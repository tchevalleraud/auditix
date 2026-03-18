<?php

namespace App\Controller\Api;

use App\Entity\CollectionCommand;
use App\Entity\CollectionFolder;
use App\Entity\CollectionRule;
use App\Entity\CollectionRuleExtract;
use App\Entity\CollectionRuleFolder;
use App\Entity\Context;
use App\Entity\DeviceModel;
use App\Entity\Editor;
use App\Entity\InventoryCategory;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

class ManufacturerExportController extends AbstractController
{
    // ─── EXPORT ───────────────────────────────────────────────────────

    #[Route('/api/manufacturers/{id}/export', methods: ['GET'], requirements: ['id' => '\d+'])]
    public function export(Editor $editor, EntityManagerInterface $em): Response
    {
        $cmdRefIndex = 0;
        $ruleRefIndex = 0;
        $extractRefIndex = 0;

        $cmdRefMap = [];
        $ruleRefMap = [];
        $extractRefMap = [];

        // ── Models ──
        $models = $em->getRepository(DeviceModel::class)->findBy(['manufacturer' => $editor]);
        $modelRefMap = [];
        $modelsData = [];
        foreach ($models as $i => $model) {
            $ref = 'model:' . $i;
            $modelRefMap[$model->getId()] = $ref;
            $modelsData[] = [
                '_ref' => $ref,
                'name' => $model->getName(),
                'description' => $model->getDescription(),
                'connectionScript' => $model->getConnectionScript(),
                'sendCtrlChar' => $model->getSendCtrlChar(),
                'manualCommandRefs' => [],
                'manualRuleRefs' => [],
            ];
        }

        // ── Command Folders ──
        $mfgCmdFolder = $em->getRepository(CollectionFolder::class)->findOneBy([
            'manufacturer' => $editor,
            'type' => CollectionFolder::TYPE_MANUFACTURER,
        ]);

        $commandFoldersData = ['manufacturer' => ['commands' => [], 'children' => []], 'custom' => []];

        if ($mfgCmdFolder) {
            $cmds = $em->getRepository(CollectionCommand::class)->findBy(['folder' => $mfgCmdFolder]);
            foreach ($cmds as $cmd) {
                $ref = 'cmd:' . $cmdRefIndex++;
                $cmdRefMap[$cmd->getId()] = $ref;
                $commandFoldersData['manufacturer']['commands'][] = $this->serializeCommand($cmd, $ref);
            }

            foreach ($mfgCmdFolder->getChildren() as $child) {
                if ($child->getType() === CollectionFolder::TYPE_MODEL && $child->getModel()) {
                    $modelRef = $modelRefMap[$child->getModel()->getId()] ?? null;
                    if (!$modelRef) continue;

                    $childData = ['modelRef' => $modelRef, 'commands' => []];
                    $childCmds = $em->getRepository(CollectionCommand::class)->findBy(['folder' => $child]);
                    foreach ($childCmds as $cmd) {
                        $ref = 'cmd:' . $cmdRefIndex++;
                        $cmdRefMap[$cmd->getId()] = $ref;
                        $childData['commands'][] = $this->serializeCommand($cmd, $ref);
                    }
                    $childData['custom'] = $this->exportCustomCmdFolders($em, $child, $cmdRefMap, $cmdRefIndex);
                    $commandFoldersData['manufacturer']['children'][] = $childData;
                }
            }

            $commandFoldersData['custom'] = $this->exportCustomCmdFolders($em, $mfgCmdFolder, $cmdRefMap, $cmdRefIndex);
        }

        // ── Rule Folders ──
        $mfgRuleFolder = $em->getRepository(CollectionRuleFolder::class)->findOneBy([
            'manufacturer' => $editor,
            'type' => CollectionRuleFolder::TYPE_MANUFACTURER,
        ]);

        $ruleFoldersData = ['manufacturer' => ['rules' => [], 'children' => []], 'custom' => []];

        if ($mfgRuleFolder) {
            $rules = $em->getRepository(CollectionRule::class)->findBy(['folder' => $mfgRuleFolder]);
            foreach ($rules as $rule) {
                $ref = 'rule:' . $ruleRefIndex++;
                $ruleRefMap[$rule->getId()] = $ref;
                $ruleFoldersData['manufacturer']['rules'][] = $this->serializeRule($rule, $ref, $extractRefMap, $extractRefIndex);
            }

            foreach ($mfgRuleFolder->getChildren() as $child) {
                if ($child->getType() === CollectionRuleFolder::TYPE_MODEL && $child->getModel()) {
                    $modelRef = $modelRefMap[$child->getModel()->getId()] ?? null;
                    if (!$modelRef) continue;

                    $childData = ['modelRef' => $modelRef, 'rules' => []];
                    $childRules = $em->getRepository(CollectionRule::class)->findBy(['folder' => $child]);
                    foreach ($childRules as $rule) {
                        $ref = 'rule:' . $ruleRefIndex++;
                        $ruleRefMap[$rule->getId()] = $ref;
                        $childData['rules'][] = $this->serializeRule($rule, $ref, $extractRefMap, $extractRefIndex);
                    }
                    $childData['custom'] = $this->exportCustomRuleFolders($em, $child, $ruleRefMap, $ruleRefIndex, $extractRefMap, $extractRefIndex);
                    $ruleFoldersData['manufacturer']['children'][] = $childData;
                }
            }

            $ruleFoldersData['custom'] = $this->exportCustomRuleFolders($em, $mfgRuleFolder, $ruleRefMap, $ruleRefIndex, $extractRefMap, $extractRefIndex);
        }

        // ── Resolve ManyToMany refs on models ──
        foreach ($models as $i => $model) {
            foreach ($model->getManualCommands() as $cmd) {
                if (isset($cmdRefMap[$cmd->getId()])) {
                    $modelsData[$i]['manualCommandRefs'][] = $cmdRefMap[$cmd->getId()];
                }
            }
            foreach ($model->getManualRules() as $rule) {
                if (isset($ruleRefMap[$rule->getId()])) {
                    $modelsData[$i]['manualRuleRefs'][] = $ruleRefMap[$rule->getId()];
                }
            }
        }

        // ── Resolve extract keyExtractRef ──
        $this->resolveExtractRefs($commandFoldersData, $ruleFoldersData, $extractRefMap);

        // ── Logo ──
        $logoData = null;
        if ($editor->getLogo()) {
            $logoPath = $this->getParameter('kernel.project_dir') . '/var/uploads/logos/' . $editor->getLogo();
            if (is_file($logoPath)) {
                $extension = pathinfo($editor->getLogo(), PATHINFO_EXTENSION);
                $logoData = [
                    'filename' => $editor->getLogo(),
                    'extension' => $extension,
                    'data' => base64_encode(file_get_contents($logoPath)),
                ];
            }
        }

        $data = [
            '_format' => 'auditix-manufacturer-export',
            '_version' => 1,
            '_exportedAt' => (new \DateTimeImmutable())->format('c'),
            'manufacturer' => [
                'name' => $editor->getName(),
                'description' => $editor->getDescription(),
                'logo' => $logoData,
            ],
            'models' => $modelsData,
            'commandFolders' => $commandFoldersData,
            'ruleFolders' => $ruleFoldersData,
        ];

        $safeName = preg_replace('/[^a-zA-Z0-9_\-.]/', '_', $editor->getName());
        $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

        return new Response($json, Response::HTTP_OK, [
            'Content-Type' => 'application/json',
            'Content-Disposition' => sprintf('attachment; filename="manufacturer-%s.json"', $safeName),
        ]);
    }

    // ─── PREVIEW IMPORT ───────────────────────────────────────────────

    #[Route('/api/manufacturers/preview-import', methods: ['POST'], priority: 10)]
    public function previewImport(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $contextId = $request->query->getInt('context');
        $context = $contextId ? $em->getRepository(Context::class)->find($contextId) : null;
        if (!$context) {
            return $this->json(['error' => 'Context is required'], Response::HTTP_BAD_REQUEST);
        }

        $file = $request->files->get('file');
        if (!$file) {
            return $this->json(['error' => 'File is required'], Response::HTTP_BAD_REQUEST);
        }

        $json = file_get_contents($file->getPathname());
        $data = json_decode($json, true);
        if (!$data || ($data['_format'] ?? null) !== 'auditix-manufacturer-export') {
            return $this->json(['error' => 'Invalid export file format'], Response::HTTP_BAD_REQUEST);
        }

        $mfgName = $data['manufacturer']['name'] ?? '';

        // Check if manufacturer already exists
        $existingEditor = $em->getRepository(Editor::class)->findOneBy(['name' => $mfgName, 'context' => $context]);

        // Analyze models
        $modelsPreview = [];
        foreach ($data['models'] ?? [] as $modelData) {
            $existing = null;
            if ($existingEditor) {
                $existing = $em->getRepository(DeviceModel::class)->findOneBy([
                    'name' => $modelData['name'],
                    'manufacturer' => $existingEditor,
                ]);
            }
            $modelsPreview[] = [
                'name' => $modelData['name'],
                'exists' => $existing !== null,
            ];
        }

        // Count commands
        $commandCount = $this->countCommands($data['commandFolders'] ?? []);

        // Count rules and extracts
        [$ruleCount, $extractCount] = $this->countRules($data['ruleFolders'] ?? []);

        // Analyze inventory categories
        $categoryNames = $this->collectCategoryNames($data['ruleFolders'] ?? []);
        $categoriesPreview = [];
        foreach ($categoryNames as $catName) {
            $existing = $em->getRepository(InventoryCategory::class)->findOneBy([
                'name' => $catName,
                'context' => $context,
            ]);
            $categoriesPreview[] = [
                'name' => $catName,
                'exists' => $existing !== null,
            ];
        }

        return $this->json([
            'manufacturer' => [
                'name' => $mfgName,
                'description' => $data['manufacturer']['description'] ?? null,
                'hasLogo' => !empty($data['manufacturer']['logo']['data']),
                'exists' => $existingEditor !== null,
            ],
            'models' => $modelsPreview,
            'commandCount' => $commandCount,
            'ruleCount' => $ruleCount,
            'extractCount' => $extractCount,
            'categories' => $categoriesPreview,
            'exportedAt' => $data['_exportedAt'] ?? null,
        ]);
    }

    private function countCommands(array $cmdFolders): int
    {
        $count = count($cmdFolders['manufacturer']['commands'] ?? []);
        foreach ($cmdFolders['manufacturer']['children'] ?? [] as $child) {
            $count += count($child['commands'] ?? []);
            $count += $this->countCustomCmdFolders($child['custom'] ?? []);
        }
        $count += $this->countCustomCmdFolders($cmdFolders['custom'] ?? []);
        return $count;
    }

    private function countCustomCmdFolders(array $folders): int
    {
        $count = 0;
        foreach ($folders as $folder) {
            $count += count($folder['commands'] ?? []);
            $count += $this->countCustomCmdFolders($folder['children'] ?? []);
        }
        return $count;
    }

    private function countRules(array $ruleFolders): array
    {
        $ruleCount = 0;
        $extractCount = 0;
        foreach ($ruleFolders['manufacturer']['rules'] ?? [] as $rule) {
            $ruleCount++;
            $extractCount += count($rule['extracts'] ?? []);
        }
        foreach ($ruleFolders['manufacturer']['children'] ?? [] as $child) {
            foreach ($child['rules'] ?? [] as $rule) {
                $ruleCount++;
                $extractCount += count($rule['extracts'] ?? []);
            }
            [$rc, $ec] = $this->countCustomRuleFolders($child['custom'] ?? []);
            $ruleCount += $rc;
            $extractCount += $ec;
        }
        [$rc, $ec] = $this->countCustomRuleFolders($ruleFolders['custom'] ?? []);
        $ruleCount += $rc;
        $extractCount += $ec;
        return [$ruleCount, $extractCount];
    }

    private function countCustomRuleFolders(array $folders): array
    {
        $ruleCount = 0;
        $extractCount = 0;
        foreach ($folders as $folder) {
            foreach ($folder['rules'] ?? [] as $rule) {
                $ruleCount++;
                $extractCount += count($rule['extracts'] ?? []);
            }
            [$rc, $ec] = $this->countCustomRuleFolders($folder['children'] ?? []);
            $ruleCount += $rc;
            $extractCount += $ec;
        }
        return [$ruleCount, $extractCount];
    }

    private function collectCategoryNames(array $ruleFolders): array
    {
        $names = [];
        $this->walkRulesForCategories($ruleFolders['manufacturer']['rules'] ?? [], $names);
        foreach ($ruleFolders['manufacturer']['children'] ?? [] as $child) {
            $this->walkRulesForCategories($child['rules'] ?? [], $names);
            $this->walkCustomFoldersForCategories($child['custom'] ?? [], $names);
        }
        $this->walkCustomFoldersForCategories($ruleFolders['custom'] ?? [], $names);
        return array_unique($names);
    }

    private function walkRulesForCategories(array $rules, array &$names): void
    {
        foreach ($rules as $rule) {
            foreach ($rule['extracts'] ?? [] as $extract) {
                if (!empty($extract['categoryName'])) {
                    $names[] = $extract['categoryName'];
                }
            }
        }
    }

    private function walkCustomFoldersForCategories(array $folders, array &$names): void
    {
        foreach ($folders as $folder) {
            $this->walkRulesForCategories($folder['rules'] ?? [], $names);
            $this->walkCustomFoldersForCategories($folder['children'] ?? [], $names);
        }
    }

    // ─── IMPORT ───────────────────────────────────────────────────────

    #[Route('/api/manufacturers/import', methods: ['POST'], priority: 10)]
    public function import(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $contextId = $request->query->getInt('context');
        $context = $contextId ? $em->getRepository(Context::class)->find($contextId) : null;
        if (!$context) {
            return $this->json(['error' => 'Context is required'], Response::HTTP_BAD_REQUEST);
        }

        $file = $request->files->get('file');
        if (!$file) {
            return $this->json(['error' => 'File is required'], Response::HTTP_BAD_REQUEST);
        }

        $json = file_get_contents($file->getPathname());
        $data = json_decode($json, true);
        if (!$data || ($data['_format'] ?? null) !== 'auditix-manufacturer-export') {
            return $this->json(['error' => 'Invalid export file format'], Response::HTTP_BAD_REQUEST);
        }

        $em->beginTransaction();
        try {
            // ── Phase 1: Manufacturer ──
            $editor = new Editor();
            $editor->setName($data['manufacturer']['name']);
            $editor->setDescription($data['manufacturer']['description'] ?? null);
            $editor->setContext($context);

            // Restore logo
            $logoInfo = $data['manufacturer']['logo'] ?? null;
            if ($logoInfo && !empty($logoInfo['data'])) {
                $uploadDir = $this->getParameter('kernel.project_dir') . '/var/uploads/logos';
                if (!is_dir($uploadDir)) {
                    mkdir($uploadDir, 0775, true);
                }
                $ext = $logoInfo['extension'] ?? 'png';
                $safeName = preg_replace('/[^a-zA-Z0-9_\-.]/', '_', $editor->getName());
                $logoFilename = $safeName . '-' . uniqid() . '.' . $ext;
                file_put_contents($uploadDir . '/' . $logoFilename, base64_decode($logoInfo['data']));
                $editor->setLogo($logoFilename);
            }

            $em->persist($editor);

            $mfgCmdFolder = new CollectionFolder();
            $mfgCmdFolder->setName($editor->getName());
            $mfgCmdFolder->setType(CollectionFolder::TYPE_MANUFACTURER);
            $mfgCmdFolder->setManufacturer($editor);
            $mfgCmdFolder->setContext($context);
            $em->persist($mfgCmdFolder);

            $mfgRuleFolder = new CollectionRuleFolder();
            $mfgRuleFolder->setName($editor->getName());
            $mfgRuleFolder->setType(CollectionRuleFolder::TYPE_MANUFACTURER);
            $mfgRuleFolder->setManufacturer($editor);
            $mfgRuleFolder->setContext($context);
            $em->persist($mfgRuleFolder);

            // ── Phase 2: Models ──
            $modelRefMap = [];
            $modelCmdFolderMap = [];
            $modelRuleFolderMap = [];

            foreach ($data['models'] ?? [] as $modelData) {
                $model = new DeviceModel();
                $model->setName($modelData['name']);
                $model->setDescription($modelData['description'] ?? null);
                $model->setConnectionScript($modelData['connectionScript'] ?? null);
                $model->setSendCtrlChar($modelData['sendCtrlChar'] ?? null);
                $model->setManufacturer($editor);
                $model->setContext($context);
                $em->persist($model);

                $ref = $modelData['_ref'];
                $modelRefMap[$ref] = $model;

                $modelCmdFolder = new CollectionFolder();
                $modelCmdFolder->setName($model->getName());
                $modelCmdFolder->setType(CollectionFolder::TYPE_MODEL);
                $modelCmdFolder->setModel($model);
                $modelCmdFolder->setManufacturer($editor);
                $modelCmdFolder->setParent($mfgCmdFolder);
                $modelCmdFolder->setContext($context);
                $em->persist($modelCmdFolder);
                $modelCmdFolderMap[$ref] = $modelCmdFolder;

                $modelRuleFolder = new CollectionRuleFolder();
                $modelRuleFolder->setName($model->getName());
                $modelRuleFolder->setType(CollectionRuleFolder::TYPE_MODEL);
                $modelRuleFolder->setModel($model);
                $modelRuleFolder->setManufacturer($editor);
                $modelRuleFolder->setParent($mfgRuleFolder);
                $modelRuleFolder->setContext($context);
                $em->persist($modelRuleFolder);
                $modelRuleFolderMap[$ref] = $modelRuleFolder;
            }

            // ── Phase 3: Commands ──
            $cmdRefMap = [];
            $cmdFolders = $data['commandFolders'] ?? [];

            foreach ($cmdFolders['manufacturer']['commands'] ?? [] as $cmdData) {
                $cmd = $this->createCommand($cmdData, $mfgCmdFolder, $context, $em);
                $cmdRefMap[$cmdData['_ref']] = $cmd;
            }

            foreach ($cmdFolders['manufacturer']['children'] ?? [] as $childData) {
                $folder = $modelCmdFolderMap[$childData['modelRef']] ?? null;
                if (!$folder) continue;
                foreach ($childData['commands'] ?? [] as $cmdData) {
                    $cmd = $this->createCommand($cmdData, $folder, $context, $em);
                    $cmdRefMap[$cmdData['_ref']] = $cmd;
                }
                $this->importCustomCmdFolders($childData['custom'] ?? [], $folder, $context, $em, $cmdRefMap);
            }

            $this->importCustomCmdFolders($cmdFolders['custom'] ?? [], $mfgCmdFolder, $context, $em, $cmdRefMap);

            // ── Phase 4: Rules + Extracts ──
            $ruleRefMap = [];
            $extractRefMap = [];
            $pendingKeyExtracts = [];
            $ruleFolders = $data['ruleFolders'] ?? [];

            foreach ($ruleFolders['manufacturer']['rules'] ?? [] as $ruleData) {
                $this->createRule($ruleData, $mfgRuleFolder, $context, $em, $ruleRefMap, $extractRefMap, $pendingKeyExtracts);
            }

            foreach ($ruleFolders['manufacturer']['children'] ?? [] as $childData) {
                $folder = $modelRuleFolderMap[$childData['modelRef']] ?? null;
                if (!$folder) continue;
                foreach ($childData['rules'] ?? [] as $ruleData) {
                    $this->createRule($ruleData, $folder, $context, $em, $ruleRefMap, $extractRefMap, $pendingKeyExtracts);
                }
                $this->importCustomRuleFolders($childData['custom'] ?? [], $folder, $context, $em, $ruleRefMap, $extractRefMap, $pendingKeyExtracts);
            }

            $this->importCustomRuleFolders($ruleFolders['custom'] ?? [], $mfgRuleFolder, $context, $em, $ruleRefMap, $extractRefMap, $pendingKeyExtracts);

            // ── Phase 5: Resolve extract self-references ──
            foreach ($pendingKeyExtracts as [$extract, $keyExtractRef]) {
                if (isset($extractRefMap[$keyExtractRef])) {
                    $extract->setKeyExtract($extractRefMap[$keyExtractRef]);
                }
            }

            // ── Phase 6: ManyToMany associations ──
            foreach ($data['models'] ?? [] as $modelData) {
                $model = $modelRefMap[$modelData['_ref']] ?? null;
                if (!$model) continue;
                foreach ($modelData['manualCommandRefs'] ?? [] as $cmdRef) {
                    if (isset($cmdRefMap[$cmdRef])) {
                        $model->addManualCommand($cmdRefMap[$cmdRef]);
                    }
                }
                foreach ($modelData['manualRuleRefs'] ?? [] as $ruleRef) {
                    if (isset($ruleRefMap[$ruleRef])) {
                        $model->addManualRule($ruleRefMap[$ruleRef]);
                    }
                }
            }

            $em->flush();
            $em->commit();

            return $this->json([
                'id' => $editor->getId(),
                'name' => $editor->getName(),
                'description' => $editor->getDescription(),
                'logo' => $editor->getLogo() ? '/api/logos/' . $editor->getLogo() : null,
                'createdAt' => $editor->getCreatedAt()->format('c'),
            ], Response::HTTP_CREATED);

        } catch (\Throwable $e) {
            $em->rollback();
            return $this->json(['error' => 'Import failed: ' . $e->getMessage()], Response::HTTP_INTERNAL_SERVER_ERROR);
        }
    }

    // ─── Serialization helpers ────────────────────────────────────────

    private function serializeCommand(CollectionCommand $cmd, string $ref): array
    {
        return [
            '_ref' => $ref,
            'name' => $cmd->getName(),
            'description' => $cmd->getDescription(),
            'commands' => $cmd->getCommands(),
            'enabled' => $cmd->isEnabled(),
        ];
    }

    private function serializeRule(CollectionRule $rule, string $ref, array &$extractRefMap, int &$extractRefIndex): array
    {
        $extracts = [];
        foreach ($rule->getExtracts() as $extract) {
            $eRef = 'extract:' . $extractRefIndex++;
            $extractRefMap[$extract->getId()] = $eRef;
            $extracts[] = [
                '_ref' => $eRef,
                'name' => $extract->getName(),
                'regex' => $extract->getRegex(),
                'multiline' => $extract->isMultiline(),
                'keyMode' => $extract->getKeyMode(),
                'keyManual' => $extract->getKeyManual(),
                '_keyExtractId' => $extract->getKeyExtract()?->getId(),
                'keyGroup' => $extract->getKeyGroup(),
                'keyLabel' => $extract->getKeyLabel(),
                'valueGroup' => $extract->getValueGroup(),
                'valueMap' => $extract->getValueMap(),
                'categoryName' => $extract->getCategory()?->getName(),
                'categoryKeyLabel' => $extract->getCategory()?->getKeyLabel(),
                'nodeField' => $extract->getNodeField(),
                'nodeFieldGroup' => $extract->getNodeFieldGroup(),
                'position' => $extract->getPosition(),
            ];
        }

        return [
            '_ref' => $ref,
            'name' => $rule->getName(),
            'description' => $rule->getDescription(),
            'enabled' => $rule->isEnabled(),
            'source' => $rule->getSource(),
            'command' => $rule->getCommand(),
            'tag' => $rule->getTag(),
            'extracts' => $extracts,
        ];
    }

    private function exportCustomCmdFolders(EntityManagerInterface $em, CollectionFolder $parent, array &$cmdRefMap, int &$cmdRefIndex): array
    {
        $result = [];
        foreach ($parent->getChildren() as $child) {
            if ($child->getType() !== CollectionFolder::TYPE_CUSTOM) continue;
            $folderData = ['name' => $child->getName(), 'commands' => [], 'children' => []];
            $cmds = $em->getRepository(CollectionCommand::class)->findBy(['folder' => $child]);
            foreach ($cmds as $cmd) {
                $ref = 'cmd:' . $cmdRefIndex++;
                $cmdRefMap[$cmd->getId()] = $ref;
                $folderData['commands'][] = $this->serializeCommand($cmd, $ref);
            }
            $folderData['children'] = $this->exportCustomCmdFolders($em, $child, $cmdRefMap, $cmdRefIndex);
            $result[] = $folderData;
        }
        return $result;
    }

    private function exportCustomRuleFolders(EntityManagerInterface $em, CollectionRuleFolder $parent, array &$ruleRefMap, int &$ruleRefIndex, array &$extractRefMap, int &$extractRefIndex): array
    {
        $result = [];
        foreach ($parent->getChildren() as $child) {
            if ($child->getType() !== CollectionRuleFolder::TYPE_CUSTOM) continue;
            $folderData = ['name' => $child->getName(), 'rules' => [], 'children' => []];
            $rules = $em->getRepository(CollectionRule::class)->findBy(['folder' => $child]);
            foreach ($rules as $rule) {
                $ref = 'rule:' . $ruleRefIndex++;
                $ruleRefMap[$rule->getId()] = $ref;
                $folderData['rules'][] = $this->serializeRule($rule, $ref, $extractRefMap, $extractRefIndex);
            }
            $folderData['children'] = $this->exportCustomRuleFolders($em, $child, $ruleRefMap, $ruleRefIndex, $extractRefMap, $extractRefIndex);
            $result[] = $folderData;
        }
        return $result;
    }

    private function resolveExtractRefs(array &$commandFolders, array &$ruleFolders, array $extractRefMap): void
    {
        $this->walkRuleFolders($ruleFolders, $extractRefMap);
    }

    private function walkRuleFolders(array &$data, array $extractRefMap): void
    {
        if (isset($data['manufacturer']['rules'])) {
            $this->resolveExtractsInRules($data['manufacturer']['rules'], $extractRefMap);
        }
        if (isset($data['manufacturer']['children'])) {
            foreach ($data['manufacturer']['children'] as &$child) {
                $this->resolveExtractsInRules($child['rules'], $extractRefMap);
                if (isset($child['custom'])) {
                    $this->resolveExtractsInCustomFolders($child['custom'], $extractRefMap);
                }
            }
        }
        if (isset($data['custom'])) {
            $this->resolveExtractsInCustomFolders($data['custom'], $extractRefMap);
        }
    }

    private function resolveExtractsInCustomFolders(array &$folders, array $extractRefMap): void
    {
        foreach ($folders as &$folder) {
            $this->resolveExtractsInRules($folder['rules'], $extractRefMap);
            if (!empty($folder['children'])) {
                $this->resolveExtractsInCustomFolders($folder['children'], $extractRefMap);
            }
        }
    }

    private function resolveExtractsInRules(array &$rules, array $extractRefMap): void
    {
        foreach ($rules as &$rule) {
            foreach ($rule['extracts'] as &$extract) {
                $keyExtractId = $extract['_keyExtractId'];
                unset($extract['_keyExtractId']);
                $extract['keyExtractRef'] = $keyExtractId !== null ? ($extractRefMap[$keyExtractId] ?? null) : null;
            }
        }
    }

    // ─── Import helpers ───────────────────────────────────────────────

    private function createCommand(array $data, CollectionFolder $folder, Context $context, EntityManagerInterface $em): CollectionCommand
    {
        $cmd = new CollectionCommand();
        $cmd->setName($data['name']);
        $cmd->setDescription($data['description'] ?? null);
        $cmd->setCommands($data['commands']);
        $cmd->setEnabled($data['enabled'] ?? true);
        $cmd->setFolder($folder);
        $cmd->setContext($context);
        $em->persist($cmd);
        return $cmd;
    }

    private function importCustomCmdFolders(array $folders, CollectionFolder $parent, Context $context, EntityManagerInterface $em, array &$cmdRefMap): void
    {
        foreach ($folders as $folderData) {
            $folder = new CollectionFolder();
            $folder->setName($folderData['name']);
            $folder->setType(CollectionFolder::TYPE_CUSTOM);
            $folder->setParent($parent);
            $folder->setContext($context);
            $em->persist($folder);

            foreach ($folderData['commands'] ?? [] as $cmdData) {
                $cmd = $this->createCommand($cmdData, $folder, $context, $em);
                $cmdRefMap[$cmdData['_ref']] = $cmd;
            }

            $this->importCustomCmdFolders($folderData['children'] ?? [], $folder, $context, $em, $cmdRefMap);
        }
    }

    private function createRule(array $data, CollectionRuleFolder $folder, Context $context, EntityManagerInterface $em, array &$ruleRefMap, array &$extractRefMap, array &$pendingKeyExtracts): void
    {
        $rule = new CollectionRule();
        $rule->setName($data['name']);
        $rule->setDescription($data['description'] ?? null);
        $rule->setEnabled($data['enabled'] ?? true);
        $rule->setSource($data['source'] ?? CollectionRule::SOURCE_LOCAL);
        $rule->setCommand($data['command'] ?? null);
        $rule->setTag($data['tag'] ?? null);
        $rule->setFolder($folder);
        $rule->setContext($context);
        $em->persist($rule);

        $ruleRefMap[$data['_ref']] = $rule;

        foreach ($data['extracts'] ?? [] as $extData) {
            $extract = new CollectionRuleExtract();
            $extract->setName($extData['name']);
            $extract->setRegex($extData['regex']);
            $extract->setMultiline($extData['multiline'] ?? false);
            $extract->setKeyMode($extData['keyMode'] ?? CollectionRuleExtract::KEY_MODE_MANUAL);
            $extract->setKeyManual($extData['keyManual'] ?? null);
            $extract->setKeyGroup($extData['keyGroup'] ?? null);
            $extract->setKeyLabel($extData['keyLabel'] ?? null);
            $extract->setValueGroup($extData['valueGroup'] ?? null);
            $extract->setValueMap($extData['valueMap'] ?? null);
            $extract->setNodeField($extData['nodeField'] ?? null);
            $extract->setNodeFieldGroup($extData['nodeFieldGroup'] ?? null);
            $extract->setPosition($extData['position'] ?? 0);
            $extract->setRule($rule);

            if (!empty($extData['categoryName'])) {
                $category = $em->getRepository(InventoryCategory::class)->findOneBy([
                    'name' => $extData['categoryName'],
                    'context' => $context,
                ]);
                if (!$category) {
                    $category = new InventoryCategory();
                    $category->setName($extData['categoryName']);
                    $category->setKeyLabel($extData['categoryKeyLabel'] ?? null);
                    $category->setContext($context);
                    $em->persist($category);
                }
                $extract->setCategory($category);
            }

            $em->persist($extract);
            $extractRefMap[$extData['_ref']] = $extract;

            if (!empty($extData['keyExtractRef'])) {
                $pendingKeyExtracts[] = [$extract, $extData['keyExtractRef']];
            }
        }
    }

    private function importCustomRuleFolders(array $folders, CollectionRuleFolder $parent, Context $context, EntityManagerInterface $em, array &$ruleRefMap, array &$extractRefMap, array &$pendingKeyExtracts): void
    {
        foreach ($folders as $folderData) {
            $folder = new CollectionRuleFolder();
            $folder->setName($folderData['name']);
            $folder->setType(CollectionRuleFolder::TYPE_CUSTOM);
            $folder->setParent($parent);
            $folder->setContext($context);
            $em->persist($folder);

            foreach ($folderData['rules'] ?? [] as $ruleData) {
                $this->createRule($ruleData, $folder, $context, $em, $ruleRefMap, $extractRefMap, $pendingKeyExtracts);
            }

            $this->importCustomRuleFolders($folderData['children'] ?? [], $folder, $context, $em, $ruleRefMap, $extractRefMap, $pendingKeyExtracts);
        }
    }
}
