<?php

namespace App\Plugin;

use App\Entity\CollectionCommand;
use App\Entity\CollectionFolder;
use App\Entity\CollectionRule;
use App\Entity\CollectionRuleExtract;
use App\Entity\CollectionRuleFolder;
use App\Entity\Context;
use App\Entity\DeviceModel;
use App\Entity\Editor;
use App\Entity\InventoryCategory;
use App\Entity\ProductRange;
use App\Entity\ShapeLibrary;
use App\Entity\ShapeLibraryItem;
use App\Plugin\Capability\CommandTemplate;
use App\Plugin\Capability\DeviceModelTemplate;
use App\Plugin\Capability\ExtractTemplate;
use App\Plugin\Capability\ManufacturerTemplate;
use App\Plugin\Capability\ProvidesCommands;
use App\Plugin\Capability\ProvidesDeviceModels;
use App\Plugin\Capability\ProvidesExtractionRules;
use App\Plugin\Capability\ProvidesManufacturers;
use App\Plugin\Capability\ProvidesShapeLibraries;
use App\Plugin\Capability\RuleTemplate;
use App\Plugin\Capability\ShapeLibraryItemTemplate;
use App\Plugin\Capability\ShapeLibraryTemplate;
use App\Repository\InstalledPluginRepository;
use App\Service\ShapeLibraryItemFactory;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Log\LoggerInterface;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\Filesystem\Filesystem;

/**
 * Importe / supprime les assets d'un Vendor Plugin (manufacturers, device models,
 * commandes, règles d'extraction) dans le scope d'un contexte donné.
 *
 * Ordre d'import :
 *   manufacturers → device models → commands → rules
 * Ordre de suppression :
 *   rules → commands → device models → manufacturers → folders managés vides
 *
 * Tous les objets créés portent managed_by_plugin = {identifier} et sont
 * read-only pour l'utilisateur (sauf le flag `enabled` quand applicable).
 *
 * L'opération entière est encadrée par une transaction.
 */
class PluginAssetsImporter
{
    /** @var array{manufacturers: int, models: int, commands: int, rules: int, extracts: int, folders: int, logos: int, shapeLibraries: int, shapeItems: int} */
    private array $stats = ['manufacturers' => 0, 'models' => 0, 'commands' => 0, 'rules' => 0, 'extracts' => 0, 'folders' => 0, 'logos' => 0, 'shapeLibraries' => 0, 'shapeItems' => 0];

    /** @var array<string, Editor> */
    private array $manufacturerCache = [];

    /** @var array<string, CollectionFolder> */
    private array $cmdFolderCache = [];

    /** @var array<string, CollectionRuleFolder> */
    private array $ruleFolderCache = [];

    private readonly Filesystem $fs;
    private readonly string $logoDir;

    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly InstalledPluginRepository $installedRepo,
        private readonly LoggerInterface $logger,
        private readonly ShapeLibraryItemFactory $shapeItemFactory,
        #[Autowire('%kernel.project_dir%')] string $projectDir,
    ) {
        $this->fs = new Filesystem();
        $this->logoDir = rtrim($projectDir, '/') . '/var/uploads/logos';
    }

    /**
     * @return array<string,int>
     */
    public function import(VendorPluginInterface $plugin, Context $context): array
    {
        $this->resetState();

        $identifier = $plugin->getIdentifier();
        $archivePath = $this->installedRepo->findByIdentifier($identifier)?->getArchivePath();

        $this->em->wrapInTransaction(function () use ($plugin, $context, $identifier, $archivePath): void {
            // Wipe any leftover assets for this plugin in this context.
            $this->purge($identifier, $context);

            if ($plugin instanceof ProvidesManufacturers) {
                foreach ($plugin->provideManufacturers() as $tpl) {
                    if (!$tpl instanceof ManufacturerTemplate) continue;
                    $this->importManufacturer($tpl, $identifier, $context, $archivePath);
                }
            }

            if ($plugin instanceof ProvidesDeviceModels) {
                foreach ($plugin->provideDeviceModels() as $tpl) {
                    if (!$tpl instanceof DeviceModelTemplate) continue;
                    $this->importDeviceModel($tpl, $identifier, $context);
                }
            }

            if ($plugin instanceof ProvidesCommands) {
                foreach ($plugin->provideCommands() as $tpl) {
                    if (!$tpl instanceof CommandTemplate) continue;
                    $this->importCommand($tpl, $identifier, $context);
                }
            }

            if ($plugin instanceof ProvidesExtractionRules) {
                foreach ($plugin->provideRules() as $tpl) {
                    if (!$tpl instanceof RuleTemplate) continue;
                    $this->importRule($tpl, $identifier, $context);
                }
            }

            if ($plugin instanceof ProvidesShapeLibraries) {
                foreach ($plugin->provideShapeLibraries() as $tpl) {
                    if (!$tpl instanceof ShapeLibraryTemplate) continue;
                    $this->importShapeLibrary($tpl, $identifier, $context, $archivePath);
                }
            }
        });

        $this->logger->info('Plugin assets imported', [
            'plugin' => $identifier, 'context' => $context->getId(), 'stats' => $this->stats,
        ]);
        return $this->stats;
    }

    /**
     * @return array<string,int>
     */
    public function remove(string $identifier, Context $context): array
    {
        $stats = [];
        $this->em->wrapInTransaction(function () use ($identifier, $context, &$stats): void {
            $stats = $this->purge($identifier, $context);
        });
        $this->logger->info('Plugin assets removed', [
            'plugin' => $identifier, 'context' => $context->getId(), 'stats' => $stats,
        ]);
        return $stats;
    }

    /**
     * @return array<string,int>
     */
    private function purge(string $identifier, Context $context): array
    {
        // 1. Rules first (cascade → extracts via orphanRemoval).
        $rules = $this->em->getRepository(CollectionRule::class)
            ->findBy(['managedByPlugin' => $identifier, 'context' => $context]);
        foreach ($rules as $rule) $this->em->remove($rule);

        // 2. Commands.
        $commands = $this->em->getRepository(CollectionCommand::class)
            ->findBy(['managedByPlugin' => $identifier, 'context' => $context]);
        foreach ($commands as $cmd) $this->em->remove($cmd);

        $this->em->flush();

        // 3. Device models.
        $models = $this->em->getRepository(DeviceModel::class)
            ->findBy(['managedByPlugin' => $identifier, 'context' => $context]);
        foreach ($models as $m) $this->em->remove($m);

        // 4. Manufacturers (Editor) — also wipe the logo file from disk.
        $manufacturers = $this->em->getRepository(Editor::class)
            ->findBy(['managedByPlugin' => $identifier, 'context' => $context]);
        foreach ($manufacturers as $mfr) {
            if ($mfr->getLogo()) {
                $logoFile = $this->logoDir . '/' . $mfr->getLogo();
                if (is_file($logoFile)) @unlink($logoFile);
            }
            $this->em->remove($mfr);
        }

        // 4b. Product ranges (lifecycle data feeding the System Updates score).
        // Matched by pluginSource — they may point to a manufacturer owned by
        // another plugin, so the Editor cascade alone would not remove them.
        $ranges = $this->em->getRepository(ProductRange::class)
            ->findBy(['pluginSource' => $identifier, 'context' => $context]);
        foreach ($ranges as $range) $this->em->remove($range);

        // 4c. Shape libraries (stencils) — items cascade on delete.
        $shapeLibraries = $this->em->getRepository(ShapeLibrary::class)
            ->findBy(['managedByPlugin' => $identifier, 'context' => $context]);
        foreach ($shapeLibraries as $lib) $this->em->remove($lib);

        $this->em->flush();

        // 5. Folders (managed, empty).
        $foldersRemoved = 0;
        $ruleFolders = $this->em->getRepository(CollectionRuleFolder::class)
            ->findBy(['managedByPlugin' => $identifier, 'context' => $context]);
        usort($ruleFolders, fn(CollectionRuleFolder $a, CollectionRuleFolder $b) => $this->depth($b) - $this->depth($a));
        foreach ($ruleFolders as $f) {
            if ($this->isRuleFolderEmpty($f)) {
                $this->em->remove($f); $this->em->flush(); $foldersRemoved++;
            }
        }
        $cmdFolders = $this->em->getRepository(CollectionFolder::class)
            ->findBy(['managedByPlugin' => $identifier, 'context' => $context]);
        usort($cmdFolders, fn(CollectionFolder $a, CollectionFolder $b) => $this->depth($b) - $this->depth($a));
        foreach ($cmdFolders as $f) {
            if ($this->isCommandFolderEmpty($f)) {
                $this->em->remove($f); $this->em->flush(); $foldersRemoved++;
            }
        }

        return [
            'manufacturers' => count($manufacturers),
            'models' => count($models),
            'commands' => count($commands),
            'rules' => count($rules),
            'ranges' => count($ranges),
            'shapeLibraries' => count($shapeLibraries),
            'folders' => $foldersRemoved,
        ];
    }

    // ── Manufacturer / DeviceModel ──

    private function importManufacturer(ManufacturerTemplate $tpl, string $identifier, Context $context, ?string $archivePath): void
    {
        $mfr = new Editor();
        $mfr->setName($tpl->name);
        $mfr->setDescription($tpl->description !== '' ? $tpl->description : null);
        $mfr->setContext($context);
        $mfr->setManagedByPlugin($identifier);

        // Copy logo from the plugin archive into var/uploads/logos/
        if ($tpl->logoPath !== null && $archivePath !== null) {
            $src = rtrim($archivePath, '/') . '/' . ltrim($tpl->logoPath, '/');
            if (is_file($src)) {
                $ext = pathinfo($src, PATHINFO_EXTENSION) ?: 'png';
                $hash = substr(sha1_file($src) ?: bin2hex(random_bytes(8)), 0, 12);
                $destName = sprintf('plugin-%s-%s.%s', $identifier, $hash, strtolower($ext));
                if (!is_dir($this->logoDir)) $this->fs->mkdir($this->logoDir);
                $this->fs->copy($src, $this->logoDir . '/' . $destName, true);
                $mfr->setLogo($destName);
                $this->stats['logos']++;
            } else {
                $this->logger->warning('Plugin logo file not found in archive', [
                    'plugin' => $identifier, 'logoPath' => $tpl->logoPath, 'expected' => $src,
                ]);
            }
        }

        $this->em->persist($mfr);
        $this->stats['manufacturers']++;
        $this->manufacturerCache[$this->mfrKey($context, $tpl->name)] = $mfr;
    }

    private function importDeviceModel(DeviceModelTemplate $tpl, string $identifier, Context $context): void
    {
        $mfr = $this->resolveManufacturer($tpl->manufacturerName, $context);
        if (!$mfr) {
            $this->logger->warning('Skipping DeviceModel: manufacturer not found', [
                'plugin' => $identifier, 'model' => $tpl->name, 'manufacturer' => $tpl->manufacturerName,
            ]);
            return;
        }

        $model = new DeviceModel();
        $model->setName($tpl->name);
        $model->setDescription($tpl->description !== '' ? $tpl->description : null);
        $model->setManufacturer($mfr);
        $model->setContext($context);
        $model->setConnectionScript($tpl->connectionScript);
        $model->setSendCtrlChar($tpl->sendCtrlChar);
        $model->setNvdKeyword($tpl->nvdKeyword);
        $model->setManagedByPlugin($identifier);

        $this->em->persist($model);
        $this->stats['models']++;
    }

    private function resolveManufacturer(string $name, Context $context): ?Editor
    {
        $key = $this->mfrKey($context, $name);
        if (isset($this->manufacturerCache[$key])) return $this->manufacturerCache[$key];

        // Fallback: any Editor with this name in this context (user-created or managed by another plugin)
        $mfr = $this->em->getRepository(Editor::class)
            ->findOneBy(['name' => $name, 'context' => $context]);
        if ($mfr) $this->manufacturerCache[$key] = $mfr;
        return $mfr;
    }

    private function mfrKey(Context $context, string $name): string
    {
        return sprintf('%d|%s', $context->getId(), $name);
    }

    // ── Commands / Rules / Folders (unchanged from previous version) ──

    private function importCommand(CommandTemplate $tpl, string $identifier, Context $context): void
    {
        $folder = $this->resolveCommandFolder($tpl->folderPath, $identifier, $context);

        $cmd = new CollectionCommand();
        $cmd->setName($tpl->name);
        $cmd->setDescription($tpl->description !== '' ? $tpl->description : null);
        $cmd->setCommands($tpl->commands);
        $cmd->setEnabled($tpl->enabled);
        $cmd->setFolder($folder);
        $cmd->setContext($context);
        $cmd->setManagedByPlugin($identifier);

        $this->em->persist($cmd);
        $this->stats['commands']++;
    }

    private function importRule(RuleTemplate $tpl, string $identifier, Context $context): void
    {
        $folder = $this->resolveRuleFolder($tpl->folderPath, $identifier, $context);

        $rule = new CollectionRule();
        $rule->setName($tpl->name);
        $rule->setDescription($tpl->description !== '' ? $tpl->description : null);
        $rule->setEnabled($tpl->enabled);
        $rule->setSource($tpl->source);
        $rule->setCommand($tpl->command);
        $rule->setFolder($folder);
        $rule->setContext($context);
        $rule->setManagedByPlugin($identifier);

        $this->em->persist($rule);

        $position = 0;
        foreach ($tpl->extracts as $extractTpl) {
            if (!$extractTpl instanceof ExtractTemplate) continue;
            $extract = new CollectionRuleExtract();
            $extract->setName($extractTpl->name);
            $extract->setRegex($extractTpl->regex);
            $extract->setMultiline($extractTpl->multiline);
            $extract->setExtractMode($extractTpl->extractMode);
            $extract->setKeyMode($extractTpl->keyMode);
            $extract->setKeyManual($extractTpl->keyManual);
            $extract->setKeyGroup($extractTpl->keyGroup);
            $extract->setValueGroup($extractTpl->valueGroup);
            $extract->setValueMap($extractTpl->valueMap);
            $extract->setNodeField($extractTpl->nodeField);
            $extract->setBlockSeparator($extractTpl->blockSeparator);
            $extract->setBlockKeyGroup($extractTpl->blockKeyGroup);
            $extract->setBlockKeyTemplate($extractTpl->blockKeyTemplate);
            $extract->setBlockCaptures($extractTpl->blockCaptures);
            $extract->setPosition($position++);

            if ($extractTpl->categoryName !== null && $extractTpl->categoryName !== '') {
                $category = $this->em->getRepository(InventoryCategory::class)
                    ->findOneBy(['name' => $extractTpl->categoryName, 'context' => $context]);
                if ($category) $extract->setCategory($category);
            }

            $rule->addExtract($extract);
            $this->em->persist($extract);
            $this->stats['extracts']++;
        }
        $this->stats['rules']++;
    }

    private function importShapeLibrary(ShapeLibraryTemplate $tpl, string $identifier, Context $context, ?string $archivePath): void
    {
        $library = new ShapeLibrary();
        $library->setName($tpl->name);
        $library->setDescription($tpl->description !== '' ? $tpl->description : null);
        $library->setContext($context);
        $library->setManagedByPlugin($identifier);
        $this->em->persist($library);
        $this->stats['shapeLibraries']++;

        $position = 0;
        foreach ($tpl->items as $itemTpl) {
            if (!$itemTpl instanceof ShapeLibraryItemTemplate) continue;

            $payload = $itemTpl->payload;
            $width = $itemTpl->width;
            $height = $itemTpl->height;
            $previewSvg = null;

            // SVG provided by the plugin archive → embed it as an image element.
            if ($itemTpl->svgPath !== null && $archivePath !== null) {
                $src = rtrim($archivePath, '/') . '/' . ltrim($itemTpl->svgPath, '/');
                $svg = is_file($src) ? @file_get_contents($src) : false;
                if ($svg === false || trim((string)$svg) === '') {
                    $this->logger->warning('Plugin shape SVG not found in archive', [
                        'plugin' => $identifier, 'svgPath' => $itemTpl->svgPath, 'expected' => $src,
                    ]);
                    continue;
                }
                [$w, $h] = $this->svgDimensions($svg);
                $width = $width > 0 ? $width : $w;
                $height = $height > 0 ? $height : $h;
                $dataUrl = 'data:image/svg+xml;base64,' . base64_encode($svg);
                $payload = $this->shapeItemFactory->imagePayload($dataUrl, $width, $height);
                $previewSvg = $svg;
            }

            if ($payload === []) {
                continue;
            }
            if ($width <= 0 || $height <= 0) {
                $width = $width > 0 ? $width : 120;
                $height = $height > 0 ? $height : 120;
            }

            $item = new ShapeLibraryItem();
            $item->setName($itemTpl->name);
            $item->setKeywords($itemTpl->keywords);
            $item->setPayload($payload);
            $item->setWidth($width);
            $item->setHeight($height);
            $item->setPreviewSvg($previewSvg ?? $this->shapeItemFactory->renderPreview($payload, $width, $height));
            $item->setPosition($position++);
            $library->addItem($item);
            $this->em->persist($item);
            $this->stats['shapeItems']++;
        }
    }

    /**
     * @return array{0: float, 1: float}
     */
    private function svgDimensions(string $svg): array
    {
        if (preg_match('/viewBox\s*=\s*"[\d.\-]+\s+[\d.\-]+\s+([\d.]+)\s+([\d.]+)"/i', $svg, $m)) {
            return [max(1.0, (float)$m[1]), max(1.0, (float)$m[2])];
        }
        $w = preg_match('/\bwidth\s*=\s*"([\d.]+)/i', $svg, $mw) ? (float)$mw[1] : 0.0;
        $h = preg_match('/\bheight\s*=\s*"([\d.]+)/i', $svg, $mh) ? (float)$mh[1] : 0.0;
        return ($w > 0 && $h > 0) ? [$w, $h] : [120.0, 120.0];
    }

    private function resolveCommandFolder(string $folderPath, string $identifier, Context $context): ?CollectionFolder
    {
        $segments = $this->splitPath($folderPath);
        if ($segments === []) return null;

        $repo = $this->em->getRepository(CollectionFolder::class);
        $parent = null;
        $pathSoFar = '';
        foreach ($segments as $name) {
            $pathSoFar = $pathSoFar === '' ? $name : $pathSoFar . '/' . $name;
            $cacheKey = sprintf('%d|%s|%s', $context->getId(), $identifier, $pathSoFar);
            if (isset($this->cmdFolderCache[$cacheKey])) { $parent = $this->cmdFolderCache[$cacheKey]; continue; }

            $existing = null;
            foreach ($repo->findBy(['name' => $name, 'context' => $context, 'managedByPlugin' => $identifier]) as $c) {
                if ($c->getParent() === $parent) { $existing = $c; break; }
            }
            if (!$existing) {
                $existing = new CollectionFolder();
                $existing->setName($name)->setType(CollectionFolder::TYPE_CUSTOM)
                    ->setParent($parent)->setContext($context)->setManagedByPlugin($identifier);
                $this->em->persist($existing);
                $this->stats['folders']++;
            }
            $this->cmdFolderCache[$cacheKey] = $existing;
            $parent = $existing;
        }
        return $parent;
    }

    private function resolveRuleFolder(string $folderPath, string $identifier, Context $context): ?CollectionRuleFolder
    {
        $segments = $this->splitPath($folderPath);
        if ($segments === []) return null;

        $repo = $this->em->getRepository(CollectionRuleFolder::class);
        $parent = null;
        $pathSoFar = '';
        foreach ($segments as $name) {
            $pathSoFar = $pathSoFar === '' ? $name : $pathSoFar . '/' . $name;
            $cacheKey = sprintf('%d|%s|%s', $context->getId(), $identifier, $pathSoFar);
            if (isset($this->ruleFolderCache[$cacheKey])) { $parent = $this->ruleFolderCache[$cacheKey]; continue; }

            $existing = null;
            foreach ($repo->findBy(['name' => $name, 'context' => $context, 'managedByPlugin' => $identifier]) as $c) {
                if ($c->getParent() === $parent) { $existing = $c; break; }
            }
            if (!$existing) {
                $existing = new CollectionRuleFolder();
                $existing->setName($name)->setType(CollectionRuleFolder::TYPE_CUSTOM)
                    ->setParent($parent)->setContext($context)->setManagedByPlugin($identifier);
                $this->em->persist($existing);
                $this->stats['folders']++;
            }
            $this->ruleFolderCache[$cacheKey] = $existing;
            $parent = $existing;
        }
        return $parent;
    }

    /** @return string[] */
    private function splitPath(string $path): array
    {
        $segments = [];
        foreach (explode('/', trim($path, '/')) as $part) {
            $part = trim($part);
            if ($part !== '') $segments[] = $part;
        }
        return $segments;
    }

    private function depth(CollectionFolder|CollectionRuleFolder $folder): int
    {
        $d = 0; $f = $folder->getParent();
        while ($f !== null) { $d++; $f = $f->getParent(); }
        return $d;
    }

    private function isCommandFolderEmpty(CollectionFolder $folder): bool
    {
        if ($this->em->getRepository(CollectionCommand::class)->findOneBy(['folder' => $folder]) !== null) return false;
        if ($this->em->getRepository(CollectionFolder::class)->findOneBy(['parent' => $folder]) !== null) return false;
        return true;
    }

    private function isRuleFolderEmpty(CollectionRuleFolder $folder): bool
    {
        if ($this->em->getRepository(CollectionRule::class)->findOneBy(['folder' => $folder]) !== null) return false;
        if ($this->em->getRepository(CollectionRuleFolder::class)->findOneBy(['parent' => $folder]) !== null) return false;
        return true;
    }

    private function resetState(): void
    {
        $this->stats = ['manufacturers' => 0, 'models' => 0, 'commands' => 0, 'rules' => 0, 'extracts' => 0, 'folders' => 0, 'logos' => 0, 'shapeLibraries' => 0, 'shapeItems' => 0];
        $this->manufacturerCache = [];
        $this->cmdFolderCache = [];
        $this->ruleFolderCache = [];
    }
}
