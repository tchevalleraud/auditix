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
use App\Entity\TopologyDevice;
use App\Entity\TopologyLink;
use App\Entity\TopologyMap;
use App\Entity\VendorPlugin;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\DependencyInjection\Attribute\Autowire;

class ContextExporter
{
    public const FORMAT = 'auditix-context-export';
    public const VERSION = 1;

    public function __construct(
        private readonly EntityManagerInterface $em,
        #[Autowire('%kernel.project_dir%')]
        private readonly string $projectDir,
    ) {}

    /**
     * Export one or more contexts to a temporary ZIP file. Returns the path.
     * Caller is responsible for unlinking the file once delivered.
     *
     * @param Context[] $contexts
     */
    public function export(array $contexts): string
    {
        $payload = [
            '_format' => self::FORMAT,
            '_version' => self::VERSION,
            '_exportedAt' => (new \DateTimeImmutable())->format('c'),
            'contexts' => [],
        ];

        $bundledFiles = [];

        foreach ($contexts as $context) {
            $payload['contexts'][] = $this->serializeContext($context, $bundledFiles);
        }

        $tmp = tempnam(sys_get_temp_dir(), 'ctx-export-');
        $zip = new \ZipArchive();
        if ($zip->open($tmp, \ZipArchive::OVERWRITE) !== true) {
            throw new \RuntimeException('Cannot create export archive');
        }

        $zip->addFromString('manifest.json', json_encode([
            '_format' => self::FORMAT,
            '_version' => self::VERSION,
            '_exportedAt' => $payload['_exportedAt'],
            'contextCount' => count($payload['contexts']),
            'contextNames' => array_map(fn($c) => $c['context']['name'], $payload['contexts']),
        ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));

        $zip->addFromString('data.json', json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));

        foreach ($bundledFiles as $entry) {
            [$absPath, $archivePath] = $entry;
            if (is_file($absPath)) {
                $zip->addFile($absPath, $archivePath);
                $zip->setCompressionName($archivePath, \ZipArchive::CM_DEFLATE, 1);
            }
        }

        $zip->close();
        return $tmp;
    }

    private function serializeContext(Context $context, array &$bundledFiles): array
    {
        $ctxId = $context->getId();

        $editors = $this->em->getRepository(Editor::class)->findBy(['context' => $context]);
        $deviceModels = $this->em->getRepository(DeviceModel::class)->findBy(['context' => $context]);
        $productRanges = $this->em->getRepository(ProductRange::class)->findBy(['context' => $context]);
        $vendorPlugins = $this->em->getRepository(VendorPlugin::class)->findBy(['context' => $context]);
        $invCategories = $this->em->getRepository(InventoryCategory::class)->findBy(['context' => $context]);
        $snmpCreds = $this->em->getRepository(SnmpCredential::class)->findBy(['context' => $context]);
        $cliCreds = $this->em->getRepository(CliCredential::class)->findBy(['context' => $context]);
        $profiles = $this->em->getRepository(Profile::class)->findBy(['context' => $context]);
        $nodeTags = $this->em->getRepository(NodeTag::class)->findBy(['context' => $context]);
        $nodes = $this->em->getRepository(Node::class)->findBy(['context' => $context]);
        $colFolders = $this->em->getRepository(CollectionFolder::class)->findBy(['context' => $context]);
        $colCommands = $this->em->getRepository(CollectionCommand::class)->findBy(['context' => $context]);
        $colRuleFolders = $this->em->getRepository(CollectionRuleFolder::class)->findBy(['context' => $context]);
        $colRules = $this->em->getRepository(CollectionRule::class)->findBy(['context' => $context]);
        $compPolicies = $this->em->getRepository(CompliancePolicy::class)->findBy(['context' => $context]);
        $compRuleFolders = $this->em->getRepository(ComplianceRuleFolder::class)->findBy(['context' => $context]);
        $compRules = $this->em->getRepository(ComplianceRule::class)->findBy(['context' => $context]);
        $collections = $this->em->getRepository(Collection::class)->findBy(['context' => $context]);
        $themes = $this->em->getRepository(ReportTheme::class)->findBy(['context' => $context]);
        $reports = $this->em->getRepository(Report::class)->findBy(['context' => $context]);
        $mailReports = $this->em->getRepository(MailReport::class)->findBy(['context' => $context]);
        $schedules = $this->em->getRepository(Schedule::class)->findBy(['context' => $context]);
        $topoMaps = $this->em->getRepository(TopologyMap::class)->findBy(['context' => $context]);
        $labs = $this->em->getRepository(Lab::class)->findBy(['context' => $context]);

        $deviceModelIds = array_map(fn(DeviceModel $m) => $m->getId(), $deviceModels);
        $monitoringOids = $deviceModelIds
            ? $this->em->getRepository(MonitoringOid::class)->createQueryBuilder('o')
                ->where('IDENTITY(o.deviceModel) IN (:ids)')
                ->setParameter('ids', $deviceModelIds)
                ->getQuery()->getResult()
            : [];

        $nodeIds = array_map(fn(Node $n) => $n->getId(), $nodes);
        $dynamicTags = $nodeIds
            ? $this->em->getRepository(NodeDynamicTag::class)->createQueryBuilder('d')
                ->where('IDENTITY(d.node) IN (:ids)')
                ->setParameter('ids', $nodeIds)
                ->getQuery()->getResult()
            : [];

        $extracts = [];
        foreach ($colRules as $rule) {
            foreach ($rule->getExtracts() as $extract) {
                $extracts[] = $extract;
            }
        }

        $this->collectCrossContextDependencies(
            $editors,
            $deviceModels,
            $profiles,
            $snmpCreds,
            $cliCreds,
            $invCategories,
            $themes,
            $productRanges,
            $nodes,
            $colFolders,
            $colRuleFolders,
            $extracts,
            $reports,
            $mailReports,
        );

        $labTasks = [];
        foreach ($labs as $lab) {
            foreach ($lab->getTasks() as $task) {
                $labTasks[] = $task;
            }
        }

        $topoDevices = [];
        $topoLinks = [];
        foreach ($topoMaps as $map) {
            $topoDevices = array_merge($topoDevices, $this->em->getRepository(TopologyDevice::class)->findBy(['map' => $map]));
            $topoLinks = array_merge($topoLinks, $this->em->getRepository(TopologyLink::class)->findBy(['map' => $map]));
        }

        $data = [
            'context' => $this->serializeContextEntity($context),
            'editors' => array_map($this->serializeEditor(...), $editors),
            'deviceModels' => array_map($this->serializeDeviceModel(...), $deviceModels),
            'productRanges' => array_map($this->serializeProductRange(...), $productRanges),
            'vendorPlugins' => array_map($this->serializeVendorPlugin(...), $vendorPlugins),
            'monitoringOids' => array_map($this->serializeMonitoringOid(...), $monitoringOids),
            'inventoryCategories' => array_map($this->serializeInventoryCategory(...), $invCategories),
            'snmpCredentials' => array_map($this->serializeSnmpCredential(...), $snmpCreds),
            'cliCredentials' => array_map($this->serializeCliCredential(...), $cliCreds),
            'profiles' => array_map($this->serializeProfile(...), $profiles),
            'nodeTags' => array_map($this->serializeNodeTag(...), $nodeTags),
            'nodes' => array_map($this->serializeNode(...), $nodes),
            'nodeDynamicTags' => array_map($this->serializeNodeDynamicTag(...), $dynamicTags),
            'collectionFolders' => array_map($this->serializeCollectionFolder(...), $colFolders),
            'collectionCommands' => array_map($this->serializeCollectionCommand(...), $colCommands),
            'collectionRuleFolders' => array_map($this->serializeCollectionRuleFolder(...), $colRuleFolders),
            'collectionRules' => array_map($this->serializeCollectionRule(...), $colRules),
            'collectionRuleExtracts' => array_map($this->serializeCollectionRuleExtract(...), $extracts),
            'compliancePolicies' => array_map($this->serializeCompliancePolicy(...), $compPolicies),
            'complianceRuleFolders' => array_map($this->serializeComplianceRuleFolder(...), $compRuleFolders),
            'complianceRules' => array_map($this->serializeComplianceRule(...), $compRules),
            'collections' => $this->mapWithFiles($collections, 'serializeCollection', $bundledFiles, $ctxId),
            'reportThemes' => array_map($this->serializeReportTheme(...), $themes),
            'reports' => $this->mapWithFiles($reports, 'serializeReport', $bundledFiles, $ctxId),
            'mailReports' => $this->mapWithFiles($mailReports, 'serializeMailReport', $bundledFiles, $ctxId),
            'schedules' => array_map($this->serializeSchedule(...), $schedules),
            'topologyMaps' => array_map($this->serializeTopologyMap(...), $topoMaps),
            'topologyDevices' => array_map($this->serializeTopologyDevice(...), $topoDevices),
            'topologyLinks' => array_map($this->serializeTopologyLink(...), $topoLinks),
            'labs' => array_map($this->serializeLab(...), $labs),
            'labTasks' => array_map($this->serializeLabTask(...), $labTasks),
        ];

        foreach ($editors as $editor) {
            if ($editor->getLogo()) {
                $abs = $this->projectDir . '/var/uploads/logos/' . $editor->getLogo();
                $bundledFiles[] = [$abs, "files/contexts/{$ctxId}/uploads/logos/" . $editor->getLogo()];
            }
        }

        return $data;
    }

    // ─── Entity serializers ───────────────────────────────────────────

    private function serializeContextEntity(Context $c): array
    {
        return [
            '_ref' => $this->ref('context', $c->getId()),
            'name' => $c->getName(),
            'description' => $c->getDescription(),
            'monitoringEnabled' => $c->isMonitoringEnabled(),
            'snmpRetentionMinutes' => $c->getSnmpRetentionMinutes(),
            'snmpPollIntervalSeconds' => $c->getSnmpPollIntervalSeconds(),
            'icmpPollIntervalSeconds' => $c->getIcmpPollIntervalSeconds(),
            'isDefault' => $c->isDefault(),
            'publicEnabled' => $c->isPublicEnabled(),
            'vulnerabilityEnabled' => $c->isVulnerabilityEnabled(),
            'nvdApiKey' => $c->getNvdApiKey(),
            'vulnerabilitySyncIntervalHours' => $c->getVulnerabilitySyncIntervalHours(),
            'vulnerabilityScoreWeight' => $c->getVulnerabilityScoreWeight(),
            'complianceScoreWeight' => $c->getComplianceScoreWeight(),
            'systemUpdateEnabled' => $c->isSystemUpdateEnabled(),
            'systemUpdateScoreWeight' => $c->getSystemUpdateScoreWeight(),
            'nodeColumnsConfig' => $c->getNodeColumnsConfig(),
        ];
    }

    private function serializeEditor(Editor $e): array
    {
        return [
            '_ref' => $this->ref('editor', $e->getId()),
            'name' => $e->getName(),
            'description' => $e->getDescription(),
            'logo' => $e->getLogo(),
        ];
    }

    private function serializeDeviceModel(DeviceModel $m): array
    {
        return [
            '_ref' => $this->ref('deviceModel', $m->getId()),
            'name' => $m->getName(),
            'description' => $m->getDescription(),
            'manufacturer' => $this->refOrNull('editor', $m->getManufacturer()?->getId()),
            'connectionScript' => $m->getConnectionScript(),
            'sendCtrlChar' => $m->getSendCtrlChar(),
            'nvdKeyword' => $m->getNvdKeyword(),
            'manualCommands' => array_values(array_map(
                fn(CollectionCommand $c) => $this->ref('collectionCommand', $c->getId()),
                $m->getManualCommands()->toArray(),
            )),
            'manualRules' => array_values(array_map(
                fn(CollectionRule $r) => $this->ref('collectionRule', $r->getId()),
                $m->getManualRules()->toArray(),
            )),
        ];
    }

    private function serializeProductRange(ProductRange $r): array
    {
        return [
            '_ref' => $this->ref('productRange', $r->getId()),
            'name' => $r->getName(),
            'description' => $r->getDescription(),
            'manufacturer' => $this->refOrNull('editor', $r->getManufacturer()?->getId()),
            'recommendedVersion' => $r->getRecommendedVersion(),
            'currentVersion' => $r->getCurrentVersion(),
            'releaseDate' => $r->getReleaseDate()?->format('c'),
            'endOfSaleDate' => $r->getEndOfSaleDate()?->format('c'),
            'endOfSupportDate' => $r->getEndOfSupportDate()?->format('c'),
            'endOfLifeDate' => $r->getEndOfLifeDate()?->format('c'),
            'pluginSource' => $r->getPluginSource(),
        ];
    }

    private function serializeVendorPlugin(VendorPlugin $p): array
    {
        return [
            '_ref' => $this->ref('vendorPlugin', $p->getId()),
            'pluginIdentifier' => $p->getPluginIdentifier(),
            'enabled' => $p->isEnabled(),
            'configuration' => $p->getConfiguration(),
        ];
    }

    private function serializeMonitoringOid(MonitoringOid $o): array
    {
        return [
            '_ref' => $this->ref('monitoringOid', $o->getId()),
            'deviceModel' => $this->refOrNull('deviceModel', $o->getDeviceModel()?->getId()),
            'category' => $o->getCategory(),
            'oid' => $o->getOid(),
            'enabled' => $o->isEnabled(),
        ];
    }

    private function serializeInventoryCategory(InventoryCategory $c): array
    {
        return [
            '_ref' => $this->ref('inventoryCategory', $c->getId()),
            'name' => $c->getName(),
            'keyLabel' => $c->getKeyLabel(),
            'columnConfig' => $c->getColumnConfig(),
            'sortConfig' => $c->getSortConfig(),
        ];
    }

    private function serializeSnmpCredential(SnmpCredential $s): array
    {
        return [
            '_ref' => $this->ref('snmpCredential', $s->getId()),
            'name' => $s->getName(),
            'version' => $s->getVersion(),
            'community' => $s->getCommunity(),
            'username' => $s->getUsername(),
            'securityLevel' => $s->getSecurityLevel(),
            'authProtocol' => $s->getAuthProtocol(),
            'authPassword' => $s->getAuthPassword(),
            'privProtocol' => $s->getPrivProtocol(),
            'privPassword' => $s->getPrivPassword(),
        ];
    }

    private function serializeCliCredential(CliCredential $c): array
    {
        return [
            '_ref' => $this->ref('cliCredential', $c->getId()),
            'name' => $c->getName(),
            'protocol' => $c->getProtocol(),
            'port' => $c->getPort(),
            'username' => $c->getUsername(),
            'password' => $c->getPassword(),
            'enablePassword' => $c->getEnablePassword(),
        ];
    }

    private function serializeProfile(Profile $p): array
    {
        return [
            '_ref' => $this->ref('profile', $p->getId()),
            'name' => $p->getName(),
            'snmpCredential' => $this->refOrNull('snmpCredential', $p->getSnmpCredential()?->getId()),
            'cliCredential' => $this->refOrNull('cliCredential', $p->getCliCredential()?->getId()),
        ];
    }

    private function serializeNodeTag(NodeTag $t): array
    {
        return [
            '_ref' => $this->ref('nodeTag', $t->getId()),
            'name' => $t->getName(),
            'color' => $t->getColor(),
        ];
    }

    private function serializeNode(Node $n): array
    {
        return [
            '_ref' => $this->ref('node', $n->getId()),
            'name' => $n->getName(),
            'ipAddress' => $n->getIpAddress(),
            'manufacturer' => $this->refOrNull('editor', $n->getManufacturer()?->getId()),
            'model' => $this->refOrNull('deviceModel', $n->getModel()?->getId()),
            'profile' => $this->refOrNull('profile', $n->getProfile()?->getId()),
            'hostname' => $n->getHostname(),
            'discoveredModel' => $n->getDiscoveredModel(),
            'discoveredVersion' => $n->getDiscoveredVersion(),
            'productModel' => $n->getProductModel(),
            'policy' => $n->getPolicy(),
            'tags' => array_values(array_map(
                fn(NodeTag $t) => $this->ref('nodeTag', $t->getId()),
                $n->getTags()->toArray(),
            )),
        ];
    }

    private function serializeNodeDynamicTag(NodeDynamicTag $d): array
    {
        return [
            '_ref' => $this->ref('nodeDynamicTag', $d->getId()),
            'node' => $this->ref('node', $d->getNode()->getId()),
            'tag' => $this->ref('nodeTag', $d->getTag()->getId()),
            'rule' => $this->refOrNull('collectionRule', $d->getRule()?->getId()),
        ];
    }

    private function serializeCollectionFolder(CollectionFolder $f): array
    {
        return [
            '_ref' => $this->ref('collectionFolder', $f->getId()),
            'name' => $f->getName(),
            'type' => $f->getType(),
            'parent' => $this->refOrNull('collectionFolder', $f->getParent()?->getId()),
            'manufacturer' => $this->refOrNull('editor', $f->getManufacturer()?->getId()),
            'model' => $this->refOrNull('deviceModel', $f->getModel()?->getId()),
        ];
    }

    private function serializeCollectionCommand(CollectionCommand $c): array
    {
        return [
            '_ref' => $this->ref('collectionCommand', $c->getId()),
            'name' => $c->getName(),
            'description' => $c->getDescription(),
            'commands' => $c->getCommands(),
            'enabled' => $c->isEnabled(),
            'folder' => $this->refOrNull('collectionFolder', $c->getFolder()?->getId()),
        ];
    }

    private function serializeCollectionRuleFolder(CollectionRuleFolder $f): array
    {
        return [
            '_ref' => $this->ref('collectionRuleFolder', $f->getId()),
            'name' => $f->getName(),
            'type' => $f->getType(),
            'parent' => $this->refOrNull('collectionRuleFolder', $f->getParent()?->getId()),
            'manufacturer' => $this->refOrNull('editor', $f->getManufacturer()?->getId()),
            'model' => $this->refOrNull('deviceModel', $f->getModel()?->getId()),
        ];
    }

    private function serializeCollectionRule(CollectionRule $r): array
    {
        return [
            '_ref' => $this->ref('collectionRule', $r->getId()),
            'name' => $r->getName(),
            'description' => $r->getDescription(),
            'enabled' => $r->isEnabled(),
            'source' => $r->getSource(),
            'command' => $r->getCommand(),
            'tag' => $r->getTag(),
            'folder' => $this->refOrNull('collectionRuleFolder', $r->getFolder()?->getId()),
            'translations' => $r->getTranslations(),
            'conditionTree' => $r->getConditionTree(),
        ];
    }

    private function serializeCollectionRuleExtract(CollectionRuleExtract $e): array
    {
        return [
            '_ref' => $this->ref('collectionRuleExtract', $e->getId()),
            'rule' => $this->ref('collectionRule', $e->getRule()->getId()),
            'name' => $e->getName(),
            'regex' => $e->getRegex(),
            'multiline' => $e->isMultiline(),
            'keyMode' => $e->getKeyMode(),
            'keyManual' => $e->getKeyManual(),
            'keyExtract' => $this->refOrNull('collectionRuleExtract', $e->getKeyExtract()?->getId()),
            'keyGroup' => $e->getKeyGroup(),
            'keyLabel' => $e->getKeyLabel(),
            'valueGroup' => $e->getValueGroup(),
            'valueMap' => $e->getValueMap(),
            'category' => $this->refOrNull('inventoryCategory', $e->getCategory()?->getId()),
            'nodeField' => $e->getNodeField(),
            'nodeFieldGroup' => $e->getNodeFieldGroup(),
            'extractMode' => $e->getExtractMode(),
            'blockSeparator' => $e->getBlockSeparator(),
            'blockKeyGroup' => $e->getBlockKeyGroup(),
            'position' => $e->getPosition(),
        ];
    }

    private function serializeCompliancePolicy(CompliancePolicy $p): array
    {
        return [
            '_ref' => $this->ref('compliancePolicy', $p->getId()),
            'name' => $p->getName(),
            'description' => $p->getDescription(),
            'enabled' => $p->isEnabled(),
            'matchRules' => $p->getMatchRules(),
            'extraRules' => array_values(array_map(
                fn(ComplianceRule $r) => $this->ref('complianceRule', $r->getId()),
                $p->getExtraRules()->toArray(),
            )),
            'nodes' => array_values(array_map(
                fn(Node $n) => $this->ref('node', $n->getId()),
                $p->getNodes()->toArray(),
            )),
        ];
    }

    private function serializeComplianceRuleFolder(ComplianceRuleFolder $f): array
    {
        return [
            '_ref' => $this->ref('complianceRuleFolder', $f->getId()),
            'name' => $f->getName(),
            'parent' => $this->refOrNull('complianceRuleFolder', $f->getParent()?->getId()),
            'policy' => $this->refOrNull('compliancePolicy', $f->getPolicy()?->getId()),
        ];
    }

    private function serializeComplianceRule(ComplianceRule $r): array
    {
        return [
            '_ref' => $this->ref('complianceRule', $r->getId()),
            'identifier' => $r->getIdentifier(),
            'name' => $r->getName(),
            'description' => $r->getDescription(),
            'enabled' => $r->isEnabled(),
            'dataSources' => $r->getDataSources(),
            'conditionTree' => $r->getConditionTree(),
            'multiRowMessages' => $r->getMultiRowMessages(),
            'folder' => $this->refOrNull('complianceRuleFolder', $r->getFolder()?->getId()),
        ];
    }

    private function serializeCollection(Collection $c, array &$bundledFiles, int $ctxId): array
    {
        $storageDir = $this->projectDir . '/var/' . $c->getStoragePath();
        if (is_dir($storageDir)) {
            foreach ($this->iterFiles($storageDir) as $file) {
                $rel = ltrim(substr($file, strlen($storageDir)), '/');
                $bundledFiles[] = [$file, sprintf('files/contexts/%d/collections/%d/%s', $ctxId, $c->getId(), $rel)];
            }
        }

        return [
            '_ref' => $this->ref('collection', $c->getId()),
            'node' => $this->ref('node', $c->getNode()->getId()),
            'tags' => $c->getTags(),
            'status' => $c->getStatus(),
            'commandCount' => $c->getCommandCount(),
            'completedCount' => $c->getCompletedCount(),
            'startedAt' => $c->getStartedAt()?->format('c'),
            'completedAt' => $c->getCompletedAt()?->format('c'),
            'extractStatus' => $c->getExtractStatus(),
            'lastExtractedAt' => $c->getLastExtractedAt()?->format('c'),
            'createdAt' => $c->getCreatedAt()->format('c'),
        ];
    }

    private function serializeReportTheme(ReportTheme $t): array
    {
        return [
            '_ref' => $this->ref('reportTheme', $t->getId()),
            'name' => $t->getName(),
            'description' => $t->getDescription(),
            'isDefault' => $t->isDefault(),
            'styles' => $t->getStyles(),
        ];
    }

    private function serializeReport(Report $r, array &$bundledFiles, int $ctxId): array
    {
        $this->collectAssetReferences($r->getBlocks(), $bundledFiles, $ctxId);

        return [
            '_ref' => $this->ref('report', $r->getId()),
            'name' => $r->getName(),
            'description' => $r->getDescription(),
            'locale' => $r->getLocale(),
            'title' => $r->getTitle(),
            'subtitle' => $r->getSubtitle(),
            'showTableOfContents' => $r->getShowTableOfContents(),
            'showAuthorsPage' => $r->getShowAuthorsPage(),
            'showRevisionPage' => $r->getShowRevisionPage(),
            'showIllustrationsPage' => $r->getShowIllustrationsPage(),
            'tags' => $r->getTags(),
            'authors' => $r->getAuthors(),
            'recipients' => $r->getRecipients(),
            'revisions' => $r->getRevisions(),
            'blocks' => $r->getBlocks(),
            'theme' => $this->ref('reportTheme', $r->getTheme()->getId()),
            'type' => $r->getType(),
            'nodes' => array_values(array_map(
                fn(Node $n) => $this->ref('node', $n->getId()),
                $r->getNodes()->toArray(),
            )),
        ];
    }

    private function serializeMailReport(MailReport $m, array &$bundledFiles, int $ctxId): array
    {
        $this->collectAssetReferences($m->getBlocks(), $bundledFiles, $ctxId);

        return [
            '_ref' => $this->ref('mailReport', $m->getId()),
            'name' => $m->getName(),
            'description' => $m->getDescription(),
            'locale' => $m->getLocale(),
            'subject' => $m->getSubject(),
            'preheader' => $m->getPreheader(),
            'type' => $m->getType(),
            'blocks' => $m->getBlocks(),
            'recipientUserIds' => $m->getRecipientUserIds(),
            'recipientExternalEmails' => $m->getRecipientExternalEmails(),
            'theme' => $this->ref('reportTheme', $m->getTheme()->getId()),
            'mailServerId' => $m->getMailServer()?->getId(),
            'nodes' => array_values(array_map(
                fn(Node $n) => $this->ref('node', $n->getId()),
                $m->getNodes()->toArray(),
            )),
        ];
    }

    private function serializeSchedule(Schedule $s): array
    {
        return [
            '_ref' => $this->ref('schedule', $s->getId()),
            'name' => $s->getName(),
            'cronExpression' => $s->getCronExpression(),
            'enabled' => $s->isEnabled(),
            'nodeSelectionMode' => $s->getNodeSelectionMode(),
            'nodeTag' => $this->refOrNull('nodeTag', $s->getNodeTagId()),
            'nodes' => array_values(array_map(
                fn($id) => $this->ref('node', (int) $id),
                $s->getNodeIds() ?? [],
            )),
            'collectEnabled' => $s->isCollectEnabled(),
            'extractEnabled' => $s->isExtractEnabled(),
            'cleanupEnabled' => $s->isCleanupEnabled(),
            'complianceEnabled' => $s->isComplianceEnabled(),
            'reports' => array_values(array_map(
                fn($id) => $this->ref('report', (int) $id),
                $s->getReportIds() ?? [],
            )),
            'mailReports' => array_values(array_map(
                fn($id) => $this->ref('mailReport', (int) $id),
                $s->getMailReportIds() ?? [],
            )),
            'collections' => array_values(array_map(
                fn($id) => $this->ref('collection', (int) $id),
                $s->getCollectionIds() ?? [],
            )),
        ];
    }

    private function serializeTopologyMap(TopologyMap $m): array
    {
        return [
            '_ref' => $this->ref('topologyMap', $m->getId()),
            'name' => $m->getName(),
            'description' => $m->getDescription(),
            'defaultProtocol' => $m->getDefaultProtocol(),
            'layout' => $m->getLayout(),
            'designConfig' => $m->getDesignConfig(),
            'linkRules' => $m->getLinkRules(),
        ];
    }

    private function serializeTopologyDevice(TopologyDevice $d): array
    {
        return [
            '_ref' => $this->ref('topologyDevice', $d->getId()),
            'map' => $this->ref('topologyMap', $d->getMap()->getId()),
            'node' => $this->refOrNull('node', $d->getNode()?->getId()),
            'name' => $d->getName(),
            'chassisId' => $d->getChassisId(),
            'mgmtAddress' => $d->getMgmtAddress(),
            'sysDescr' => $d->getSysDescr(),
            'styleOverride' => $d->getStyleOverride(),
        ];
    }

    private function serializeTopologyLink(TopologyLink $l): array
    {
        return [
            '_ref' => $this->ref('topologyLink', $l->getId()),
            'map' => $this->ref('topologyMap', $l->getMap()->getId()),
            'sourceDevice' => $this->ref('topologyDevice', $l->getSourceDevice()->getId()),
            'targetDevice' => $this->ref('topologyDevice', $l->getTargetDevice()->getId()),
            'protocol' => $l->getProtocol(),
            'sourcePort' => $l->getSourcePort(),
            'targetPort' => $l->getTargetPort(),
            'status' => $l->getStatus(),
            'weight' => $l->getWeight(),
            'metadata' => $l->getMetadata(),
            'styleOverride' => $l->getStyleOverride(),
            'isManual' => $l->getIsManual(),
        ];
    }

    private function serializeLab(Lab $l): array
    {
        return [
            '_ref' => $this->ref('lab', $l->getId()),
            'name' => $l->getName(),
            'description' => $l->getDescription(),
        ];
    }

    private function serializeLabTask(LabTask $t): array
    {
        return [
            '_ref' => $this->ref('labTask', $t->getId()),
            'lab' => $this->ref('lab', $t->getLab()->getId()),
            'name' => $t->getName(),
            'description' => $t->getDescription(),
            'position' => $t->getPosition(),
            'policies' => array_values(array_map(
                fn(CompliancePolicy $p) => $this->ref('compliancePolicy', $p->getId()),
                $t->getPolicies()->toArray(),
            )),
        ];
    }

    // ─── Helpers ──────────────────────────────────────────────────────

    /**
     * Pull in any entities referenced via FK from another context, so the
     * archive is self-contained. Each cross-context referenced entity is
     * cloned into the imported context on import.
     *
     * @param Editor[] $editors
     * @param DeviceModel[] $deviceModels
     * @param Profile[] $profiles
     * @param SnmpCredential[] $snmpCreds
     * @param CliCredential[] $cliCreds
     * @param InventoryCategory[] $invCategories
     * @param ReportTheme[] $themes
     * @param ProductRange[] $productRanges
     * @param Node[] $nodes
     * @param CollectionFolder[] $colFolders
     * @param CollectionRuleFolder[] $colRuleFolders
     * @param CollectionRuleExtract[] $extracts
     * @param Report[] $reports
     * @param MailReport[] $mailReports
     */
    private function collectCrossContextDependencies(
        array &$editors,
        array &$deviceModels,
        array &$profiles,
        array &$snmpCreds,
        array &$cliCreds,
        array &$invCategories,
        array &$themes,
        array $productRanges,
        array $nodes,
        array $colFolders,
        array $colRuleFolders,
        array $extracts,
        array $reports,
        array $mailReports,
    ): void {
        $progress = true;
        while ($progress) {
            $progress = false;

            foreach ($productRanges as $r) {
                if ($this->ensureContains($editors, $r->getManufacturer())) {
                    $progress = true;
                }
            }
            foreach ($deviceModels as $m) {
                if ($this->ensureContains($editors, $m->getManufacturer())) {
                    $progress = true;
                }
            }
            foreach ($nodes as $n) {
                if ($this->ensureContains($editors, $n->getManufacturer())) $progress = true;
                if ($this->ensureContains($deviceModels, $n->getModel())) $progress = true;
                if ($this->ensureContains($profiles, $n->getProfile())) $progress = true;
            }
            foreach ($colFolders as $f) {
                if ($this->ensureContains($editors, $f->getManufacturer())) $progress = true;
                if ($this->ensureContains($deviceModels, $f->getModel())) $progress = true;
            }
            foreach ($colRuleFolders as $f) {
                if ($this->ensureContains($editors, $f->getManufacturer())) $progress = true;
                if ($this->ensureContains($deviceModels, $f->getModel())) $progress = true;
            }
            foreach ($extracts as $e) {
                if ($this->ensureContains($invCategories, $e->getCategory())) $progress = true;
            }
            foreach ($reports as $r) {
                if ($this->ensureContains($themes, $r->getTheme())) $progress = true;
            }
            foreach ($mailReports as $m) {
                if ($this->ensureContains($themes, $m->getTheme())) $progress = true;
            }
            foreach ($profiles as $p) {
                if ($this->ensureContains($snmpCreds, $p->getSnmpCredential())) $progress = true;
                if ($this->ensureContains($cliCreds, $p->getCliCredential())) $progress = true;
            }
        }
    }

    /**
     * Append $entity to $list if it's not already there (compared by class+id).
     * Returns true if it was added.
     */
    private function ensureContains(array &$list, ?object $entity): bool
    {
        if ($entity === null || !method_exists($entity, 'getId') || $entity->getId() === null) {
            return false;
        }
        foreach ($list as $existing) {
            if ($existing::class === $entity::class && $existing->getId() === $entity->getId()) {
                return false;
            }
        }
        $list[] = $entity;
        return true;
    }

    private function mapWithFiles(array $items, string $method, array &$bundledFiles, int $ctxId): array
    {
        $result = [];
        foreach ($items as $item) {
            $result[] = $this->{$method}($item, $bundledFiles, $ctxId);
        }
        return $result;
    }

    private function ref(string $type, int $id): string
    {
        return $type . ':' . $id;
    }

    private function refOrNull(string $type, ?int $id): ?string
    {
        return $id === null ? null : $this->ref($type, $id);
    }

    /**
     * @return iterable<string>
     */
    private function iterFiles(string $dir): iterable
    {
        $iter = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($dir, \FilesystemIterator::SKIP_DOTS),
        );
        foreach ($iter as $info) {
            if ($info->isFile()) {
                yield $info->getPathname();
            }
        }
    }

    /**
     * Recursively scan a JSON structure for cover-page (cp-*) and block-image (bi-*)
     * file references, and add them to the bundle.
     */
    private function collectAssetReferences(mixed $node, array &$bundledFiles, int $ctxId): void
    {
        if (is_string($node)) {
            if (preg_match_all('/(?:cp|bi)-[a-zA-Z0-9._-]+\.(?:png|jpg|jpeg|webp|svg)/i', $node, $matches)) {
                foreach ($matches[0] as $filename) {
                    $sub = str_starts_with($filename, 'cp-') ? 'cover-pages' : 'block-images';
                    $abs = $this->projectDir . '/var/uploads/' . $sub . '/' . $filename;
                    $archive = sprintf('files/contexts/%d/uploads/%s/%s', $ctxId, $sub, $filename);
                    $bundledFiles[] = [$abs, $archive];
                }
            }
            return;
        }
        if (is_array($node)) {
            foreach ($node as $value) {
                $this->collectAssetReferences($value, $bundledFiles, $ctxId);
            }
        }
    }
}
