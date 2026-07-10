<?php

namespace App\Service\Context;

use App\Entity\CliCredential;
use App\Entity\Collection;
use App\Entity\CollectionCommand;
use App\Entity\CollectionFolder;
use App\Entity\CollectionRule;
use App\Entity\CollectionRuleExtract;
use App\Entity\CollectionRuleFolder;
use App\Entity\CompliancePolicy;
use App\Entity\ComplianceRule;
use App\Entity\ComplianceRuleFolder;
use App\Entity\Context;
use App\Entity\DeviceModel;
use App\Entity\Editor;
use App\Entity\InventoryCategory;
use App\Entity\Lab;
use App\Entity\LabTask;
use App\Entity\MailReport;
use App\Entity\MailServer;
use App\Entity\MonitoringOid;
use App\Entity\Node;
use App\Entity\NodeDynamicTag;
use App\Entity\NodeTag;
use App\Entity\ProductRange;
use App\Entity\Profile;
use App\Entity\Report;
use App\Entity\ReportTheme;
use App\Entity\Schedule;
use App\Entity\SnmpCredential;
use App\Entity\VendorPlugin;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\DependencyInjection\Attribute\Autowire;

class ContextImporter
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        #[Autowire('%kernel.project_dir%')]
        private readonly string $projectDir,
    ) {}

    /**
     * Inspect a ZIP without applying any change. Returns metadata about the
     * import (list of contexts, conflict resolution previewed names, counts).
     *
     * @return array{format:string,version:int,exportedAt:?string,contexts:array<int,array<string,mixed>>}
     */
    public function preview(string $zipPath): array
    {
        $payload = $this->readPayload($zipPath);
        $existingNames = $this->existingContextNames();
        $existingDefault = $this->em->getRepository(Context::class)->findOneBy(['isDefault' => true]);
        $defaultIsEmpty = $existingDefault ? $this->isContextEmpty($existingDefault) : false;

        $contexts = [];
        $usedNames = $existingNames;
        foreach ($payload['contexts'] as $ctxData) {
            $entity = $ctxData['context'];
            $action = 'create';
            $effectiveName = $entity['name'];

            if (!empty($entity['isDefault']) && $existingDefault) {
                if ($defaultIsEmpty) {
                    $action = 'merge-default';
                    $effectiveName = $existingDefault->getName();
                } else {
                    $action = 'rename';
                    $effectiveName = $this->generateUniqueName($entity['name'], $usedNames);
                    $usedNames[] = $effectiveName;
                }
            } elseif (in_array($effectiveName, $usedNames, true)) {
                $action = 'rename';
                $effectiveName = $this->generateUniqueName($effectiveName, $usedNames);
                $usedNames[] = $effectiveName;
            } else {
                $usedNames[] = $effectiveName;
            }

            $contexts[] = [
                'sourceName' => $entity['name'],
                'effectiveName' => $effectiveName,
                'action' => $action,
                'isDefault' => (bool) ($entity['isDefault'] ?? false),
                'counts' => [
                    'editors' => count($ctxData['editors'] ?? []),
                    'deviceModels' => count($ctxData['deviceModels'] ?? []),
                    'nodes' => count($ctxData['nodes'] ?? []),
                    'collections' => count($ctxData['collections'] ?? []),
                    'collectionRules' => count($ctxData['collectionRules'] ?? []),
                    'collectionCommands' => count($ctxData['collectionCommands'] ?? []),
                    'compliancePolicies' => count($ctxData['compliancePolicies'] ?? []),
                    'complianceRules' => count($ctxData['complianceRules'] ?? []),
                    'reports' => count($ctxData['reports'] ?? []),
                    'mailReports' => count($ctxData['mailReports'] ?? []),
                    'schedules' => count($ctxData['schedules'] ?? []),
                    'labs' => count($ctxData['labs'] ?? []),
                ],
            ];
        }

        return [
            'format' => $payload['_format'],
            'version' => (int) ($payload['_version'] ?? 1),
            'exportedAt' => $payload['_exportedAt'] ?? null,
            'contexts' => $contexts,
        ];
    }

    /**
     * Import a ZIP into the database. Each context is imported in its own
     * transaction. Returns the list of resulting contexts.
     *
     * @return Context[]
     */
    public function import(string $zipPath): array
    {
        $payload = $this->readPayload($zipPath);

        $extractDir = $this->extractZip($zipPath);
        $imported = [];

        try {
            foreach ($payload['contexts'] as $ctxData) {
                $imported[] = $this->importOneContext($ctxData, $extractDir);
            }
        } finally {
            $this->cleanupDir($extractDir);
        }

        return $imported;
    }

    // ─── Reading helpers ──────────────────────────────────────────────

    private function readPayload(string $zipPath): array
    {
        $zip = new \ZipArchive();
        if ($zip->open($zipPath) !== true) {
            throw new \RuntimeException("Cannot open archive: {$zipPath}");
        }
        $json = $zip->getFromName('data.json');
        $zip->close();
        if ($json === false) {
            throw new \RuntimeException('Archive does not contain data.json');
        }
        $data = json_decode($json, true);
        if (!is_array($data) || ($data['_format'] ?? null) !== ContextExporter::FORMAT) {
            throw new \RuntimeException('Invalid archive format');
        }
        return $data;
    }

    private function extractZip(string $zipPath): string
    {
        $dir = sys_get_temp_dir() . '/ctx-import-' . bin2hex(random_bytes(8));
        if (!mkdir($dir, 0775, true) && !is_dir($dir)) {
            throw new \RuntimeException("Cannot create temp dir: {$dir}");
        }
        $zip = new \ZipArchive();
        if ($zip->open($zipPath) !== true) {
            throw new \RuntimeException("Cannot open archive: {$zipPath}");
        }
        $zip->extractTo($dir);
        $zip->close();
        return $dir;
    }

    private function cleanupDir(string $dir): void
    {
        if (!is_dir($dir)) {
            return;
        }
        $iter = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($dir, \FilesystemIterator::SKIP_DOTS),
            \RecursiveIteratorIterator::CHILD_FIRST,
        );
        foreach ($iter as $info) {
            if ($info->isDir()) {
                @rmdir($info->getPathname());
            } else {
                @unlink($info->getPathname());
            }
        }
        @rmdir($dir);
    }

    /** @return string[] */
    private function existingContextNames(): array
    {
        return array_map(
            fn(Context $c) => $c->getName(),
            $this->em->getRepository(Context::class)->findAll(),
        );
    }

    private function generateUniqueName(string $base, array $taken): string
    {
        if (!in_array($base, $taken, true)) {
            return $base;
        }
        for ($i = 1; $i < 1000; $i++) {
            $candidate = $base . ' (' . $i . ')';
            if (!in_array($candidate, $taken, true)) {
                return $candidate;
            }
        }
        return $base . ' (' . uniqid() . ')';
    }

    private function isContextEmpty(Context $context): bool
    {
        $repos = [
            Node::class,
            CollectionRule::class,
            CollectionCommand::class,
            CompliancePolicy::class,
            Report::class,
            MailReport::class,
            Schedule::class,
            Editor::class,
            DeviceModel::class,
            Profile::class,
            SnmpCredential::class,
            CliCredential::class,
            Lab::class,
        ];
        foreach ($repos as $cls) {
            $count = (int) $this->em->createQuery(
                "SELECT COUNT(e) FROM {$cls} e WHERE e.context = :ctx"
            )->setParameter('ctx', $context)->getSingleScalarResult();
            if ($count > 0) {
                return false;
            }
        }
        return true;
    }

    // ─── Per-context import ───────────────────────────────────────────

    private function importOneContext(array $data, string $extractDir): Context
    {
        $em = $this->em;
        $em->beginTransaction();
        try {
            $context = $this->resolveTargetContext($data['context']);

            /** @var array<string, object> $idMap ref => new entity */
            $idMap = [];

            $this->importEditors($data['editors'] ?? [], $context, $idMap);
            $this->importDeviceModels($data['deviceModels'] ?? [], $context, $idMap);
            $this->importProductRanges($data['productRanges'] ?? [], $context, $idMap);
            $this->importVendorPlugins($data['vendorPlugins'] ?? [], $context, $idMap);
            $this->importMonitoringOids($data['monitoringOids'] ?? [], $idMap);
            $this->importInventoryCategories($data['inventoryCategories'] ?? [], $context, $idMap);
            $this->importSnmpCredentials($data['snmpCredentials'] ?? [], $context, $idMap);
            $this->importCliCredentials($data['cliCredentials'] ?? [], $context, $idMap);
            $this->importProfiles($data['profiles'] ?? [], $context, $idMap);
            $this->importNodeTags($data['nodeTags'] ?? [], $context, $idMap);
            $this->importNodes($data['nodes'] ?? [], $context, $idMap);

            $this->importFolderHierarchy(
                $data['collectionFolders'] ?? [],
                $context,
                $idMap,
                CollectionFolder::class,
                'collectionFolder',
            );
            $this->importCollectionCommands($data['collectionCommands'] ?? [], $context, $idMap);

            $this->importFolderHierarchy(
                $data['collectionRuleFolders'] ?? [],
                $context,
                $idMap,
                CollectionRuleFolder::class,
                'collectionRuleFolder',
            );
            $this->importCollectionRules($data['collectionRules'] ?? [], $context, $idMap);
            $this->importCollectionRuleExtracts($data['collectionRuleExtracts'] ?? [], $context, $idMap);
            $this->remapRuleTranslationExtractIds($data['collectionRules'] ?? [], $idMap);

            $this->importNodeDynamicTags($data['nodeDynamicTags'] ?? [], $idMap);

            $this->importCompliancePolicies($data['compliancePolicies'] ?? [], $context, $idMap);
            $this->importComplianceFoldersAndRules(
                $data['complianceRuleFolders'] ?? [],
                $data['complianceRules'] ?? [],
                $context,
                $idMap,
            );
            $this->applyCompliancePolicyAssociations($data['compliancePolicies'] ?? [], $idMap);

            $em->flush();

            $newCollectionIds = $this->importCollections($data['collections'] ?? [], $context, $idMap);

            $this->importReportThemes($data['reportThemes'] ?? [], $context, $idMap);
            $this->importReports($data['reports'] ?? [], $context, $idMap);
            $this->importMailReports($data['mailReports'] ?? [], $context, $idMap);
            $this->importSchedules($data['schedules'] ?? [], $context, $idMap);

            $this->importLabs($data['labs'] ?? [], $context, $idMap);
            $this->importLabTasks($data['labTasks'] ?? [], $idMap);

            $this->applyDeviceModelAssociations($data['deviceModels'] ?? [], $idMap);

            $em->flush();

            $sourceContextId = $this->parseRefId($data['context']['_ref']);
            $this->restoreFiles($extractDir, $sourceContextId, $newCollectionIds);

            $em->commit();
            return $context;
        } catch (\Throwable $e) {
            $em->rollback();
            throw $e;
        }
    }

    private function resolveTargetContext(array $ctxData): Context
    {
        $existingNames = $this->existingContextNames();
        $existingDefault = $this->em->getRepository(Context::class)->findOneBy(['isDefault' => true]);

        if (!empty($ctxData['isDefault']) && $existingDefault && $this->isContextEmpty($existingDefault)) {
            // Merge into the existing empty default — preserve its id and name
            // but copy over settings from the imported context.
            $this->applyContextSettings($existingDefault, $ctxData);
            return $existingDefault;
        }

        $context = new Context();
        $name = $ctxData['name'];
        if (in_array($name, $existingNames, true)
            || (!empty($ctxData['isDefault']) && $existingDefault)
        ) {
            $name = $this->generateUniqueName($name, $existingNames);
        }
        $context->setName($name);
        $this->applyContextSettings($context, $ctxData);
        // Imported context never wins the default flag — there's only one default.
        $context->setIsDefault(false);
        $this->em->persist($context);
        $this->em->flush();

        return $context;
    }

    private function applyContextSettings(Context $context, array $ctxData): void
    {
        $context->setDescription($ctxData['description'] ?? null);
        $context->setMonitoringEnabled((bool) ($ctxData['monitoringEnabled'] ?? false));
        $context->setSnmpRetentionMinutes(max(1, (int) ($ctxData['snmpRetentionMinutes'] ?? 120)));
        $context->setSnmpPollIntervalSeconds(max(5, (int) ($ctxData['snmpPollIntervalSeconds'] ?? 60)));
        $context->setIcmpPollIntervalSeconds(max(5, (int) ($ctxData['icmpPollIntervalSeconds'] ?? 60)));
        $context->setPublicEnabled((bool) ($ctxData['publicEnabled'] ?? false));
        $context->setVulnerabilityEnabled((bool) ($ctxData['vulnerabilityEnabled'] ?? false));
        $context->setNvdApiKey($ctxData['nvdApiKey'] ?? null);
        $context->setVulnerabilitySyncIntervalHours(max(1, (int) ($ctxData['vulnerabilitySyncIntervalHours'] ?? 24)));
        $context->setVulnerabilityScoreWeight((float) ($ctxData['vulnerabilityScoreWeight'] ?? 0.3));
        $context->setComplianceScoreWeight((float) ($ctxData['complianceScoreWeight'] ?? 0.7));
        $context->setSystemUpdateEnabled((bool) ($ctxData['systemUpdateEnabled'] ?? false));
        $context->setSystemUpdateScoreWeight((float) ($ctxData['systemUpdateScoreWeight'] ?? 0.0));
        $context->setNodeColumnsConfig($ctxData['nodeColumnsConfig'] ?? null);
    }

    // ─── Per-entity importers ─────────────────────────────────────────

    private function importEditors(array $rows, Context $context, array &$idMap): void
    {
        foreach ($rows as $row) {
            $e = (new Editor())
                ->setName($row['name'] ?? '')
                ->setDescription($row['description'] ?? null)
                ->setLogo($row['logo'] ?? null)
                ->setContext($context);
            $this->em->persist($e);
            $idMap[$row['_ref']] = $e;
        }
    }

    private function importDeviceModels(array $rows, Context $context, array &$idMap): void
    {
        foreach ($rows as $row) {
            $m = (new DeviceModel())
                ->setName($row['name'] ?? '')
                ->setDescription($row['description'] ?? null)
                ->setConnectionScript($row['connectionScript'] ?? null)
                ->setSendCtrlChar($row['sendCtrlChar'] ?? null)
                ->setNvdKeyword($row['nvdKeyword'] ?? null)
                ->setContext($context);
            if ($row['manufacturer'] ?? null) {
                $m->setManufacturer($idMap[$row['manufacturer']] ?? null);
            }
            $this->em->persist($m);
            $idMap[$row['_ref']] = $m;
        }
    }

    private function importProductRanges(array $rows, Context $context, array &$idMap): void
    {
        foreach ($rows as $row) {
            $r = (new ProductRange())
                ->setName($row['name'] ?? '')
                ->setDescription($row['description'] ?? null)
                ->setRecommendedVersion($row['recommendedVersion'] ?? null)
                ->setCurrentVersion($row['currentVersion'] ?? null)
                ->setReleaseDate($this->dt($row['releaseDate'] ?? null))
                ->setEndOfSaleDate($this->dt($row['endOfSaleDate'] ?? null))
                ->setEndOfSupportDate($this->dt($row['endOfSupportDate'] ?? null))
                ->setEndOfLifeDate($this->dt($row['endOfLifeDate'] ?? null))
                ->setPluginSource($row['pluginSource'] ?? null)
                ->setContext($context);
            if ($row['manufacturer'] ?? null) {
                $r->setManufacturer($idMap[$row['manufacturer']] ?? null);
            }
            $this->em->persist($r);
            $idMap[$row['_ref']] = $r;
        }
    }

    private function importVendorPlugins(array $rows, Context $context, array &$idMap): void
    {
        foreach ($rows as $row) {
            $existing = $this->em->getRepository(VendorPlugin::class)->findOneBy([
                'context' => $context,
                'pluginIdentifier' => $row['pluginIdentifier'] ?? '',
            ]);
            if ($existing) {
                $existing->setEnabled((bool) ($row['enabled'] ?? false));
                $existing->setConfiguration($row['configuration'] ?? null);
                $idMap[$row['_ref']] = $existing;
                continue;
            }
            $p = (new VendorPlugin())
                ->setPluginIdentifier($row['pluginIdentifier'] ?? '')
                ->setEnabled((bool) ($row['enabled'] ?? false))
                ->setConfiguration($row['configuration'] ?? null)
                ->setContext($context);
            $this->em->persist($p);
            $idMap[$row['_ref']] = $p;
        }
    }

    private function importMonitoringOids(array $rows, array &$idMap): void
    {
        foreach ($rows as $row) {
            $deviceModel = $row['deviceModel'] ? ($idMap[$row['deviceModel']] ?? null) : null;
            if (!$deviceModel) {
                continue;
            }
            $o = (new MonitoringOid())
                ->setDeviceModel($deviceModel)
                ->setCategory($row['category'] ?? '')
                ->setOid($row['oid'] ?? '')
                ->setEnabled((bool) ($row['enabled'] ?? true));
            $this->em->persist($o);
            $idMap[$row['_ref']] = $o;
        }
    }

    private function importInventoryCategories(array $rows, Context $context, array &$idMap): void
    {
        foreach ($rows as $row) {
            $existing = $this->em->getRepository(InventoryCategory::class)->findOneBy([
                'context' => $context,
                'name' => $row['name'] ?? '',
            ]);
            if ($existing) {
                $idMap[$row['_ref']] = $existing;
                continue;
            }
            $c = (new InventoryCategory())
                ->setName($row['name'] ?? '')
                ->setKeyLabel($row['keyLabel'] ?? null)
                ->setColumnConfig($row['columnConfig'] ?? null)
                ->setSortConfig($row['sortConfig'] ?? null)
                ->setContext($context);
            $this->em->persist($c);
            $idMap[$row['_ref']] = $c;
        }
    }

    private function importSnmpCredentials(array $rows, Context $context, array &$idMap): void
    {
        foreach ($rows as $row) {
            $s = (new SnmpCredential())
                ->setName($row['name'] ?? '')
                ->setVersion($row['version'] ?? null)
                ->setCommunity($row['community'] ?? null)
                ->setUsername($row['username'] ?? null)
                ->setSecurityLevel($row['securityLevel'] ?? null)
                ->setAuthProtocol($row['authProtocol'] ?? null)
                ->setAuthPassword($row['authPassword'] ?? null)
                ->setPrivProtocol($row['privProtocol'] ?? null)
                ->setPrivPassword($row['privPassword'] ?? null)
                ->setContext($context);
            $this->em->persist($s);
            $idMap[$row['_ref']] = $s;
        }
    }

    private function importCliCredentials(array $rows, Context $context, array &$idMap): void
    {
        foreach ($rows as $row) {
            $c = (new CliCredential())
                ->setName($row['name'] ?? '')
                ->setProtocol($row['protocol'] ?? null)
                ->setPort($row['port'] ?? null)
                ->setUsername($row['username'] ?? null)
                ->setPassword($row['password'] ?? null)
                ->setEnablePassword($row['enablePassword'] ?? null)
                ->setContext($context);
            $this->em->persist($c);
            $idMap[$row['_ref']] = $c;
        }
    }

    private function importProfiles(array $rows, Context $context, array &$idMap): void
    {
        foreach ($rows as $row) {
            $p = (new Profile())
                ->setName($row['name'] ?? '')
                ->setContext($context);
            if ($row['snmpCredential'] ?? null) {
                $p->setSnmpCredential($idMap[$row['snmpCredential']] ?? null);
            }
            if ($row['cliCredential'] ?? null) {
                $p->setCliCredential($idMap[$row['cliCredential']] ?? null);
            }
            $this->em->persist($p);
            $idMap[$row['_ref']] = $p;
        }
    }

    private function importNodeTags(array $rows, Context $context, array &$idMap): void
    {
        foreach ($rows as $row) {
            $t = (new NodeTag())
                ->setName($row['name'] ?? '')
                ->setColor($row['color'] ?? '#6b7280')
                ->setContext($context);
            $this->em->persist($t);
            $idMap[$row['_ref']] = $t;
        }
    }

    private function importNodes(array $rows, Context $context, array &$idMap): void
    {
        foreach ($rows as $row) {
            $n = (new Node())
                ->setName($row['name'] ?? null)
                ->setIpAddress($row['ipAddress'] ?? '0.0.0.0')
                ->setHostname($row['hostname'] ?? null)
                ->setDiscoveredModel($row['discoveredModel'] ?? null)
                ->setDiscoveredVersion($row['discoveredVersion'] ?? null)
                ->setPolicy($row['policy'] ?? 'audit')
                ->setContext($context);
            if ($row['manufacturer'] ?? null) {
                $n->setManufacturer($idMap[$row['manufacturer']] ?? null);
            }
            if ($row['model'] ?? null) {
                $n->setModel($idMap[$row['model']] ?? null);
            }
            if ($row['profile'] ?? null) {
                $n->setProfile($idMap[$row['profile']] ?? null);
            }
            foreach ($row['tags'] ?? [] as $tagRef) {
                if (isset($idMap[$tagRef])) {
                    $n->addTag($idMap[$tagRef]);
                }
            }
            $this->em->persist($n);
            $idMap[$row['_ref']] = $n;
        }
    }

    /**
     * Generic two-pass folder-tree importer for entities with self-referencing parent.
     */
    private function importFolderHierarchy(
        array $rows,
        Context $context,
        array &$idMap,
        string $entityClass,
        string $parentField,
    ): void {
        $remaining = $rows;
        $progress = true;
        while ($remaining && $progress) {
            $progress = false;
            $next = [];
            foreach ($remaining as $row) {
                $parentRef = $row['parent'] ?? null;
                if ($parentRef !== null && !isset($idMap[$parentRef])) {
                    $next[] = $row;
                    continue;
                }
                $f = new $entityClass();
                $f->setName($row['name'] ?? '');
                $f->setType($row['type'] ?? 'custom');
                if ($parentRef !== null) {
                    $f->setParent($idMap[$parentRef]);
                }
                if ($row['manufacturer'] ?? null) {
                    $f->setManufacturer($idMap[$row['manufacturer']] ?? null);
                }
                if ($row['model'] ?? null) {
                    $f->setModel($idMap[$row['model']] ?? null);
                }
                $f->setContext($context);
                $this->em->persist($f);
                $idMap[$row['_ref']] = $f;
                $progress = true;
            }
            $remaining = $next;
        }
        if ($remaining) {
            throw new \RuntimeException("Cannot resolve parent hierarchy for {$entityClass}");
        }
    }

    private function importCollectionCommands(array $rows, Context $context, array &$idMap): void
    {
        foreach ($rows as $row) {
            $c = (new CollectionCommand())
                ->setName($row['name'] ?? '')
                ->setDescription($row['description'] ?? null)
                ->setCommands($row['commands'] ?? '')
                ->setEnabled((bool) ($row['enabled'] ?? true))
                ->setContext($context);
            if ($row['folder'] ?? null) {
                $c->setFolder($idMap[$row['folder']] ?? null);
            }
            $this->em->persist($c);
            $idMap[$row['_ref']] = $c;
        }
    }

    private function importCollectionRules(array $rows, Context $context, array &$idMap): void
    {
        foreach ($rows as $row) {
            $r = (new CollectionRule())
                ->setName($row['name'] ?? '')
                ->setDescription($row['description'] ?? null)
                ->setEnabled((bool) ($row['enabled'] ?? true))
                ->setSource($row['source'] ?? CollectionRule::SOURCE_LOCAL)
                ->setCommand($row['command'] ?? null)
                ->setTranslations($row['translations'] ?? null)
                ->setConditionTree($row['conditionTree'] ?? null)
                ->setContext($context);
            if ($row['folder'] ?? null) {
                $r->setFolder($idMap[$row['folder']] ?? null);
            }
            $this->em->persist($r);
            $idMap[$row['_ref']] = $r;
        }
    }

    private function importCollectionRuleExtracts(array $rows, Context $context, array &$idMap): void
    {
        $deferred = [];
        foreach ($rows as $row) {
            $rule = $idMap[$row['rule']] ?? null;
            if (!$rule) {
                continue;
            }
            $e = (new CollectionRuleExtract())
                ->setName($row['name'] ?? '')
                ->setRegex($row['regex'] ?? '')
                ->setMultiline((bool) ($row['multiline'] ?? false))
                ->setKeyMode($row['keyMode'] ?? CollectionRuleExtract::KEY_MODE_MANUAL)
                ->setKeyManual($row['keyManual'] ?? null)
                ->setKeyGroup($row['keyGroup'] ?? null)
                ->setKeyLabel($row['keyLabel'] ?? null)
                ->setValueGroup($row['valueGroup'] ?? null)
                ->setValueMap($row['valueMap'] ?? null)
                ->setNodeField($row['nodeField'] ?? null)
                ->setNodeFieldGroup($row['nodeFieldGroup'] ?? null)
                ->setExtractMode($row['extractMode'] ?? CollectionRuleExtract::EXTRACT_MODE_LINE)
                ->setBlockSeparator($row['blockSeparator'] ?? null)
                ->setBlockKeyGroup($row['blockKeyGroup'] ?? null)
                ->setBlockKeyTemplate($row['blockKeyTemplate'] ?? null)
                ->setBlockCaptures(is_array($row['blockCaptures'] ?? null) ? $row['blockCaptures'] : null)
                ->setPosition((int) ($row['position'] ?? 0))
                ->setRule($rule);
            if ($row['category'] ?? null) {
                $e->setCategory($idMap[$row['category']] ?? null);
            }
            $this->em->persist($e);
            $idMap[$row['_ref']] = $e;
            if ($row['keyExtract'] ?? null) {
                $deferred[] = [$e, $row['keyExtract']];
            }
        }
        $this->em->flush();
        foreach ($deferred as [$extract, $ref]) {
            if (isset($idMap[$ref])) {
                $extract->setKeyExtract($idMap[$ref]);
            }
        }
    }

    /**
     * Rule translations reference their extracts by the extract's database id
     * (`extractId`). After import those extracts have brand-new ids, so the
     * stored ids are stale and the runtime translation matching
     * (CollectNodeMessageHandler::applyTranslation) never fires. Remap each
     * stale id to the freshly-imported extract.
     *
     * The export encodes an extract's old id in its `_ref` as
     * "collectionRuleExtract:<oldId>", so we can recover the mapping from the
     * already-populated $idMap without touching the export format — making this
     * backward-compatible with previously exported files.
     */
    private function remapRuleTranslationExtractIds(array $ruleRows, array $idMap): void
    {
        foreach ($ruleRows as $row) {
            $rule = $idMap[$row['_ref']] ?? null;
            if (!$rule || !is_array($row['translations'] ?? null)) {
                continue;
            }

            $changed = false;
            $translations = $row['translations'];
            foreach ($translations as &$t) {
                $oldId = $t['extractId'] ?? null;
                if ($oldId === null) {
                    continue;
                }
                $newExtract = $idMap['collectionRuleExtract:' . $oldId] ?? null;
                if ($newExtract !== null) {
                    $t['extractId'] = $newExtract->getId();
                    $changed = true;
                }
            }
            unset($t);

            if ($changed) {
                $rule->setTranslations($translations);
            }
        }
    }

    private function importNodeDynamicTags(array $rows, array &$idMap): void
    {
        foreach ($rows as $row) {
            $node = $idMap[$row['node']] ?? null;
            $tag = $idMap[$row['tag']] ?? null;
            if (!$node || !$tag) {
                continue;
            }
            $d = (new NodeDynamicTag())
                ->setNode($node)
                ->setTag($tag);
            if ($row['rule'] ?? null) {
                $d->setRule($idMap[$row['rule']] ?? null);
            }
            $this->em->persist($d);
            $idMap[$row['_ref']] = $d;
        }
    }

    private function importCompliancePolicies(array $rows, Context $context, array &$idMap): void
    {
        foreach ($rows as $row) {
            $p = (new CompliancePolicy())
                ->setName($row['name'] ?? '')
                ->setDescription($row['description'] ?? null)
                ->setEnabled((bool) ($row['enabled'] ?? true))
                ->setMatchRules($row['matchRules'] ?? null)
                ->setContext($context);
            $this->em->persist($p);
            $idMap[$row['_ref']] = $p;
        }
    }

    private function importComplianceFoldersAndRules(array $folderRows, array $ruleRows, Context $context, array &$idMap): void
    {
        $remaining = $folderRows;
        $progress = true;
        while ($remaining && $progress) {
            $progress = false;
            $next = [];
            foreach ($remaining as $row) {
                $parentRef = $row['parent'] ?? null;
                if ($parentRef !== null && !isset($idMap[$parentRef])) {
                    $next[] = $row;
                    continue;
                }
                $f = (new ComplianceRuleFolder())
                    ->setName($row['name'] ?? '')
                    ->setContext($context);
                if ($parentRef !== null) {
                    $f->setParent($idMap[$parentRef]);
                }
                if ($row['policy'] ?? null) {
                    $f->setPolicy($idMap[$row['policy']] ?? null);
                }
                $this->em->persist($f);
                $idMap[$row['_ref']] = $f;
                $progress = true;
            }
            $remaining = $next;
        }
        if ($remaining) {
            throw new \RuntimeException('Cannot resolve compliance folder hierarchy');
        }

        foreach ($ruleRows as $row) {
            $r = (new ComplianceRule())
                ->setIdentifier($row['identifier'] ?? null)
                ->setName($row['name'] ?? '')
                ->setDescription($row['description'] ?? null)
                ->setEnabled((bool) ($row['enabled'] ?? true))
                ->setDataSources($row['dataSources'] ?? [])
                ->setConditionTree($row['conditionTree'] ?? null)
                ->setMultiRowMessages($row['multiRowMessages'] ?? null)
                ->setContext($context);
            if ($row['folder'] ?? null) {
                $r->setFolder($idMap[$row['folder']] ?? null);
            }
            $this->em->persist($r);
            $idMap[$row['_ref']] = $r;
        }
    }

    private function applyCompliancePolicyAssociations(array $rows, array $idMap): void
    {
        foreach ($rows as $row) {
            /** @var CompliancePolicy|null $policy */
            $policy = $idMap[$row['_ref']] ?? null;
            if (!$policy) {
                continue;
            }
            foreach ($row['extraRules'] ?? [] as $ruleRef) {
                if (isset($idMap[$ruleRef])) {
                    $policy->addExtraRule($idMap[$ruleRef]);
                }
            }
            foreach ($row['nodes'] ?? [] as $nodeRef) {
                if (isset($idMap[$nodeRef])) {
                    $policy->addNode($idMap[$nodeRef]);
                }
            }
        }
    }

    /**
     * @return array<int,int> source collection id → new collection id
     */
    private function importCollections(array $rows, Context $context, array &$idMap): array
    {
        $newIds = [];
        foreach ($rows as $row) {
            $node = $idMap[$row['node']] ?? null;
            if (!$node) {
                continue;
            }
            // Never carry over a transient (in-flight) state from the source:
            // the export may have been taken mid-collect/mid-extract, leaving a
            // 'running'/'pending' status with no worker behind it on the target.
            // A bundled collection is, by definition, a finished one.
            $status = $row['status'] ?? Collection::STATUS_COMPLETED;
            if (!in_array($status, [Collection::STATUS_COMPLETED, Collection::STATUS_FAILED], true)) {
                $status = Collection::STATUS_COMPLETED;
            }
            $extractStatus = $row['extractStatus'] ?? null;
            if (!in_array($extractStatus, [Collection::EXTRACT_STATUS_COMPLETED, Collection::EXTRACT_STATUS_FAILED], true)) {
                // No extraction is actually running on the target — drop the
                // phantom indicator. Inventory is (re)built on the next extract.
                $extractStatus = null;
            }

            $c = new Collection();
            $c->setNode($node);
            $c->setContext($context);
            $c->setTags($row['tags'] ?? []);
            $c->setStatus($status);
            $c->setCommandCount((int) ($row['commandCount'] ?? 0));
            $c->setCompletedCount((int) ($row['completedCount'] ?? 0));
            $c->setStartedAt($this->dt($row['startedAt'] ?? null));
            $c->setCompletedAt($this->dt($row['completedAt'] ?? null));
            $c->setExtractStatus($extractStatus);
            $c->setLastExtractedAt($this->dt($row['lastExtractedAt'] ?? null));
            $this->em->persist($c);
            $this->em->flush($c);
            $idMap[$row['_ref']] = $c;
            $newIds[$this->parseRefId($row['_ref'])] = $c->getId();
        }
        return $newIds;
    }

    private function importReportThemes(array $rows, Context $context, array &$idMap): void
    {
        foreach ($rows as $row) {
            $t = (new ReportTheme())
                ->setName($row['name'] ?? '')
                ->setDescription($row['description'] ?? null)
                ->setIsDefault((bool) ($row['isDefault'] ?? false))
                ->setStyles($row['styles'] ?? [])
                ->setContext($context);
            $this->em->persist($t);
            $idMap[$row['_ref']] = $t;
        }
    }

    private function importReports(array $rows, Context $context, array &$idMap): void
    {
        foreach ($rows as $row) {
            $theme = $idMap[$row['theme']] ?? $this->em->getRepository(ReportTheme::class)->findOneBy(['isDefault' => true]);
            if (!$theme) {
                continue;
            }
            $r = (new Report())
                ->setName($row['name'] ?? '')
                ->setDescription($row['description'] ?? null)
                ->setLocale($row['locale'] ?? 'fr')
                ->setTitle($row['title'] ?? '')
                ->setSubtitle($row['subtitle'] ?? null)
                ->setShowTableOfContents((bool) ($row['showTableOfContents'] ?? true))
                ->setShowAuthorsPage((bool) ($row['showAuthorsPage'] ?? true))
                ->setShowRevisionPage((bool) ($row['showRevisionPage'] ?? false))
                ->setShowIllustrationsPage((bool) ($row['showIllustrationsPage'] ?? false))
                ->setTags($row['tags'] ?? null)
                ->setAuthors($row['authors'] ?? [])
                ->setRecipients($row['recipients'] ?? [])
                ->setRevisions($row['revisions'] ?? [])
                ->setBlocks($row['blocks'] ?? [])
                ->setType($row['type'] ?? Report::TYPE_GENERAL)
                ->setTheme($theme)
                ->setContext($context);
            foreach ($row['nodes'] ?? [] as $nodeRef) {
                if (isset($idMap[$nodeRef])) {
                    $r->addNode($idMap[$nodeRef]);
                }
            }
            $this->em->persist($r);
            $idMap[$row['_ref']] = $r;
        }
    }

    private function importMailReports(array $rows, Context $context, array &$idMap): void
    {
        foreach ($rows as $row) {
            $theme = $idMap[$row['theme']] ?? $this->em->getRepository(ReportTheme::class)->findOneBy(['isDefault' => true]);
            if (!$theme) {
                continue;
            }
            $m = (new MailReport())
                ->setName($row['name'] ?? '')
                ->setDescription($row['description'] ?? null)
                ->setLocale($row['locale'] ?? 'fr')
                ->setSubject($row['subject'] ?? '')
                ->setPreheader($row['preheader'] ?? null)
                ->setType($row['type'] ?? MailReport::TYPE_GENERAL)
                ->setBlocks($row['blocks'] ?? [])
                ->setRecipientUserIds($row['recipientUserIds'] ?? null)
                ->setRecipientExternalEmails($row['recipientExternalEmails'] ?? null)
                ->setTheme($theme)
                ->setContext($context);
            if ($row['mailServerId'] ?? null) {
                $server = $this->em->getRepository(MailServer::class)->find($row['mailServerId']);
                if ($server) {
                    $m->setMailServer($server);
                }
            }
            foreach ($row['nodes'] ?? [] as $nodeRef) {
                if (isset($idMap[$nodeRef])) {
                    $m->addNode($idMap[$nodeRef]);
                }
            }
            $this->em->persist($m);
            $idMap[$row['_ref']] = $m;
        }
    }

    private function importSchedules(array $rows, Context $context, array &$idMap): void
    {
        foreach ($rows as $row) {
            $s = (new Schedule())
                ->setName($row['name'] ?? '')
                ->setCronExpression($row['cronExpression'] ?? '0 * * * *')
                ->setEnabled((bool) ($row['enabled'] ?? true))
                ->setNodeSelectionMode($row['nodeSelectionMode'] ?? null)
                ->setCollectEnabled((bool) ($row['collectEnabled'] ?? false))
                ->setExtractEnabled((bool) ($row['extractEnabled'] ?? false))
                ->setCleanupEnabled((bool) ($row['cleanupEnabled'] ?? false))
                ->setComplianceEnabled((bool) ($row['complianceEnabled'] ?? false))
                ->setContext($context);
            if ($row['nodeTag'] ?? null) {
                $tag = $idMap[$row['nodeTag']] ?? null;
                if ($tag) {
                    $s->setNodeTagId($tag->getId());
                }
            }
            $s->setNodeIds($this->resolveIdList($row['nodes'] ?? [], $idMap));
            $s->setReportIds($this->resolveIdList($row['reports'] ?? [], $idMap));
            $s->setMailReportIds($this->resolveIdList($row['mailReports'] ?? [], $idMap));
            $s->setCollectionIds($this->resolveIdList($row['collections'] ?? [], $idMap));
            $this->em->persist($s);
            $idMap[$row['_ref']] = $s;
        }
    }

    private function importLabs(array $rows, Context $context, array &$idMap): void
    {
        foreach ($rows as $row) {
            $l = (new Lab())
                ->setName($row['name'] ?? '')
                ->setDescription($row['description'] ?? null)
                ->setContext($context);
            $this->em->persist($l);
            $idMap[$row['_ref']] = $l;
        }
    }

    private function importLabTasks(array $rows, array &$idMap): void
    {
        foreach ($rows as $row) {
            $lab = $idMap[$row['lab']] ?? null;
            if (!$lab) {
                continue;
            }
            $t = (new LabTask())
                ->setLab($lab)
                ->setName($row['name'] ?? '')
                ->setDescription($row['description'] ?? null)
                ->setPosition((int) ($row['position'] ?? 0));
            foreach ($row['policies'] ?? [] as $policyRef) {
                if (isset($idMap[$policyRef])) {
                    $t->addPolicy($idMap[$policyRef]);
                }
            }
            $this->em->persist($t);
            $idMap[$row['_ref']] = $t;
        }
    }

    private function applyDeviceModelAssociations(array $rows, array $idMap): void
    {
        foreach ($rows as $row) {
            /** @var DeviceModel|null $model */
            $model = $idMap[$row['_ref']] ?? null;
            if (!$model) {
                continue;
            }
            foreach ($row['manualCommands'] ?? [] as $ref) {
                if (isset($idMap[$ref])) {
                    $model->addManualCommand($idMap[$ref]);
                }
            }
            foreach ($row['manualRules'] ?? [] as $ref) {
                if (isset($idMap[$ref])) {
                    $model->addManualRule($idMap[$ref]);
                }
            }
        }
    }

    // ─── File restoration ─────────────────────────────────────────────

    private function restoreFiles(string $extractDir, int $sourceContextId, array $newCollectionIds): void
    {
        $sourceBase = $extractDir . '/files/contexts/' . $sourceContextId;
        if (!is_dir($sourceBase)) {
            return;
        }

        // Collections: rename {sourceId} → {newId}
        $colsBase = $sourceBase . '/collections';
        if (is_dir($colsBase)) {
            foreach (scandir($colsBase) as $entry) {
                if ($entry === '.' || $entry === '..') {
                    continue;
                }
                $sourceCollectionId = (int) $entry;
                if (!isset($newCollectionIds[$sourceCollectionId])) {
                    continue;
                }
                $newId = $newCollectionIds[$sourceCollectionId];
                $src = $colsBase . '/' . $entry;
                $dst = $this->projectDir . '/var/collections/' . $newId;
                $this->copyDirectory($src, $dst);
            }
        }

        // Uploads — copy to global var/uploads/{sub}/
        foreach (['logos', 'cover-pages', 'block-images'] as $sub) {
            $dir = $sourceBase . '/uploads/' . $sub;
            if (!is_dir($dir)) {
                continue;
            }
            $dst = $this->projectDir . '/var/uploads/' . $sub;
            if (!is_dir($dst)) {
                @mkdir($dst, 0775, true);
            }
            foreach (scandir($dir) as $entry) {
                if ($entry === '.' || $entry === '..') {
                    continue;
                }
                $srcFile = $dir . '/' . $entry;
                $dstFile = $dst . '/' . $entry;
                if (!file_exists($dstFile) && is_file($srcFile)) {
                    copy($srcFile, $dstFile);
                }
            }
        }
    }

    private function copyDirectory(string $src, string $dst): void
    {
        if (!is_dir($dst)) {
            @mkdir($dst, 0775, true);
        }
        $iter = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($src, \FilesystemIterator::SKIP_DOTS),
            \RecursiveIteratorIterator::SELF_FIRST,
        );
        foreach ($iter as $info) {
            $rel = substr($info->getPathname(), strlen($src) + 1);
            $target = $dst . '/' . $rel;
            if ($info->isDir()) {
                if (!is_dir($target)) {
                    @mkdir($target, 0775, true);
                }
            } else {
                @copy($info->getPathname(), $target);
            }
        }
    }

    // ─── Misc helpers ─────────────────────────────────────────────────

    private function dt(?string $iso): ?\DateTimeImmutable
    {
        if (!$iso) {
            return null;
        }
        try {
            return new \DateTimeImmutable($iso);
        } catch (\Throwable) {
            return null;
        }
    }

    private function parseRefId(string $ref): int
    {
        $parts = explode(':', $ref, 2);
        return (int) ($parts[1] ?? 0);
    }

    /**
     * Resolve a list of refs into an ID list (skipping unknown refs).
     *
     * @return int[]
     */
    private function resolveIdList(array $refs, array $idMap): array
    {
        $ids = [];
        foreach ($refs as $ref) {
            $entity = $idMap[$ref] ?? null;
            if ($entity && method_exists($entity, 'getId') && $entity->getId() !== null) {
                $ids[] = (int) $entity->getId();
            }
        }
        return $ids;
    }
}
