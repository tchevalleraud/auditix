<?php

namespace App\MessageHandler;

use App\Entity\Collection;
use App\Doctrine\Filter\LatestInventoryFilter;
use App\Entity\Node;
use App\Entity\NodeInventoryEntry;
use App\Entity\NodeTag;
use App\Entity\Report;
use App\Entity\ReportTheme;
use App\Message\GenerateReportMessage;
use App\Service\BlockConditionEvaluator;
use App\Service\ComplianceEvaluator;
use App\Service\InventoryNodeRuleEvaluator;
use App\Service\NodeTagResolver;
use App\Service\SystemUpdateScoreCalculator;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Log\LoggerInterface;
use Symfony\Component\Mercure\HubInterface;
use Symfony\Component\Mercure\Update;
use Symfony\Component\Messenger\Attribute\AsMessageHandler;
use TCPDF;

#[AsMessageHandler]
class GenerateReportMessageHandler
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly HubInterface $hub,
        private readonly InventoryNodeRuleEvaluator $inventoryRuleEvaluator,
        private readonly ComplianceEvaluator $complianceEvaluator,
        private readonly SystemUpdateScoreCalculator $lifecycleCalculator,
        private readonly BlockConditionEvaluator $blockConditionEvaluator,
        private readonly LoggerInterface $logger,
        private readonly \App\Service\TopologyV2SvgRenderer $topologyV2Renderer,
        private readonly \App\Service\ReportSchemaSvgRenderer $reportSchemaRenderer,
        private readonly \App\Service\SvgRasterizer $svgRasterizer,
        private readonly NodeTagResolver $tagResolver,
        private readonly \App\Service\AclExtractor $aclExtractor,
    ) {}

    public function __invoke(GenerateReportMessage $message): void
    {
        $report = $this->em->getRepository(Report::class)->find($message->getReportId());
        if (!$report) return;

        $report->setGeneratingStatus('running');
        $this->em->flush();
        $this->publish($report, 'running');

        $this->logger->info('[generator] start', [
            'reportId' => $report->getId(),
            'reportName' => $report->getName(),
            'type' => $report->getType(),
            'nodes' => $report->getType() === Report::TYPE_NODE ? count($report->getNodes()) : null,
        ]);
        $t0 = microtime(true);

        try {
            $dir = sprintf('/var/www/var/reports/%d', $report->getId());
            if (!is_dir($dir)) {
                mkdir($dir, 0775, true);
            }

            if ($report->getType() === Report::TYPE_NODE) {
                $generatedFiles = [];
                foreach ($report->getNodes() as $node) {
                    $nodeT0 = microtime(true);
                    $this->logger->info('[generator] node start', [
                        'reportId' => $report->getId(),
                        'nodeId' => $node->getId(),
                        'ip' => $node->getIpAddress(),
                    ]);
                    $nodeDir = $dir . '/node_' . $node->getId();
                    if (!is_dir($nodeDir)) {
                        mkdir($nodeDir, 0775, true);
                    }
                    $filePath = $nodeDir . '/report.pdf';
                    $this->generatePdf($report, $filePath, $node);
                    $generatedFiles[(string) $node->getId()] = sprintf('reports/%d/node_%d/report.pdf', $report->getId(), $node->getId());
                    $this->logger->info('[generator] node done', [
                        'reportId' => $report->getId(),
                        'nodeId' => $node->getId(),
                        'durationMs' => (int) ((microtime(true) - $nodeT0) * 1000),
                    ]);
                }

                $report->setGeneratingStatus(null);
                $report->setGeneratedAt(new \DateTimeImmutable());
                $report->setGeneratedFile(null);
                $report->setGeneratedFiles($generatedFiles);
                $this->em->flush();
            } else {
                $filePath = $dir . '/report.pdf';
                $this->generatePdf($report, $filePath);

                $report->setGeneratingStatus(null);
                $report->setGeneratedAt(new \DateTimeImmutable());
                $report->setGeneratedFile(sprintf('reports/%d/report.pdf', $report->getId()));
                $report->setGeneratedFiles(null);
                $this->em->flush();
            }

            $this->logger->info('[generator] done', [
                'reportId' => $report->getId(),
                'durationMs' => (int) ((microtime(true) - $t0) * 1000),
            ]);

            $this->publish($report, 'completed');
        } catch (\Throwable $e) {
            $report->setGeneratingStatus(null);
            $this->em->flush();
            $this->publish($report, 'failed');
            $this->logger->error('[generator] failed', [
                'reportId' => $report->getId(),
                'error' => $e->getMessage(),
            ]);
            throw $e;
        }
    }

    private const PDF_TRANSLATIONS = [
        'fr' => [
            'priority_critical' => 'Critique',
            'priority_high' => 'Priorite haute',
            'priority_medium' => 'Priorite moyenne',
            'priority_low' => 'A surveiller',
            'toc' => 'Table des matieres',
            'authors_page' => 'Auteurs et diffusion',
            'authors' => 'Auteurs',
            'recipients' => 'Diffusion',
            'revisions_page' => 'Historique des versions',
            'illustrations_page' => 'Table des illustrations',
            'col_lastname' => 'Nom',
            'col_firstname' => 'Prenom',
            'col_position' => 'Poste',
            'col_email' => 'Email',
            'col_phone' => 'Telephone',
            'col_version' => 'Version',
            'col_date' => 'Date',
            'col_description' => 'Description',
            'comparison_title' => 'Comparaison',
            'comparison_common' => 'Communs',
        ],
        'en' => [
            'priority_critical' => 'Critical',
            'priority_high' => 'High priority',
            'priority_medium' => 'Medium priority',
            'priority_low' => 'Needs attention',
            'toc' => 'Table of Contents',
            'authors_page' => 'Authors and Distribution',
            'authors' => 'Authors',
            'recipients' => 'Distribution',
            'revisions_page' => 'Revision History',
            'illustrations_page' => 'Table of Illustrations',
            'col_lastname' => 'Last Name',
            'col_firstname' => 'First Name',
            'col_position' => 'Position',
            'col_email' => 'Email',
            'col_phone' => 'Phone',
            'col_version' => 'Version',
            'col_date' => 'Date',
            'col_description' => 'Description',
            'comparison_title' => 'Comparison',
            'comparison_common' => 'Common',
        ],
        'de' => [
            'priority_critical' => 'Kritisch',
            'priority_high' => 'Hohe Prioritaet',
            'priority_medium' => 'Mittlere Prioritaet',
            'priority_low' => 'Zu beachten',
            'toc' => 'Inhaltsverzeichnis',
            'authors_page' => 'Autoren und Verteilung',
            'authors' => 'Autoren',
            'recipients' => 'Verteilung',
            'revisions_page' => 'Versionshistorie',
            'illustrations_page' => 'Abbildungsverzeichnis',
            'col_lastname' => 'Nachname',
            'col_firstname' => 'Vorname',
            'col_position' => 'Position',
            'col_email' => 'E-Mail',
            'col_phone' => 'Telefon',
            'col_version' => 'Version',
            'col_date' => 'Datum',
            'col_description' => 'Beschreibung',
            'comparison_title' => 'Vergleich',
            'comparison_common' => 'Gemeinsam',
        ],
        'es' => [
            'priority_critical' => 'Critico',
            'priority_high' => 'Prioridad alta',
            'priority_medium' => 'Prioridad media',
            'priority_low' => 'Requiere atencion',
            'toc' => 'Tabla de Contenidos',
            'authors_page' => 'Autores y Distribucion',
            'authors' => 'Autores',
            'recipients' => 'Distribucion',
            'revisions_page' => 'Historial de Versiones',
            'illustrations_page' => 'Tabla de Ilustraciones',
            'col_lastname' => 'Apellido',
            'col_firstname' => 'Nombre',
            'col_position' => 'Puesto',
            'col_email' => 'Email',
            'col_phone' => 'Telefono',
            'col_version' => 'Version',
            'col_date' => 'Fecha',
            'col_description' => 'Descripcion',
            'comparison_title' => 'Comparacion',
            'comparison_common' => 'Comunes',
        ],
        'it' => [
            'priority_critical' => 'Critico',
            'priority_high' => 'Priorita alta',
            'priority_medium' => 'Priorita media',
            'priority_low' => 'Da monitorare',
            'toc' => 'Indice',
            'authors_page' => 'Autori e Distribuzione',
            'authors' => 'Autori',
            'recipients' => 'Distribuzione',
            'revisions_page' => 'Cronologia Versioni',
            'illustrations_page' => 'Indice delle Illustrazioni',
            'col_lastname' => 'Cognome',
            'col_firstname' => 'Nome',
            'col_position' => 'Posizione',
            'col_email' => 'Email',
            'col_phone' => 'Telefono',
            'col_version' => 'Versione',
            'col_date' => 'Data',
            'col_description' => 'Descrizione',
            'comparison_title' => 'Confronto',
            'comparison_common' => 'Comuni',
        ],
        'ja' => [
            'toc' => '目次',
            'authors_page' => '著者と配布',
            'authors' => '著者',
            'recipients' => '配布先',
            'revisions_page' => '改訂履歴',
            'illustrations_page' => '図表一覧',
            'col_lastname' => '姓',
            'col_firstname' => '名',
            'col_position' => '役職',
            'col_email' => 'メール',
            'col_phone' => '電話',
            'col_version' => 'バージョン',
            'col_date' => '日付',
            'col_description' => '説明',
            'comparison_title' => '比較',
            'comparison_common' => '共通',
        ],
    ];

    private const COMPLIANCE_LABELS = [
        'fr' => [
            'rule' => 'Regle', 'rule_id' => 'ID', 'description' => 'Description',
            'compliant' => 'Conforme', 'non_compliant' => 'Non conforme',
            'error' => 'Erreur', 'not_applicable' => 'N/A', 'total' => 'Total',
            'node' => 'Equipement', 'status' => 'Statut', 'severity' => 'Severite',
            'message' => 'Message', 'no_data' => 'Aucun resultat disponible.',
            'no_recommendation' => 'Aucune recommandation generee pour cet equipement.',
            'sev_info' => 'Info', 'sev_low' => 'Faible', 'sev_medium' => 'Moyenne',
            'sev_high' => 'Haute', 'sev_critical' => 'Critique',
        ],
        'en' => [
            'rule' => 'Rule', 'rule_id' => 'ID', 'description' => 'Description',
            'compliant' => 'Compliant', 'non_compliant' => 'Non-compliant',
            'error' => 'Error', 'not_applicable' => 'N/A', 'total' => 'Total',
            'node' => 'Device', 'status' => 'Status', 'severity' => 'Severity',
            'message' => 'Message', 'no_data' => 'No results available.',
            'no_recommendation' => 'No recommendation produced for this device.',
            'sev_info' => 'Info', 'sev_low' => 'Low', 'sev_medium' => 'Medium',
            'sev_high' => 'High', 'sev_critical' => 'Critical',
        ],
        'de' => [
            'rule' => 'Regel', 'rule_id' => 'ID', 'description' => 'Beschreibung',
            'compliant' => 'Konform', 'non_compliant' => 'Nicht konform',
            'error' => 'Fehler', 'not_applicable' => 'N/A', 'total' => 'Gesamt',
            'node' => 'Geraet', 'status' => 'Status', 'severity' => 'Schweregrad',
            'message' => 'Nachricht', 'no_data' => 'Keine Ergebnisse verfuegbar.',
            'no_recommendation' => 'Keine Empfehlung fuer dieses Geraet erzeugt.',
            'sev_info' => 'Info', 'sev_low' => 'Niedrig', 'sev_medium' => 'Mittel',
            'sev_high' => 'Hoch', 'sev_critical' => 'Kritisch',
        ],
        'es' => [
            'rule' => 'Regla', 'rule_id' => 'ID', 'description' => 'Descripcion',
            'compliant' => 'Conforme', 'non_compliant' => 'No conforme',
            'error' => 'Error', 'not_applicable' => 'N/A', 'total' => 'Total',
            'node' => 'Equipo', 'status' => 'Estado', 'severity' => 'Severidad',
            'message' => 'Mensaje', 'no_data' => 'Sin resultados disponibles.',
            'no_recommendation' => 'No se genero recomendacion para este equipo.',
            'sev_info' => 'Info', 'sev_low' => 'Baja', 'sev_medium' => 'Media',
            'sev_high' => 'Alta', 'sev_critical' => 'Critica',
        ],
        'it' => [
            'rule' => 'Regola', 'rule_id' => 'ID', 'description' => 'Descrizione',
            'compliant' => 'Conforme', 'non_compliant' => 'Non conforme',
            'error' => 'Errore', 'not_applicable' => 'N/D', 'total' => 'Totale',
            'node' => 'Dispositivo', 'status' => 'Stato', 'severity' => 'Severita',
            'message' => 'Messaggio', 'no_data' => 'Nessun risultato disponibile.',
            'no_recommendation' => 'Nessuna raccomandazione prodotta per questo dispositivo.',
            'sev_info' => 'Info', 'sev_low' => 'Bassa', 'sev_medium' => 'Media',
            'sev_high' => 'Alta', 'sev_critical' => 'Critica',
        ],
        'ja' => [
            'rule' => 'ルール', 'rule_id' => 'ID', 'description' => '説明',
            'compliant' => '準拠', 'non_compliant' => '非準拠',
            'error' => 'エラー', 'not_applicable' => '対象外', 'total' => '合計',
            'node' => '機器', 'status' => 'ステータス', 'severity' => '深刻度',
            'message' => 'メッセージ', 'no_data' => '結果がありません。',
            'no_recommendation' => 'この機器に対する推奨事項は生成されませんでした。',
            'sev_info' => '情報', 'sev_low' => '低', 'sev_medium' => '中',
            'sev_high' => '高', 'sev_critical' => '重大',
        ],
    ];

    /** Column headers for the firewall-style ACL table block (ASCII, EN fallback). */
    private const ACL_LABELS = [
        'fr' => [
            'name' => 'Nom', 'source' => 'Source', 'destination' => 'Destination',
            'service' => 'Service', 'action' => 'Action', 'enabled' => 'Actif',
            'default_action' => 'Action par defaut', 'all' => 'tous',
            'no_data' => 'Aucune ACL disponible.', 'no_aces' => 'Aucune ACE',
        ],
        'en' => [
            'name' => 'Name', 'source' => 'Source', 'destination' => 'Destination',
            'service' => 'Service', 'action' => 'Action', 'enabled' => 'Enabled',
            'default_action' => 'Default action', 'all' => 'all',
            'no_data' => 'No ACL available.', 'no_aces' => 'No ACE',
        ],
    ];

    /** Badge palette for the ACL table — [bgRGB, textRGB], mirrors the web UI. */
    private const ACL_KIND_RGB = [
        'mac'      => [[243, 232, 255], [126, 34, 206]],
        'ipv4'     => [[219, 234, 254], [29, 78, 216]],
        'ipv6'     => [[207, 250, 254], [14, 116, 144]],
        'port'     => [[254, 243, 199], [180, 83, 9]],
        'protocol' => [[224, 231, 255], [67, 56, 202]],
        'any'      => [[241, 245, 249], [100, 116, 139]],
        'text'     => [[241, 245, 249], [71, 85, 105]],
    ];

    /** Well-known TCP/UDP port -> service name (22 -> SSH). */
    private const ACL_PORT_NAMES = [
        '20' => 'FTP-DATA', '21' => 'FTP', '22' => 'SSH', '23' => 'Telnet', '25' => 'SMTP', '53' => 'DNS',
        '67' => 'DHCP', '68' => 'DHCP', '69' => 'TFTP', '80' => 'HTTP', '110' => 'POP3', '123' => 'NTP',
        '143' => 'IMAP', '161' => 'SNMP', '162' => 'SNMP-Trap', '179' => 'BGP', '389' => 'LDAP',
        '443' => 'HTTPS', '445' => 'SMB', '465' => 'SMTPS', '514' => 'Syslog', '587' => 'SMTP',
        '636' => 'LDAPS', '993' => 'IMAPS', '995' => 'POP3S', '1812' => 'RADIUS', '1813' => 'RADIUS',
        '3306' => 'MySQL', '3389' => 'RDP', '5060' => 'SIP', '5432' => 'PostgreSQL', '8080' => 'HTTP-Alt', '8443' => 'HTTPS-Alt',
    ];

    /** Known protocol keywords (separators stripped before matching). */
    private const ACL_PROTOCOLS = [
        'tcp', 'udp', 'icmp', 'icmpv6', 'igmp', 'gre', 'esp', 'ah', 'ospf', 'pim', 'sctp', 'ip', 'ipv6',
        'arp', 'arprequest', 'arpresponse', 'arpreply',
        'echorequest', 'echoreply', 'destinationunreachable', 'timeexceeded',
        'redirect', 'routeradvertisement', 'routersolicitation',
    ];

    private const COMPLIANCE_STATUS_RGB = [
        'compliant' => [22, 163, 74],
        'non_compliant' => [220, 38, 38],
        'error' => [234, 88, 12],
        'not_applicable' => [100, 116, 139],
    ];

    private const COMPLIANCE_SEVERITY_RGB = [
        'info' => [37, 99, 235],
        'low' => [22, 163, 74],
        'medium' => [234, 179, 8],
        'high' => [234, 88, 12],
        'critical' => [220, 38, 38],
    ];

    private function generatePdf(Report $report, string $filePath, ?Node $forNode = null): void
    {
        $blocks = $report->getBlocks();
        $hasSummary = $this->containsRecommendationSummary($blocks);

        $pageMap = [];
        if ($hasSummary) {
            $tmpPath = tempnam(sys_get_temp_dir(), 'auditix_pre_') . '.pdf';
            try {
                $unused = [];
                $this->doGeneratePdf($report, $tmpPath, $forNode, [], $pageMap);
            } finally {
                @unlink($tmpPath);
            }
        }

        $unused2 = [];
        $this->doGeneratePdf($report, $filePath, $forNode, $pageMap, $unused2);
    }

    private function doGeneratePdf(Report $report, string $filePath, ?Node $forNode, array $summaryPageMap, array &$collectedPageMap): void
    {
        $locale = $report->getLocale() ?: 'fr';
        $t = self::PDF_TRANSLATIONS[$locale] ?? self::PDF_TRANSLATIONS['fr'];

        $styles = $report->getTheme()?->getStyles() ?? ReportTheme::DEFAULT_STYLES;
        $coverPage = $styles['coverPage'] ?? ReportTheme::DEFAULT_STYLES['coverPage'];
        $colors = $styles['colors'] ?? ReportTheme::DEFAULT_STYLES['colors'];
        $margins = $styles['margins'] ?? ReportTheme::DEFAULT_STYLES['margins'];
        $headings = $styles['headings'] ?? ReportTheme::DEFAULT_STYLES['headings'];
        $tocStyle = $styles['toc'] ?? ReportTheme::DEFAULT_STYLES['toc'];
        $headerStyle = $styles['header'] ?? ReportTheme::DEFAULT_STYLES['header'];
        $footerStyle = $styles['footer'] ?? ReportTheme::DEFAULT_STYLES['footer'];
        $numberingEnabled = $styles['headingNumbering'] ?? true;

        $title = $report->getTitle() ?: $report->getName();
        $subtitle = $report->getSubtitle() ?? '';
        $contextName = $report->getContext()->getName() ?? '';

        // Resolve {{node...}} variables in title and subtitle
        $title = $this->resolveNodeVariables($title, $forNode, $report);
        $subtitle = $this->resolveNodeVariables($subtitle, $forNode, $report);

        // For node-type reports, add node info to variables
        $nodeName = '';
        $nodeIp = '';
        $nodeHostname = '';
        if ($forNode) {
            $nodeName = $forNode->getName() ?? $forNode->getHostname() ?? $forNode->getIpAddress();
            $nodeIp = $forNode->getIpAddress() ?? '';
            $nodeHostname = $forNode->getHostname() ?? '';
        }

        $variables = [
            'title' => $title,
            'subtitle' => $subtitle,
            'date' => (new \DateTime())->format('d/m/Y'),
            'author' => 'Auditix',
            'context' => $contextName,
            'nodeName' => $nodeName,
            'nodeIp' => $nodeIp,
            'nodeHostname' => $nodeHostname,
        ];

        // Index heading styles by level
        $headingsByLevel = [];
        foreach ($headings as $h) {
            $headingsByLevel[$h['level'] ?? 0] = $h;
        }

        $mLeft = $margins['left'] ?? 20;
        $mTop = $margins['top'] ?? 20;
        $mRight = $margins['right'] ?? 20;
        $mBottom = $margins['bottom'] ?? 20;

        // Calculate page numbers for TOC entries
        // Order: Cover > Authors > Revisions > TOC > Illustrations > Content
        $pageNum = 1; // cover page
        $tocEntries = [];

        if ($report->getShowAuthorsPage()) {
            $pageNum++;
            $tocEntries[] = ['level' => 1, 'title' => $t['authors_page'], 'page' => $pageNum];
        }

        if ($report->getShowRevisionPage()) {
            $pageNum++;
            $tocEntries[] = ['level' => 1, 'title' => $t['revisions_page'], 'page' => $pageNum];
        }

        if ($report->getShowTableOfContents()) {
            $pageNum++;
            // TOC page itself is $pageNum, not listed in TOC
        }

        if ($report->getShowIllustrationsPage()) {
            $pageNum++;
            $tocEntries[] = ['level' => 1, 'title' => $t['illustrations_page'], 'page' => $pageNum];
        }

        // Blocks: compute TOC entries and page numbers (recurses into containers).
        $blocks = $report->getBlocks();
        $firstBlockDone = false;
        $this->collectTocEntries($blocks, $pageNum, $firstBlockDone, $tocEntries, $forNode, $report);

        // --- Render PDF ---
        $pdf = new TCPDF('P', 'mm', 'A4', true, 'UTF-8');
        $pdf->SetCreator('Auditix');
        $pdf->SetAuthor('Auditix');
        $pdf->SetTitle($title);
        $pdf->setPrintHeader(false);
        $pdf->setPrintFooter(false);

        // Cover page: no margins
        $pdf->SetMargins(0, 0, 0);
        $pdf->SetAutoPageBreak(false);
        $pdf->AddPage();
        $this->renderCoverPage($pdf, $coverPage, $variables, $colors, $forNode, $report);

        // Authors / Diffusion
        if ($report->getShowAuthorsPage()) {
            $this->addTitledPage($pdf, $t['authors_page'], $mLeft, $mTop, $mRight, $mBottom, $headingsByLevel);
            $this->renderAuthorsPage($pdf, $report->getAuthors(), $report->getRecipients(), $t, $styles, $mLeft, $mRight, $mBottom, $headingsByLevel);
        }

        // Revision history
        if ($report->getShowRevisionPage()) {
            $this->addTitledPage($pdf, $t['revisions_page'], $mLeft, $mTop, $mRight, $mBottom, $headingsByLevel);
            $this->renderRevisionsPage($pdf, $report->getRevisions(), $t, $styles, $mLeft, $mRight, $mBottom);
        }

        // Table of Contents
        if ($report->getShowTableOfContents()) {
            $this->addTitledPage($pdf, $t['toc'], $mLeft, $mTop, $mRight, $mBottom, $headingsByLevel);
            $this->renderTocEntries($pdf, $tocEntries, $headingsByLevel, $tocStyle, $numberingEnabled, $mLeft, $mRight);
        }

        // Illustrations
        if ($report->getShowIllustrationsPage()) {
            $this->addTitledPage($pdf, $t['illustrations_page'], $mLeft, $mTop, $mRight, $mBottom, $headingsByLevel);
        }

        // Reset PDF state before rendering blocks (cover page / special pages may leave corrupted font state)
        $pdf->SetFont('helvetica', '', 11);
        $pdf->SetTextColor(0, 0, 0);
        $pdf->SetMargins($mLeft, $mTop, $mRight);
        $pdf->SetAutoPageBreak(true, $mBottom);

        // Render structure blocks. The heading counters are passed by reference
        // so nested calls (conditional, two_column) keep numbering continuous —
        // matching the TOC pass which walks all visible headings in a single
        // counter scope.
        $headingCounters = [];
        $this->renderBlocks($pdf, $blocks, $headingsByLevel, $styles, $numberingEnabled, $mLeft, $mTop, $mRight, $mBottom, $forNode, $report, $summaryPageMap, $collectedPageMap, false, $headingCounters);

        // Post-processing: render headers and footers on all pages except cover (page 1)
        $totalPages = $pdf->getNumPages();
        for ($p = 2; $p <= $totalPages; $p++) {
            $pdf->setPage($p);
            // Reset state so we can write anywhere on the page (including margin areas)
            $pdf->SetAutoPageBreak(false);
            $pdf->SetMargins(0, 0, 0);
            $pdf->SetCellPadding(0);
            $this->renderHeaderFooterBar($pdf, $headerStyle, $variables, $totalPages, $p, $mLeft, $mRight, true);
            $this->renderHeaderFooterBar($pdf, $footerStyle, $variables, $totalPages, $p, $mLeft, $mRight, false);
        }

        $pdf->Output($filePath, 'F');
    }

    private function addTitledPage(
        TCPDF $pdf,
        string $title,
        float $mLeft,
        float $mTop,
        float $mRight,
        float $mBottom,
        array $headingsByLevel,
    ): void {
        $pdf->SetMargins($mLeft, $mTop, $mRight);
        $pdf->SetAutoPageBreak(true, $mBottom);
        $pdf->AddPage();

        $h1 = $headingsByLevel[1] ?? null;
        $font = $this->mapFont($h1['font'] ?? 'Calibri');
        $size = $h1['size'] ?? 26;
        $bold = ($h1['bold'] ?? true) ? 'B' : '';
        $italic = ($h1['italic'] ?? false) ? 'I' : '';
        $rgb = $this->hexToRgb($h1['color'] ?? '#1e293b');
        $background = $h1['background'] ?? '';
        $spaceAfter = (float) ($h1['spaceAfter'] ?? 2);

        $pdf->SetTextColor($rgb[0], $rgb[1], $rgb[2]);
        $pdf->SetFont($font, $bold . $italic, $size);
        $pdf->SetXY($mLeft, $mTop);
        $lineH = $size * 0.3528 + 1;

        if ($background) {
            $bgRgb = $this->hexToRgb($background);
            $pdf->SetFillColor($bgRgb[0], $bgRgb[1], $bgRgb[2]);
            $pageW = $pdf->getPageWidth();
            $contentW = $pageW - $mLeft - $mRight;
            $pdf->MultiCell($contentW, $lineH + 2, ' ' . $title, 0, 'L', true);
        } else {
            $pdf->Cell(0, $lineH, $title, 0, 1, 'L');
        }

        $pdf->Ln($spaceAfter);
    }

    private function renderTocEntries(
        TCPDF $pdf,
        array $entries,
        array $headingsByLevel,
        array $tocStyle,
        bool $numberingEnabled,
        float $mLeft,
        float $mRight,
    ): void {
        $dotLeader = $tocStyle['dotLeader'] ?? true;
        $lineSpacing = $tocStyle['lineSpacing'] ?? 8;
        $pageW = $pdf->getPageWidth();
        $contentW = $pageW - $mLeft - $mRight;

        // Index TOC level styles
        $tocLevels = [];
        foreach (($tocStyle['levels'] ?? []) as $tl) {
            $tocLevels[$tl['level'] ?? 0] = $tl;
        }

        // Space after H1 title is already handled by addTitledPage via spaceAfter

        // Counters for numbering per level
        $counters = [];

        foreach ($entries as $entry) {
            $level = $entry['level'] ?? 1;
            $entryTitle = $entry['title'] ?? '';
            $entryPage = $entry['page'] ?? '';

            // Use independent TOC level style if available, fallback to heading style
            $tStyle = $tocLevels[$level] ?? null;
            if ($tStyle) {
                $font = $this->mapFont($tStyle['font'] ?? 'Calibri');
                $size = $tStyle['size'] ?? 11;
                $bold = ($tStyle['bold'] ?? false) ? 'B' : '';
                $italic = ($tStyle['italic'] ?? false) ? 'I' : '';
                $rgb = $this->hexToRgb($tStyle['color'] ?? '#1e293b');
            } else {
                $hStyle = $headingsByLevel[$level] ?? $headingsByLevel[1] ?? [];
                $font = $this->mapFont($hStyle['font'] ?? 'Calibri');
                $size = min($hStyle['size'] ?? 14, 14);
                $bold = ($hStyle['bold'] ?? false) ? 'B' : '';
                $italic = ($hStyle['italic'] ?? false) ? 'I' : '';
                $rgb = $this->hexToRgb($hStyle['color'] ?? '#1e293b');
            }

            // Indentation: 6mm per sub-level
            $indent = ($level - 1) * 6;

            // Numbering
            $prefix = '';
            if ($numberingEnabled) {
                // Increment counter for this level, reset deeper levels
                if (!isset($counters[$level])) {
                    $counters[$level] = 0;
                }
                $counters[$level]++;
                // Reset all deeper levels
                foreach ($counters as $l => $v) {
                    if ($l > $level) {
                        unset($counters[$l]);
                    }
                }
                // Build number string: "1.", "1.1.", "1.1.1.", etc.
                $parts = [];
                for ($l = 1; $l <= $level; $l++) {
                    $parts[] = $counters[$l] ?? 1;
                }
                $prefix = implode('.', $parts) . '. ';
            }

            $displayTitle = $prefix . $entryTitle;

            $pdf->SetFont($font, $bold . $italic, $size);
            $pdf->SetTextColor($rgb[0], $rgb[1], $rgb[2]);

            $x = $mLeft + $indent;
            $availableW = $contentW - $indent;

            // Calculate text width and page number width
            $pageNumStr = (string) $entryPage;
            $pageNumW = $pdf->GetStringWidth($pageNumStr) + 2;
            $titleW = $pdf->GetStringWidth($displayTitle);
            $dotsW = $availableW - $titleW - $pageNumW;

            $pdf->SetX($x);

            if ($dotLeader && $dotsW > 5) {
                // Title
                $pdf->Cell($titleW + 1, $lineSpacing, $displayTitle, 0, 0, 'L');
                // Dots
                $pdf->SetFont($font, '', $size);
                $dotChar = '.';
                $singleDotW = $pdf->GetStringWidth('. ');
                if ($singleDotW > 0) {
                    $numDots = (int) floor(($dotsW - 1) / ($singleDotW));
                    $dots = str_repeat('. ', max(0, $numDots));
                } else {
                    $dots = '';
                }
                $pdf->Cell($dotsW - 1, $lineSpacing, $dots, 0, 0, 'R');
                $pdf->SetFont($font, $bold . $italic, $size);
                // Page number
                $pdf->Cell($pageNumW, $lineSpacing, $pageNumStr, 0, 1, 'R');
            } else {
                // No dot leader: title left, page number right
                $pdf->Cell($availableW - $pageNumW, $lineSpacing, $displayTitle, 0, 0, 'L');
                $pdf->Cell($pageNumW, $lineSpacing, $pageNumStr, 0, 1, 'R');
            }
        }
    }

    private function renderCoverPage(TCPDF $pdf, array $coverPage, array $variables, array $colors, ?Node $forNode = null, ?Report $report = null): void
    {
        $pageW = $pdf->getPageWidth();
        $pageH = $pdf->getPageHeight();

        // Background color
        $bg = $coverPage['background'] ?? '#ffffff';
        $bgRgb = $this->hexToRgb($bg);
        $pdf->SetFillColor($bgRgb[0], $bgRgb[1], $bgRgb[2]);
        $pdf->Rect(0, 0, $pageW, $pageH, 'F');

        $elements = $coverPage['elements'] ?? [];

        if (empty($elements)) {
            $this->renderDefaultCoverPage($pdf, $variables, $colors);
            return;
        }

        foreach ($elements as $el) {
            $x = ($el['x'] ?? 0) / 100 * $pageW;
            $y = ($el['y'] ?? 0) / 100 * $pageH;
            $w = ($el['width'] ?? 50) / 100 * $pageW;
            $h = ($el['height'] ?? 10) / 100 * $pageH;
            $style = $el['style'] ?? [];
            $type = $el['type'] ?? 'text';

            if ($type === 'variable' || $type === 'text') {
                $text = '';
                if ($type === 'variable') {
                    $text = htmlspecialchars($variables[$el['variable'] ?? ''] ?? '', ENT_QUOTES, 'UTF-8');
                } else {
                    $rawContent = $el['content'] ?? '';
                    if ($report) {
                        $rawContent = $this->resolveNodeVariables($rawContent, $forNode, $report);
                    }
                    $text = $this->sanitizeHtml(str_replace("\n", '<br>', $rawContent));
                }

                $font = $this->mapFont($style['fontFamily'] ?? 'Helvetica');
                $fontSize = $style['fontSize'] ?? 14;
                $fontWeight = ($style['fontWeight'] ?? 'normal') === 'bold' ? 'B' : '';
                $fontStyle = ($style['fontStyle'] ?? 'normal') === 'italic' ? 'I' : '';

                $rgb = $this->hexToRgb($style['color'] ?? '#1e293b');
                $color = sprintf('#%02x%02x%02x', $rgb[0], $rgb[1], $rgb[2]);

                $align = match ($style['textAlign'] ?? 'center') {
                    'left' => 'left',
                    'right' => 'right',
                    default => 'center',
                };

                $htmlStyle = sprintf(
                    'font-family:%s;font-size:%dpt;color:%s;text-align:%s;%s%s',
                    $font,
                    $fontSize,
                    $color,
                    $align,
                    $fontWeight === 'B' ? 'font-weight:bold;' : '',
                    $fontStyle === 'I' ? 'font-style:italic;' : '',
                );

                $html = sprintf('<div style="%s">%s</div>', $htmlStyle, $text);

                $pdf->SetXY($x, $y);
                $pdf->writeHTMLCell($w, $h, $x, $y, $html, 0, 1, false, true, '', true);
            } elseif ($type === 'image') {
                $src = $el['src'] ?? '';
                // Resolve image path: /api/cover-page-images/X → /var/www/var/uploads/cover-pages/X
                $imgPath = null;
                if ($src && preg_match('#^/api/cover-page-images/(.+)$#', $src, $m)) {
                    $imgPath = '/var/www/var/uploads/cover-pages/' . basename($m[1]);
                } elseif ($src && file_exists('/var/www/public' . $src)) {
                    $imgPath = '/var/www/public' . $src;
                }
                if ($imgPath && file_exists($imgPath)) {
                    $pdf->Image($imgPath, $x, $y, $w, $h, '', '', '', true, 300, '', false, false, 0, 'CM');
                }
            }
        }
    }

    private function renderDefaultCoverPage(TCPDF $pdf, array $variables, array $colors): void
    {
        $pageW = $pdf->getPageWidth();
        $pageH = $pdf->getPageHeight();

        // Decorative lines
        $primaryRgb = $this->hexToRgb($colors['primary'] ?? '#1e293b');
        $pdf->SetFillColor($primaryRgb[0], $primaryRgb[1], $primaryRgb[2]);
        $pdf->Rect(0, $pageH * 0.38, $pageW, 2, 'F');

        $secondaryRgb = $this->hexToRgb($colors['secondary'] ?? '#3b82f6');
        $pdf->SetFillColor($secondaryRgb[0], $secondaryRgb[1], $secondaryRgb[2]);
        $pdf->Rect(0, $pageH * 0.38 + 3, $pageW, 0.8, 'F');

        // Title
        $pdf->SetTextColor($primaryRgb[0], $primaryRgb[1], $primaryRgb[2]);
        $pdf->SetFont('helvetica', 'B', 28);
        $pdf->SetXY(20, $pageH * 0.42);
        $pdf->MultiCell($pageW - 40, 15, $variables['title'] ?? '', 0, 'L');

        // Subtitle
        if (!empty($variables['subtitle'])) {
            $pdf->SetTextColor($secondaryRgb[0], $secondaryRgb[1], $secondaryRgb[2]);
            $pdf->SetFont('helvetica', '', 16);
            $pdf->SetX(20);
            $pdf->MultiCell($pageW - 40, 10, $variables['subtitle'], 0, 'L');
        }

        // Meta info
        $pdf->SetTextColor(100, 116, 139);
        $pdf->SetFont('helvetica', '', 10);
        $pdf->SetXY(20, $pageH - 50);
        $pdf->Cell($pageW - 40, 6, $variables['context'] ?? '', 0, 1, 'L');
        $pdf->SetX(20);
        $pdf->Cell($pageW - 40, 6, $variables['date'] ?? '', 0, 1, 'L');
        $pdf->SetX(20);
        $pdf->Cell($pageW - 40, 6, 'Genere par Auditix', 0, 1, 'L');
    }

    /**
     * Render an HTML fragment via writeHTMLCell, trimming the phantom trailing
     * line that TCPDF adds after a closing list tag.
     */
    private function writeHtmlFragment(TCPDF $pdf, string $html, float $width, float $x, float $y): void
    {
        if ($html === '') return;

        // Wrap plain text in <p> with line breaks
        if (!preg_match('/<[a-z][^>]*>/i', $html)) {
            $html = '<p>' . nl2br(htmlspecialchars($html, ENT_QUOTES)) . '</p>';
        }

        // Strip trailing empty paragraphs/divs (TipTap leaves an empty <p></p> after a list)
        $prev = null;
        while ($prev !== $html) {
            $prev = $html;
            $html = preg_replace('#(<p>(?:\s|&nbsp;|<br\s*/?>)*</p>|<div>(?:\s|&nbsp;|<br\s*/?>)*</div>)\s*$#i', '', $html) ?? $html;
        }
        $html = rtrim($html);
        if ($html === '') return;

        $pdf->writeHTMLCell($width, 0, $x, $y, $html, 0, 1, false, true, 'L', true);

        // TCPDF appends a phantom line break when HTML ends with a closing list tag
        if (preg_match('/<\/(ul|ol)>\s*$/i', $html)) {
            $lineH = $pdf->getCellHeight($pdf->getFontSize());
            $pdf->SetY($pdf->GetY() - $lineH);
        }
    }

    private function renderBlocks(
        TCPDF $pdf,
        array $blocks,
        array $headingsByLevel,
        array $styles,
        bool $numberingEnabled,
        float $mLeft,
        float $mTop,
        float $mRight,
        float $mBottom,
        ?Node $forNode = null,
        ?Report $report = null,
        array $summaryPageMap = [],
        array &$collectedPageMap = [],
        bool $isNestedCall = false,
        ?array &$externalCounters = null,
    ): void {
        if (empty($blocks)) return;

        $body = $styles['body'] ?? ReportTheme::DEFAULT_STYLES['body'];
        $bodyFont = $this->mapFont($body['font'] ?? 'Calibri');
        $bodySize = $body['size'] ?? 11;
        $bodyRgb = $this->hexToRgb($body['color'] ?? '#1e293b');

        $paragraphStyle = $styles['paragraph'] ?? ReportTheme::DEFAULT_STYLES['paragraph'];
        $pAlign = $paragraphStyle['alignment'] ?? 'left';
        $pLineBefore = (float) ($paragraphStyle['lineBefore'] ?? 0);
        $pLineAfter = (float) ($paragraphStyle['lineAfter'] ?? 0);
        $pBlockSpacing = (float) ($paragraphStyle['blockSpacing'] ?? 4);
        $pSpaceBefore = (float) ($paragraphStyle['spaceBefore'] ?? 2);
        $pSpaceAfter = (float) ($paragraphStyle['spaceAfter'] ?? 2);

        // Heading numbering counters. When a parent shares its counters via
        // $externalCounters, alias the local $counters onto it so all nested
        // calls (conditional, two_column) increment a single sequence. Without
        // this, every nested renderBlocks() would restart counters at 1 and
        // diverge from the TOC which numbers continuously.
        if ($externalCounters !== null) {
            $counters = &$externalCounters;
        } else {
            $localCounters = [];
            $counters = &$localCounters;
        }
        // Nested calls (two_column, conditional) skip the implicit AddPage on the
        // first block so the cursor stays where the parent placed it.
        $firstBlock = !$isNestedCall;
        $prevType = '';
        $blockCount = count($blocks);

        // Set <p> tag spacing for lineBefore/lineAfter (space between <p> lines within a block)
        // n=0 trick: TCPDF uses !empty(h), so h=0 falls back to default. Use n=0 to truly disable.
        $pBefore = $pLineBefore > 0 ? ['h' => $pLineBefore, 'n' => 1] : ['h' => 1, 'n' => 0];
        $pAfter = $pLineAfter > 0 ? ['h' => $pLineAfter, 'n' => 1] : ['h' => 1, 'n' => 0];
        $noSpace = ['h' => 1, 'n' => 0];
        $pdf->setHtmlVSpace([
            'div' => [0 => $noSpace, 1 => $noSpace],
            'p' => [0 => $pBefore, 1 => $pAfter],
            'ul' => [0 => $noSpace, 1 => $noSpace],
            'ol' => [0 => $noSpace, 1 => $noSpace],
            'li' => [0 => $noSpace, 1 => $noSpace],
        ]);

        for ($i = 0; $i < $blockCount; $i++) {
            $block = $blocks[$i];
            $type = $block['type'] ?? '';
            $nextType = ($i + 1 < $blockCount) ? ($blocks[$i + 1]['type'] ?? '') : '';

            $this->logger->info('[generator] block', [
                'reportId' => $report?->getId(),
                'nodeId' => $forNode?->getId(),
                'index' => $i,
                'total' => $blockCount,
                'type' => $type,
                'level' => $block['level'] ?? null,
            ]);

            if ($type === 'heading') {
                $level = $block['level'] ?? 1;
                $content = $this->resolveNodeVariables($block['content'] ?? '', $forNode, $report);
                $pageBreakBefore = !empty($block['pageBreakBefore']);

                // Update numbering counters
                if ($numberingEnabled) {
                    if (!isset($counters[$level])) {
                        $counters[$level] = 0;
                    }
                    $counters[$level]++;
                    // Reset deeper levels
                    foreach ($counters as $l => $v) {
                        if ($l > $level) {
                            unset($counters[$l]);
                        }
                    }
                    $parts = [];
                    for ($l = 1; $l <= $level; $l++) {
                        $parts[] = $counters[$l] ?? 1;
                    }
                    $prefix = implode('.', $parts) . '. ';
                } else {
                    $prefix = '';
                }

                $hStyle = $headingsByLevel[$level] ?? $headingsByLevel[1] ?? [];
                $spaceBefore = $hStyle['spaceBefore'] ?? 4;
                $spaceAfter = $hStyle['spaceAfter'] ?? 2;
                $background = $hStyle['background'] ?? '';

                if ($pageBreakBefore || $firstBlock) {
                    $pdf->SetMargins($mLeft, $mTop, $mRight);
                    $pdf->SetAutoPageBreak(true, $mBottom);
                    $pdf->AddPage();
                } else {
                    $pdf->Ln($spaceBefore);
                }

                $font = $this->mapFont($hStyle['font'] ?? 'Calibri');
                $size = $hStyle['size'] ?? 14;
                $bold = ($hStyle['bold'] ?? true) ? 'B' : '';
                $italic = ($hStyle['italic'] ?? false) ? 'I' : '';
                $rgb = $this->hexToRgb($hStyle['color'] ?? '#1e293b');

                $pdf->SetTextColor($rgb[0], $rgb[1], $rgb[2]);
                $pdf->SetFont($font, $bold . $italic, $size);
                $lineH = $size * 0.3528 + 1;

                // Keep-with-next: a heading must never be split across pages, and
                // it should not be left as an orphan at the bottom of a page with
                // its first body line on the next page. Estimate the heading
                // height (wrap included) and require at least two body-line
                // heights of follow-up space; if there is not enough room on the
                // current page, force a fresh page before rendering. Skipped
                // when we just started a fresh page above.
                $pageW = $pdf->getPageWidth();
                $contentW = $pageW - $mLeft - $mRight;
                $headingTextW = $background ? $contentW : $contentW;
                $headingLineH = $background ? $lineH + 2 : $lineH;
                $headingHeight = $pdf->getStringHeight($headingTextW, $prefix . $content);
                if ($headingHeight < $headingLineH) $headingHeight = $headingLineH;
                $minFollowH = max(($bodySize * 0.3528 + 1) * 2, 8.0);
                $pageBottomLimit = $pdf->getPageHeight() - $mBottom;
                if (
                    !$pageBreakBefore
                    && !$firstBlock
                    && ($pdf->GetY() + $headingHeight + $spaceAfter + $minFollowH) > $pageBottomLimit
                ) {
                    $pdf->AddPage();
                }

                // Background color
                if ($background) {
                    $bgRgb = $this->hexToRgb($background);
                    $pdf->SetFillColor($bgRgb[0], $bgRgb[1], $bgRgb[2]);
                    $pdf->MultiCell($contentW, $lineH + 2, ' ' . $prefix . $content, 0, 'L', true);
                } else {
                    $pdf->MultiCell(0, $lineH, $prefix . $content, 0, 'L');
                }
                $pdf->Ln($spaceAfter);

                $firstBlock = false;
                $prevType = 'heading';

            } elseif ($type === 'paragraph') {
                $content = $this->resolveNodeVariables($block['content'] ?? '', $forNode, $report);
                $align = $block['align'] ?? $pAlign;

                // --- Page / spacing ---
                if ($firstBlock) {
                    $pdf->SetMargins($mLeft, $mTop, $mRight);
                    $pdf->SetAutoPageBreak(true, $mBottom);
                    $pdf->AddPage();
                    $firstBlock = false;
                } elseif ($prevType === 'paragraph') {
                    if ($pBlockSpacing > 0) {
                        $pdf->Ln($pBlockSpacing);
                    }
                } else {
                    if ($pSpaceBefore > 0) {
                        $pdf->Ln($pSpaceBefore);
                    }
                }

                // --- Prepare HTML ---
                $html = $this->sanitizeParagraphHtml($content);
                // Remove empty trailing <p> tags (TipTap often adds <p></p> or <p><br></p> at end)
                $html = preg_replace('#(<p[^>]*>\s*(<br\s*/?>)?\s*</p>\s*)+$#i', '', $html);
                // Strip the FIRST opening <p> and LAST closing </p> so that
                // setHtmlVSpace only applies BETWEEN <p> lines, not at block boundaries
                $html = preg_replace('#^\s*<p[^>]*>#i', '', $html, 1);
                $html = preg_replace('#</p>\s*$#i', '', $html, 1);
                $html = trim($html);

                if (empty($html)) {
                    $prevType = 'paragraph';
                    continue;
                }

                // Apply text alignment
                $alignMap = ['left' => 'left', 'center' => 'center', 'right' => 'right', 'justify' => 'justify'];
                $cssAlign = $alignMap[$align] ?? 'left';
                $html = '<div style="text-align:' . $cssAlign . ';">' . $html . '</div>';

                // --- Render ---
                $pdf->SetTextColor($bodyRgb[0], $bodyRgb[1], $bodyRgb[2]);
                $pdf->SetFont($bodyFont, '', $bodySize);

                $pageW = $pdf->getPageWidth();
                $contentW = $pageW - $mLeft - $mRight;
                $pdf->writeHTMLCell($contentW, 0, $mLeft, $pdf->GetY(), $html, 0, 1, false, true, '', true);

                // --- Group boundary: spaceAfter ---
                if ($nextType !== 'paragraph' && $pSpaceAfter > 0) {
                    $pdf->Ln($pSpaceAfter);
                }

                $firstBlock = false;
                $prevType = 'paragraph';

            } elseif ($type === 'image') {
                $filename = $block['filename'] ?? '';
                $width = (float) ($block['width'] ?? 100);
                $showCaption = !empty($block['showCaption']);
                $caption = $block['caption'] ?? '';

                if (empty($filename)) {
                    continue;
                }

                // Resolve image path
                $imgPath = null;
                if (preg_match('#^/api/block-images/(.+)$#', $filename, $m)) {
                    $imgPath = '/var/www/var/uploads/block-images/' . basename($m[1]);
                } elseif (file_exists('/var/www/var/uploads/block-images/' . basename($filename))) {
                    $imgPath = '/var/www/var/uploads/block-images/' . basename($filename);
                }

                if (!$imgPath || !file_exists($imgPath)) {
                    continue;
                }

                // Page / spacing
                if ($firstBlock) {
                    $pdf->SetMargins($mLeft, $mTop, $mRight);
                    $pdf->SetAutoPageBreak(true, $mBottom);
                    $pdf->AddPage();
                    $firstBlock = false;
                } else {
                    $pdf->Ln($pSpaceBefore > 0 ? $pSpaceBefore : 4);
                }

                $pageW = $pdf->getPageWidth();
                $contentW = $pageW - $mLeft - $mRight;
                $imgW = $contentW * ($width / 100);

                // Center the image
                $imgX = $mLeft + ($contentW - $imgW) / 2;
                $pdf->Image($imgPath, $imgX, $pdf->GetY(), $imgW, 0, '', '', 'N', true, 300);

                // Caption
                if ($showCaption && !empty($caption)) {
                    $pdf->Ln(2);
                    $pdf->SetTextColor($bodyRgb[0], $bodyRgb[1], $bodyRgb[2]);
                    $pdf->SetFont($bodyFont, 'I', $bodySize - 1);
                    $pdf->MultiCell($contentW, 0, $caption, 0, 'C', false, 1, $mLeft);
                    $pdf->SetFont($bodyFont, '', $bodySize);
                }

                if ($pSpaceAfter > 0) {
                    $pdf->Ln($pSpaceAfter);
                }

                $prevType = 'image';

            } elseif ($type === 'table') {
                $headers = $block['headers'] ?? [];
                $rows = $block['rows'] ?? [];
                $showHeader = !empty($block['showHeader']);
                $colAligns = $block['columnAligns'] ?? [];
                $colWidthsPct = $block['columnWidths'] ?? [];
                $colVAligns = $block['columnVAligns'] ?? [];

                if (empty($rows) && empty($headers)) {
                    continue;
                }

                // Page / spacing
                if ($firstBlock) {
                    $pdf->SetMargins($mLeft, $mTop, $mRight);
                    $pdf->SetAutoPageBreak(true, $mBottom);
                    $pdf->AddPage();
                    $firstBlock = false;
                } else {
                    $pdf->Ln($pSpaceBefore > 0 ? $pSpaceBefore : 4);
                }

                // Table styles from theme
                $tableStyle = $styles['table'] ?? ReportTheme::DEFAULT_STYLES['table'];
                $headerBg = $this->hexToRgb($tableStyle['headerBg'] ?? '#1e293b');
                $headerColor = $this->hexToRgb($tableStyle['headerColor'] ?? '#ffffff');
                $borderColor = $this->hexToRgb($tableStyle['borderColor'] ?? '#e2e8f0');
                $alternateRows = $tableStyle['alternateRows'] ?? true;
                $alternateBg = $this->hexToRgb($tableStyle['alternateBg'] ?? '#f8fafc');
                $tableFontSize = !empty($tableStyle['fontSize']) ? (int) $tableStyle['fontSize'] : $bodySize;

                $pageW = $pdf->getPageWidth();
                $contentW = $pageW - $mLeft - $mRight;
                $colCount = max(count($headers), !empty($rows[0]) ? count($rows[0]) : 1);
                $minLineH = $tableFontSize * 0.3528 + 3;

                // Compute column widths in mm
                $totalPct = array_sum($colWidthsPct) ?: 100;
                $colWidths = [];
                for ($c = 0; $c < $colCount; $c++) {
                    $pct = $colWidthsPct[$c] ?? (100 / $colCount);
                    $colWidths[$c] = $contentW * ($pct / $totalPct);
                }

                // Helper: extract cell value, sanitize HTML, return plain text for height calc
                $prepareCellData = function ($cell, int $defaultSize, bool $isHeader = false): array {
                    $val = is_array($cell) ? ($cell['value'] ?? '') : (string) $cell;
                    $cellSize = is_array($cell) && !empty($cell['size']) ? (int) $cell['size'] : $defaultSize;

                    // Legacy support: cell-level bold/italic
                    if (is_array($cell) && !empty($cell['bold']) && stripos($val, '<b>') === false) {
                        $val = '<b>' . $val . '</b>';
                    }
                    if (is_array($cell) && !empty($cell['italic']) && stripos($val, '<i>') === false) {
                        $val = '<i>' . $val . '</i>';
                    }

                    // Check if value contains HTML tags
                    $hasHtml = (bool) preg_match('/<(b|i|br|strong|em)[\s>\/]/i', $val);

                    // Sanitize: only allow b, i, br, strong, em
                    $val = strip_tags($val, '<b><i><br><strong><em>');

                    // For headers without explicit bold, wrap in <b>
                    if ($isHeader && !empty($val) && stripos($val, '<b>') === false && stripos($val, '<strong>') === false) {
                        $val = '<b>' . $val . '</b>';
                    }

                    // Plain text for height calculation: convert <br> to newlines, strip tags
                    $plain = str_ireplace(['<br>', '<br/>', '<br />'], "\n", $val);
                    $plain = strip_tags($plain);

                    return ['html' => $val, 'plain' => $plain, 'size' => $cellSize, 'hasHtml' => $hasHtml || $isHeader];
                };

                $pdf->SetDrawColor($borderColor[0], $borderColor[1], $borderColor[2]);
                $pdf->SetLineWidth(0.2);

                // --- Header row ---
                if ($showHeader && !empty($headers)) {
                    $pdf->SetFillColor($headerBg[0], $headerBg[1], $headerBg[2]);
                    $pdf->SetTextColor($headerColor[0], $headerColor[1], $headerColor[2]);

                    // Prepare cells and calculate max row height
                    $maxH = $minLineH;
                    $prepared = [];
                    for ($c = 0; $c < $colCount; $c++) {
                        $cell = $headers[$c] ?? '';
                        $p = $prepareCellData($cell, $tableFontSize, true);
                        $prepared[$c] = $p;
                        $pdf->SetFont($bodyFont, 'B', $p['size']);
                        $cellH = $pdf->getStringHeight($colWidths[$c], $p['plain']);
                        $maxH = max($maxH, $cellH + 2);
                    }

                    // Keep-with-next: avoid leaving the header alone at the
                    // bottom of a page with the body starting on the next one.
                    // Estimate the first data row's height and force a new page
                    // when header + first row would not fit together.
                    $firstRowH = $minLineH;
                    if (!empty($rows) && is_array($rows[0])) {
                        for ($c = 0; $c < $colCount; $c++) {
                            $cell = $rows[0][$c] ?? '';
                            $p = $prepareCellData($cell, $tableFontSize, false);
                            $pdf->SetFont($bodyFont, '', $p['size']);
                            $cellH = $pdf->getStringHeight($colWidths[$c], $p['plain']);
                            $firstRowH = max($firstRowH, $cellH + 2);
                        }
                    }
                    if ($pdf->GetY() + $maxH + $firstRowH > $pdf->getPageHeight() - $mBottom) {
                        $pdf->AddPage();
                    }

                    $startY = $pdf->GetY();
                    $startX = $mLeft;
                    for ($c = 0; $c < $colCount; $c++) {
                        $p = $prepared[$c];
                        $align = strtoupper(substr($colAligns[$c] ?? 'left', 0, 1));
                        $vAlign = strtoupper(substr($colVAligns[$c] ?? 'middle', 0, 1));
                        $pdf->SetFont($bodyFont, 'B', $p['size']);
                        if ($p['hasHtml']) {
                            // Draw cell background + border
                            $pdf->SetXY($startX, $startY);
                            $pdf->Cell($colWidths[$c], $maxH, '', 1, 0, 'L', true);
                            // Calculate content height for vertical alignment
                            $contentH = $pdf->getStringHeight($colWidths[$c], $p['plain']);
                            $yOffset = 0;
                            if ($vAlign === 'M') {
                                $yOffset = max(0, ($maxH - $contentH) / 2);
                            } elseif ($vAlign === 'B') {
                                $yOffset = max(0, $maxH - $contentH);
                            }
                            $pdf->writeHTMLCell($colWidths[$c], 0, $startX, $startY + $yOffset, $p['html'], 0, 0, false, true, $align, true);
                        } else {
                            $pdf->MultiCell($colWidths[$c], $maxH, $p['plain'], 1, $align, true, 0, $startX, $startY, true, 0, false, true, $maxH, $vAlign);
                        }
                        $startX += $colWidths[$c];
                    }
                    $pdf->SetXY($mLeft, $startY + $maxH);
                }

                // --- Data rows ---
                foreach ($rows as $ri => $row) {
                    $fill = false;
                    if ($alternateRows && $ri % 2 === 1) {
                        $pdf->SetFillColor($alternateBg[0], $alternateBg[1], $alternateBg[2]);
                        $fill = true;
                    } elseif ($alternateRows) {
                        $pdf->SetFillColor(255, 255, 255);
                        $fill = true;
                    }
                    $pdf->SetTextColor($bodyRgb[0], $bodyRgb[1], $bodyRgb[2]);

                    // Prepare cells and calculate max row height
                    $maxH = $minLineH;
                    $prepared = [];
                    for ($c = 0; $c < $colCount; $c++) {
                        $cell = $row[$c] ?? '';
                        $p = $prepareCellData($cell, $tableFontSize, false);
                        $prepared[$c] = $p;
                        $pdf->SetFont($bodyFont, '', $p['size']);
                        $cellH = $pdf->getStringHeight($colWidths[$c], $p['plain']);
                        $maxH = max($maxH, $cellH + 2);
                    }

                    $startY = $pdf->GetY();
                    // Check if row fits on current page, if not add page
                    if ($startY + $maxH > $pdf->getPageHeight() - $mBottom) {
                        $pdf->AddPage();
                        $startY = $pdf->GetY();
                    }

                    $startX = $mLeft;
                    for ($c = 0; $c < $colCount; $c++) {
                        $p = $prepared[$c];
                        $align = strtoupper(substr($colAligns[$c] ?? 'left', 0, 1));
                        $vAlign = strtoupper(substr($colVAligns[$c] ?? 'middle', 0, 1));
                        $pdf->SetFont($bodyFont, '', $p['size']);
                        if ($p['hasHtml']) {
                            // Draw cell background + border
                            $pdf->SetXY($startX, $startY);
                            $pdf->Cell($colWidths[$c], $maxH, '', 1, 0, 'L', $fill);
                            // Calculate content height for vertical alignment
                            $contentH = $pdf->getStringHeight($colWidths[$c], $p['plain']);
                            $yOffset = 0;
                            if ($vAlign === 'M') {
                                $yOffset = max(0, ($maxH - $contentH) / 2);
                            } elseif ($vAlign === 'B') {
                                $yOffset = max(0, $maxH - $contentH);
                            }
                            $pdf->writeHTMLCell($colWidths[$c], 0, $startX, $startY + $yOffset, $p['html'], 0, 0, false, true, $align, true);
                        } else {
                            $pdf->MultiCell($colWidths[$c], $maxH, $p['plain'], 1, $align, $fill, 0, $startX, $startY, true, 0, false, true, $maxH, $vAlign);
                        }
                        $startX += $colWidths[$c];
                    }
                    $pdf->SetXY($mLeft, $startY + $maxH);
                    $pdf->SetFont($bodyFont, '', $bodySize);
                }

                if ($pSpaceAfter > 0) {
                    $pdf->Ln($pSpaceAfter);
                }

                $prevType = 'table';

            } elseif ($type === 'inventory_table') {
                $invMode = $block['mode'] ?? 'multi_node_columns';
                $showHeader = !empty($block['showHeader']);
                $invTableStyle = $styles['table'] ?? ReportTheme::DEFAULT_STYLES['table'];
                $invThemeFontSize = !empty($invTableStyle['fontSize']) ? (int) $invTableStyle['fontSize'] : $bodySize;
                $invFontSize = !empty($block['fontSize']) ? (int) $block['fontSize'] : $invThemeFontSize;
                $hostnameHeaderLabel = !empty($block['hostnameHeaderLabel']) ? $block['hostnameHeaderLabel'] : 'Hostname';
                $styleRules = $block['styleRules'] ?? [];

                // --- single_node_full mode: render category entries as rows for one node ---
                if ($invMode === 'single_node_full') {
                    $singleNodeId = $forNode ? $forNode->getId() : ($block['singleNodeId'] ?? null);
                    $singleCategory = (string) ($block['singleCategory'] ?? '');
                    if (!$singleNodeId || $singleCategory === '') {
                        continue;
                    }
                    $node = $forNode ?? $this->em->getRepository(Node::class)->find($singleNodeId);
                    if (!$node) continue;

                    $countModeOn = !empty($block['countMode']);
                    $countCols = $block['countColumns'] ?? [];

                    if ($firstBlock) {
                        $pdf->SetMargins($mLeft, $mTop, $mRight);
                        $pdf->SetAutoPageBreak(true, $mBottom);
                        $pdf->AddPage();
                        $firstBlock = false;
                    } else {
                        $pdf->Ln($pSpaceBefore > 0 ? $pSpaceBefore : 4);
                    }

                    $tableStyle = $styles['table'] ?? ReportTheme::DEFAULT_STYLES['table'];
                    $headerBg = $this->hexToRgb($tableStyle['headerBg'] ?? '#1e293b');
                    $headerColor = $this->hexToRgb($tableStyle['headerColor'] ?? '#ffffff');
                    $borderColor = $this->hexToRgb($tableStyle['borderColor'] ?? '#e2e8f0');
                    $alternateRows = $tableStyle['alternateRows'] ?? true;
                    $alternateBg = $this->hexToRgb($tableStyle['alternateBg'] ?? '#f8fafc');

                    // Count-mode rendering: one row, one column per countColumn
                    if ($countModeOn && !empty($countCols)) {
                        $invRepo = $this->em->getRepository(NodeInventoryEntry::class);

                        $hostname = $node->getHostname() ?? $node->getName() ?? $node->getIpAddress();
                        $hostnameAlign = strtoupper(substr($block['hostnameAlign'] ?? 'left', 0, 1));
                        if (!in_array($hostnameAlign, ['L', 'C', 'R'])) $hostnameAlign = 'L';
                        $hostnameVAlign = strtoupper(substr($block['hostnameVAlign'] ?? 'middle', 0, 1));
                        if (!in_array($hostnameVAlign, ['T', 'M', 'B'])) $hostnameVAlign = 'M';

                        // Build headers, values, and aligns
                        $headers = [$hostnameHeaderLabel ?: 'Hostname'];
                        $values = [$hostname];
                        $colAligns = [$hostnameAlign];
                        $colVAligns = [$hostnameVAlign];
                        $explicitWidthPcts = [isset($block['hostnameWidth']) && $block['hostnameWidth'] > 0 ? (float) $block['hostnameWidth'] : null];
                        foreach ($countCols as $cc) {
                            $colLabel = (string) ($cc['colLabel'] ?? '');
                            $matchValue = (string) ($cc['matchValue'] ?? '');
                            $matchOp = $cc['matchOperator'] ?? 'eq';

                            $hLabel = (string) ($cc['headerLabel'] ?? '');
                            if ($hLabel === '') $hLabel = $matchValue !== '' ? $matchValue : $colLabel;
                            $headers[] = $hLabel;
                            $explicitWidthPcts[] = isset($cc['width']) && $cc['width'] > 0 ? (float) $cc['width'] : null;

                            $cnt = 0;
                            if ($colLabel !== '') {
                                $rows = $invRepo->createQueryBuilder('e')
                                    ->select('e.value AS val')
                                    ->where('e.node = :n')
                                    ->andWhere('e.categoryName = :cat')
                                    ->andWhere('e.colLabel = :col')
                                    ->setParameter('n', $node)
                                    ->setParameter('cat', $singleCategory)
                                    ->setParameter('col', $colLabel)
                                    ->getQuery()
                                    ->getArrayResult();
                                foreach ($rows as $r) {
                                    $val = (string) ($r['val'] ?? '');
                                    if ($this->matchCountValue($val, $matchValue, $matchOp)) {
                                        $cnt++;
                                    }
                                }
                            }
                            $values[] = (string) $cnt;

                            $a = strtoupper(substr($cc['align'] ?? 'left', 0, 1));
                            $colAligns[] = in_array($a, ['L', 'C', 'R']) ? $a : 'L';
                            $va = strtoupper(substr($cc['valign'] ?? 'middle', 0, 1));
                            $colVAligns[] = in_array($va, ['T', 'M', 'B']) ? $va : 'M';
                        }

                        $pageW = $pdf->getPageWidth();
                        $contentW = $pageW - $mLeft - $mRight;
                        $tableW = $this->resolveInventoryTableWidth($block, $contentW);
                        $minLineH = $invFontSize * 0.3528 + 3;
                        $cellPadding = 4;
                        $colCountInv = count($headers);
                        $maxWidths = array_fill(0, $colCountInv, 0);

                        $pdf->SetFont($bodyFont, 'B', $invFontSize);
                        foreach ($headers as $hi => $h) {
                            $maxWidths[$hi] = max($maxWidths[$hi], $pdf->GetStringWidth($h) + $cellPadding);
                        }
                        $pdf->SetFont($bodyFont, '', $invFontSize);
                        foreach ($values as $vi => $v) {
                            $maxWidths[$vi] = max($maxWidths[$vi], $pdf->GetStringWidth($v) + $cellPadding);
                        }
                        $colWidthsInv = $this->distributeInventoryColumnWidths($maxWidths, $explicitWidthPcts, $tableW);

                        $pdf->SetDrawColor($borderColor[0], $borderColor[1], $borderColor[2]);
                        $pdf->SetLineWidth(0.2);

                        if ($showHeader) {
                            $pdf->SetFillColor($headerBg[0], $headerBg[1], $headerBg[2]);
                            $pdf->SetTextColor($headerColor[0], $headerColor[1], $headerColor[2]);
                            $pdf->SetFont($bodyFont, 'B', $invFontSize);
                            $maxH = $minLineH;
                            foreach ($headers as $hi => $h) {
                                $maxH = max($maxH, $pdf->getStringHeight($colWidthsInv[$hi], $h) + 2);
                            }
                            $startY = $pdf->GetY();
                            $startX = $mLeft;
                            foreach ($headers as $hi => $h) {
                                $pdf->MultiCell($colWidthsInv[$hi], $maxH, $h, 1, $colAligns[$hi], true, 0, $startX, $startY, true, 0, false, true, $maxH, 'M');
                                $startX += $colWidthsInv[$hi];
                            }
                            $pdf->SetXY($mLeft, $startY + $maxH);
                        }

                        $pdf->SetFont($bodyFont, '', $invFontSize);
                        $pdf->SetTextColor($bodyRgb[0], $bodyRgb[1], $bodyRgb[2]);
                        $maxH = $minLineH;
                        foreach ($values as $vi => $v) {
                            $maxH = max($maxH, $pdf->getStringHeight($colWidthsInv[$vi], $v) + 2);
                        }
                        $startY = $pdf->GetY();
                        if ($startY + $maxH > $pdf->getPageHeight() - $mBottom) {
                            $pdf->AddPage();
                            $startY = $pdf->GetY();
                        }
                        $startX = $mLeft;
                        foreach ($values as $vi => $v) {
                            $pdf->MultiCell($colWidthsInv[$vi], $maxH, $v, 1, $colAligns[$vi], false, 0, $startX, $startY, true, 0, false, true, $maxH, $colVAligns[$vi]);
                            $startX += $colWidthsInv[$vi];
                        }
                        $pdf->SetXY($mLeft, $startY + $maxH);

                        if ($pSpaceAfter > 0) {
                            $pdf->Ln($pSpaceAfter);
                        }
                        $prevType = 'table';
                        continue;
                    }

                    $entries = $this->em->getRepository(NodeInventoryEntry::class)->createQueryBuilder('e')
                        ->where('e.node = :n')
                        ->andWhere('e.categoryName = :cat')
                        ->setParameter('n', $node)
                        ->setParameter('cat', $singleCategory)
                        ->addOrderBy('e.colLabel', 'ASC')
                        ->getQuery()
                        ->getResult();

                    // Pivot: rows = entryKey, columns = colLabel (sorted by first occurrence)
                    $colLabels = [];
                    $rowMap = [];
                    foreach ($entries as $entry) {
                        $k = $entry->getEntryKey() ?? '';
                        $cl = $entry->getColLabel() ?? '';
                        if (!in_array($cl, $colLabels, true)) $colLabels[] = $cl;
                        if (!isset($rowMap[$k])) $rowMap[$k] = [];
                        $rowMap[$k][$cl] = $entry->getValue() ?? '';
                    }
                    $rowKeys = array_keys($rowMap);
                    sort($rowKeys, SORT_NATURAL | SORT_FLAG_CASE);

                    // Apply value filters (rows must match), then drop hidden columns.
                    $valueFilters = array_values(array_filter($block['valueFilters'] ?? [], 'is_array'));
                    if (!empty($valueFilters)) {
                        $matchAll = (($block['valueFiltersMatch'] ?? 'all') === 'all');
                        $rowKeys = array_values(array_filter($rowKeys, function ($k) use ($rowMap, $valueFilters, $matchAll) {
                            foreach ($valueFilters as $f) {
                                $cl = (string) ($f['colLabel'] ?? '');
                                if ($cl === '') continue;
                                $cell = mb_strtolower((string) ($rowMap[$k][$cl] ?? ''));
                                $expected = mb_strtolower((string) ($f['value'] ?? ''));
                                $op = (string) ($f['operator'] ?? 'eq');
                                $hit = match ($op) {
                                    'eq' => $cell === $expected,
                                    'neq' => $cell !== $expected,
                                    'contains' => $expected !== '' && str_contains($cell, $expected),
                                    'not_contains' => $expected === '' || !str_contains($cell, $expected),
                                    'starts_with' => $expected !== '' && str_starts_with($cell, $expected),
                                    'ends_with' => $expected !== '' && str_ends_with($cell, $expected),
                                    default => true,
                                };
                                if ($matchAll && !$hit) return false;
                                if (!$matchAll && $hit) return true;
                            }
                            return $matchAll;
                        }));
                    }

                    $hiddenColumns = array_values(array_filter((array) ($block['hiddenColumns'] ?? []), 'is_string'));
                    if (!empty($hiddenColumns)) {
                        $colLabels = array_values(array_filter($colLabels, fn($cl) => !in_array($cl, $hiddenColumns, true)));
                    }

                    if (empty($rowKeys)) {
                        // Filters dropped every row → skip block entirely.
                        if ($pSpaceAfter > 0) $pdf->Ln($pSpaceAfter);
                        $prevType = 'table';
                        continue;
                    }

                    // Conditional remark columns (appended after the data columns).
                    // Each rule is evaluated on the current row's value at rule.colLabel
                    // within the single category; texts of all matching rules are concatenated.
                    $remarkCols = [];
                    foreach (($block['columns'] ?? []) as $rc) {
                        if (is_array($rc) && ($rc['aggregation'] ?? '') === 'remark') {
                            $remarkCols[] = $rc;
                        }
                    }
                    $remarkValues = []; // rowKey => [remarkColIndex => text]
                    foreach ($rowKeys as $k) {
                        foreach ($remarkCols as $rci => $rc) {
                            $sep = (string) ($rc['remarkSeparator'] ?? ', ');
                            $rules = is_array($rc['remarkRules'] ?? null) ? $rc['remarkRules'] : [];
                            $texts = [];
                            foreach ($rules as $rule) {
                                if (!is_array($rule)) continue;
                                $rCol = (string) ($rule['colLabel'] ?? '');
                                $rOp = (string) ($rule['operator'] ?? 'eq');
                                $rVal = (string) ($rule['value'] ?? '');
                                $rText = (string) ($rule['text'] ?? '');
                                if ($rCol === '' || $rText === '') continue;
                                $cellVal = (string) ($rowMap[$k][$rCol] ?? '');
                                if ($this->evaluateInventoryOperator($cellVal, $rOp, $rVal)) {
                                    $texts[] = $rText;
                                }
                            }
                            $remarkValues[$k][$rci] = implode($sep, array_values(array_unique($texts)));
                        }
                    }

                    $pageW = $pdf->getPageWidth();
                    $contentW = $pageW - $mLeft - $mRight;
                    $tableW = $this->resolveInventoryTableWidth($block, $contentW);
                    $minLineH = $invFontSize * 0.3528 + 3;
                    $cellPadding = 4;

                    $headers = [$hostnameHeaderLabel ?: 'Cle'];
                    foreach ($colLabels as $cl) $headers[] = $cl;
                    $remarkBaseIdx = count($headers); // first remark column header index
                    foreach ($remarkCols as $rc) {
                        $headers[] = (string) ($rc['headerLabel'] ?? $rc['label'] ?? 'Remarque');
                    }
                    $colCountInv = count($headers);
                    $maxWidths = array_fill(0, $colCountInv, 0);

                    $pdf->SetFont($bodyFont, 'B', $invFontSize);
                    foreach ($headers as $hi => $h) {
                        $maxWidths[$hi] = max($maxWidths[$hi], $pdf->GetStringWidth($h) + $cellPadding);
                    }
                    $pdf->SetFont($bodyFont, '', $invFontSize);
                    foreach ($rowKeys as $k) {
                        $maxWidths[0] = max($maxWidths[0], $pdf->GetStringWidth($k) + $cellPadding);
                        foreach ($colLabels as $ci => $cl) {
                            $v = $rowMap[$k][$cl] ?? '';
                            $maxWidths[$ci + 1] = max($maxWidths[$ci + 1], $pdf->GetStringWidth($v) + $cellPadding);
                        }
                        foreach ($remarkCols as $rci => $rc) {
                            $v = (string) ($remarkValues[$k][$rci] ?? '');
                            $idx = $remarkBaseIdx + $rci;
                            $maxWidths[$idx] = max($maxWidths[$idx], $pdf->GetStringWidth($v) + $cellPadding);
                        }
                    }
                    $columnWidthsMap = is_array($block['columnWidths'] ?? null) ? $block['columnWidths'] : [];
                    $explicitWidthPcts = [
                        isset($block['keyColumnWidth']) && $block['keyColumnWidth'] > 0 ? (float) $block['keyColumnWidth'] : null,
                    ];
                    foreach ($colLabels as $cl) {
                        $w = $columnWidthsMap[$cl] ?? null;
                        $explicitWidthPcts[] = ($w !== null && $w > 0) ? (float) $w : null;
                    }
                    foreach ($remarkCols as $rc) {
                        $w = $rc['width'] ?? null;
                        $explicitWidthPcts[] = ($w !== null && $w > 0) ? (float) $w : null;
                    }
                    $colWidthsInv = $this->distributeInventoryColumnWidths($maxWidths, $explicitWidthPcts, $tableW);

                    $pdf->SetDrawColor($borderColor[0], $borderColor[1], $borderColor[2]);
                    $pdf->SetLineWidth(0.2);

                    if ($showHeader) {
                        $pdf->SetFillColor($headerBg[0], $headerBg[1], $headerBg[2]);
                        $pdf->SetTextColor($headerColor[0], $headerColor[1], $headerColor[2]);
                        $pdf->SetFont($bodyFont, 'B', $invFontSize);
                        $maxH = $minLineH;
                        foreach ($headers as $hi => $h) {
                            $maxH = max($maxH, $pdf->getStringHeight($colWidthsInv[$hi], $h) + 2);
                        }
                        $startY = $pdf->GetY();
                        $startX = $mLeft;
                        foreach ($headers as $hi => $h) {
                            $pdf->MultiCell($colWidthsInv[$hi], $maxH, $h, 1, 'L', true, 0, $startX, $startY, true, 0, false, true, $maxH, 'M');
                            $startX += $colWidthsInv[$hi];
                        }
                        $pdf->SetXY($mLeft, $startY + $maxH);
                    }

                    $pdf->SetFont($bodyFont, '', $invFontSize);
                    $pdf->SetTextColor($bodyRgb[0], $bodyRgb[1], $bodyRgb[2]);
                    foreach ($rowKeys as $ri => $k) {
                        $values = [$k];
                        foreach ($colLabels as $cl) {
                            $values[] = $rowMap[$k][$cl] ?? '';
                        }
                        foreach ($remarkCols as $rci => $rc) {
                            $values[] = (string) ($remarkValues[$k][$rci] ?? '');
                        }
                        $maxH = $minLineH;
                        foreach ($values as $vi => $v) {
                            $maxH = max($maxH, $pdf->getStringHeight($colWidthsInv[$vi], $v) + 2);
                        }
                        $startY = $pdf->GetY();
                        if ($startY + $maxH > $pdf->getPageHeight() - $mBottom) {
                            $pdf->AddPage();
                            $startY = $pdf->GetY();
                        }
                        $fill = $alternateRows && ($ri % 2 === 1);
                        $pdf->SetFillColor($alternateBg[0], $alternateBg[1], $alternateBg[2]);
                        $startX = $mLeft;
                        foreach ($values as $vi => $v) {
                            $pdf->MultiCell($colWidthsInv[$vi], $maxH, $v, 1, 'L', $fill, 0, $startX, $startY, true, 0, false, true, $maxH, 'M');
                            $startX += $colWidthsInv[$vi];
                        }
                        $pdf->SetXY($mLeft, $startY + $maxH);
                    }

                    if ($pSpaceAfter > 0) {
                        $pdf->Ln($pSpaceAfter);
                    }
                    $prevType = 'table';
                    continue;
                }

                // --- multi_node_columns mode (default): existing behavior ---
                $columns = $block['columns'] ?? [];

                // Resolve node ids: forNode wins for TYPE_NODE; otherwise manual + auto-rules
                if ($forNode) {
                    $nodeIds = [$forNode->getId()];
                } else {
                    $nodeIds = array_values(array_unique(array_map('intval', $block['nodeIds'] ?? [])));
                    $rules = $block['nodeRules'] ?? [];
                    if (!empty($rules) && $report->getContext()) {
                        $matchMode = ($block['nodeRulesMatch'] ?? 'any') === 'all' ? 'all' : 'any';
                        $matched = $this->inventoryRuleEvaluator->matchNodeIds($report->getContext(), $rules, $matchMode);
                        foreach ($matched as $mid) {
                            if (!in_array($mid, $nodeIds, true)) $nodeIds[] = $mid;
                        }
                    }
                }

                // Build column ID to index map for rule matching
                $colIdMap = ['__hostname__' => -1]; // -1 = hostname column
                foreach ($columns as $ci => $colDef) {
                    $colIdMap[$colDef['id'] ?? ''] = $ci;
                }

                if (empty($columns) || empty($nodeIds)) {
                    continue;
                }

                // Page / spacing
                if ($firstBlock) {
                    $pdf->SetMargins($mLeft, $mTop, $mRight);
                    $pdf->SetAutoPageBreak(true, $mBottom);
                    $pdf->AddPage();
                    $firstBlock = false;
                } else {
                    $pdf->Ln($pSpaceBefore > 0 ? $pSpaceBefore : 4);
                }

                // Table styles from theme
                $tableStyle = $styles['table'] ?? ReportTheme::DEFAULT_STYLES['table'];
                $headerBg = $this->hexToRgb($tableStyle['headerBg'] ?? '#1e293b');
                $headerColor = $this->hexToRgb($tableStyle['headerColor'] ?? '#ffffff');
                $borderColor = $this->hexToRgb($tableStyle['borderColor'] ?? '#e2e8f0');
                $alternateRows = $tableStyle['alternateRows'] ?? true;
                $alternateBg = $this->hexToRgb($tableStyle['alternateBg'] ?? '#f8fafc');

                $pageW = $pdf->getPageWidth();
                $contentW = $pageW - $mLeft - $mRight;
                $tableW = $this->resolveInventoryTableWidth($block, $contentW);
                $colCount = 1 + count($columns); // hostname + defined columns
                $minLineH = $invFontSize * 0.3528 + 3;

                // Alignment settings
                $hostnameAlign = strtoupper(substr($block['hostnameAlign'] ?? 'left', 0, 1));
                if (!in_array($hostnameAlign, ['L', 'C', 'R'])) $hostnameAlign = 'L';
                $hostnameVAlign = strtoupper(substr($block['hostnameVAlign'] ?? 'middle', 0, 1));
                if (!in_array($hostnameVAlign, ['T', 'M', 'B'])) $hostnameVAlign = 'M';

                $colAligns = [];
                $colVAligns = [];
                foreach ($columns as $ci => $colDef) {
                    $a = strtoupper(substr($colDef['align'] ?? 'left', 0, 1));
                    $colAligns[$ci] = in_array($a, ['L', 'C', 'R']) ? $a : 'L';
                    $va = strtoupper(substr($colDef['valign'] ?? 'middle', 0, 1));
                    $colVAligns[$ci] = in_array($va, ['T', 'M', 'B']) ? $va : 'M';
                }

                // Load nodes
                $nodes = $this->em->getRepository(Node::class)->findBy(['id' => $nodeIds]);
                $nodeMap = [];
                foreach ($nodes as $node) {
                    $nodeMap[$node->getId()] = $node;
                }

                // Load inventory entries for selected nodes and columns
                $invRepo = $this->em->getRepository(NodeInventoryEntry::class);
                // Build lookup: nodeId -> colId -> value (or count as string)
                $invData = [];
                foreach ($nodeIds as $nid) {
                    $invData[$nid] = [];
                }
                foreach ($columns as $colDef) {
                    $colId = $colDef['id'] ?? '';
                    $cat = $colDef['category'] ?? '';
                    $col = $colDef['colLabel'] ?? '';
                    $aggregation = $colDef['aggregation'] ?? 'value';

                    if ($aggregation === 'count') {
                        if ($colId === '') continue;
                        $matchValue = (string) ($colDef['matchValue'] ?? '');
                        $matchOp = $colDef['matchOperator'] ?? 'eq';
                        // No matchValue and operator is eq/neq => count all entries (no value filter).
                        $countAll = ($matchValue === '' && ($matchOp === 'eq' || $matchOp === 'neq'));

                        // Always initialize to "0" so cells show 0 even if no entries exist
                        foreach ($nodeIds as $nid) {
                            $invData[$nid][$colId] = '0';
                        }

                        if ($cat === '' || $col === '') continue;

                        $entries = $invRepo->createQueryBuilder('e')
                            ->where('e.node IN (:nodes)')
                            ->andWhere('e.categoryName = :cat')
                            ->andWhere('e.colLabel = :col')
                            ->setParameter('nodes', $nodeIds)
                            ->setParameter('cat', $cat)
                            ->setParameter('col', $col)
                            ->getQuery()
                            ->getResult();

                        $counts = [];
                        foreach ($entries as $entry) {
                            $nid = $entry->getNode()->getId();
                            if ($countAll) {
                                $counts[$nid] = ($counts[$nid] ?? 0) + 1;
                                continue;
                            }
                            $val = (string) ($entry->getValue() ?? '');
                            if ($this->matchCountValue($val, $matchValue, $matchOp)) {
                                $counts[$nid] = ($counts[$nid] ?? 0) + 1;
                            }
                        }
                        foreach ($counts as $nid => $cnt) {
                            $invData[$nid][$colId] = (string) $cnt;
                        }
                    } elseif ($aggregation === 'list') {
                        if ($colId === '') continue;
                        $listSource = ($colDef['listSource'] ?? 'keys') === 'values' ? 'values' : 'keys';
                        $listSeparator = (string) ($colDef['listSeparator'] ?? ', ');
                        $listFilters = is_array($colDef['listFilters'] ?? null) ? $colDef['listFilters'] : [];
                        $listFiltersMatch = ($colDef['listFiltersMatch'] ?? 'all') === 'any' ? 'any' : 'all';
                        $listCompact = !empty($colDef['listCompact']);

                        foreach ($nodeIds as $nid) {
                            $invData[$nid][$colId] = '';
                        }

                        if ($cat === '' || $col === '') continue;

                        $entries = $invRepo->createQueryBuilder('e')
                            ->where('e.node IN (:nodes)')
                            ->andWhere('e.categoryName = :cat')
                            ->andWhere('e.colLabel = :col')
                            ->setParameter('nodes', $nodeIds)
                            ->setParameter('cat', $cat)
                            ->setParameter('col', $col)
                            ->getQuery()
                            ->getResult();

                        $buckets = [];
                        foreach ($entries as $entry) {
                            $nid = $entry->getNode()->getId();
                            $key = (string) ($entry->getEntryKey() ?? '');
                            $val = (string) ($entry->getValue() ?? '');
                            if (!$this->matchListFilters($key, $val, $listFilters, $listFiltersMatch)) continue;
                            $item = ($listSource === 'values') ? $val : $key;
                            if ($item === '') continue;
                            $buckets[$nid][] = $item;
                        }
                        foreach ($buckets as $nid => $items) {
                            $items = array_values(array_unique($items));
                            usort($items, 'strnatcasecmp');
                            if ($listCompact) {
                                $items = $this->compactNumericRanges($items);
                            }
                            $invData[$nid][$colId] = implode($listSeparator, $items);
                        }
                    } elseif ($aggregation === 'remark') {
                        // Conditional remark column: evaluate each rule against the
                        // referenced inventory datum (category/entryKey/colLabel) per node;
                        // concatenate the texts of all matching rules.
                        if ($colId === '') continue;
                        $remarkRules = is_array($colDef['remarkRules'] ?? null) ? $colDef['remarkRules'] : [];
                        $remarkSep = (string) ($colDef['remarkSeparator'] ?? ', ');
                        foreach ($nodeIds as $nid) {
                            $invData[$nid][$colId] = '';
                        }
                        $acc = []; // nodeId => list of matched texts
                        foreach ($remarkRules as $rule) {
                            if (!is_array($rule)) continue;
                            $rCat = (string) ($rule['category'] ?? '');
                            $rKey = (string) ($rule['entryKey'] ?? '');
                            $rCol = (string) ($rule['colLabel'] ?? '');
                            $rOp = (string) ($rule['operator'] ?? 'eq');
                            $rVal = (string) ($rule['value'] ?? '');
                            $rText = (string) ($rule['text'] ?? '');
                            if ($rCat === '' || $rCol === '' || $rText === '') continue;

                            $qb = $invRepo->createQueryBuilder('e')
                                ->where('e.node IN (:nodes)')
                                ->andWhere('e.categoryName = :cat')
                                ->andWhere('e.colLabel = :col')
                                ->setParameter('nodes', $nodeIds)
                                ->setParameter('cat', $rCat)
                                ->setParameter('col', $rCol);
                            if ($rKey !== '') {
                                $qb->andWhere('e.entryKey = :key')->setParameter('key', $rKey);
                            }
                            $entries = $qb->getQuery()->getResult();
                            foreach ($entries as $entry) {
                                $nid = $entry->getNode()->getId();
                                $cellVal = (string) ($entry->getValue() ?? '');
                                if ($this->evaluateInventoryOperator($cellVal, $rOp, $rVal)) {
                                    $acc[$nid][] = $rText;
                                }
                            }
                        }
                        foreach ($acc as $nid => $texts) {
                            $invData[$nid][$colId] = implode($remarkSep, array_values(array_unique($texts)));
                        }
                    } else {
                        $key = $colDef['entryKey'] ?? '';
                        if ($colId === '' || $cat === '' || $key === '' || $col === '') continue;

                        $entries = $invRepo->createQueryBuilder('e')
                            ->where('e.node IN (:nodes)')
                            ->andWhere('e.categoryName = :cat')
                            ->andWhere('e.entryKey = :key')
                            ->andWhere('e.colLabel = :col')
                            ->setParameter('nodes', $nodeIds)
                            ->setParameter('cat', $cat)
                            ->setParameter('key', $key)
                            ->setParameter('col', $col)
                            ->getQuery()
                            ->getResult();

                        foreach ($entries as $entry) {
                            $nid = $entry->getNode()->getId();
                            $invData[$nid][$colId] = $entry->getValue() ?? '';
                        }
                    }
                }

                // --- Sort node ids by configured sort column (single column, asc/desc).
                //     If no column sort is set, default to hostname ASC (natural-case). ---
                $sortColId = null;
                $sortDir = 'asc';
                foreach ($columns as $colDef) {
                    $s = $colDef['sort'] ?? null;
                    if ($s === 'asc' || $s === 'desc') {
                        $sortColId = $colDef['id'] ?? null;
                        $sortDir = $s;
                        break;
                    }
                }
                if ($sortColId !== null && $sortColId !== '') {
                    usort($nodeIds, function ($a, $b) use ($invData, $sortColId, $sortDir) {
                        $va = (string) ($invData[$a][$sortColId] ?? '');
                        $vb = (string) ($invData[$b][$sortColId] ?? '');
                        $cmp = (is_numeric($va) && is_numeric($vb))
                            ? ((float) $va <=> (float) $vb)
                            : strnatcasecmp($va, $vb);
                        return $sortDir === 'desc' ? -$cmp : $cmp;
                    });
                } else {
                    usort($nodeIds, function ($a, $b) use ($nodeMap) {
                        $na = $nodeMap[$a] ?? null;
                        $nb = $nodeMap[$b] ?? null;
                        $ha = $na ? ($na->getHostname() ?? $na->getName() ?? $na->getIpAddress() ?? '') : '';
                        $hb = $nb ? ($nb->getHostname() ?? $nb->getName() ?? $nb->getIpAddress() ?? '') : '';
                        return strnatcasecmp((string) $ha, (string) $hb);
                    });
                }

                // --- Dynamic column width calculation ---
                $cellPadding = 4; // mm padding per cell (left+right)
                $pdf->SetFont($bodyFont, '', $invFontSize);

                // Measure max content width for each column
                $maxWidths = array_fill(0, $colCount, 0);

                // Measure header widths (bold)
                $pdf->SetFont($bodyFont, 'B', $invFontSize);
                $maxWidths[0] = max($maxWidths[0], $pdf->GetStringWidth($hostnameHeaderLabel) + $cellPadding);
                foreach ($columns as $ci => $colDef) {
                    $label = $colDef['headerLabel'] ?? $colDef['label'] ?? ($colDef['category'] . ' > ' . $colDef['entryKey'] . ' > ' . $colDef['colLabel']);
                    $maxWidths[$ci + 1] = max($maxWidths[$ci + 1], $pdf->GetStringWidth($label) + $cellPadding);
                }

                // Measure data widths (normal)
                $pdf->SetFont($bodyFont, '', $invFontSize);
                foreach ($nodeIds as $nid) {
                    $node = $nodeMap[$nid] ?? null;
                    if (!$node) continue;
                    $hostname = $node->getHostname() ?? $node->getName() ?? $node->getIpAddress();
                    $maxWidths[0] = max($maxWidths[0], $pdf->GetStringWidth($hostname) + $cellPadding);

                    foreach ($columns as $ci => $colDef) {
                        $colId = $colDef['id'] ?? '';
                        $val = $invData[$nid][$colId] ?? '';
                        $maxWidths[$ci + 1] = max($maxWidths[$ci + 1], $pdf->GetStringWidth($val) + $cellPadding);
                    }
                }

                // Build explicit width %s: index 0 = hostname, 1..N = columns
                $explicitWidthPcts = [
                    isset($block['hostnameWidth']) && $block['hostnameWidth'] > 0 ? (float) $block['hostnameWidth'] : null,
                ];
                foreach ($columns as $colDef) {
                    $w = $colDef['width'] ?? null;
                    $explicitWidthPcts[] = ($w !== null && $w > 0) ? (float) $w : null;
                }
                $colWidthsInv = $this->distributeInventoryColumnWidths($maxWidths, $explicitWidthPcts, $tableW);

                $pdf->SetDrawColor($borderColor[0], $borderColor[1], $borderColor[2]);
                $pdf->SetLineWidth(0.2);

                // --- Header row ---
                if ($showHeader) {
                    $pdf->SetFillColor($headerBg[0], $headerBg[1], $headerBg[2]);
                    $pdf->SetTextColor($headerColor[0], $headerColor[1], $headerColor[2]);
                    $pdf->SetFont($bodyFont, 'B', $invFontSize);

                    $maxH = max($minLineH, $pdf->getStringHeight($colWidthsInv[0], $hostnameHeaderLabel) + 2);
                    foreach ($columns as $ci => $colDef) {
                        $label = $colDef['headerLabel'] ?? $colDef['label'] ?? ($colDef['category'] . ' > ' . $colDef['entryKey'] . ' > ' . $colDef['colLabel']);
                        $h = $pdf->getStringHeight($colWidthsInv[$ci + 1], $label) + 2;
                        $maxH = max($maxH, $h);
                    }

                    $startY = $pdf->GetY();
                    $startX = $mLeft;
                    $pdf->MultiCell($colWidthsInv[0], $maxH, $hostnameHeaderLabel, 1, $hostnameAlign, true, 0, $startX, $startY, true, 0, false, true, $maxH, 'M');
                    $startX += $colWidthsInv[0];
                    foreach ($columns as $ci => $colDef) {
                        $label = $colDef['headerLabel'] ?? $colDef['label'] ?? ($colDef['category'] . ' > ' . $colDef['entryKey'] . ' > ' . $colDef['colLabel']);
                        $pdf->MultiCell($colWidthsInv[$ci + 1], $maxH, $label, 1, $colAligns[$ci], true, 0, $startX, $startY, true, 0, false, true, $maxH, 'M');
                        $startX += $colWidthsInv[$ci + 1];
                    }
                    $pdf->SetXY($mLeft, $startY + $maxH);
                }

                // --- Data rows ---
                foreach ($nodeIds as $ri => $nid) {
                    $node = $nodeMap[$nid] ?? null;
                    if (!$node) continue;

                    $defaultFill = false;
                    $defaultFillColor = [255, 255, 255];
                    if ($alternateRows && $ri % 2 === 1) {
                        $defaultFillColor = $alternateBg;
                        $defaultFill = true;
                    } elseif ($alternateRows) {
                        $defaultFill = true;
                    }

                    $hostname = $node->getHostname() ?? $node->getName() ?? $node->getIpAddress();

                    // Build all cell values for this row: index 0 = hostname, 1..N = columns
                    $allValues = [$hostname];
                    foreach ($columns as $ci => $colDef) {
                        $colId = $colDef['id'] ?? '';
                        $allValues[] = $invData[$nid][$colId] ?? '';
                    }

                    // Evaluate style rules per cell (first match wins per cell)
                    $cellStyles = array_fill(0, $colCount, null); // null = no rule matched
                    foreach ($styleRules as $rule) {
                        $ruleColId = $rule['columnId'] ?? '';
                        $ruleOp = $rule['operator'] ?? 'eq';
                        $ruleVal = $rule['value'] ?? '';

                        // Determine which cell indices this rule targets
                        $targetIdx = null;
                        if ($ruleColId === '__hostname__') {
                            $targetIdx = 0;
                        } elseif (isset($colIdMap[$ruleColId])) {
                            $targetIdx = $colIdMap[$ruleColId] + 1; // +1 because 0 is hostname
                        }
                        if ($targetIdx === null) continue;

                        // Skip if this cell already has a matched rule
                        if ($cellStyles[$targetIdx] !== null) continue;

                        $cellVal = $allValues[$targetIdx] ?? '';
                        if ($this->evaluateInventoryOperator((string) $cellVal, (string) $ruleOp, (string) $ruleVal)) {
                            $cellStyles[$targetIdx] = $rule;
                        }
                    }

                    // Calculate row height
                    $pdf->SetFont($bodyFont, '', $invFontSize);
                    $maxH = max($minLineH, $pdf->getStringHeight($colWidthsInv[0], $hostname) + 2);
                    foreach ($columns as $ci => $colDef) {
                        $val = $allValues[$ci + 1];
                        // Account for bold font when calculating height
                        $ruleStyle = $cellStyles[$ci + 1];
                        if ($ruleStyle && !empty($ruleStyle['bold'])) {
                            $pdf->SetFont($bodyFont, 'B', $invFontSize);
                        }
                        $h = $pdf->getStringHeight($colWidthsInv[$ci + 1], $val) + 2;
                        $maxH = max($maxH, $h);
                        $pdf->SetFont($bodyFont, '', $invFontSize);
                    }
                    // Also check hostname bold
                    $hostnameRule = $cellStyles[0];
                    if ($hostnameRule && !empty($hostnameRule['bold'])) {
                        $pdf->SetFont($bodyFont, 'B', $invFontSize);
                        $h = $pdf->getStringHeight($colWidthsInv[0], $hostname) + 2;
                        $maxH = max($maxH, $h);
                        $pdf->SetFont($bodyFont, '', $invFontSize);
                    }

                    $startY = $pdf->GetY();
                    if ($startY + $maxH > $pdf->getPageHeight() - $mBottom) {
                        $pdf->AddPage();
                        $startY = $pdf->GetY();
                    }

                    // Render each cell with style rules applied
                    $startX = $mLeft;
                    for ($cellIdx = 0; $cellIdx < $colCount; $cellIdx++) {
                        $cellVal = $allValues[$cellIdx];
                        $colW = $colWidthsInv[$cellIdx];
                        $hAlign = $cellIdx === 0 ? $hostnameAlign : $colAligns[$cellIdx - 1];
                        $vAlign = $cellIdx === 0 ? $hostnameVAlign : $colVAligns[$cellIdx - 1];

                        $ruleStyle = $cellStyles[$cellIdx];

                        // Determine fill color for this cell
                        $cellFill = $defaultFill;
                        $cellFillColor = $defaultFillColor;
                        if ($ruleStyle && !empty($ruleStyle['bgColor'])) {
                            $cellFillColor = $this->hexToRgb($ruleStyle['bgColor']);
                            $cellFill = true;
                        }
                        $pdf->SetFillColor($cellFillColor[0], $cellFillColor[1], $cellFillColor[2]);

                        // Determine text color
                        if ($ruleStyle && !empty($ruleStyle['textColor'])) {
                            $tc = $this->hexToRgb($ruleStyle['textColor']);
                            $pdf->SetTextColor($tc[0], $tc[1], $tc[2]);
                        } else {
                            $pdf->SetTextColor($bodyRgb[0], $bodyRgb[1], $bodyRgb[2]);
                        }

                        // Determine font style
                        $fontStyle = '';
                        $isBold = $ruleStyle && !empty($ruleStyle['bold']);
                        $isItalic = $ruleStyle && !empty($ruleStyle['italic']);
                        if ($isBold) $fontStyle .= 'B';
                        if ($isItalic) $fontStyle .= 'I';
                        $pdf->SetFont($bodyFont, $fontStyle, $invFontSize);

                        $hasHighlight = $ruleStyle && !empty($ruleStyle['highlightColor']);

                        if ($hasHighlight) {
                            // Use writeHTMLCell to render highlighted text
                            $hlColor = $ruleStyle['highlightColor'];
                            $escapedVal = htmlspecialchars($cellVal, ENT_QUOTES, 'UTF-8');
                            $htmlStyle = "background-color:{$hlColor};";
                            if ($ruleStyle && !empty($ruleStyle['textColor'])) {
                                $htmlStyle .= "color:{$ruleStyle['textColor']};";
                            }
                            if ($isBold) $escapedVal = '<b>' . $escapedVal . '</b>';
                            if ($isItalic) $escapedVal = '<i>' . $escapedVal . '</i>';
                            $htmlContent = '<span style="' . $htmlStyle . '">' . $escapedVal . '</span>';

                            // Manual vertical alignment offset for writeHTMLCell
                            $contentH = $pdf->getStringHeight($colW, $cellVal);
                            $yOff = 0;
                            if ($vAlign === 'M') {
                                $yOff = max(0, ($maxH - $contentH) / 2);
                            } elseif ($vAlign === 'B') {
                                $yOff = max(0, $maxH - $contentH);
                            }

                            // Draw cell background + border first
                            $pdf->Rect($startX, $startY, $colW, $maxH, $cellFill ? 'DF' : 'D');
                            $pdf->writeHTMLCell($colW, 0, $startX, $startY + $yOff, $htmlContent, 0, 0, false, true, $hAlign, true);
                        } else {
                            $pdf->MultiCell($colW, $maxH, $cellVal, 1, $hAlign, $cellFill, 0, $startX, $startY, true, 0, false, true, $maxH, $vAlign);
                        }
                        $startX += $colW;
                    }
                    $pdf->SetXY($mLeft, $startY + $maxH);
                    // Reset font
                    $pdf->SetFont($bodyFont, '', $invFontSize);
                    $pdf->SetTextColor($bodyRgb[0], $bodyRgb[1], $bodyRgb[2]);
                }

                if ($pSpaceAfter > 0) {
                    $pdf->Ln($pSpaceAfter);
                }

                $prevType = 'table';

            } elseif ($type === 'cli_command') {
                $dataSource = $block['dataSource'] ?? 'none';
                $commandName = $block['commandName'] ?? '';
                $cliNodeIds = $forNode ? [$forNode->getId()] : ($block['nodeIds'] ?? []);
                $cliTagIds = $forNode ? [] : ($block['tagIds'] ?? []);
                $cliManufacturerIds = $forNode ? [] : array_values(array_filter(array_map('intval', (array) ($block['manufacturerIds'] ?? [])), fn($x) => $x > 0));
                $cliModelIds = $forNode ? [] : array_values(array_filter(array_map('intval', (array) ($block['modelIds'] ?? [])), fn($x) => $x > 0));
                $conditionalRules = $block['conditionalRules'] ?? [];
                $lineFilter = $block['lineFilter'] ?? '';
                $showEllipsis = !empty($block['showEllipsis']);
                $cliFontSize = !empty($block['fontSize']) ? (int) $block['fontSize'] : null;
                $cliRules = $block['styleRules'] ?? [];

                // CLI theme style (shared for all device blocks)
                $cliStyle = $styles['cliCommand'] ?? ReportTheme::DEFAULT_STYLES['cliCommand'];
                $cliFont = $this->mapFont($cliStyle['font'] ?? 'Consolas');
                $cliHeaderFontSz = (float) ($cliStyle['size'] ?? 9); // header always uses theme size
                $cliFontSz = $cliFontSize ?? $cliHeaderFontSz;       // content uses block override or theme
                $cliBg = $this->hexToRgb($cliStyle['bgColor'] ?? '#f1f5f9');
                $cliText = $this->hexToRgb($cliStyle['textColor'] ?? '#1e293b');
                $cliBorder = $this->hexToRgb($cliStyle['borderColor'] ?? '#e2e8f0');
                $cliLineNumColor = $this->hexToRgb($cliStyle['lineNumberColor'] ?? '#94a3b8');
                $cliBorderRadius = (float) ($cliStyle['borderRadius'] ?? 2);
                $cliShowLineNum = $cliStyle['showLineNumbers'] ?? true;

                // Slugify helper (same as CollectNodeMessageHandler)
                $slugify = fn(string $text): string => strtolower(trim(preg_replace('/[^a-z0-9]+/i', '-', $text), '-'));
                $commandSlug = $slugify($commandName);

                // Build list of {label, output} pairs depending on data source
                $cliEntries = []; // array of ['label' => string|null, 'output' => string]

                if ($dataSource === 'none') {
                    // Static mode: single entry from the block's command field
                    $command = $block['command'] ?? '';
                    if (!empty(trim($command))) {
                        $cliEntries[] = ['label' => null, 'output' => $command];
                    }
                } else {
                    // local or remote: resolve all target nodes from nodeIds + tagIds
                    $resolvedNodeIds = $cliNodeIds;

                    // Resolve nodes from tags (STATIC tags only — manual node_node_tag
                    // assignments. Dynamic tags applied by collection rules, stored in
                    // NodeDynamicTag, are intentionally excluded here.)
                    if (!empty($cliTagIds)) {
                        $staticTagNodeIds = $this->em->getRepository(Node::class)->createQueryBuilder('n')
                            ->select('n.id')
                            ->innerJoin('n.tags', 't')
                            ->where('t.id IN (:tagIds)')
                            ->andWhere('n.context = :ctx')
                            ->setParameter('tagIds', $cliTagIds)
                            ->setParameter('ctx', $report->getContext())
                            ->getQuery()
                            ->getResult();
                        foreach ($staticTagNodeIds as $row) {
                            $nid = (int) $row['id'];
                            if (!in_array($nid, $resolvedNodeIds, true)) {
                                $resolvedNodeIds[] = $nid;
                            }
                        }
                    }

                    // Resolve nodes by manufacturer
                    if (!empty($cliManufacturerIds)) {
                        $manNodeIds = $this->em->getRepository(Node::class)->createQueryBuilder('n')
                            ->select('n.id')
                            ->where('n.manufacturer IN (:manIds)')
                            ->andWhere('n.context = :ctx')
                            ->setParameter('manIds', $cliManufacturerIds)
                            ->setParameter('ctx', $report->getContext())
                            ->getQuery()
                            ->getResult();
                        foreach ($manNodeIds as $row) {
                            $nid = (int) $row['id'];
                            if (!in_array($nid, $resolvedNodeIds, true)) {
                                $resolvedNodeIds[] = $nid;
                            }
                        }
                    }

                    // Resolve nodes by model
                    if (!empty($cliModelIds)) {
                        $modelNodeIds = $this->em->getRepository(Node::class)->createQueryBuilder('n')
                            ->select('n.id')
                            ->where('n.model IN (:modelIds)')
                            ->andWhere('n.context = :ctx')
                            ->setParameter('modelIds', $cliModelIds)
                            ->setParameter('ctx', $report->getContext())
                            ->getQuery()
                            ->getResult();
                        foreach ($modelNodeIds as $row) {
                            $nid = (int) $row['id'];
                            if (!in_array($nid, $resolvedNodeIds, true)) {
                                $resolvedNodeIds[] = $nid;
                            }
                        }
                    }

                    foreach ($resolvedNodeIds as $nodeId) {
                        $node = $this->em->getRepository(Node::class)->find($nodeId);
                        if (!$node) continue;
                        $nodeName = $node->getHostname() ?: $node->getName() ?: $node->getIpAddress();

                        if ($dataSource === 'local') {
                            // Find latest completed collection with "latest" tag for this node
                            $collections = $this->em->getRepository(Collection::class)->findBy(
                                ['node' => $node, 'status' => 'completed'],
                                ['createdAt' => 'DESC'],
                                10
                            );
                            $latestColl = null;
                            foreach ($collections as $c) {
                                if (in_array('latest', $c->getTags() ?? [], true)) {
                                    $latestColl = $c;
                                    break;
                                }
                            }
                            if (!$latestColl) continue;

                            $storageDir = dirname(__DIR__, 2) . '/var/' . $latestColl->getStoragePath();
                            if (!is_dir($storageDir)) continue;

                            // Search for the matching command file by commandName slug
                            $foundOutput = null;
                            $dirs = @scandir($storageDir);
                            if ($dirs === false) continue;
                            foreach ($dirs as $dir) {
                                if ($dir === '.' || $dir === '..') continue;
                                $rulePath = $storageDir . '/' . $dir;
                                if (!is_dir($rulePath)) continue;

                                // Check for file matching commandSlug
                                $targetFile = $rulePath . '/' . $commandSlug . '.txt';
                                if (is_file($targetFile)) {
                                    $foundOutput = file_get_contents($targetFile);
                                    break;
                                }
                            }

                            if ($foundOutput !== null && trim($foundOutput) !== '') {
                                $cliEntries[] = ['label' => $nodeName, 'output' => $foundOutput];
                            }
                        } elseif ($dataSource === 'remote') {
                            // Remote mode: placeholder (to be implemented with SSH execution)
                            $cliEntries[] = [
                                'label' => $nodeName,
                                'output' => "# Command: {$commandName}\n# Device: {$nodeName}\n# Remote execution pending...",
                            ];
                        }
                    }
                }

                if (empty($cliEntries)) continue;

                // Apply conditional rules: filter entries based on regex conditions
                if (!empty($conditionalRules)) {
                    $cliEntries = array_values(array_filter($cliEntries, function (array $entry) use ($conditionalRules) {
                        $output = $entry['output'];
                        foreach ($conditionalRules as $cRule) {
                            $pattern = $cRule['pattern'] ?? '';
                            $operator = $cRule['operator'] ?? 'contains';
                            $action = $cRule['action'] ?? 'show';
                            if (empty($pattern)) continue;

                            $matched = false;
                            switch ($operator) {
                                case 'matches':
                                    $matched = (bool) @preg_match('/' . $pattern . '/m', $output);
                                    break;
                                case 'not_matches':
                                    $matched = !@preg_match('/' . $pattern . '/m', $output);
                                    break;
                                case 'contains':
                                    $matched = str_contains(mb_strtolower($output), mb_strtolower($pattern));
                                    break;
                                case 'not_contains':
                                    $matched = !str_contains(mb_strtolower($output), mb_strtolower($pattern));
                                    break;
                            }

                            if ($matched) {
                                return $action === 'show';
                            }
                        }
                        // No rule matched: show by default
                        return true;
                    }));
                }

                if (empty($cliEntries)) continue;

                // Parse line filter
                $visibleLines = null;
                if (!empty($lineFilter)) {
                    $visibleLines = [];
                    foreach (explode(',', $lineFilter) as $part) {
                        $part = trim($part);
                        if (str_contains($part, '-')) {
                            [$start, $end] = array_map('intval', explode('-', $part, 2));
                            for ($ln = $start; $ln <= $end; $ln++) {
                                $visibleLines[$ln] = true;
                            }
                        } else {
                            $n = (int) $part;
                            if ($n > 0) $visibleLines[$n] = true;
                        }
                    }
                }

                // Theme settings: padding, lineSpacing, header
                $cliPadding = (float) ($cliStyle['padding'] ?? 3);
                $cliLineSpacing = (float) ($cliStyle['lineSpacing'] ?? 1.4);
                $cliShowHeader = $cliStyle['showHeader'] ?? true;
                $cliHeaderBg = $this->hexToRgb($cliStyle['headerBgColor'] ?? '#1e293b');
                $cliHeaderText = $this->hexToRgb($cliStyle['headerTextColor'] ?? '#ffffff');

                $contentW = $pdf->getPageWidth() - $mLeft - $mRight;
                $baseLineH = $cliFontSz * 0.3528; // font height in mm (content)
                $headerBaseLineH = $cliHeaderFontSz * 0.3528; // font height in mm (header)
                $lineH = $baseLineH * $cliLineSpacing;
                $headerH = $cliShowHeader ? ($headerBaseLineH + $cliPadding * 2) : 0;

                // Render one CLI block per entry (one per device, or one for static)
                foreach ($cliEntries as $entryIdx => $entry) {
                    $command = $entry['output'];
                    $entryLabel = $entry['label']; // device name or null

                    // Page / spacing
                    if ($firstBlock) {
                        $pdf->SetMargins($mLeft, $mTop, $mRight);
                        $pdf->SetAutoPageBreak(true, $mBottom);
                        $pdf->AddPage();
                        $firstBlock = false;
                    } else {
                        $pdf->Ln($entryIdx > 0 ? 4 : ($pSpaceBefore > 0 ? $pSpaceBefore : 4));
                    }

                    // Build visible output lines
                    $allLines = explode("\n", $command);
                    $outputLines = [];
                    $prevVisible = true;
                    foreach ($allLines as $li => $line) {
                        $lineNum = $li + 1;
                        $isVisible = $visibleLines === null || isset($visibleLines[$lineNum]);
                        if ($isVisible) {
                            $outputLines[] = ['type' => 'line', 'num' => $lineNum, 'text' => $line];
                            $prevVisible = true;
                        } elseif ($prevVisible && $showEllipsis) {
                            $outputLines[] = ['type' => 'ellipsis'];
                            $prevVisible = false;
                        }
                    }

                    if (empty($outputLines)) continue;

                    // Dynamic line number width based on max line number
                    $maxLineNum = 0;
                    foreach ($outputLines as $ol) {
                        if ($ol['type'] === 'line' && $ol['num'] > $maxLineNum) $maxLineNum = $ol['num'];
                    }
                    $lineNumDigits = $maxLineNum > 0 ? strlen((string) $maxLineNum) : 1;
                    $lineNumW = $cliShowLineNum ? ($lineNumDigits * $cliFontSz * 0.2) + 4 : 0;

                    // Paginate the output: each page segment draws its own self-contained
                    // box (background, border, repeated header) and only as many lines as
                    // fit on the page, so long command output flows cleanly across pages
                    // instead of overflowing past the bottom margin.
                    $textX = $mLeft + $cliPadding + $lineNumW;
                    $textW = $contentW - ($cliPadding * 2) - $lineNumW;
                    $pageBottom = $pdf->getPageHeight() - $mBottom;

                    $lineCount = count($outputLines);
                    $lineIdx = 0;
                    $isFirstSegment = true;

                    while ($lineIdx < $lineCount) {
                        if ($isFirstSegment) {
                            $startY = $pdf->GetY();
                        } else {
                            $pdf->AddPage();
                            $startY = $pdf->GetY();
                        }

                        // If not even the header plus one line fits here, start a new page.
                        $minSegH = $headerH + ($cliPadding * 2) + $lineH;
                        if ($startY + $minSegH > $pageBottom) {
                            $pdf->AddPage();
                            $startY = $pdf->GetY();
                        }

                        // How many lines fit in the remaining space on this page.
                        $availForLines = $pageBottom - $startY - $headerH - ($cliPadding * 2);
                        $maxLinesThisPage = (int) floor($availForLines / $lineH);
                        if ($maxLinesThisPage < 1) $maxLinesThisPage = 1;
                        $linesThisPage = min($maxLinesThisPage, $lineCount - $lineIdx);

                        $segBodyH = ($cliPadding * 2) + ($linesThisPage * $lineH);
                        $segBoxH = $headerH + $segBodyH;

                        // Draw the outer box for this segment: body background + border
                        $pdf->SetDrawColor($cliBorder[0], $cliBorder[1], $cliBorder[2]);
                        $pdf->SetLineWidth(0.3);
                        $pdf->SetFillColor($cliBg[0], $cliBg[1], $cliBg[2]);
                        if ($cliBorderRadius > 0) {
                            $pdf->RoundedRect($mLeft, $startY, $contentW, $segBoxH, $cliBorderRadius, '1111', 'DF');
                        } else {
                            $pdf->Rect($mLeft, $startY, $contentW, $segBoxH, 'DF');
                        }

                        // --- Header bar overlay (repeated on every page segment) ---
                        if ($cliShowHeader) {
                            // Fill header area on top (no border, top corners rounded)
                            $pdf->SetFillColor($cliHeaderBg[0], $cliHeaderBg[1], $cliHeaderBg[2]);
                            if ($cliBorderRadius > 0) {
                                $pdf->RoundedRect($mLeft + 0.15, $startY + 0.15, $contentW - 0.3, $headerH - 0.15, $cliBorderRadius, '1001', 'F');
                            } else {
                                $pdf->Rect($mLeft + 0.15, $startY + 0.15, $contentW - 0.3, $headerH - 0.15, 'F');
                            }

                            // Header text: command name on left, device name on right
                            $pdf->SetFont($cliFont, 'B', $cliHeaderFontSz);
                            $pdf->SetTextColor($cliHeaderText[0], $cliHeaderText[1], $cliHeaderText[2]);
                            $headerTextY = $startY + ($headerH - $headerBaseLineH) / 2;
                            $headerTextW = $contentW - ($cliPadding * 2);

                            // Command name (left)
                            $cmdTitle = !empty($commandName) ? $commandName : '';
                            if (!empty($cmdTitle)) {
                                $pdf->MultiCell($headerTextW * 0.7, $headerBaseLineH, $cmdTitle, 0, 'L', false, 0, $mLeft + $cliPadding, $headerTextY, true, 0, false, true, 0, 'M');
                            }

                            // Device name (right)
                            if ($entryLabel) {
                                $pdf->SetFont($cliFont, '', $cliHeaderFontSz - 1);
                                $pdf->MultiCell($headerTextW * 0.3, $headerBaseLineH, $entryLabel, 0, 'R', false, 0, $mLeft + $cliPadding + $headerTextW * 0.7, $headerTextY, true, 0, false, true, 0, 'M');
                            }
                        }

                        // Render the lines belonging to this segment
                        $curY = $startY + $headerH + $cliPadding;

                        // Clip content to the box area with padding so text doesn't touch the border
                        $pdf->StartTransform();
                        $pdf->Rect($mLeft + $cliPadding, $startY, $contentW - ($cliPadding * 2), $segBoxH, 'CNZ');

                        for ($k = 0; $k < $linesThisPage; $k++) {
                            $ol = $outputLines[$lineIdx + $k];
                            if ($ol['type'] === 'ellipsis') {
                                $pdf->SetFont($cliFont, 'I', $cliFontSz);
                                $pdf->SetTextColor($cliLineNumColor[0], $cliLineNumColor[1], $cliLineNumColor[2]);
                                $pdf->SetXY($textX, $curY);
                                $pdf->Cell($textW, $lineH, '[...]', 0, 0, 'L');
                                $curY += $lineH;
                                continue;
                            }

                            $lineText = $ol['text'];
                            $lineNum = $ol['num'];

                            // Evaluate style rules for this line (first match wins)
                            $matchedRule = null;
                            $matchedSegments = null;
                            foreach ($cliRules as $rule) {
                                $ruleOp = $rule['operator'] ?? 'matches';
                                $pattern = $rule['pattern'] ?? '';
                                if (empty($pattern)) continue;

                                $match = false;
                                $segments = null;
                                switch ($ruleOp) {
                                    case 'matches':
                                        if (@preg_match('/' . $pattern . '/', $lineText, $m, PREG_OFFSET_CAPTURE)) {
                                            $match = true;
                                            $segments = $m;
                                        }
                                        break;
                                    case 'not_matches':
                                        $match = !@preg_match('/' . $pattern . '/', $lineText);
                                        break;
                                    case 'contains':
                                        $match = str_contains(mb_strtolower($lineText), mb_strtolower($pattern));
                                        break;
                                    case 'not_contains':
                                        $match = !str_contains(mb_strtolower($lineText), mb_strtolower($pattern));
                                        break;
                                    case 'eq':
                                        $match = trim($lineText) === $pattern;
                                        break;
                                    case 'neq':
                                        $match = trim($lineText) !== $pattern;
                                        break;
                                }

                                if ($match) {
                                    $matchedRule = $rule;
                                    if ($ruleOp === 'matches' && $segments) {
                                        $matchedSegments = $segments;
                                    }
                                    break;
                                }
                            }

                            // Draw line number
                            if ($cliShowLineNum) {
                                $pdf->SetFont($cliFont, '', $cliFontSz);
                                $pdf->SetTextColor($cliLineNumColor[0], $cliLineNumColor[1], $cliLineNumColor[2]);
                                $pdf->SetXY($mLeft + $cliPadding, $curY);
                                $pdf->Cell($lineNumW - 2, $lineH, (string) $lineNum, 0, 0, 'R');
                            }

                            // Determine line style from rule
                            $fontStyle = '';
                            $lineTextColor = $cliText;
                            $lineBgColor = null;
                            $highlightColor = null;
                            $highlightMode = 'match';

                            if ($matchedRule) {
                                if (!empty($matchedRule['bold'])) $fontStyle .= 'B';
                                if (!empty($matchedRule['italic'])) $fontStyle .= 'I';
                                if (!empty($matchedRule['textColor'])) $lineTextColor = $this->hexToRgb($matchedRule['textColor']);
                                if (!empty($matchedRule['bgColor'])) $lineBgColor = $this->hexToRgb($matchedRule['bgColor']);
                                if (!empty($matchedRule['highlightColor'])) $highlightColor = $matchedRule['highlightColor'];
                                $highlightMode = $matchedRule['highlightMode'] ?? 'match';
                            }

                            // Draw line background if rule has bgColor
                            if ($lineBgColor) {
                                $pdf->SetFillColor($lineBgColor[0], $lineBgColor[1], $lineBgColor[2]);
                                $pdf->Rect($textX, $curY, $textW, $lineH, 'F');
                            }

                            // Handle highlight
                            if ($highlightColor && $highlightMode === 'line') {
                                $hlRgb = $this->hexToRgb($highlightColor);
                                $pdf->SetFillColor($hlRgb[0], $hlRgb[1], $hlRgb[2]);
                                $lineStrW = $pdf->GetStringWidth($lineText) + 2;
                                $pdf->Rect($textX, $curY, min($lineStrW, $textW), $lineH, 'F');
                            }

                            if ($highlightColor && $highlightMode === 'match' && $matchedSegments && !empty($matchedSegments[0])) {
                                $matchText = $matchedSegments[0][0];
                                $matchOffset = $matchedSegments[0][1];
                                $beforeMatch = substr($lineText, 0, $matchOffset);

                                $pdf->SetFont($cliFont, $fontStyle, $cliFontSz);
                                $beforeW = $pdf->GetStringWidth($beforeMatch);
                                $matchW = $pdf->GetStringWidth($matchText);

                                $hlRgb = $this->hexToRgb($highlightColor);
                                $pdf->SetFillColor($hlRgb[0], $hlRgb[1], $hlRgb[2]);
                                $pdf->Rect($textX + $beforeW, $curY, $matchW + 1, $lineH, 'F');
                            }

                            // Draw text
                            $pdf->SetFont($cliFont, $fontStyle, $cliFontSz);
                            $pdf->SetTextColor($lineTextColor[0], $lineTextColor[1], $lineTextColor[2]);
                            $pdf->SetXY($textX, $curY);
                            $pdf->Cell($textW, $lineH, $lineText, 0, 0, 'L');

                            $curY += $lineH;
                        }

                        $pdf->StopTransform();

                        // Reset fill color
                        $pdf->SetFillColor($cliBg[0], $cliBg[1], $cliBg[2]);
                        $pdf->SetXY($mLeft, $startY + $segBoxH);

                        $lineIdx += $linesThisPage;
                        $isFirstSegment = false;
                    }

                    $pdf->SetFont($bodyFont, '', $bodySize);
                    $pdf->SetTextColor($bodyRgb[0], $bodyRgb[1], $bodyRgb[2]);
                }

                if ($pSpaceAfter > 0) {
                    $pdf->Ln($pSpaceAfter);
                }

                $prevType = 'cli_command';

            } elseif ($type === 'equipment_list') {
                $eqTitle = $block['title'] ?? '';
                $eqTitleStyle = $block['titleStyle'] ?? [];
                $eqCategories = $block['categories'] ?? [];
                $eqNodeDisplayField = $block['nodeDisplayField'] ?? 'name';
                $eqNodeColor = $block['nodeColor'] ?? '#7c3aed';
                $eqShowCount = $block['showCount'] ?? true;

                if (!empty($block['pageBreakBefore']) && !$firstBlock) {
                    $pdf->AddPage();
                }

                if ($firstBlock) {
                    $pdf->SetMargins($mLeft, $mTop, $mRight);
                    $pdf->SetAutoPageBreak(true, $mBottom);
                    $pdf->AddPage();
                    $firstBlock = false;
                } else {
                    $pdf->Ln($pSpaceBefore > 0 ? $pSpaceBefore : 4);
                }

                // Render title with indent (resolve variables)
                $eqTitle = $this->resolveNodeVariables($eqTitle, $forNode, $report);
                if ($eqTitle) {
                    $titleSize = $eqTitleStyle['size'] ?? 13;
                    $titleBold = ($eqTitleStyle['bold'] ?? true) ? 'B' : '';
                    $titleItalic = ($eqTitleStyle['italic'] ?? false) ? 'I' : '';
                    $titleColor = $this->hexToRgb($eqTitleStyle['color'] ?? '#1e293b');
                    $pdf->SetFont($bodyFont, $titleBold . $titleItalic, $titleSize);
                    $pdf->SetTextColor($titleColor[0], $titleColor[1], $titleColor[2]);
                    $titleIndentVal = $block['indent'] ?? 10;
                    $pdf->SetX($mLeft + $titleIndentVal);
                    $titleWidth = $pdf->getPageWidth() - $mLeft - $titleIndentVal - $mRight;
                    $pdf->MultiCell($titleWidth, $titleSize * 0.5, $eqTitle . ':', 0, 'L');
                    $pdf->Ln(2);
                }

                // Render each category
                $nodeColorRgb = $this->hexToRgb($eqNodeColor);
                $defaultCatStyle = $block['categoryStyle'] ?? [];
                $titleIndent = $block['indent'] ?? 10;
                $catIndent = $block['categoryIndent'] ?? 20;

                foreach ($eqCategories as $cat) {
                    $catName = $cat['name'] ?? '';
                    $catNodeIds = $cat['nodeIds'] ?? [];

                    // Resolve node names
                    $nodeNames = [];
                    if (!empty($catNodeIds)) {
                        $catNodes = $this->em->getRepository(\App\Entity\Node::class)->findBy(['id' => $catNodeIds]);
                        foreach ($catNodes as $cn) {
                            $nodeNames[] = match ($eqNodeDisplayField) {
                                'hostname' => $cn->getHostname() ?: $cn->getName() ?: $cn->getIpAddress(),
                                'ipAddress' => $cn->getIpAddress(),
                                default => $cn->getName() ?: $cn->getHostname() ?: $cn->getIpAddress(),
                            };
                        }
                    }

                    // Category label
                    $catLabel = $catName;
                    if ($eqShowCount) {
                        $catLabel .= ' (' . count($nodeNames) . ')';
                    }
                    $catLabel .= ':';

                    // Resolve category style (per-cat override > default)
                    $catStyle = $cat['style'] ?? [];
                    $catSize = $catStyle['size'] ?? $defaultCatStyle['size'] ?? $bodySize;
                    $catBold = ($catStyle['bold'] ?? $defaultCatStyle['bold'] ?? false) ? 'B' : '';
                    $catItalic = ($catStyle['italic'] ?? $defaultCatStyle['italic'] ?? false) ? 'I' : '';
                    $catColorHex = $catStyle['color'] ?? $defaultCatStyle['color'] ?? ($bodyStyle['color'] ?? '#1e293b');
                    $catColorRgb = $this->hexToRgb($catColorHex);

                    $pdf->SetFont($bodyFont, $catBold . $catItalic, $catSize);
                    $pdf->SetTextColor($catColorRgb[0], $catColorRgb[1], $catColorRgb[2]);
                    $pdf->SetX($mLeft + $catIndent);

                    // Render category name + nodes inline
                    $catLabelWidth = min($pdf->GetStringWidth($catLabel) + 4, 60);
                    $lineH = max($catSize, $bodySize) * 0.5;

                    $pdf->Cell($catLabelWidth, $lineH, $catLabel, 0, 0, 'L');

                    // Node names in color
                    $pdf->SetFont($bodyFont, 'B', $bodySize);
                    $pdf->SetTextColor($nodeColorRgb[0], $nodeColorRgb[1], $nodeColorRgb[2]);

                    $nodeText = implode(', ', $nodeNames);
                    $remainingWidth = $pdf->getPageWidth() - $pdf->GetX() - $mRight;
                    if ($remainingWidth < 20) {
                        $pdf->Ln($lineH);
                        $pdf->SetX($mLeft + $catIndent + $catLabelWidth);
                        $remainingWidth = $pdf->getPageWidth() - $pdf->GetX() - $mRight;
                    }

                    if (empty($nodeNames)) {
                        $pdf->Ln($lineH);
                    } elseif ($pdf->GetStringWidth($nodeText) <= $remainingWidth) {
                        $pdf->Cell($remainingWidth, $lineH, $nodeText, 0, 1, 'L');
                    } else {
                        $pdf->MultiCell($remainingWidth, $lineH, $nodeText, 0, 'L');
                    }

                    $pdf->Ln(1);
                }

                // Reset text color
                $pdf->SetTextColor($bodyRgb[0], $bodyRgb[1], $bodyRgb[2]);

                if ($pSpaceAfter > 0) {
                    $pdf->Ln($pSpaceAfter);
                }

                $prevType = 'equipment_list';

            } elseif ($type === 'action_list') {
                $alTitle = $this->resolveNodeVariables($block['title'] ?? '', $forNode, $report);
                $alActions = $block['actions'] ?? [];
                $reportLocale = $report ? $report->getLocale() : 'en';
                $pt = self::PDF_TRANSLATIONS[$reportLocale] ?? self::PDF_TRANSLATIONS['en'];
                $priorityStyles = [
                    'critical' => ['label' => $pt['priority_critical'] ?? 'Critical', 'rgb' => [220, 38, 38]],
                    'high' => ['label' => $pt['priority_high'] ?? 'High priority', 'rgb' => [234, 88, 12]],
                    'medium' => ['label' => $pt['priority_medium'] ?? 'Medium priority', 'rgb' => [37, 99, 235]],
                    'low' => ['label' => $pt['priority_low'] ?? 'Needs attention', 'rgb' => [22, 163, 74]],
                ];

                if ($firstBlock) {
                    $pdf->SetMargins($mLeft, $mTop, $mRight);
                    $pdf->SetAutoPageBreak(true, $mBottom);
                    $pdf->AddPage();
                    $firstBlock = false;
                }

                // Title
                $alFont = $this->mapFont(($headingsByLevel[1] ?? [])['font'] ?? 'Calibri');
                if ($alTitle) {
                    $pdf->SetFont($alFont, 'B', $bodySize + 1);
                    $pdf->SetTextColor($bodyRgb[0], $bodyRgb[1], $bodyRgb[2]);
                    $pdf->MultiCell(0, ($bodySize + 1) * 0.3528 + 1, $alTitle, 0, 'L');
                    $pdf->Ln(2);
                }

                // Render actions — use MultiCell like heading/paragraph blocks
                $lineH = $bodySize * 0.3528 + 1;
                foreach ($alActions as $ai => $action) {
                    $details = $this->resolveNodeVariables($action['details'] ?? '', $forNode, $report);
                    $prio = $action['priority'] ?? 'medium';
                    $prioStyle = $priorityStyles[$prio] ?? $priorityStyles['medium'];

                    // Priority tag in bold + color
                    $pdf->SetFont($alFont, 'B', $bodySize);
                    $pdf->SetTextColor($prioStyle['rgb'][0], $prioStyle['rgb'][1], $prioStyle['rgb'][2]);
                    $tagText = ($ai + 1) . '. [' . $prioStyle['label'] . '] ';
                    $tagW = $pdf->GetStringWidth($tagText);
                    $pdf->Cell($tagW, $lineH, $tagText, 0, 0, 'L');

                    // Details text in normal color
                    $pdf->SetFont($alFont, '', $bodySize);
                    $pdf->SetTextColor($bodyRgb[0], $bodyRgb[1], $bodyRgb[2]);
                    $remaining = $pdf->getPageWidth() - $pdf->GetX() - $mRight;
                    $pdf->MultiCell($remaining, $lineH, $details ?: ' ', 0, 'L');
                }

                $prevType = 'action_list';

            } elseif ($type === 'command_list') {
                $modelId = $block['modelId'] ?? null;

                if ($firstBlock) {
                    $pdf->SetMargins($mLeft, $mTop, $mRight);
                    $pdf->SetAutoPageBreak(true, $mBottom);
                    $pdf->AddPage();
                    $firstBlock = false;
                } else {
                    $pdf->Ln($pSpaceBefore > 0 ? $pSpaceBefore : 4);
                }

                if ($modelId) {
                    $model = $this->em->getRepository(\App\Entity\DeviceModel::class)->find($modelId);
                    if ($model) {
                        $cliFont = 'courier';
                        $blockStyle = $block['style'] ?? [];
                        $cliSize = (float) ($blockStyle['fontSize'] ?? 9);
                        $titleSize = 9;
                        $lineH = $cliSize * 0.45;
                        $titleLineH = $titleSize * 0.45;
                        $colW = ($pdf->getPageWidth() - $mLeft - $mRight) / 2;
                        $indent = 10;

                        // Collect all command lines: connection script + grouped commands
                        $allLines = [];

                        // Connection script
                        $connScript = $model->getConnectionScript();
                        if ($connScript) {
                            foreach (array_filter(array_map('trim', explode("\n", $connScript)), fn($l) => $l !== '') as $line) {
                                $allLines[] = ['type' => 'cmd', 'text' => $line];
                            }
                        }

                        // Resolve commands (same logic as CollectNodeMessageHandler)
                        $cmdFolderRepo = $this->em->getRepository(\App\Entity\CollectionFolder::class);
                        $cmdRepo = $this->em->getRepository(\App\Entity\CollectionCommand::class);

                        $manFolder = $cmdFolderRepo->findOneBy(['manufacturer' => $model->getManufacturer(), 'model' => null, 'type' => \App\Entity\CollectionFolder::TYPE_MANUFACTURER]);
                        $modelFolder = $cmdFolderRepo->findOneBy(['model' => $model, 'type' => \App\Entity\CollectionFolder::TYPE_MODEL]);

                        $seenIds = [];
                        $folders = [];

                        $collectCmdsRecursive = function (\App\Entity\CollectionFolder $folder, array &$cmds, array &$seen, bool $skipModelFolders = false) use ($cmdRepo, $cmdFolderRepo, &$collectCmdsRecursive): void {
                            foreach ($cmdRepo->findBy(['folder' => $folder, 'enabled' => true], ['name' => 'ASC']) as $c) {
                                if (!in_array($c->getId(), $seen, true)) { $seen[] = $c->getId(); $cmds[] = $c; }
                            }
                            foreach ($cmdFolderRepo->findBy(['parent' => $folder], ['name' => 'ASC']) as $child) {
                                if ($skipModelFolders && $child->getType() === \App\Entity\CollectionFolder::TYPE_MODEL) continue;
                                $collectCmdsRecursive($child, $cmds, $seen, $skipModelFolders);
                            }
                        };

                        if ($manFolder) {
                            $folderCmds = [];
                            $collectCmdsRecursive($manFolder, $folderCmds, $seenIds, true);
                            if (!empty($folderCmds)) $folders[] = ['name' => $manFolder->getName(), 'commands' => $folderCmds];
                        }
                        if ($modelFolder) {
                            $folderCmds = [];
                            $collectCmdsRecursive($modelFolder, $folderCmds, $seenIds);
                            if (!empty($folderCmds)) $folders[] = ['name' => $modelFolder->getName(), 'commands' => $folderCmds];
                        }
                        // Manual commands
                        $manualCmds = [];
                        foreach ($model->getManualCommands() as $c) {
                            if ($c->isEnabled() && !in_array($c->getId(), $seenIds, true)) { $manualCmds[] = $c; }
                        }
                        if (!empty($manualCmds)) {
                            $folders[] = ['name' => 'Manual', 'commands' => $manualCmds];
                        }

                        // Build lines: each command has a title (command name) then its CLI lines
                        foreach ($folders as $folder) {
                            foreach ($folder['commands'] as $cmd) {
                                $allLines[] = ['type' => 'title', 'text' => '# ' . mb_strtoupper($cmd->getName())];
                                foreach (array_filter(array_map('trim', explode("\n", $cmd->getCommands())), fn($l) => $l !== '') as $line) {
                                    $allLines[] = ['type' => 'cmd', 'text' => $line];
                                }
                            }
                        }

                        // Group lines into blocks (connection script = one block, each command = one block)
                        $cmdBlocks = [];
                        $currentCmdBlock = [];
                        foreach ($allLines as $line) {
                            if ($line['type'] === 'title' && !empty($currentCmdBlock)) {
                                $cmdBlocks[] = $currentCmdBlock;
                                $currentCmdBlock = [];
                            }
                            $currentCmdBlock[] = $line;
                        }
                        if (!empty($currentCmdBlock)) $cmdBlocks[] = $currentCmdBlock;

                        // Calculate height of each block
                        $cmdBlockHeights = [];
                        foreach ($cmdBlocks as $blk) {
                            $h = 0;
                            foreach ($blk as $line) {
                                if ($line['type'] === 'title') {
                                    $h += 2; // spacing before title
                                    $h += $titleLineH + 1;
                                } else {
                                    $h += $lineH + 1;
                                }
                            }
                            $cmdBlockHeights[] = $h;
                        }

                        // --- Multi-page two-column pagination ---
                        $pageH = $pdf->getPageHeight();
                        $fullPageAvailH = $pageH - $mTop - $mBottom;
                        $startY = $pdf->GetY();
                        $firstPageAvailH = $pageH - $startY - $mBottom;

                        // Build pages: each page has col1 and col2 block lists
                        $pages = [];
                        $curPage = ['col1' => [], 'col2' => []];
                        $col1H = 0.0;
                        $col2H = 0.0;
                        $fillingCol = 1;
                        $curAvailH = $firstPageAvailH;

                        foreach ($cmdBlocks as $bi => $blk) {
                            $bh = $cmdBlockHeights[$bi];

                            if ($fillingCol === 1) {
                                if ($col1H + $bh <= $curAvailH) {
                                    $curPage['col1'][] = $blk;
                                    $col1H += $bh;
                                } else {
                                    // Col1 full, try col2
                                    $fillingCol = 2;
                                    if ($col2H + $bh <= $curAvailH) {
                                        $curPage['col2'][] = $blk;
                                        $col2H += $bh;
                                    } else {
                                        // Both columns full, new page
                                        $pages[] = $curPage;
                                        $curPage = ['col1' => [$blk], 'col2' => []];
                                        $col1H = $bh;
                                        $col2H = 0.0;
                                        $curAvailH = $fullPageAvailH;
                                        $fillingCol = 1;
                                    }
                                }
                            } else {
                                if ($col2H + $bh <= $curAvailH) {
                                    $curPage['col2'][] = $blk;
                                    $col2H += $bh;
                                } else {
                                    // Col2 full, new page
                                    $pages[] = $curPage;
                                    $curPage = ['col1' => [$blk], 'col2' => []];
                                    $col1H = $bh;
                                    $col2H = 0.0;
                                    $curAvailH = $fullPageAvailH;
                                    $fillingCol = 1;
                                }
                            }
                        }
                        if (!empty($curPage['col1']) || !empty($curPage['col2'])) {
                            $pages[] = $curPage;
                        }

                        // --- Render pages ---
                        $col1X = $mLeft + $indent;
                        $col2X = $mLeft + $colW;

                        $renderColumn = function (array $colBlocks, float $x, float $yStart) use ($pdf, $cliFont, $cliSize, $titleSize, $lineH, $titleLineH, $colW, $indent, $bodyRgb): float {
                            $y = $yStart;
                            foreach ($colBlocks as $blk) {
                                foreach ($blk as $line) {
                                    if ($line['type'] === 'title') {
                                        $y += 2;
                                        $pdf->SetFont($cliFont, 'B', $titleSize);
                                        $pdf->SetTextColor($bodyRgb[0], $bodyRgb[1], $bodyRgb[2]);
                                        $pdf->SetXY($x, $y);
                                        $pdf->Cell($colW - $indent, $titleLineH, $line['text'], 0, 0, 'L');
                                        $y += $titleLineH + 1;
                                    } else {
                                        $pdf->SetFont($cliFont, '', $cliSize);
                                        $pdf->SetTextColor($bodyRgb[0], $bodyRgb[1], $bodyRgb[2]);
                                        $pdf->SetXY($x, $y);
                                        $pdf->Cell($colW - $indent, $lineH, $line['text'], 0, 0, 'L');
                                        $y += $lineH + 1;
                                    }
                                }
                            }
                            return $y;
                        };

                        $isFirstPage = true;
                        foreach ($pages as $page) {
                            if (!$isFirstPage) {
                                $pdf->AddPage();
                                $startY = $mTop;
                            }
                            $isFirstPage = false;

                            $col1EndY = $renderColumn($page['col1'], $col1X, $startY);
                            $col2EndY = $renderColumn($page['col2'], $col2X, $startY);

                            $pdf->SetY(max($col1EndY, $col2EndY));
                        }
                    }
                }

                if ($pSpaceAfter > 0) {
                    $pdf->Ln($pSpaceAfter);
                }

                $prevType = 'command_list';

            } elseif ($type === 'topology') {
                $topoId = $block['topologyId'] ?? null;
                $topoWidth = (float) ($block['width'] ?? 100);
                $caption = $block['caption'] ?? '';
                $pageBreak = !empty($block['pageBreakBefore']);

                if (!$topoId) continue;

                $topology = $this->em->getRepository(\App\Entity\Topology::class)->find($topoId);
                if (!$topology) continue;
                $pf = $block['protocolFilter'] ?? 'manual';
                if ($pf !== 'manual' && is_numeric($pf)) $pf = (int)$pf;
                $opts = [
                    'protocolFilter' => $pf,
                    'canvasWidth' => 1200,
                ];
                $mstpInstance = $block['mstpInstance'] ?? null;
                if ($mstpInstance !== null && $mstpInstance !== '') {
                    $opts['mstpInstance'] = (string) $mstpInstance;
                }
                // Legend visibility is driven by the block's "Show legend"
                // toggle, not by the topology's mapOptions — the user
                // makes the per-report-block decision here.
                $opts['showLegend'] = !empty($block['showLegend']);
                $vf = $block['viewportFrame'] ?? null;
                if (is_array($vf) && isset($vf['x'], $vf['y'], $vf['width'], $vf['height'])) {
                    $opts['viewportFrame'] = [
                        'x' => (float)$vf['x'],
                        'y' => (float)$vf['y'],
                        'width' => (float)$vf['width'],
                        'height' => (float)$vf['height'],
                    ];
                }
                $renderer = $this->topologyV2Renderer ?? null;
                $svg = $renderer ? $renderer->render($topology, $opts) : null;
                if ($svg === null) continue;

                if ($pageBreak || $firstBlock) {
                    $pdf->SetMargins($mLeft, $mTop, $mRight);
                    $pdf->SetAutoPageBreak(true, $mBottom);
                    $pdf->AddPage();
                    $firstBlock = false;
                } else {
                    $pdf->Ln($pSpaceBefore > 0 ? $pSpaceBefore : 4);
                }

                // Embed SVG directly via TCPDF
                $tmpSvg = tempnam(sys_get_temp_dir(), 'topo_') . '.svg';
                file_put_contents($tmpSvg, $svg);

                $pageW = $pdf->getPageWidth();
                $contentW = $pageW - $mLeft - $mRight;
                $imgW = $contentW * ($topoWidth / 100);
                $imgX = $mLeft + ($contentW - $imgW) / 2;

                // Compute aspect ratio for height
                $svgAspect = 1.0;
                if (preg_match('/width="(\d+(?:\.\d+)?)"/', $svg, $wm) && preg_match('/height="(\d+(?:\.\d+)?)"/', $svg, $hm)) {
                    $svgAspect = (float) $hm[1] / max((float) $wm[1], 1);
                }
                $imgH = $imgW * $svgAspect;
                $yBefore = $pdf->GetY();

                // Check if we need a page break
                if ($yBefore + $imgH > $pdf->getPageHeight() - $mBottom) {
                    $pdf->AddPage();
                    $yBefore = $pdf->GetY();
                }

                $pdf->ImageSVG($tmpSvg, $imgX, $yBefore, $imgW, $imgH, '', '', '', 0, false);
                @unlink($tmpSvg);

                $pdf->SetY($yBefore + $imgH);

                // Caption
                if (!empty($caption)) {
                    $pdf->Ln(2);
                    $pdf->SetTextColor($bodyRgb[0], $bodyRgb[1], $bodyRgb[2]);
                    $pdf->SetFont($bodyFont, 'I', $bodySize - 1);
                    $pdf->MultiCell($contentW, 0, $caption, 0, 'C', false, 1, $mLeft);
                    $pdf->SetFont($bodyFont, '', $bodySize);
                }

                if ($pSpaceAfter > 0) {
                    $pdf->Ln($pSpaceAfter);
                }

                $prevType = 'topology';

            } elseif ($type === 'schema') {
                $schemaId = $block['schemaId'] ?? null;
                $schemaWidth = (float) ($block['width'] ?? 100);
                $caption = $block['caption'] ?? '';
                $pageBreak = !empty($block['pageBreakBefore']);

                if (!$schemaId) continue;

                $reportSchema = $this->em->getRepository(\App\Entity\ReportSchema::class)->find($schemaId);
                if (!$reportSchema) continue;

                $opts = ['canvasWidth' => 1200];
                $vf = $block['viewportFrame'] ?? null;
                if (is_array($vf) && isset($vf['x'], $vf['y'], $vf['width'], $vf['height'])) {
                    $opts['viewportFrame'] = [
                        'x' => (float)$vf['x'],
                        'y' => (float)$vf['y'],
                        'width' => (float)$vf['width'],
                        'height' => (float)$vf['height'],
                    ];
                }

                $svg = $this->reportSchemaRenderer->render($reportSchema, $opts);
                if ($svg === null || $svg === '') continue;

                if ($pageBreak || $firstBlock) {
                    $pdf->SetMargins($mLeft, $mTop, $mRight);
                    $pdf->SetAutoPageBreak(true, $mBottom);
                    $pdf->AddPage();
                    $firstBlock = false;
                } else {
                    $pdf->Ln($pSpaceBefore > 0 ? $pSpaceBefore : 4);
                }

                $pageW = $pdf->getPageWidth();
                $contentW = $pageW - $mLeft - $mRight;
                $imgW = $contentW * ($schemaWidth / 100);
                $imgX = $mLeft + ($contentW - $imgW) / 2;

                $svgAspect = 1.0;
                if (preg_match('/width="(\d+(?:\.\d+)?)"/', $svg, $wm) && preg_match('/height="(\d+(?:\.\d+)?)"/', $svg, $hm)) {
                    $svgAspect = (float) $hm[1] / max((float) $wm[1], 1);
                }
                $imgH = $imgW * $svgAspect;
                $yBefore = $pdf->GetY();

                if ($yBefore + $imgH > $pdf->getPageHeight() - $mBottom) {
                    $pdf->AddPage();
                    $yBefore = $pdf->GetY();
                }

                // Rasterize the schema with librsvg and embed the PNG. TCPDF's SVG
                // parser cannot render SVG-in-<image> (imported Visio/SVG shapes),
                // so we rasterize the whole schema — nested icons included — and
                // fall back to TCPDF's ImageSVG only if rasterization is unavailable.
                $targetPx = (int) round($imgW / 25.4 * 250); // ~250 DPI
                $pngFile = $this->svgRasterizer->toPngFile($svg, $targetPx);
                if ($pngFile !== null) {
                    $pdf->Image($pngFile, $imgX, $yBefore, $imgW, $imgH, 'PNG', '', '', true, 300, '', false, false, 0);
                    @unlink($pngFile);
                } else {
                    $tmpSvg = tempnam(sys_get_temp_dir(), 'rsch_') . '.svg';
                    file_put_contents($tmpSvg, $svg);
                    $pdf->ImageSVG($tmpSvg, $imgX, $yBefore, $imgW, $imgH, '', '', '', 0, false);
                    @unlink($tmpSvg);
                }

                $pdf->SetY($yBefore + $imgH);

                if (!empty($caption)) {
                    $pdf->Ln(2);
                    $pdf->SetTextColor($bodyRgb[0], $bodyRgb[1], $bodyRgb[2]);
                    $pdf->SetFont($bodyFont, 'I', $bodySize - 1);
                    $pdf->MultiCell($contentW, 0, $caption, 0, 'C', false, 1, $mLeft);
                    $pdf->SetFont($bodyFont, '', $bodySize);
                }

                if ($pSpaceAfter > 0) {
                    $pdf->Ln($pSpaceAfter);
                }

                $prevType = 'schema';

            } elseif ($type === 'compliance_matrix') {
                $policyId = $block['policyId'] ?? null;
                if (!$policyId) continue;

                $policy = $this->em->getRepository(\App\Entity\CompliancePolicy::class)->find($policyId);
                if (!$policy) continue;

                $showRuleId = !empty($block['showRuleId']);
                $showTotal = !empty($block['showTotal']);
                $pageBreak = !empty($block['pageBreakBefore']);
                $cmFontSize = !empty($block['fontSize']) ? (float) $block['fontSize'] : 9.0;

                $reportLocale = $report ? $report->getLocale() : 'en';
                $cl = self::COMPLIANCE_LABELS[$reportLocale] ?? self::COMPLIANCE_LABELS['en'];

                if ($pageBreak || $firstBlock) {
                    $pdf->SetMargins($mLeft, $mTop, $mRight);
                    $pdf->SetAutoPageBreak(true, $mBottom);
                    $pdf->AddPage();
                    $firstBlock = false;
                } else {
                    $pdf->Ln($pSpaceBefore > 0 ? $pSpaceBefore : 4);
                }

                // Aggregate counts per rule per status
                $rowsAgg = $this->em->createQueryBuilder()
                    ->select('r.id AS rid', 'r.identifier AS rident', 'r.name AS rname', 'cr.status AS st', 'COUNT(cr.id) AS cnt')
                    ->from(\App\Entity\ComplianceResult::class, 'cr')
                    ->join('cr.rule', 'r')
                    ->where('cr.policy = :policy')
                    ->setParameter('policy', $policy)
                    ->groupBy('r.id', 'r.identifier', 'r.name', 'cr.status')
                    ->getQuery()->getArrayResult();

                $ruleMap = [];
                foreach ($rowsAgg as $row) {
                    $rid = (int) $row['rid'];
                    if (!isset($ruleMap[$rid])) {
                        $ruleMap[$rid] = [
                            'identifier' => $row['rident'] ?? '',
                            'name' => $row['rname'] ?? '',
                            'compliant' => 0, 'non_compliant' => 0, 'error' => 0, 'not_applicable' => 0,
                        ];
                    }
                    $st = $row['st'];
                    if ($st !== 'skipped' && isset($ruleMap[$rid][$st])) {
                        $ruleMap[$rid][$st] = (int) $row['cnt'];
                    }
                }
                uasort($ruleMap, function ($a, $b) {
                    return strnatcasecmp($a['identifier'] ?? '', $b['identifier'] ?? '') ?: strcmp($a['name'] ?? '', $b['name'] ?? '');
                });

                // Theme colors
                $cmTableStyle = $styles['table'] ?? ReportTheme::DEFAULT_STYLES['table'];
                $cmHeaderBg = $this->hexToRgb($cmTableStyle['headerBg'] ?? '#1e293b');
                $cmHeaderColor = $this->hexToRgb($cmTableStyle['headerColor'] ?? '#ffffff');
                $cmBorderColor = $this->hexToRgb($cmTableStyle['borderColor'] ?? '#e2e8f0');
                $cmAlternate = $cmTableStyle['alternateRows'] ?? true;
                $cmAlternateBg = $this->hexToRgb($cmTableStyle['alternateBg'] ?? '#f8fafc');

                // Title
                $pdf->SetFont($bodyFont, 'B', $cmFontSize + 2);
                $pdf->SetTextColor($bodyRgb[0], $bodyRgb[1], $bodyRgb[2]);
                $pdf->MultiCell(0, ($cmFontSize + 2) * 0.3528 + 1, $policy->getName(), 0, 'L');
                $pdf->Ln(1);

                // Build columns
                $cmCols = [];
                if ($showRuleId) $cmCols[] = ['key' => 'identifier', 'label' => $cl['rule_id'], 'w' => 14, 'align' => 'L', 'multi' => true];
                $cmCols[] = ['key' => 'name', 'label' => $cl['rule'], 'w' => 50, 'align' => 'L', 'multi' => true];
                $cmCols[] = ['key' => 'compliant', 'label' => $cl['compliant'], 'w' => 14, 'align' => 'C', 'multi' => false];
                $cmCols[] = ['key' => 'non_compliant', 'label' => $cl['non_compliant'], 'w' => 14, 'align' => 'C', 'multi' => false];
                $cmCols[] = ['key' => 'error', 'label' => $cl['error'], 'w' => 14, 'align' => 'C', 'multi' => false];
                $cmCols[] = ['key' => 'not_applicable', 'label' => $cl['not_applicable'], 'w' => 14, 'align' => 'C', 'multi' => false];
                if ($showTotal) $cmCols[] = ['key' => 'total', 'label' => $cl['total'], 'w' => 14, 'align' => 'C', 'multi' => false];

                $cmContentW = $pdf->getPageWidth() - $mLeft - $mRight;
                $cmTotalW = array_sum(array_column($cmCols, 'w'));
                foreach ($cmCols as $cmCi => $cmC) {
                    $cmCols[$cmCi]['mm'] = $cmContentW * ($cmC['w'] / $cmTotalW);
                }

                $pdf->SetDrawColor($cmBorderColor[0], $cmBorderColor[1], $cmBorderColor[2]);
                $pdf->SetLineWidth(0.2);

                // Header
                $pdf->SetFont($bodyFont, 'B', $cmFontSize);
                $pdf->SetFillColor($cmHeaderBg[0], $cmHeaderBg[1], $cmHeaderBg[2]);
                $pdf->SetTextColor($cmHeaderColor[0], $cmHeaderColor[1], $cmHeaderColor[2]);
                $headerH = $cmFontSize * 0.3528 + 3;
                $startY = $pdf->GetY();
                $startX = $mLeft;
                foreach ($cmCols as $c) {
                    $pdf->MultiCell($c['mm'], $headerH, $c['label'], 1, $c['align'], true, 0, $startX, $startY, true, 0, false, true, $headerH, 'M');
                    $startX += $c['mm'];
                }
                $pdf->SetXY($mLeft, $startY + $headerH);

                if (empty($ruleMap)) {
                    $pdf->SetFont($bodyFont, 'I', $cmFontSize);
                    $pdf->SetTextColor($bodyRgb[0], $bodyRgb[1], $bodyRgb[2]);
                    $pdf->MultiCell($cmContentW, 0, $cl['no_data'], 1, 'C', false, 1, $mLeft);
                } else {
                    $cmRowI = 0;
                    foreach ($ruleMap as $r) {
                        $r['total'] = ($r['compliant'] ?? 0) + ($r['non_compliant'] ?? 0) + ($r['error'] ?? 0) + ($r['not_applicable'] ?? 0);

                        $fill = $cmAlternate && ($cmRowI % 2 === 1);
                        if ($fill) {
                            $pdf->SetFillColor($cmAlternateBg[0], $cmAlternateBg[1], $cmAlternateBg[2]);
                        } else {
                            $pdf->SetFillColor(255, 255, 255);
                            $fill = true;
                        }

                        // Compute row height based on multi-line columns
                        $rowH = $cmFontSize * 0.3528 + 3;
                        $pdf->SetFont($bodyFont, '', $cmFontSize);
                        foreach ($cmCols as $c) {
                            if (!empty($c['multi'])) {
                                $h = $pdf->getStringHeight($c['mm'], (string) ($r[$c['key']] ?? ''));
                                $rowH = max($rowH, $h + 2);
                            }
                        }

                        $startY = $pdf->GetY();
                        if ($startY + $rowH > $pdf->getPageHeight() - $mBottom) {
                            $pdf->AddPage();
                            $startY = $pdf->GetY();
                        }

                        $startX = $mLeft;
                        foreach ($cmCols as $c) {
                            $val = (string) ($r[$c['key']] ?? '');
                            if (isset(self::COMPLIANCE_STATUS_RGB[$c['key']]) && (int) $val > 0) {
                                $sc = self::COMPLIANCE_STATUS_RGB[$c['key']];
                                $pdf->SetTextColor($sc[0], $sc[1], $sc[2]);
                                $pdf->SetFont($bodyFont, 'B', $cmFontSize);
                            } else {
                                $pdf->SetTextColor($bodyRgb[0], $bodyRgb[1], $bodyRgb[2]);
                                $pdf->SetFont($bodyFont, '', $cmFontSize);
                            }
                            $pdf->MultiCell($c['mm'], $rowH, $val, 1, $c['align'], $fill, 0, $startX, $startY, true, 0, false, true, $rowH, 'M');
                            $startX += $c['mm'];
                        }
                        $pdf->SetXY($mLeft, $startY + $rowH);
                        $cmRowI++;
                    }
                }

                if ($pSpaceAfter > 0) {
                    $pdf->Ln($pSpaceAfter);
                }

                $prevType = 'compliance_matrix';

            } elseif ($type === 'acl_table') {
                $aclNodes = $this->resolveRepeatNodes($block, $forNode, $report);
                if (empty($aclNodes)) continue;

                $aclConfig = $report?->getContext()?->getAclConfig();
                $showDisabled = ($block['showDisabled'] ?? true) !== false;
                $aclFontSize = !empty($block['fontSize']) ? (float) $block['fontSize'] : 6.0;
                $pageBreak = !empty($block['pageBreakBefore']);

                $reportLocale = $report ? $report->getLocale() : 'en';
                $al = self::ACL_LABELS[$reportLocale] ?? self::ACL_LABELS['en'];

                $aclTableStyle = $styles['table'] ?? ReportTheme::DEFAULT_STYLES['table'];
                $aclHeaderBg = $this->hexToRgb($aclTableStyle['headerBg'] ?? '#1e293b');
                $aclHeaderColor = $this->hexToRgb($aclTableStyle['headerColor'] ?? '#ffffff');
                $aclBorderColor = $this->hexToRgb($aclTableStyle['borderColor'] ?? '#e2e8f0');
                $aclAlternate = $aclTableStyle['alternateRows'] ?? true;
                $aclAlternateBg = $this->hexToRgb($aclTableStyle['alternateBg'] ?? '#f8fafc');

                if ($pageBreak || $firstBlock) {
                    $pdf->SetMargins($mLeft, $mTop, $mRight);
                    $pdf->SetAutoPageBreak(true, $mBottom);
                    $pdf->AddPage();
                    $firstBlock = false;
                } else {
                    $pdf->Ln($pSpaceBefore > 0 ? $pSpaceBefore : 4);
                }

                $aclContentW = $pdf->getPageWidth() - $mLeft - $mRight;
                $aclCols = [
                    ['key' => 'enabled', 'label' => '', 'w' => 5, 'align' => 'C'],
                    ['key' => 'name', 'label' => $al['name'], 'w' => 26, 'align' => 'L'],
                    ['key' => 'source', 'label' => $al['source'], 'w' => 22, 'align' => 'L'],
                    ['key' => 'destination', 'label' => $al['destination'], 'w' => 22, 'align' => 'L'],
                    ['key' => 'service', 'label' => $al['service'], 'w' => 22, 'align' => 'L'],
                    ['key' => 'action', 'label' => $al['action'], 'w' => 20, 'align' => 'L'],
                ];
                $aclTotalW = array_sum(array_column($aclCols, 'w'));
                foreach ($aclCols as $ci => $c) {
                    $aclCols[$ci]['mm'] = $aclContentW * ($c['w'] / $aclTotalW);
                }

                $pdf->SetDrawColor($aclBorderColor[0], $aclBorderColor[1], $aclBorderColor[2]);
                $pdf->SetLineWidth(0.2);

                foreach ($aclNodes as $aclNode) {
                    $acls = $this->aclExtractor->extractForNode($aclNode, $aclConfig);

                    // Per-node title (hostname / name / ip).
                    $nodeTitle = $aclNode->getHostname() ?: ($aclNode->getName() ?: $aclNode->getIpAddress());
                    $pdf->SetFont($bodyFont, 'B', $aclFontSize + 2);
                    $pdf->SetTextColor($bodyRgb[0], $bodyRgb[1], $bodyRgb[2]);
                    $pdf->MultiCell(0, ($aclFontSize + 2) * 0.3528 + 1, (string) $nodeTitle, 0, 'L');
                    $pdf->Ln(0.5);

                    if (empty($acls)) {
                        $pdf->SetFont($bodyFont, 'I', $aclFontSize);
                        $pdf->MultiCell($aclContentW, 0, $al['no_data'], 1, 'C', false, 1, $mLeft);
                        $pdf->Ln(2);
                        continue;
                    }

                    foreach ($acls as $acl) {
                        // ACL sub-heading: name, type, default action.
                        $aclHead = (string) ($acl['name'] ?? $acl['id'] ?? '');
                        if (!empty($acl['type'])) $aclHead .= '  [' . $acl['type'] . ']';
                        if (!empty($acl['defaultAction'])) $aclHead .= '  ' . $al['default_action'] . ': ' . $acl['defaultAction'];
                        $pdf->SetFont($bodyFont, 'B', $aclFontSize + 0.5);
                        $pdf->SetTextColor($bodyRgb[0], $bodyRgb[1], $bodyRgb[2]);
                        $pdf->MultiCell(0, ($aclFontSize + 0.5) * 0.3528 + 1, $aclHead, 0, 'L');

                        // Header row — restore the theme border colour (icon/dot
                        // drawing on previous rows changed the current draw colour).
                        $pdf->SetDrawColor($aclBorderColor[0], $aclBorderColor[1], $aclBorderColor[2]);
                        $pdf->SetLineWidth(0.2);
                        $pdf->SetFont($bodyFont, 'B', $aclFontSize);
                        $pdf->SetFillColor($aclHeaderBg[0], $aclHeaderBg[1], $aclHeaderBg[2]);
                        $pdf->SetTextColor($aclHeaderColor[0], $aclHeaderColor[1], $aclHeaderColor[2]);
                        $headerH = $aclFontSize * 0.3528 + 2.5;
                        $startY = $pdf->GetY();
                        $startX = $mLeft;
                        foreach ($aclCols as $c) {
                            $pdf->MultiCell($c['mm'], $headerH, $c['label'], 1, 'C', true, 0, $startX, $startY, true, 0, false, true, $headerH, 'M');
                            $startX += $c['mm'];
                        }
                        $pdf->SetXY($mLeft, $startY + $headerH);

                        $aces = $acl['aces'] ?? [];
                        if (!$showDisabled) {
                            $aces = array_values(array_filter($aces, fn($a) => ($a['enabled'] ?? true) !== false));
                        }

                        if (empty($aces)) {
                            $pdf->SetFont($bodyFont, 'I', $aclFontSize);
                            $pdf->SetTextColor($bodyRgb[0], $bodyRgb[1], $bodyRgb[2]);
                            $pdf->MultiCell($aclContentW, 0, $al['no_aces'], 1, 'C', false, 1, $mLeft);
                        } else {
                            $rowI = 0;
                            foreach ($aces as $ace) {
                                $disabled = ($ace['enabled'] ?? true) === false;
                                // Per-cell badge lists (enabled/name are plain text).
                                $badges = [
                                    'source' => $this->aclCellBadges($ace['source'] ?? [], $al['all'], 'source'),
                                    'destination' => $this->aclCellBadges($ace['destination'] ?? [], $al['all'], 'destination'),
                                    'service' => $this->aclServiceBadges($ace, $al['all']),
                                    'action' => $this->aclActionBadges($ace),
                                ];

                                // Row height: tallest of badge cells and text cells.
                                $rowH = $aclFontSize * 0.3528 + 3;
                                foreach (['source', 'destination', 'service', 'action'] as $bk) {
                                    $col = null;
                                    foreach ($aclCols as $c) { if ($c['key'] === $bk) { $col = $c; break; } }
                                    if ($col === null) continue;
                                    $h = $this->aclRenderBadges($pdf, $badges[$bk], 0, 0, $col['mm'], $bodyFont, $aclFontSize, true);
                                    $rowH = max($rowH, $h);
                                }
                                $nameCol = null;
                                foreach ($aclCols as $c) { if ($c['key'] === 'name') { $nameCol = $c; break; } }
                                if ($nameCol) {
                                    $pdf->SetFont($bodyFont, '', $aclFontSize);
                                    $rowH = max($rowH, $pdf->getStringHeight($nameCol['mm'], (string) ($ace['name'] ?? '')) + 1.5);
                                }

                                $startY = $pdf->GetY();
                                if ($startY + $rowH > $pdf->getPageHeight() - $mBottom) {
                                    $pdf->AddPage();
                                    $startY = $pdf->GetY();
                                }

                                $rowBg = ($aclAlternate && ($rowI % 2 === 1)) ? $aclAlternateBg : [255, 255, 255];

                                // 1) Cell backgrounds + borders, in the theme's
                                // table border colour (reset here since icon/dot
                                // drawing below changes the current draw colour).
                                $pdf->SetDrawColor($aclBorderColor[0], $aclBorderColor[1], $aclBorderColor[2]);
                                $pdf->SetLineWidth(0.2);
                                $startX = $mLeft;
                                foreach ($aclCols as $c) {
                                    $pdf->SetFillColor($rowBg[0], $rowBg[1], $rowBg[2]);
                                    $pdf->Rect($startX, $startY, $c['mm'], $rowH, 'DF');
                                    $startX += $c['mm'];
                                }

                                // 2) Cell contents.
                                $startX = $mLeft;
                                foreach ($aclCols as $c) {
                                    if ($c['key'] === 'enabled') {
                                        // Font-independent status dot: filled green = enabled, hollow grey = disabled.
                                        $dotR = 0.9;
                                        $dotCx = $startX + $c['mm'] / 2;
                                        $dotCy = $startY + $rowH / 2;
                                        if ($disabled) {
                                            $pdf->SetDrawColor(148, 163, 184);
                                            $pdf->SetLineWidth(0.15);
                                            $pdf->Circle($dotCx, $dotCy, $dotR, 0, 360, 'D', ['width' => 0.15, 'color' => [148, 163, 184]]);
                                        } else {
                                            $pdf->SetFillColor(22, 163, 74);
                                            $pdf->Circle($dotCx, $dotCy, $dotR, 0, 360, 'F', [], [22, 163, 74]);
                                        }
                                    } elseif ($c['key'] === 'name') {
                                        $pdf->SetFont($bodyFont, '', $aclFontSize);
                                        $pdf->SetTextColor($disabled ? 148 : $bodyRgb[0], $disabled ? 163 : $bodyRgb[1], $disabled ? 184 : $bodyRgb[2]);
                                        $pdf->SetXY($startX + 0.6, $startY);
                                        $pdf->MultiCell($c['mm'] - 1.2, $rowH, (string) ($ace['name'] ?? ''), 0, 'L', false, 0, $startX + 0.6, $startY, true, 0, false, true, $rowH, 'M');
                                    } else {
                                        $this->aclRenderBadges($pdf, $badges[$c['key']], $startX, $startY, $c['mm'], $bodyFont, $aclFontSize, false, $rowH);
                                    }
                                    $startX += $c['mm'];
                                }
                                $pdf->SetXY($mLeft, $startY + $rowH);
                                $rowI++;
                            }
                        }
                        $pdf->Ln(2);
                    }
                    $pdf->Ln(1);
                }

                if ($pSpaceAfter > 0) {
                    $pdf->Ln($pSpaceAfter);
                }

                $prevType = 'acl_table';

            } elseif ($type === 'rule_items_table') {
                // Per-key detail of a loop rule: one table per node listing each
                // inventory item (e.g. interface) with status/severity/message.
                $ruleId = $block['ruleId'] ?? null;
                if (!$ruleId) continue;
                $rule = $this->em->getRepository(\App\Entity\ComplianceRule::class)->find($ruleId);
                if (!$rule) continue;

                $showSeverity = !empty($block['showSeverity']);
                $showMessage = !empty($block['showMessage']);
                $onlyFailing = !empty($block['onlyFailing']);
                $pageBreak = !empty($block['pageBreakBefore']);
                $riFontSize = !empty($block['fontSize']) ? (float) $block['fontSize'] : 9.0;
                $reportLocale = $report ? $report->getLocale() : 'en';
                $cl = self::COMPLIANCE_LABELS[$reportLocale] ?? self::COMPLIANCE_LABELS['en'];

                // Resolve target nodes (current node, or manual ids + node rules)
                if ($forNode) {
                    $riNodeIds = [$forNode->getId()];
                } else {
                    $riManual = array_map('intval', $block['nodeIds'] ?? []);
                    $riRules = $block['nodeRules'] ?? [];
                    $riMatch = ($block['nodeRulesMatch'] ?? 'any') === 'all' ? 'all' : 'any';
                    $riRuleNodeIds = (!empty($riRules) && $rule->getContext())
                        ? $this->inventoryRuleEvaluator->matchNodeIds($rule->getContext(), $riRules, $riMatch)
                        : [];
                    $riNodeIds = array_values(array_unique(array_merge($riManual, $riRuleNodeIds)));
                }

                $riQb = $this->em->createQueryBuilder()
                    ->select('cr', 'n')
                    ->from(\App\Entity\ComplianceResult::class, 'cr')
                    ->join('cr.node', 'n')
                    ->where('cr.rule = :rule')
                    ->andWhere('cr.perKey = true')
                    ->setParameter('rule', $rule)
                    ->orderBy('n.name', 'ASC')->addOrderBy('n.ipAddress', 'ASC');
                if (!empty($block['policyId'])) {
                    $riQb->andWhere('cr.policy = :pol')->setParameter('pol', $block['policyId']);
                }
                if (!empty($riNodeIds)) {
                    $riQb->andWhere('n.id IN (:nids)')->setParameter('nids', $riNodeIds);
                }
                $riResults = $riQb->getQuery()->getResult();
                if (empty($riResults)) continue;

                $riTableStyle = $styles['table'] ?? ReportTheme::DEFAULT_STYLES['table'];
                $riHeaderBg = $this->hexToRgb($riTableStyle['headerBg'] ?? '#1e293b');
                $riHeaderColor = $this->hexToRgb($riTableStyle['headerColor'] ?? '#ffffff');
                $riBorderColor = $this->hexToRgb($riTableStyle['borderColor'] ?? '#e2e8f0');
                $riAlternate = $riTableStyle['alternateRows'] ?? true;
                $riAlternateBg = $this->hexToRgb($riTableStyle['alternateBg'] ?? '#f8fafc');

                if ($pageBreak || $firstBlock) {
                    $pdf->SetMargins($mLeft, $mTop, $mRight);
                    $pdf->SetAutoPageBreak(true, $mBottom);
                    $pdf->AddPage();
                    $firstBlock = false;
                } else {
                    $pdf->Ln($pSpaceBefore > 0 ? $pSpaceBefore : 4);
                }

                $riCols = [
                    ['key' => 'item', 'label' => 'Item', 'w' => 26, 'align' => 'L'],
                    ['key' => 'status', 'label' => $cl['status'] ?? 'Status', 'w' => 18, 'align' => 'C'],
                ];
                if ($showSeverity) $riCols[] = ['key' => 'severity', 'label' => $cl['severity'] ?? 'Severity', 'w' => 16, 'align' => 'C'];
                if ($showMessage) $riCols[] = ['key' => 'message', 'label' => $cl['message'] ?? 'Message', 'w' => 40, 'align' => 'L'];
                $riContentW = $pdf->getPageWidth() - $mLeft - $mRight;
                $riTotalW = array_sum(array_column($riCols, 'w'));
                foreach ($riCols as $ci => $c) { $riCols[$ci]['mm'] = $riContentW * ($c['w'] / $riTotalW); }

                // Theme border colour + thin line, matching the other tables.
                $pdf->SetDrawColor($riBorderColor[0], $riBorderColor[1], $riBorderColor[2]);
                $pdf->SetLineWidth(0.2);

                foreach ($riResults as $cr) {
                    $rnode = $cr->getNode();
                    $rnodeName = $rnode->getName() ?: $rnode->getHostname() ?: $rnode->getIpAddress();
                    $okCount = $cr->getItemsTotal() - $cr->getItemsNonCompliant();
                    $riTitle = trim(($rule->getIdentifier() ? '[' . $rule->getIdentifier() . '] ' : '') . $rule->getName())
                        . ' — ' . $rnodeName . sprintf(' (%d/%d OK)', $okCount, $cr->getItemsTotal());
                    $pdf->SetFont($bodyFont, 'B', $riFontSize + 1);
                    $pdf->SetTextColor($bodyRgb[0], $bodyRgb[1], $bodyRgb[2]);
                    $pdf->MultiCell(0, ($riFontSize + 1) * 0.3528 + 1, $riTitle, 0, 'L');
                    $pdf->Ln(0.5);

                    // Header row
                    $pdf->SetFont($bodyFont, 'B', $riFontSize);
                    $pdf->SetFillColor($riHeaderBg[0], $riHeaderBg[1], $riHeaderBg[2]);
                    $pdf->SetTextColor($riHeaderColor[0], $riHeaderColor[1], $riHeaderColor[2]);
                    $riHH = $riFontSize * 0.3528 + 2;
                    $riStartY = $pdf->GetY();
                    if ($riStartY + $riHH > $pdf->getPageHeight() - $mBottom) { $pdf->AddPage(); $riStartY = $pdf->GetY(); }
                    $riStartX = $mLeft;
                    foreach ($riCols as $c) {
                        $pdf->MultiCell($c['mm'], $riHH, $c['label'], 1, 'C', true, 0, $riStartX, $riStartY, true, 0, false, true, $riHH, 'M');
                        $riStartX += $c['mm'];
                    }
                    $pdf->SetXY($mLeft, $riStartY + $riHH);

                    // Item rows
                    $riRowI = 0;
                    foreach ($cr->getItems() as $it) {
                        $st = $it->getStatus();
                        if ($onlyFailing && !in_array($st, ['non_compliant', 'error'], true)) continue;
                        $sev = $it->getSeverity();
                        $vals = [
                            'item' => $it->getItemKey(),
                            'status' => $cl[$st] ?? $st,
                            'severity' => $sev ? ($cl['sev_' . $sev] ?? $sev) : '',
                            'message' => $it->getMessage() ?: '',
                        ];
                        $rowH = $riFontSize * 0.3528 + 2.5;
                        foreach ($riCols as $c) {
                            if ($c['key'] === 'message' || $c['key'] === 'item') {
                                $rowH = max($rowH, $pdf->getStringHeight($c['mm'], (string) $vals[$c['key']]) + 1);
                            }
                        }
                        $riStartY = $pdf->GetY();
                        if ($riStartY + $rowH > $pdf->getPageHeight() - $mBottom) { $pdf->AddPage(); $riStartY = $pdf->GetY(); }
                        $riFill = $riAlternate && ($riRowI % 2 === 1);
                        if ($riFill) $pdf->SetFillColor($riAlternateBg[0], $riAlternateBg[1], $riAlternateBg[2]);
                        $riStartX = $mLeft;
                        foreach ($riCols as $c) {
                            $val = (string) ($vals[$c['key']] ?? '');
                            if ($c['key'] === 'status' && isset(self::COMPLIANCE_STATUS_RGB[$st])) {
                                $sc = self::COMPLIANCE_STATUS_RGB[$st]; $pdf->SetTextColor($sc[0], $sc[1], $sc[2]); $pdf->SetFont($bodyFont, 'B', $riFontSize);
                            } elseif ($c['key'] === 'severity' && $sev && isset(self::COMPLIANCE_SEVERITY_RGB[$sev])) {
                                $sc = self::COMPLIANCE_SEVERITY_RGB[$sev]; $pdf->SetTextColor($sc[0], $sc[1], $sc[2]); $pdf->SetFont($bodyFont, 'B', $riFontSize);
                            } else {
                                $pdf->SetTextColor($bodyRgb[0], $bodyRgb[1], $bodyRgb[2]); $pdf->SetFont($bodyFont, '', $riFontSize);
                            }
                            $pdf->MultiCell($c['mm'], $rowH, $val, 1, $c['align'], $riFill, 0, $riStartX, $riStartY, true, 0, false, true, $rowH, 'M');
                            $riStartX += $c['mm'];
                        }
                        $pdf->SetXY($mLeft, $riStartY + $rowH);
                        $riRowI++;
                    }
                    $pdf->Ln(2);
                }
                if ($pSpaceAfter > 0) $pdf->Ln($pSpaceAfter);
                $prevType = $type;
            } elseif ($type === 'rule_non_compliant' || $type === 'rule_nodes_table') {
                $policyId = $block['policyId'] ?? null;
                $ruleId = $block['ruleId'] ?? null;
                if (!$policyId || !$ruleId) continue;

                $policy = $this->em->getRepository(\App\Entity\CompliancePolicy::class)->find($policyId);
                $rule = $this->em->getRepository(\App\Entity\ComplianceRule::class)->find($ruleId);
                if (!$policy || !$rule) continue;

                $showDescription = !empty($block['showRuleDescription']);
                $showSeverity = !empty($block['showSeverity']);
                $showMessage = !empty($block['showMessage']);
                $pageBreak = !empty($block['pageBreakBefore']);
                $rcFontSize = !empty($block['fontSize']) ? (float) $block['fontSize'] : 9.0;

                $reportLocale = $report ? $report->getLocale() : 'en';
                $cl = self::COMPLIANCE_LABELS[$reportLocale] ?? self::COMPLIANCE_LABELS['en'];

                if ($pageBreak || $firstBlock) {
                    $pdf->SetMargins($mLeft, $mTop, $mRight);
                    $pdf->SetAutoPageBreak(true, $mBottom);
                    $pdf->AddPage();
                    $firstBlock = false;
                } else {
                    $pdf->Ln($pSpaceBefore > 0 ? $pSpaceBefore : 4);
                }

                // Title: rule identifier + name
                $title = trim(($rule->getIdentifier() ? '[' . $rule->getIdentifier() . '] ' : '') . $rule->getName());
                $pdf->SetFont($bodyFont, 'B', $rcFontSize + 2);
                $pdf->SetTextColor($bodyRgb[0], $bodyRgb[1], $bodyRgb[2]);
                $pdf->MultiCell(0, ($rcFontSize + 2) * 0.3528 + 1, $title, 0, 'L');
                $pdf->Ln(0.5);

                // Description
                if ($showDescription && $rule->getDescription()) {
                    $pdf->SetFont($bodyFont, 'I', $rcFontSize);
                    $pdf->SetTextColor($bodyRgb[0], $bodyRgb[1], $bodyRgb[2]);
                    $pdf->MultiCell(0, $rcFontSize * 0.3528 + 1, $rule->getDescription(), 0, 'L');
                    $pdf->Ln(1);
                }

                // Theme colors
                $rcTableStyle = $styles['table'] ?? ReportTheme::DEFAULT_STYLES['table'];
                $rcHeaderBg = $this->hexToRgb($rcTableStyle['headerBg'] ?? '#1e293b');
                $rcHeaderColor = $this->hexToRgb($rcTableStyle['headerColor'] ?? '#ffffff');
                $rcBorderColor = $this->hexToRgb($rcTableStyle['borderColor'] ?? '#e2e8f0');
                $rcAlternate = $rcTableStyle['alternateRows'] ?? true;
                $rcAlternateBg = $this->hexToRgb($rcTableStyle['alternateBg'] ?? '#f8fafc');

                // Resolve device filter (manual node IDs + node rules)
                $rcManualNodeIds = array_map('intval', $block['nodeIds'] ?? []);
                $rcNodeRules = $block['nodeRules'] ?? [];
                $rcRulesMatch = ($block['nodeRulesMatch'] ?? 'any') === 'all' ? 'all' : 'any';
                $rcRuleNodeIds = [];
                if (!empty($rcNodeRules) && $policy->getContext()) {
                    $rcRuleNodeIds = $this->inventoryRuleEvaluator->matchNodeIds($policy->getContext(), $rcNodeRules, $rcRulesMatch);
                }
                $rcFilterNodeIds = array_values(array_unique(array_merge($rcManualNodeIds, $rcRuleNodeIds)));
                $rcHasFilter = !empty($rcFilterNodeIds);

                // Fetch results
                $resQb = $this->em->createQueryBuilder()
                    ->select('cr', 'n')
                    ->from(\App\Entity\ComplianceResult::class, 'cr')
                    ->join('cr.node', 'n')
                    ->where('cr.policy = :policy')
                    ->andWhere('cr.rule = :rule')
                    ->setParameter('policy', $policy)
                    ->setParameter('rule', $rule);
                if ($type === 'rule_non_compliant') {
                    $resQb->andWhere('cr.status = :status')->setParameter('status', 'non_compliant');
                } else {
                    $resQb->andWhere('cr.status != :status')->setParameter('status', 'skipped');
                }
                if ($rcHasFilter) {
                    $resQb->andWhere('n.id IN (:filterNodes)')->setParameter('filterNodes', $rcFilterNodeIds);
                }
                $resQb->orderBy('n.name', 'ASC')->addOrderBy('n.ipAddress', 'ASC');
                /** @var \App\Entity\ComplianceResult[] $results */
                $results = $resQb->getQuery()->getResult();

                // Pre-load inventory data for extra columns
                $rcInvColumns = $block['columns'] ?? [];
                $rcInvData = [];
                if (!empty($rcInvColumns) && !empty($results)) {
                    $rcResultNodeIds = [];
                    foreach ($results as $cr) {
                        $rcResultNodeIds[] = $cr->getNode()->getId();
                    }
                    $rcResultNodeIds = array_values(array_unique($rcResultNodeIds));
                    $rcInvRepo = $this->em->getRepository(NodeInventoryEntry::class);
                    foreach ($rcInvColumns as $rcInvCol) {
                        $cat = $rcInvCol['category'] ?? '';
                        $key = $rcInvCol['entryKey'] ?? '';
                        $col = $rcInvCol['colLabel'] ?? '';
                        if ($cat === '' || $key === '' || $col === '') continue;
                        $rcInvEntries = $rcInvRepo->createQueryBuilder('e')
                            ->where('e.node IN (:nodes)')
                            ->andWhere('e.categoryName = :cat')
                            ->andWhere('e.entryKey = :key')
                            ->andWhere('e.colLabel = :col')
                            ->setParameter('nodes', $rcResultNodeIds)
                            ->setParameter('cat', $cat)
                            ->setParameter('key', $key)
                            ->setParameter('col', $col)
                            ->getQuery()
                            ->getResult();
                        foreach ($rcInvEntries as $rcInvEntry) {
                            $rcEntryNodeId = $rcInvEntry->getNode()->getId();
                            $lookup = $cat . '|' . $key . '|' . $col;
                            if (!isset($rcInvData[$rcEntryNodeId])) $rcInvData[$rcEntryNodeId] = [];
                            $rcInvData[$rcEntryNodeId][$lookup] = $rcInvEntry->getValue() ?? '';
                        }
                    }
                }

                // Build columns: device → inventory cols → status → severity → message
                $rcCols = [['key' => 'node', 'label' => $cl['node'], 'w' => 30, 'align' => 'L', 'multi' => false]];
                foreach ($rcInvColumns as $rcInvCol) {
                    $rcCols[] = [
                        'key' => 'inv:' . ($rcInvCol['id'] ?? uniqid()),
                        'label' => $rcInvCol['headerLabel'] ?? $rcInvCol['label'] ?? (($rcInvCol['category'] ?? '') . ' > ' . ($rcInvCol['entryKey'] ?? '') . ' > ' . ($rcInvCol['colLabel'] ?? '')),
                        'w' => 22,
                        'align' => strtoupper(substr($rcInvCol['align'] ?? 'left', 0, 1)),
                        'multi' => true,
                        'invLookup' => ($rcInvCol['category'] ?? '') . '|' . ($rcInvCol['entryKey'] ?? '') . '|' . ($rcInvCol['colLabel'] ?? ''),
                    ];
                }
                if ($type === 'rule_nodes_table') {
                    $rcCols[] = ['key' => 'status', 'label' => $cl['status'], 'w' => 18, 'align' => 'C', 'multi' => false];
                }
                if ($showSeverity && $type === 'rule_non_compliant') {
                    $rcCols[] = ['key' => 'severity', 'label' => $cl['severity'], 'w' => 16, 'align' => 'C', 'multi' => false];
                }
                if ($showMessage) {
                    $rcCols[] = ['key' => 'message', 'label' => $cl['message'], 'w' => 50, 'align' => 'L', 'multi' => true];
                }

                $rcContentW = $pdf->getPageWidth() - $mLeft - $mRight;
                $rcTotalW = array_sum(array_column($rcCols, 'w'));
                foreach ($rcCols as $rcCi => $rcC) {
                    $rcCols[$rcCi]['mm'] = $rcContentW * ($rcC['w'] / $rcTotalW);
                }

                $pdf->SetDrawColor($rcBorderColor[0], $rcBorderColor[1], $rcBorderColor[2]);
                $pdf->SetLineWidth(0.2);

                // Header
                $pdf->SetFont($bodyFont, 'B', $rcFontSize);
                $pdf->SetFillColor($rcHeaderBg[0], $rcHeaderBg[1], $rcHeaderBg[2]);
                $pdf->SetTextColor($rcHeaderColor[0], $rcHeaderColor[1], $rcHeaderColor[2]);
                $headerH = $rcFontSize * 0.3528 + 3;
                $startY = $pdf->GetY();
                $startX = $mLeft;
                foreach ($rcCols as $c) {
                    $pdf->MultiCell($c['mm'], $headerH, $c['label'], 1, $c['align'], true, 0, $startX, $startY, true, 0, false, true, $headerH, 'M');
                    $startX += $c['mm'];
                }
                $pdf->SetXY($mLeft, $startY + $headerH);

                if (empty($results)) {
                    $pdf->SetFont($bodyFont, 'I', $rcFontSize);
                    $pdf->SetTextColor($bodyRgb[0], $bodyRgb[1], $bodyRgb[2]);
                    $pdf->MultiCell($rcContentW, 0, $cl['no_data'], 1, 'C', false, 1, $mLeft);
                } else {
                    $rcRowI = 0;
                    foreach ($results as $cr) {
                        $node = $cr->getNode();
                        $nodeName = $node->getName() ?: $node->getHostname() ?: $node->getIpAddress();
                        $statusKey = $cr->getStatus();
                        $sevKey = $cr->getSeverity();
                        $msg = $cr->getMessage() ?: '';

                        $cellValues = [
                            'node' => $nodeName,
                            'status' => $cl[$statusKey] ?? $statusKey,
                            'severity' => $sevKey ? ($cl['sev_' . $sevKey] ?? $sevKey) : '',
                            'message' => $msg,
                        ];
                        $rcCurrentNodeId = $node->getId();
                        foreach ($rcCols as $rcLookupCol) {
                            if (isset($rcLookupCol['invLookup'])) {
                                $cellValues[$rcLookupCol['key']] = $rcInvData[$rcCurrentNodeId][$rcLookupCol['invLookup']] ?? '';
                            }
                        }

                        $fill = $rcAlternate && ($rcRowI % 2 === 1);
                        if ($fill) {
                            $pdf->SetFillColor($rcAlternateBg[0], $rcAlternateBg[1], $rcAlternateBg[2]);
                        } else {
                            $pdf->SetFillColor(255, 255, 255);
                            $fill = true;
                        }

                        // Compute row height
                        $rowH = $rcFontSize * 0.3528 + 3;
                        $pdf->SetFont($bodyFont, '', $rcFontSize);
                        foreach ($rcCols as $c) {
                            if (!empty($c['multi'])) {
                                $h = $pdf->getStringHeight($c['mm'], (string) ($cellValues[$c['key']] ?? ''));
                                $rowH = max($rowH, $h + 2);
                            }
                        }

                        $startY = $pdf->GetY();
                        if ($startY + $rowH > $pdf->getPageHeight() - $mBottom) {
                            $pdf->AddPage();
                            $startY = $pdf->GetY();
                        }

                        $startX = $mLeft;
                        foreach ($rcCols as $c) {
                            $val = (string) ($cellValues[$c['key']] ?? '');
                            if ($c['key'] === 'status' && isset(self::COMPLIANCE_STATUS_RGB[$statusKey])) {
                                $sc = self::COMPLIANCE_STATUS_RGB[$statusKey];
                                $pdf->SetTextColor($sc[0], $sc[1], $sc[2]);
                                $pdf->SetFont($bodyFont, 'B', $rcFontSize);
                            } elseif ($c['key'] === 'severity' && $sevKey && isset(self::COMPLIANCE_SEVERITY_RGB[$sevKey])) {
                                $sc = self::COMPLIANCE_SEVERITY_RGB[$sevKey];
                                $pdf->SetTextColor($sc[0], $sc[1], $sc[2]);
                                $pdf->SetFont($bodyFont, 'B', $rcFontSize);
                            } else {
                                $pdf->SetTextColor($bodyRgb[0], $bodyRgb[1], $bodyRgb[2]);
                                $pdf->SetFont($bodyFont, '', $rcFontSize);
                            }
                            $pdf->MultiCell($c['mm'], $rowH, $val, 1, $c['align'], $fill, 0, $startX, $startY, true, 0, false, true, $rowH, 'M');
                            $startX += $c['mm'];
                        }
                        $pdf->SetXY($mLeft, $startY + $rowH);
                        $rcRowI++;
                    }
                }

                if ($pSpaceAfter > 0) {
                    $pdf->Ln($pSpaceAfter);
                }

                $prevType = $type;

            } elseif ($type === 'rule_recommendation') {
                $rcoPolicyId = $block['policyId'] ?? null;
                $rcoRuleId = $block['ruleId'] ?? null;
                $rcoNodeId = $block['nodeId'] ?? null;
                if (!$rcoRuleId || !$rcoNodeId) continue;

                $rcoPolicy = $rcoPolicyId ? $this->em->getRepository(\App\Entity\CompliancePolicy::class)->find($rcoPolicyId) : null;
                $rcoRule = $this->em->getRepository(\App\Entity\ComplianceRule::class)->find($rcoRuleId);
                $rcoNode = $this->em->getRepository(Node::class)->find($rcoNodeId);
                if (!$rcoRule || !$rcoNode) continue;

                $rcoSource = ($block['source'] ?? 'static') === 'dynamic' ? 'dynamic' : 'static';
                $rcoShowHeader = !empty($block['showHeader']);
                $rcoPageBreak = !empty($block['pageBreakBefore']);

                $rcoHostname = $rcoNode->getHostname() ?? '';
                $rcoName = $rcoNode->getName() ?? '';
                $rcoIp = $rcoNode->getIpAddress() ?? '';

                // Always evaluate the rule live to derive the recommendation type from the matched branch.
                // In dynamic source we also use the eval'd recommendation text; in static we keep the user's typed text.
                try {
                    $rcoEval = $this->complianceEvaluator->evaluateRule($rcoRule, $rcoNode);
                } catch (\Throwable $rcoErr) {
                    $rcoEval = ['recommendation' => null, 'recommendationType' => null, 'message' => 'Evaluation error: ' . $rcoErr->getMessage()];
                }
                $rcoMode = ($rcoEval['recommendationType'] ?? 'text') === 'cli' ? 'cli' : 'text';

                if ($rcoSource === 'dynamic') {
                    $rcoText = (string) ($rcoEval['recommendation'] ?? $rcoEval['message'] ?? '');
                } else {
                    $rcoText = (string) ($block['recommendation'] ?? '');
                }
                $rcoFontSize = !empty($block['fontSize']) ? (float) $block['fontSize'] : ($rcoMode === 'cli' ? 9.0 : (float) $bodySize);

                // Variable substitution
                $rcoText = strtr($rcoText, [
                    '{{hostname}}' => $rcoHostname,
                    '{{name}}' => $rcoName,
                    '{{ipAddress}}' => $rcoIp,
                ]);
                if ($report) {
                    $rcoText = $this->resolveNodeVariables($rcoText, $rcoNode, $report);
                }
                if ($rcoText === '' && $rcoSource === 'dynamic') {
                    $rcoLocale = $report ? $report->getLocale() : 'en';
                    $rcoCl = self::COMPLIANCE_LABELS[$rcoLocale] ?? self::COMPLIANCE_LABELS['en'];
                    $rcoText = $rcoCl['no_recommendation'] ?? '(no recommendation)';
                }

                if ($rcoPageBreak || $firstBlock) {
                    $pdf->SetMargins($mLeft, $mTop, $mRight);
                    $pdf->SetAutoPageBreak(true, $mBottom);
                    $pdf->AddPage();
                    $firstBlock = false;
                } else {
                    $pdf->Ln($pSpaceBefore > 0 ? $pSpaceBefore : 4);
                }

                $rcoContentW = $pdf->getPageWidth() - $mLeft - $mRight;
                $rcoRuleTitle = trim(($rcoRule->getIdentifier() ? '[' . $rcoRule->getIdentifier() . '] ' : '') . $rcoRule->getName());
                $rcoDeviceLabel = $rcoHostname ?: ($rcoName ?: $rcoIp);

                if ($rcoMode === 'text') {
                    if ($rcoShowHeader) {
                        $pdf->SetFont($bodyFont, 'B', $rcoFontSize + 1);
                        $pdf->SetTextColor($bodyRgb[0], $bodyRgb[1], $bodyRgb[2]);
                        $rcoTextHeaderLabel = $rcoRuleTitle . ' — ' . $rcoDeviceLabel;
                        $pdf->MultiCell(0, ($rcoFontSize + 1) * 0.3528 + 1, $rcoTextHeaderLabel, 0, 'L');
                        $pdf->Ln(0.5);
                    }
                    $pdf->SetFont($bodyFont, '', $rcoFontSize);
                    $pdf->SetTextColor($bodyRgb[0], $bodyRgb[1], $bodyRgb[2]);
                    $rcoTextEsc = htmlspecialchars($rcoText, ENT_QUOTES | ENT_HTML5, 'UTF-8');
                    $rcoTextEsc = nl2br($rcoTextEsc);
                    $pdf->writeHTMLCell($rcoContentW, 0, $mLeft, $pdf->GetY(), $rcoTextEsc, 0, 1, false, true, 'L', true);
                } else {
                    // CLI mode: reuse the same theme as cli_command block
                    $rcoCliStyle = $styles['cliCommand'] ?? ReportTheme::DEFAULT_STYLES['cliCommand'];
                    $rcoCliFont = $this->mapFont($rcoCliStyle['font'] ?? 'Consolas');
                    $rcoThemeFontSz = (float) ($rcoCliStyle['size'] ?? 9);
                    $rcoFontSize = !empty($block['fontSize']) ? (float) $block['fontSize'] : $rcoThemeFontSz;
                    $rcoBg = $this->hexToRgb($rcoCliStyle['bgColor'] ?? '#f1f5f9');
                    $rcoTextColor = $this->hexToRgb($rcoCliStyle['textColor'] ?? '#1e293b');
                    $rcoBorder = $this->hexToRgb($rcoCliStyle['borderColor'] ?? '#e2e8f0');
                    $rcoHeaderBg = $this->hexToRgb($rcoCliStyle['headerBgColor'] ?? '#1e293b');
                    $rcoHeaderText = $this->hexToRgb($rcoCliStyle['headerTextColor'] ?? '#ffffff');
                    $rcoBorderRadius = (float) ($rcoCliStyle['borderRadius'] ?? 2);
                    $rcoPadding = (float) ($rcoCliStyle['padding'] ?? 3);
                    $rcoLineSpacing = (float) ($rcoCliStyle['lineSpacing'] ?? 1.4);
                    $rcoHeaderFontSz = $rcoThemeFontSz;

                    $rcoLines = explode("\n", $rcoText);
                    if (empty($rcoLines)) $rcoLines = [''];
                    $rcoBaseLineH = $rcoFontSize * 0.3528;
                    $rcoLineH = $rcoBaseLineH * $rcoLineSpacing;
                    $rcoHeaderH = $rcoShowHeader ? ($rcoHeaderFontSz * 0.3528 + $rcoPadding * 2) : 0;
                    $rcoBodyH = ($rcoPadding * 2) + (count($rcoLines) * $rcoLineH);
                    $rcoTotalBoxH = $rcoHeaderH + $rcoBodyH;

                    $startY = $pdf->GetY();
                    if ($startY + $rcoTotalBoxH > $pdf->getPageHeight() - $mBottom) {
                        $pdf->AddPage();
                        $startY = $pdf->GetY();
                    }

                    // Outer box
                    $pdf->SetDrawColor($rcoBorder[0], $rcoBorder[1], $rcoBorder[2]);
                    $pdf->SetLineWidth(0.3);
                    $pdf->SetFillColor($rcoBg[0], $rcoBg[1], $rcoBg[2]);
                    if ($rcoBorderRadius > 0) {
                        $pdf->RoundedRect($mLeft, $startY, $rcoContentW, $rcoTotalBoxH, $rcoBorderRadius, '1111', 'DF');
                    } else {
                        $pdf->Rect($mLeft, $startY, $rcoContentW, $rcoTotalBoxH, 'DF');
                    }

                    // Header bar
                    if ($rcoShowHeader) {
                        $pdf->SetFillColor($rcoHeaderBg[0], $rcoHeaderBg[1], $rcoHeaderBg[2]);
                        if ($rcoBorderRadius > 0) {
                            $pdf->RoundedRect($mLeft + 0.15, $startY + 0.15, $rcoContentW - 0.3, $rcoHeaderH - 0.15, $rcoBorderRadius, '1001', 'F');
                        } else {
                            $pdf->Rect($mLeft + 0.15, $startY + 0.15, $rcoContentW - 0.3, $rcoHeaderH - 0.15, 'F');
                        }
                        $pdf->SetFont($rcoCliFont, 'B', $rcoHeaderFontSz);
                        $pdf->SetTextColor($rcoHeaderText[0], $rcoHeaderText[1], $rcoHeaderText[2]);
                        $rcoHeaderTextY = $startY + ($rcoHeaderH - $rcoHeaderFontSz * 0.3528) / 2;
                        $rcoHeaderTextW = $rcoContentW - ($rcoPadding * 2);
                        $pdf->MultiCell($rcoHeaderTextW * 0.7, $rcoHeaderFontSz * 0.3528, $rcoRuleTitle, 0, 'L', false, 0, $mLeft + $rcoPadding, $rcoHeaderTextY, true, 0, false, true, 0, 'M');
                        $pdf->SetFont($rcoCliFont, '', $rcoHeaderFontSz - 1);
                        $pdf->MultiCell($rcoHeaderTextW * 0.3, $rcoHeaderFontSz * 0.3528, $rcoDeviceLabel, 0, 'R', false, 0, $mLeft + $rcoPadding + $rcoHeaderTextW * 0.7, $rcoHeaderTextY, true, 0, false, true, 0, 'M');
                    }

                    // Body lines
                    $rcoCurY = $startY + $rcoHeaderH + $rcoPadding;
                    $rcoTextX = $mLeft + $rcoPadding;
                    $rcoTextW = $rcoContentW - ($rcoPadding * 2);
                    $pdf->SetFont($rcoCliFont, '', $rcoFontSize);
                    $pdf->SetTextColor($rcoTextColor[0], $rcoTextColor[1], $rcoTextColor[2]);
                    foreach ($rcoLines as $rcoLine) {
                        $pdf->SetXY($rcoTextX, $rcoCurY);
                        $pdf->Cell($rcoTextW, $rcoLineH, $rcoLine, 0, 0, 'L');
                        $rcoCurY += $rcoLineH;
                    }

                    $pdf->SetY($startY + $rcoTotalBoxH);
                }

                if ($pSpaceAfter > 0) {
                    $pdf->Ln($pSpaceAfter);
                }

                $prevType = 'rule_recommendation';

            } elseif ($type === 'compliance_recommendations') {
                $crPolicyIds = array_values(array_filter(array_map('intval', $block['policyIds'] ?? []), fn($x) => $x > 0));
                $crRuleIds = array_values(array_filter(array_map('intval', $block['ruleIds'] ?? []), fn($x) => $x > 0));
                $crScope = (string) ($block['scope'] ?? 'all');
                $crNodeTagIds = array_values(array_filter(array_map('intval', $block['nodeTagIds'] ?? []), fn($x) => $x > 0));
                $crNodeIds = array_values(array_filter(array_map('intval', $block['nodeIds'] ?? []), fn($x) => $x > 0));
                $crShowReco = !empty($block['showRecommendation']);
                $crPageBreak = !empty($block['pageBreakBefore']);
                $crFontSize = !empty($block['fontSize']) ? (float) $block['fontSize'] : 9.0;

                if (empty($crPolicyIds) && empty($crRuleIds)) {
                    continue;
                }

                $crLocale = $report ? $report->getLocale() : 'en';
                $crCl = self::COMPLIANCE_LABELS[$crLocale] ?? self::COMPLIANCE_LABELS['en'];

                // Build query
                $crQb = $this->em->createQueryBuilder()
                    ->select('cr', 'r', 'p', 'n')
                    ->from(\App\Entity\ComplianceResult::class, 'cr')
                    ->innerJoin('cr.rule', 'r')
                    ->innerJoin('cr.policy', 'p')
                    ->innerJoin('cr.node', 'n')
                    ->where('p.enabled = true')
                    ->andWhere('cr.status IN (:statuses)')
                    ->setParameter('statuses', ['non_compliant', 'error']);

                if (!empty($crPolicyIds)) {
                    $crQb->andWhere('p.id IN (:policyIds)')->setParameter('policyIds', $crPolicyIds);
                }
                if (!empty($crRuleIds)) {
                    $crQb->andWhere('r.id IN (:ruleIds)')->setParameter('ruleIds', $crRuleIds);
                }
                if ($crScope === 'device' && !empty($crNodeIds)) {
                    $crQb->andWhere('n.id IN (:nodeIds)')->setParameter('nodeIds', $crNodeIds);
                } elseif ($crScope === 'tag' && !empty($crNodeTagIds)) {
                    $crTagNodeIds = $this->tagResolver->getNodeIdsWithAnyTag($report->getContext(), $crNodeTagIds);
                    if (empty($crTagNodeIds)) {
                        continue;
                    }
                    $crQb->andWhere('n.id IN (:tagNodeIds)')->setParameter('tagNodeIds', $crTagNodeIds);
                } elseif ($crScope === 'device' || $crScope === 'tag') {
                    // Filter selected but empty → no results
                    continue;
                }

                /** @var \App\Entity\ComplianceResult[] $crResults */
                $crResults = $crQb->getQuery()->getResult();

                if (empty($crResults)) {
                    continue;
                }

                // Sort by severity desc (critical first), errors weighted as critical
                $crSevOrder = ['critical' => 5, 'high' => 4, 'medium' => 3, 'low' => 2, 'info' => 1];
                usort($crResults, function ($a, $b) use ($crSevOrder) {
                    $sa = $a->getStatus() === 'error' ? 5 : ($crSevOrder[$a->getSeverity() ?? 'info'] ?? 1);
                    $sb = $b->getStatus() === 'error' ? 5 : ($crSevOrder[$b->getSeverity() ?? 'info'] ?? 1);
                    if ($sa !== $sb) return $sb - $sa;
                    $na = $a->getNode()->getHostname() ?? $a->getNode()->getName() ?? $a->getNode()->getIpAddress() ?? '';
                    $nb = $b->getNode()->getHostname() ?? $b->getNode()->getName() ?? $b->getNode()->getIpAddress() ?? '';
                    return strnatcasecmp($na, $nb);
                });

                if ($crPageBreak || $firstBlock) {
                    $pdf->SetMargins($mLeft, $mTop, $mRight);
                    $pdf->SetAutoPageBreak(true, $mBottom);
                    $pdf->AddPage();
                    $firstBlock = false;
                } else {
                    $pdf->Ln($pSpaceBefore > 0 ? $pSpaceBefore : 4);
                }

                $crContentW = $pdf->getPageWidth() - $mLeft - $mRight;

                // Severity badge colors (RGB tuples)
                $crSevColors = [
                    'critical' => [239, 68, 68],
                    'high' => [249, 115, 22],
                    'medium' => [234, 179, 8],
                    'low' => [59, 130, 246],
                    'info' => [148, 163, 184],
                    'error' => [239, 68, 68],
                ];

                foreach ($crResults as $crRes) {
                    $crNode = $crRes->getNode();
                    $crRule = $crRes->getRule();
                    $crStatus = $crRes->getStatus();
                    $crSev = $crStatus === 'error' ? 'error' : ($crRes->getSeverity() ?? 'info');
                    $crColor = $crSevColors[$crSev] ?? $crSevColors['info'];
                    $crSevLabel = $crStatus === 'error' ? ($crCl['error'] ?? 'Error') : ($crCl['sev_' . $crSev] ?? $crSev);

                    $crNodeLabel = $crNode->getHostname() ?: ($crNode->getName() ?: $crNode->getIpAddress());
                    $crRuleTitle = trim(($crRule->getIdentifier() ? '[' . $crRule->getIdentifier() . '] ' : '') . $crRule->getName());
                    $crLong = (string) ($crRes->getMessageLong() ?? '');
                    if ($crLong === '') $crLong = (string) ($crRes->getMessage() ?? '');
                    $crReco = $crShowReco ? (string) ($crRes->getRecommendation() ?? '') : '';
                    $crRecoFormat = $crRes->getRecommendationType() === 'cli' ? 'cli' : 'text';

                    // Closure renders the full item from current Y; called twice when checking page fit
                    $renderCrItem = function () use (
                        &$pdf, $crColor, $crSevLabel, $crNodeLabel, $crRuleTitle, $crLong, $crReco,
                        $crShowReco, $crRecoFormat, $crFontSize, $bodyFont, $bodyRgb, $mLeft, $mBottom,
                        $crContentW, $styles
                    ) {
                        $crBoxStartY = $pdf->GetY();
                        $crBarW = 1.2;
                        $crBadgeW = 22;
                        $crBadgeH = $crFontSize * 0.3528 + 1.5;

                        $pdf->SetFillColor($crColor[0], $crColor[1], $crColor[2]);
                        $pdf->SetTextColor(255, 255, 255);
                        $pdf->SetFont($bodyFont, 'B', $crFontSize - 1);
                        $pdf->Rect($mLeft, $crBoxStartY, $crBadgeW, $crBadgeH, 'F');
                        $pdf->SetXY($mLeft, $crBoxStartY);
                        $pdf->Cell($crBadgeW, $crBadgeH, strtoupper($crSevLabel), 0, 0, 'C');

                        $pdf->SetTextColor($bodyRgb[0], $bodyRgb[1], $bodyRgb[2]);
                        $pdf->SetFont($bodyFont, 'B', $crFontSize);
                        $pdf->SetXY($mLeft + $crBadgeW + 2, $crBoxStartY);
                        $pdf->Cell($crContentW - $crBadgeW - 2, $crBadgeH, $crNodeLabel . ' — ' . $crRuleTitle, 0, 1, 'L');

                        $pdf->SetFont($bodyFont, '', $crFontSize);
                        $pdf->SetTextColor($bodyRgb[0], $bodyRgb[1], $bodyRgb[2]);
                        if ($crLong !== '') {
                            $this->writeHtmlFragment($pdf, $crLong, $crContentW, $mLeft, $pdf->GetY() + 0.5);
                        }

                        if ($crShowReco && $crReco !== '') {
                            if ($crRecoFormat === 'cli') {
                                $crCliStyle = $styles['cliCommand'] ?? ReportTheme::DEFAULT_STYLES['cliCommand'];
                                $crCliFont = $this->mapFont($crCliStyle['font'] ?? 'Consolas');
                                $crCliBg = $this->hexToRgb($crCliStyle['bgColor'] ?? '#f1f5f9');
                                $crCliText = $this->hexToRgb($crCliStyle['textColor'] ?? '#1e293b');
                                $crCliBorder = $this->hexToRgb($crCliStyle['borderColor'] ?? '#e2e8f0');
                                $crCliPadding = (float) ($crCliStyle['padding'] ?? 3);
                                $crLines = explode("\n", $crReco);
                                $crLineH = $crFontSize * 0.3528 * 1.4;
                                $crBodyH = ($crCliPadding * 2) + (count($crLines) * $crLineH);
                                $crStartY = $pdf->GetY() + 1;
                                if ($crStartY + $crBodyH > $pdf->getPageHeight() - $mBottom) {
                                    $pdf->AddPage();
                                    $crStartY = $pdf->GetY();
                                }
                                $pdf->SetDrawColor($crCliBorder[0], $crCliBorder[1], $crCliBorder[2]);
                                $pdf->SetFillColor($crCliBg[0], $crCliBg[1], $crCliBg[2]);
                                $pdf->Rect($mLeft, $crStartY, $crContentW, $crBodyH, 'DF');
                                $pdf->SetFont($crCliFont, '', $crFontSize);
                                $pdf->SetTextColor($crCliText[0], $crCliText[1], $crCliText[2]);
                                $crCurY = $crStartY + $crCliPadding;
                                foreach ($crLines as $crLine) {
                                    $pdf->SetXY($mLeft + $crCliPadding, $crCurY);
                                    $pdf->Cell($crContentW - ($crCliPadding * 2), $crLineH, $crLine, 0, 0, 'L');
                                    $crCurY += $crLineH;
                                }
                                $pdf->SetY($crStartY + $crBodyH);
                            } else {
                                $pdf->Ln(0.5);
                                $crRecoEsc = nl2br(htmlspecialchars($crReco, ENT_QUOTES, 'UTF-8'));
                                $pdf->writeHTMLCell($crContentW, 0, $mLeft, $pdf->GetY(), '<i>' . $crRecoEsc . '</i>', 0, 1, false, true, 'L', true);
                            }
                        }

                        $crBoxEndY = $pdf->GetY();
                        $pdf->SetFillColor($crColor[0], $crColor[1], $crColor[2]);
                        $pdf->Rect($mLeft - 1.8, $crBoxStartY, $crBarW, $crBoxEndY - $crBoxStartY, 'F');
                    };

                    // Dry-run via TCPDF transaction to detect cross-page rendering
                    $crStartY = $pdf->GetY();
                    $crStartPage = $pdf->getPage();
                    $pdf->startTransaction();
                    $renderCrItem();
                    $crCrossedPage = ($pdf->getPage() !== $crStartPage);
                    $pdf->rollbackTransaction(true);

                    // Force a page break if the item would cross AND we are not already at the top
                    if ($crCrossedPage && $crStartY > $mTop + 10) {
                        $pdf->AddPage();
                    }

                    $collectedPageMap['cr-' . $crRes->getId()] = $pdf->getPage();

                    $renderCrItem();

                    $pdf->Ln(2);
                }

                $prevType = 'compliance_recommendations';

            } elseif ($type === 'static_recommendations') {
                $srTitle = $this->resolveNodeVariables((string) ($block['title'] ?? ''), $forNode, $report);
                $srItems = is_array($block['items'] ?? null) ? $block['items'] : [];
                $srShowReco = !isset($block['showRecommendation']) || !empty($block['showRecommendation']);
                $srPageBreak = !empty($block['pageBreakBefore']);
                $srFontSize = !empty($block['fontSize']) ? (float) $block['fontSize'] : 9.0;

                if (empty($srItems)) {
                    continue;
                }

                $srLocale = $report ? $report->getLocale() : 'en';
                $srCl = self::COMPLIANCE_LABELS[$srLocale] ?? self::COMPLIANCE_LABELS['en'];

                if ($srPageBreak || $firstBlock) {
                    $pdf->SetMargins($mLeft, $mTop, $mRight);
                    $pdf->SetAutoPageBreak(true, $mBottom);
                    $pdf->AddPage();
                    $firstBlock = false;
                } else {
                    $pdf->Ln($pSpaceBefore > 0 ? $pSpaceBefore : 4);
                }

                $srContentW = $pdf->getPageWidth() - $mLeft - $mRight;

                if ($srTitle !== '') {
                    $srTitleFont = $this->mapFont(($headingsByLevel[1] ?? [])['font'] ?? $bodyFont);
                    $pdf->SetFont($srTitleFont, 'B', $bodySize + 1);
                    $pdf->SetTextColor($bodyRgb[0], $bodyRgb[1], $bodyRgb[2]);
                    $pdf->MultiCell(0, ($bodySize + 1) * 0.3528 + 1, $srTitle, 0, 'L');
                    $pdf->Ln(2);
                }

                $srSevColors = [
                    'critical' => [239, 68, 68],
                    'high' => [249, 115, 22],
                    'medium' => [234, 179, 8],
                    'low' => [59, 130, 246],
                    'info' => [148, 163, 184],
                ];

                $srBlockId = (string) ($block['id'] ?? '');
                foreach ($srItems as $srItem) {
                    if (!is_array($srItem)) continue;
                    $srSev = (string) ($srItem['severity'] ?? 'info');
                    if (!isset($srSevColors[$srSev])) $srSev = 'info';
                    $srColor = $srSevColors[$srSev];
                    $srSevLabel = $srCl['sev_' . $srSev] ?? $srSev;

                    $srShort = $this->resolveNodeVariables((string) ($srItem['shortDescription'] ?? ''), $forNode, $report);
                    $srLong = $this->resolveNodeVariables((string) ($srItem['longDescription'] ?? ''), $forNode, $report);
                    $srReco = $this->resolveNodeVariables((string) ($srItem['recommendation'] ?? ''), $forNode, $report);
                    $srRecoFormat = ($srItem['recommendationFormat'] ?? 'text') === 'cli' ? 'cli' : 'text';
                    $srItemId = (string) ($srItem['id'] ?? '');

                    // Closure renders the full item from current Y; called twice when checking page fit
                    $renderSrItem = function () use (
                        &$pdf, $srColor, $srSevLabel, $srShort, $srLong, $srReco, $srRecoFormat,
                        $srShowReco, $srFontSize, $bodyFont, $bodyRgb, $mLeft, $mBottom, $srContentW, $styles
                    ) {
                        $srBoxStartY = $pdf->GetY();
                        $srBarW = 1.2;
                        $srBadgeW = 22;
                        $srBadgeH = $srFontSize * 0.3528 + 1.5;

                        $pdf->SetFillColor($srColor[0], $srColor[1], $srColor[2]);
                        $pdf->SetTextColor(255, 255, 255);
                        $pdf->SetFont($bodyFont, 'B', $srFontSize - 1);
                        $pdf->Rect($mLeft, $srBoxStartY, $srBadgeW, $srBadgeH, 'F');
                        $pdf->SetXY($mLeft, $srBoxStartY);
                        $pdf->Cell($srBadgeW, $srBadgeH, strtoupper($srSevLabel), 0, 0, 'C');

                        $pdf->SetTextColor($bodyRgb[0], $bodyRgb[1], $bodyRgb[2]);
                        $pdf->SetFont($bodyFont, 'B', $srFontSize);
                        $pdf->SetXY($mLeft + $srBadgeW + 2, $srBoxStartY);
                        $pdf->Cell($srContentW - $srBadgeW - 2, $srBadgeH, $srShort, 0, 1, 'L');

                        $pdf->SetFont($bodyFont, '', $srFontSize);
                        $pdf->SetTextColor($bodyRgb[0], $bodyRgb[1], $bodyRgb[2]);
                        if ($srLong !== '') {
                            $this->writeHtmlFragment($pdf, $srLong, $srContentW, $mLeft, $pdf->GetY() + 0.5);
                        }

                        if ($srShowReco && $srReco !== '') {
                            if ($srRecoFormat === 'cli') {
                                $srCliStyle = $styles['cliCommand'] ?? ReportTheme::DEFAULT_STYLES['cliCommand'];
                                $srCliFont = $this->mapFont($srCliStyle['font'] ?? 'Consolas');
                                $srCliBg = $this->hexToRgb($srCliStyle['bgColor'] ?? '#f1f5f9');
                                $srCliText = $this->hexToRgb($srCliStyle['textColor'] ?? '#1e293b');
                                $srCliBorder = $this->hexToRgb($srCliStyle['borderColor'] ?? '#e2e8f0');
                                $srCliPadding = (float) ($srCliStyle['padding'] ?? 3);
                                $srLines = explode("\n", $srReco);
                                $srLineH = $srFontSize * 0.3528 * 1.4;
                                $srBodyH = ($srCliPadding * 2) + (count($srLines) * $srLineH);
                                $srStartY = $pdf->GetY() + 1;
                                if ($srStartY + $srBodyH > $pdf->getPageHeight() - $mBottom) {
                                    $pdf->AddPage();
                                    $srStartY = $pdf->GetY();
                                }
                                $pdf->SetDrawColor($srCliBorder[0], $srCliBorder[1], $srCliBorder[2]);
                                $pdf->SetFillColor($srCliBg[0], $srCliBg[1], $srCliBg[2]);
                                $pdf->Rect($mLeft, $srStartY, $srContentW, $srBodyH, 'DF');
                                $pdf->SetFont($srCliFont, '', $srFontSize);
                                $pdf->SetTextColor($srCliText[0], $srCliText[1], $srCliText[2]);
                                $srCurY = $srStartY + $srCliPadding;
                                foreach ($srLines as $srLine) {
                                    $pdf->SetXY($mLeft + $srCliPadding, $srCurY);
                                    $pdf->Cell($srContentW - ($srCliPadding * 2), $srLineH, $srLine, 0, 0, 'L');
                                    $srCurY += $srLineH;
                                }
                                $pdf->SetY($srStartY + $srBodyH);
                            } else {
                                $pdf->Ln(0.5);
                                $srRecoEsc = nl2br(htmlspecialchars($srReco, ENT_QUOTES, 'UTF-8'));
                                $pdf->writeHTMLCell($srContentW, 0, $mLeft, $pdf->GetY(), '<i>' . $srRecoEsc . '</i>', 0, 1, false, true, 'L', true);
                            }
                        }

                        $srBoxEndY = $pdf->GetY();
                        $pdf->SetFillColor($srColor[0], $srColor[1], $srColor[2]);
                        $pdf->Rect($mLeft - 1.8, $srBoxStartY, $srBarW, $srBoxEndY - $srBoxStartY, 'F');
                    };

                    // Dry-run via TCPDF transaction to detect cross-page rendering
                    $srStartY = $pdf->GetY();
                    $srStartPage = $pdf->getPage();
                    $pdf->startTransaction();
                    $renderSrItem();
                    $srCrossedPage = ($pdf->getPage() !== $srStartPage);
                    $pdf->rollbackTransaction(true);

                    // Force a page break if the item would cross AND we are not already at the top
                    if ($srCrossedPage && $srStartY > $mTop + 10) {
                        $pdf->AddPage();
                    }

                    if ($srItemId !== '') {
                        $collectedPageMap['sr-' . $srBlockId . '-' . $srItemId] = $pdf->getPage();
                    }

                    $renderSrItem();

                    $pdf->Ln(2);
                }

                $prevType = 'static_recommendations';

            } elseif ($type === 'recommendation_summary') {
                $rsTitle = $this->resolveNodeVariables((string) ($block['title'] ?? ''), $forNode, $report);
                $rsSeverityFilter = is_array($block['severityFilter'] ?? null) ? $block['severityFilter'] : ['critical', 'high', 'medium', 'low', 'info'];
                $rsShowPage = !isset($block['showPageNumber']) || !empty($block['showPageNumber']);
                $rsDescMode = (string) ($block['descriptionMode'] ?? 'none');
                if (!in_array($rsDescMode, ['none', 'short', 'long'], true)) $rsDescMode = 'none';
                $rsPageBreak = !empty($block['pageBreakBefore']);
                $rsFontSize = !empty($block['fontSize']) ? (float) $block['fontSize'] : 9.0;

                $rsLocale = $report ? $report->getLocale() : 'en';
                $rsCl = self::COMPLIANCE_LABELS[$rsLocale] ?? self::COMPLIANCE_LABELS['en'];

                // Severity colors (mirror compliance_recommendations)
                $rsSevColors = [
                    'critical' => [239, 68, 68],
                    'high' => [249, 115, 22],
                    'medium' => [234, 179, 8],
                    'low' => [59, 130, 246],
                    'info' => [148, 163, 184],
                ];
                $rsSevOrder = ['critical' => 5, 'high' => 4, 'medium' => 3, 'low' => 2, 'info' => 1];

                // Walk all blocks of the document to collect recommendation items.
                // Use the *root* document tree (not the local $blocks scope) and
                // recurse into containers, so recommendation sources nested
                // inside a conditional or a two_column are also considered. We
                // honor conditional evaluation: items from a false-conditional
                // branch were not rendered, so they are absent from
                // $summaryPageMap and must not appear in the summary.
                $rsItems = [];
                $rsInsertion = 0;
                $rsSourceBlocks = $report
                    ? $this->collectRecommendationSources($report->getBlocks(), $forNode, $report)
                    : $blocks;
                foreach ($rsSourceBlocks as $rsBlock) {
                    $rsBlockType = $rsBlock['type'] ?? '';
                    if ($rsBlockType === 'compliance_recommendations') {
                        $rsPolicyIds = array_values(array_filter(array_map('intval', $rsBlock['policyIds'] ?? []), fn($x) => $x > 0));
                        $rsRuleIds = array_values(array_filter(array_map('intval', $rsBlock['ruleIds'] ?? []), fn($x) => $x > 0));
                        $rsScope = (string) ($rsBlock['scope'] ?? 'all');
                        $rsNodeTagIds = array_values(array_filter(array_map('intval', $rsBlock['nodeTagIds'] ?? []), fn($x) => $x > 0));
                        $rsNodeIdsSel = array_values(array_filter(array_map('intval', $rsBlock['nodeIds'] ?? []), fn($x) => $x > 0));
                        if (empty($rsPolicyIds) && empty($rsRuleIds)) continue;
                        $rsQb = $this->em->createQueryBuilder()
                            ->select('cr', 'r', 'p', 'n')
                            ->from(\App\Entity\ComplianceResult::class, 'cr')
                            ->innerJoin('cr.rule', 'r')
                            ->innerJoin('cr.policy', 'p')
                            ->innerJoin('cr.node', 'n')
                            ->where('p.enabled = true')
                            ->andWhere('cr.status IN (:statuses)')
                            ->setParameter('statuses', ['non_compliant', 'error']);
                        if (!empty($rsPolicyIds)) $rsQb->andWhere('p.id IN (:policyIds)')->setParameter('policyIds', $rsPolicyIds);
                        if (!empty($rsRuleIds)) $rsQb->andWhere('r.id IN (:ruleIds)')->setParameter('ruleIds', $rsRuleIds);
                        if ($rsScope === 'device' && !empty($rsNodeIdsSel)) {
                            $rsQb->andWhere('n.id IN (:nodeIds)')->setParameter('nodeIds', $rsNodeIdsSel);
                        } elseif ($rsScope === 'tag' && !empty($rsNodeTagIds)) {
                            $rsTagNodeIds = $report?->getContext()
                                ? $this->tagResolver->getNodeIdsWithAnyTag($report->getContext(), $rsNodeTagIds)
                                : [];
                            if (empty($rsTagNodeIds)) {
                                continue;
                            }
                            $rsQb->andWhere('n.id IN (:tagNodeIds)')->setParameter('tagNodeIds', $rsTagNodeIds);
                        } elseif ($rsScope === 'device' || $rsScope === 'tag') {
                            continue;
                        }
                        $rsResults = $rsQb->getQuery()->getResult();
                        foreach ($rsResults as $rsRes) {
                            $rsStatus = $rsRes->getStatus();
                            $rsSev = $rsStatus === 'error' ? 'critical' : ($rsRes->getSeverity() ?? 'info');
                            if (!in_array($rsSev, $rsSeverityFilter, true)) continue;
                            $rsRule = $rsRes->getRule();
                            $rsNode = $rsRes->getNode();
                            $rsNodeLabel = $rsNode->getHostname() ?: ($rsNode->getName() ?: $rsNode->getIpAddress());
                            $rsRuleTitle = trim(($rsRule->getIdentifier() ? '[' . $rsRule->getIdentifier() . '] ' : '') . $rsRule->getName());
                            $rsMsg = (string) ($rsRes->getMessage() ?? '');
                            $rsMsgLong = (string) ($rsRes->getMessageLong() ?? '');
                            if ($rsMsgLong === '') $rsMsgLong = $rsMsg;
                            $rsItems[] = [
                                'severity' => $rsSev,
                                'title' => $rsNodeLabel . ' — ' . $rsRuleTitle,
                                'descShort' => $rsMsg,
                                'descLong' => $rsMsgLong,
                                'pageId' => 'cr-' . $rsRes->getId(),
                                'order' => $rsInsertion++,
                            ];
                        }
                    } elseif ($rsBlockType === 'static_recommendations') {
                        $rsBlockIdLocal = (string) ($rsBlock['id'] ?? '');
                        foreach (($rsBlock['items'] ?? []) as $rsItem) {
                            if (!is_array($rsItem)) continue;
                            $rsSev = (string) ($rsItem['severity'] ?? 'info');
                            if (!isset($rsSevColors[$rsSev])) $rsSev = 'info';
                            if (!in_array($rsSev, $rsSeverityFilter, true)) continue;
                            $rsItemIdLocal = (string) ($rsItem['id'] ?? '');
                            $rsShortRaw = $this->resolveNodeVariables((string) ($rsItem['shortDescription'] ?? ''), $forNode, $report);
                            if ($rsShortRaw === '') $rsShortRaw = '—';
                            $rsLongRaw = $this->resolveNodeVariables((string) ($rsItem['longDescription'] ?? ''), $forNode, $report);
                            $rsItems[] = [
                                'severity' => $rsSev,
                                'title' => $rsShortRaw,
                                'descShort' => '',
                                'descLong' => $rsLongRaw,
                                'pageId' => 'sr-' . $rsBlockIdLocal . '-' . $rsItemIdLocal,
                                'order' => $rsInsertion++,
                            ];
                        }
                    }
                }

                if (empty($rsItems)) {
                    continue;
                }

                // Sort by severity desc, then by document insertion order
                usort($rsItems, function ($a, $b) use ($rsSevOrder) {
                    $sa = $rsSevOrder[$a['severity']] ?? 0;
                    $sb = $rsSevOrder[$b['severity']] ?? 0;
                    if ($sa !== $sb) return $sb - $sa;
                    return $a['order'] - $b['order'];
                });

                if ($rsPageBreak || $firstBlock) {
                    $pdf->SetMargins($mLeft, $mTop, $mRight);
                    $pdf->SetAutoPageBreak(true, $mBottom);
                    $pdf->AddPage();
                    $firstBlock = false;
                } else {
                    $pdf->Ln($pSpaceBefore > 0 ? $pSpaceBefore : 4);
                }

                $rsContentW = $pdf->getPageWidth() - $mLeft - $mRight;

                if ($rsTitle !== '') {
                    $rsTitleFont = $this->mapFont(($headingsByLevel[1] ?? [])['font'] ?? $bodyFont);
                    $pdf->SetFont($rsTitleFont, 'B', $bodySize + 1);
                    $pdf->SetTextColor($bodyRgb[0], $bodyRgb[1], $bodyRgb[2]);
                    $pdf->MultiCell(0, ($bodySize + 1) * 0.3528 + 1, $rsTitle, 0, 'L');
                    $pdf->Ln(2);
                }

                $rsBadgeW = 22;
                $rsPageColW = $rsShowPage ? 14 : 0;
                $rsGap = 2;
                $rsTextColW = $rsContentW - $rsBadgeW - $rsGap - ($rsShowPage ? ($rsGap + $rsPageColW) : 0);
                $rsLineH = $rsFontSize * 0.3528 + 1.5;

                foreach ($rsItems as $rsItem) {
                    $rsSev = $rsItem['severity'];
                    $rsColor = $rsSevColors[$rsSev] ?? $rsSevColors['info'];
                    $rsSevLabel = $rsCl['sev_' . $rsSev] ?? $rsSev;
                    $rsItemTitle = (string) $rsItem['title'];
                    $rsDescHtml = '';
                    if ($rsDescMode === 'short') {
                        $rsDescHtml = (string) ($rsItem['descShort'] ?? '');
                    } elseif ($rsDescMode === 'long') {
                        $rsDescHtml = (string) ($rsItem['descLong'] ?? '');
                    }
                    $rsHasDesc = trim(strip_tags($rsDescHtml)) !== '';
                    $rsPageNum = $summaryPageMap[$rsItem['pageId']] ?? null;
                    $rsPageStr = $rsShowPage ? ($rsPageNum !== null ? (string) $rsPageNum : '—') : '';

                    // Closure renders the full row from current Y; called twice when checking page fit
                    $renderRsRow = function () use (
                        &$pdf, $rsColor, $rsSevLabel, $rsItemTitle, $rsDescHtml, $rsHasDesc, $rsPageStr,
                        $rsShowPage, $rsFontSize, $rsLineH, $rsBadgeW, $rsTextColW, $rsPageColW, $rsGap,
                        $bodyFont, $bodyRgb, $mLeft
                    ) {
                        $rsRowStartY = $pdf->GetY();
                        $rsStartPage = $pdf->getPage();

                        $pdf->SetFillColor($rsColor[0], $rsColor[1], $rsColor[2]);
                        $pdf->SetTextColor(255, 255, 255);
                        $pdf->SetFont($bodyFont, 'B', $rsFontSize - 1);
                        $pdf->Rect($mLeft, $rsRowStartY, $rsBadgeW, $rsLineH, 'F');
                        $pdf->SetXY($mLeft, $rsRowStartY);
                        $pdf->Cell($rsBadgeW, $rsLineH, strtoupper($rsSevLabel), 0, 0, 'C');

                        $rsTitleStyle = $rsHasDesc ? 'B' : '';
                        $pdf->SetTextColor($bodyRgb[0], $bodyRgb[1], $bodyRgb[2]);
                        $pdf->SetFont($bodyFont, $rsTitleStyle, $rsFontSize);
                        $pdf->SetXY($mLeft + $rsBadgeW + $rsGap, $rsRowStartY);
                        $pdf->Cell($rsTextColW, $rsLineH, $rsItemTitle, 0, 0, 'L');

                        if ($rsShowPage) {
                            $pdf->SetXY($mLeft + $rsBadgeW + $rsGap + $rsTextColW + $rsGap, $rsRowStartY);
                            $pdf->SetFont($bodyFont, 'B', $rsFontSize);
                            $pdf->SetTextColor(100, 116, 139);
                            $pdf->Cell($rsPageColW, $rsLineH, $rsPageStr, 0, 0, 'R');
                        }

                        $pdf->SetY($rsRowStartY + $rsLineH);

                        if ($rsHasDesc) {
                            $pdf->SetFont($bodyFont, '', $rsFontSize - 0.5);
                            $pdf->SetTextColor(71, 85, 105);
                            $this->writeHtmlFragment($pdf, $rsDescHtml, $rsTextColW, $mLeft + $rsBadgeW + $rsGap, $pdf->GetY());
                        }

                        $rsRowEndY = $pdf->GetY();
                        $rsEndPage = $pdf->getPage();

                        if ($rsEndPage === $rsStartPage) {
                            $pdf->SetFillColor($rsColor[0], $rsColor[1], $rsColor[2]);
                            $pdf->Rect($mLeft - 1.8, $rsRowStartY, 1.2, $rsRowEndY - $rsRowStartY, 'F');
                        }
                    };

                    // Dry-run via TCPDF transaction to detect cross-page rendering
                    $rsItemStartY = $pdf->GetY();
                    $rsItemStartPage = $pdf->getPage();
                    $pdf->startTransaction();
                    $renderRsRow();
                    $rsItemCrossedPage = ($pdf->getPage() !== $rsItemStartPage);
                    $pdf->rollbackTransaction(true);

                    if ($rsItemCrossedPage && $rsItemStartY > $mTop + 10) {
                        $pdf->AddPage();
                    }

                    $renderRsRow();

                    $pdf->Ln(1);
                }

                $prevType = 'recommendation_summary';

            } elseif ($type === 'chart_static') {
                $chKind = (string) ($block['chartKind'] ?? 'bar');
                $chTitle = (string) ($block['title'] ?? '');
                [$chW, $chH] = $this->resolveChartDimensions($pdf, $block, $mLeft, $mRight, $mTop, $mBottom);
                $chShowLegend = !empty($block['showLegend']);
                $chShowValues = !empty($block['showValues']);
                $chShowAxes = !empty($block['showAxes']);
                $chLabels = array_values(array_map(fn($v) => (string) $v, $block['labels'] ?? []));
                $chSeries = $block['series'] ?? [];

                // Pie / Treemap: each label is a slice. Transform [N labels, 1 series with N data]
                // into [['Total'], N series each with 1 data point], using the per-slice color.
                if (($chKind === 'pie' || $chKind === 'treemap') && count($chSeries) === 1 && count($chLabels) > 0) {
                    $chPalette = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#a855f7', '#84cc16', '#f97316', '#ec4899', '#14b8a6'];
                    $chSliceColors = $block['sliceColors'] ?? [];
                    $chSourceData = $chSeries[0]['data'] ?? [];
                    $chPieSeries = [];
                    foreach ($chLabels as $chPi => $chLbl) {
                        $chPieSeries[] = [
                            'name' => $chLbl,
                            'color' => $chSliceColors[$chPi] ?? $chPalette[$chPi % count($chPalette)],
                            'data' => [(float) ($chSourceData[$chPi] ?? 0)],
                        ];
                    }
                    $chLabels = ['Total'];
                    $chSeries = $chPieSeries;
                }

                if (!empty($block['pageBreakBefore']) || $firstBlock) {
                    $pdf->SetMargins($mLeft, $mTop, $mRight);
                    $pdf->SetAutoPageBreak(true, $mBottom);
                    $pdf->AddPage();
                    $firstBlock = false;
                } else {
                    $pdf->Ln($pSpaceBefore > 0 ? $pSpaceBefore : 4);
                }

                $chOrientation = ($block['orientation'] ?? 'vertical') === 'horizontal' ? 'horizontal' : 'vertical';
                $chColorRules = $block['colorRules'] ?? [];
                $chSort = $block['sort'] ?? null;
                $this->applyChartSort($chLabels, $chSeries, $chSort);
                $this->renderChartArea(
                    $pdf, $chKind, $chTitle, $chLabels, $chSeries,
                    $chW, $chH, $chShowLegend, $chShowValues, $chShowAxes,
                    $mLeft, $mRight, $mBottom, $bodyFont, $bodyRgb, $chOrientation, $chColorRules
                );

                if ($pSpaceAfter > 0) {
                    $pdf->Ln($pSpaceAfter);
                }
                $prevType = 'chart_static';

            } elseif ($type === 'chart_inventory') {
                $chKind = (string) ($block['chartKind'] ?? 'pie');
                $chTitle = (string) ($block['title'] ?? '');
                [$chW, $chH] = $this->resolveChartDimensions($pdf, $block, $mLeft, $mRight, $mTop, $mBottom);
                $chShowLegend = !empty($block['showLegend']);
                $chShowValues = !empty($block['showValues']);
                $chShowAxes = !empty($block['showAxes']);
                $chPrimary = $block['primary'] ?? null;
                $chSecondary = $block['secondary'] ?? null;

                $chNodes = $this->resolveChartNodes($block, $forNode, $report);
                if (empty($chNodes) || !$chPrimary) {
                    continue;
                }

                [$chLabels, $chSeries] = $this->aggregateChartData($chNodes, $chPrimary, $chSecondary, $chKind, $block['metric'] ?? null);
                if (empty($chLabels) || empty($chSeries)) {
                    continue;
                }

                if (!empty($block['pageBreakBefore']) || $firstBlock) {
                    $pdf->SetMargins($mLeft, $mTop, $mRight);
                    $pdf->SetAutoPageBreak(true, $mBottom);
                    $pdf->AddPage();
                    $firstBlock = false;
                } else {
                    $pdf->Ln($pSpaceBefore > 0 ? $pSpaceBefore : 4);
                }

                $chOrientation = ($block['orientation'] ?? 'vertical') === 'horizontal' ? 'horizontal' : 'vertical';
                $chColorRules = $block['colorRules'] ?? [];
                $chSort = $block['sort'] ?? null;
                $this->applyChartSort($chLabels, $chSeries, $chSort);
                $this->renderChartArea(
                    $pdf, $chKind, $chTitle, $chLabels, $chSeries,
                    $chW, $chH, $chShowLegend, $chShowValues, $chShowAxes,
                    $mLeft, $mRight, $mBottom, $bodyFont, $bodyRgb, $chOrientation, $chColorRules
                );

                if ($pSpaceAfter > 0) {
                    $pdf->Ln($pSpaceAfter);
                }
                $prevType = 'chart_inventory';

            } elseif ($type === 'timeline') {
                $tlMode = ($block['mode'] ?? 'product_range') === 'node' ? 'node' : 'product_range';
                $tlShowRelease = !empty($block['showRelease']);
                $tlShowEoS = !empty($block['showEndOfSale']);
                $tlShowEoSp = !empty($block['showEndOfSupport']);
                $tlShowEoL = !empty($block['showEndOfLife']);
                $tlShowNow = !empty($block['showNow']);
                $tlShowLegend = !empty($block['showLegend']);
                $tlBarH = (float) ($block['height'] ?? 6);
                $tlRowSpacing = (float) ($block['rowSpacing'] ?? 24);

                $tlEntries = [];
                if ($tlMode === 'node') {
                    $tlNodes = [];
                    if ($forNode) {
                        $tlNodes = [$forNode];
                    } else {
                        $tlNodeIds = $block['nodeIds'] ?? [];
                        foreach ($tlNodeIds as $tlNid) {
                            $tlN = $this->em->getRepository(Node::class)->find((int) $tlNid);
                            if ($tlN) $tlNodes[] = $tlN;
                        }
                    }
                    foreach ($tlNodes as $tlN) {
                        $tlPr = $this->lifecycleCalculator->findProductRange($tlN);
                        if ($tlPr) {
                            $tlLabel = $tlN->getHostname() ?: $tlN->getName() ?: $tlN->getIpAddress();
                            $tlEntries[] = ['label' => $tlLabel, 'subLabel' => $tlPr->getName(), 'range' => $tlPr];
                        }
                    }
                } else {
                    $tlAllRanges = !empty($block['allProductRanges']);
                    $tlPrList = [];
                    if ($tlAllRanges) {
                        $tlCtx = $report?->getContext();
                        if ($tlCtx) {
                            // Collect product ranges actually in use by nodes of the context.
                            // The ProductRange table is shared per-context but may include
                            // entries no node references — those would clutter the timeline.
                            $tlNodesCtx = $this->em->getRepository(Node::class)->findBy(['context' => $tlCtx]);
                            $tlSeen = [];
                            foreach ($tlNodesCtx as $tlNc) {
                                $tlPr = $this->lifecycleCalculator->findProductRange($tlNc);
                                if ($tlPr && !isset($tlSeen[$tlPr->getId()])) {
                                    $tlSeen[$tlPr->getId()] = $tlPr;
                                }
                            }
                            $tlPrList = array_values($tlSeen);
                            usort($tlPrList, fn($a, $b) => strcasecmp((string) $a->getName(), (string) $b->getName()));
                        }
                    } else {
                        foreach (($block['productRangeIds'] ?? []) as $tlPid) {
                            $tlPr = $this->em->getRepository(\App\Entity\ProductRange::class)->find((int) $tlPid);
                            if ($tlPr) $tlPrList[] = $tlPr;
                        }
                    }
                    foreach ($tlPrList as $tlPr) {
                        $tlEntries[] = ['label' => $tlPr->getName(), 'subLabel' => $tlPr->getManufacturer()?->getName() ?? '', 'range' => $tlPr];
                    }
                }

                if (empty($tlEntries)) {
                    continue;
                }

                if (!empty($block['pageBreakBefore']) || $firstBlock) {
                    $pdf->SetMargins($mLeft, $mTop, $mRight);
                    $pdf->SetAutoPageBreak(true, $mBottom);
                    $pdf->AddPage();
                    $firstBlock = false;
                } else {
                    $pdf->Ln($pSpaceBefore > 0 ? $pSpaceBefore : 4);
                }

                $this->renderTimelineArea(
                    $pdf, $tlEntries,
                    $tlShowRelease, $tlShowEoS, $tlShowEoSp, $tlShowEoL, $tlShowNow, $tlShowLegend,
                    $tlBarH, $tlRowSpacing,
                    $mLeft, $mRight, $mBottom, $bodyFont, $bodyRgb
                );

                if ($pSpaceAfter > 0) {
                    $pdf->Ln($pSpaceAfter);
                }
                $prevType = 'timeline';

            } elseif ($type === 'comparison_summary') {
                $cmpNode1Id = (int) ($block['node1Id'] ?? 0);
                $cmpNode2Id = (int) ($block['node2Id'] ?? 0);
                $cmpComparisons = $block['comparisons'] ?? [];
                $cmpShowHeader = !empty($block['showHeader']);
                $cmpFontSize = !empty($block['fontSize']) ? (int) $block['fontSize'] : (!empty($styles['table']['fontSize']) ? (int) $styles['table']['fontSize'] : $bodySize);

                if (!$cmpNode1Id || !$cmpNode2Id || empty($cmpComparisons)) {
                    continue;
                }
                $cmpNode1 = $this->em->getRepository(Node::class)->find($cmpNode1Id);
                $cmpNode2 = $this->em->getRepository(Node::class)->find($cmpNode2Id);
                if (!$cmpNode1 || !$cmpNode2) {
                    continue;
                }

                if ($firstBlock) {
                    $pdf->SetMargins($mLeft, $mTop, $mRight);
                    $pdf->SetAutoPageBreak(true, $mBottom);
                    $pdf->AddPage();
                    $firstBlock = false;
                } else {
                    $pdf->Ln($pSpaceBefore > 0 ? $pSpaceBefore : 4);
                }

                $tableStyle = $styles['table'] ?? ReportTheme::DEFAULT_STYLES['table'];
                $headerBg = $this->hexToRgb($tableStyle['headerBg'] ?? '#1e293b');
                $headerColor = $this->hexToRgb($tableStyle['headerColor'] ?? '#ffffff');
                $borderColor = $this->hexToRgb($tableStyle['borderColor'] ?? '#e2e8f0');
                $alternateRows = $tableStyle['alternateRows'] ?? true;
                $alternateBg = $this->hexToRgb($tableStyle['alternateBg'] ?? '#f8fafc');

                $cmpNode1Label = (string) ($block['node1Label'] ?? '');
                if ($cmpNode1Label === '') {
                    $cmpNode1Label = $cmpNode1->getHostname() ?: $cmpNode1->getName() ?: $cmpNode1->getIpAddress();
                }
                $cmpNode2Label = (string) ($block['node2Label'] ?? '');
                if ($cmpNode2Label === '') {
                    $cmpNode2Label = $cmpNode2->getHostname() ?: $cmpNode2->getName() ?: $cmpNode2->getIpAddress();
                }
                $cmpLocale = $report ? $report->getLocale() : 'fr';
                $cmpTrans = self::PDF_TRANSLATIONS[$cmpLocale] ?? self::PDF_TRANSLATIONS['en'];
                $cmpTitleHeader = (string) ($block['titleHeader'] ?? '');
                if ($cmpTitleHeader === '') $cmpTitleHeader = $cmpTrans['comparison_title'] ?? 'Comparison';
                $cmpCommonHeader = (string) ($block['commonHeader'] ?? '');
                if ($cmpCommonHeader === '') $cmpCommonHeader = $cmpTrans['comparison_common'] ?? 'Common';

                // 4 columns: title | N1 (+/-) | common | N2 (+/-)
                $headers = [$cmpTitleHeader, $cmpNode1Label, $cmpCommonHeader, $cmpNode2Label];
                $cmpRows = [];

                $invRepo = $this->em->getRepository(NodeInventoryEntry::class);

                foreach ($cmpComparisons as $cmp) {
                    $cmpTitle = (string) ($cmp['title'] ?? '');
                    $cmpCat = (string) ($cmp['categoryName'] ?? '');
                    $matchCols = $cmp['matchColumns'] ?? [];
                    if (!is_array($matchCols)) $matchCols = [];
                    if ($cmpCat === '') {
                        $cmpRows[] = [$cmpTitle, 0, 0, 0, 0, 0];
                        continue;
                    }

                    // Identity tuple per entryKey: (key, ...matchColumns values)
                    $loadIdentity = function (Node $n) use ($invRepo, $cmpCat, $matchCols): array {
                        $entries = $invRepo->createQueryBuilder('e')
                            ->where('e.node = :n')
                            ->andWhere('e.categoryName = :cat')
                            ->setParameter('n', $n)
                            ->setParameter('cat', $cmpCat)
                            ->getQuery()
                            ->getResult();
                        $byKey = [];
                        foreach ($entries as $e) {
                            $k = $e->getEntryKey() ?? '';
                            $cl = $e->getColLabel() ?? '';
                            if (!isset($byKey[$k])) $byKey[$k] = [];
                            $byKey[$k][mb_strtolower($cl)] = $e->getValue() ?? '';
                        }
                        $tuples = [];
                        foreach ($byKey as $k => $cols) {
                            $parts = [$k];
                            foreach ($matchCols as $mc) {
                                $parts[] = $cols[mb_strtolower((string) $mc)] ?? '';
                            }
                            $tuples[$k] = implode("\x1f", $parts);
                        }
                        return $tuples;
                    };

                    $t1 = $loadIdentity($cmpNode1);
                    $t2 = $loadIdentity($cmpNode2);

                    // onlyN1: keys only in N1 (truly extra in N1, missing in N2)
                    // onlyN2: keys only in N2 (truly extra in N2, missing in N1)
                    // mismatch: keys present in both but identity tuples differ — counts as missing on both sides
                    $onlyN1 = 0; $onlyN2 = 0; $mismatch = 0; $common = 0;
                    foreach ($t1 as $k => $tup1) {
                        if (!isset($t2[$k])) {
                            $onlyN1++;
                        } elseif ($t2[$k] === $tup1) {
                            $common++;
                        } else {
                            $mismatch++;
                        }
                    }
                    foreach ($t2 as $k => $tup2) {
                        if (!isset($t1[$k])) {
                            $onlyN2++;
                        }
                    }

                    // N1 cell: + = onlyN1, - = onlyN2 + mismatch
                    // N2 cell: + = onlyN2, - = onlyN1 + mismatch
                    $cmpRows[] = [
                        $cmpTitle,
                        $onlyN1, $onlyN2 + $mismatch,
                        $common,
                        $onlyN2, $onlyN1 + $mismatch,
                    ];
                }

                $pageW = $pdf->getPageWidth();
                $contentW = $pageW - $mLeft - $mRight;
                $minLineH = $cmpFontSize * 0.3528 + 3;
                $cellPadding = 6;
                $colCountCmp = 4;

                // Plain text used for width measurement (HTML rendered on actual draw)
                // Row layout: [title, n1Plus, n1Minus, common, n2Plus, n2Minus]
                $cellPlain = function (int $colIdx, array $row) {
                    if ($colIdx === 0) return (string) $row[0];
                    if ($colIdx === 2) return (string) $row[3];
                    $pos = $colIdx === 1 ? (int) $row[1] : (int) $row[4];
                    $neg = $colIdx === 1 ? (int) $row[2] : (int) $row[5];
                    if ($pos === 0 && $neg === 0) return '-';
                    $parts = [];
                    if ($pos > 0) $parts[] = '+' . $pos;
                    if ($neg > 0) $parts[] = '-' . $neg;
                    return implode(' / ', $parts);
                };

                $maxWidths = array_fill(0, $colCountCmp, 0);
                $pdf->SetFont($bodyFont, 'B', $cmpFontSize);
                foreach ($headers as $hi => $h) {
                    $maxWidths[$hi] = max($maxWidths[$hi], $pdf->GetStringWidth($h) + $cellPadding);
                }
                $pdf->SetFont($bodyFont, '', $cmpFontSize);
                foreach ($cmpRows as $row) {
                    for ($c = 0; $c < $colCountCmp; $c++) {
                        $text = $cellPlain($c, $row);
                        $maxWidths[$c] = max($maxWidths[$c], $pdf->GetStringWidth($text) + $cellPadding);
                    }
                }
                $totalNatural = array_sum($maxWidths);
                $colWidthsCmp = [];
                if ($totalNatural < $contentW) {
                    $extra = $contentW - $totalNatural;
                    $colWidthsCmp[0] = $maxWidths[0] + $extra;
                    for ($c = 1; $c < $colCountCmp; $c++) $colWidthsCmp[$c] = $maxWidths[$c];
                } else {
                    $scale = $contentW / max($totalNatural, 0.01);
                    foreach ($maxWidths as $w) $colWidthsCmp[] = $w * $scale;
                }

                $pdf->SetDrawColor($borderColor[0], $borderColor[1], $borderColor[2]);
                $pdf->SetLineWidth(0.2);

                if ($cmpShowHeader) {
                    $pdf->SetFillColor($headerBg[0], $headerBg[1], $headerBg[2]);
                    $pdf->SetTextColor($headerColor[0], $headerColor[1], $headerColor[2]);
                    $pdf->SetFont($bodyFont, 'B', $cmpFontSize);
                    $maxH = $minLineH;
                    foreach ($headers as $hi => $h) {
                        $maxH = max($maxH, $pdf->getStringHeight($colWidthsCmp[$hi], $h) + 2);
                    }
                    $startY = $pdf->GetY();
                    $startX = $mLeft;
                    foreach ($headers as $hi => $h) {
                        $align = $hi === 0 ? 'L' : 'C';
                        $pdf->MultiCell($colWidthsCmp[$hi], $maxH, $h, 1, $align, true, 0, $startX, $startY, true, 0, false, true, $maxH, 'M');
                        $startX += $colWidthsCmp[$hi];
                    }
                    $pdf->SetXY($mLeft, $startY + $maxH);
                }

                $renderDiffHtml = function (int $pos, int $neg): string {
                    if ($pos === 0 && $neg === 0) {
                        return '<font color="#94a3b8"><b>-</b></font>';
                    }
                    $parts = [];
                    if ($pos > 0) $parts[] = '<font color="#16a34a"><b>+' . $pos . '</b></font>';
                    if ($neg > 0) $parts[] = '<font color="#dc2626"><b>-' . $neg . '</b></font>';
                    return implode(' <font color="#000000"><b>/</b></font> ', $parts);
                };

                foreach ($cmpRows as $ri => $row) {
                    $titleText = (string) $row[0];
                    $commonText = (string) $row[3];
                    $n1Plain = $cellPlain(1, $row);
                    $n2Plain = $cellPlain(3, $row);

                    $maxH = $minLineH;
                    $maxH = max($maxH, $pdf->getStringHeight($colWidthsCmp[0], $titleText) + 2);
                    $maxH = max($maxH, $pdf->getStringHeight($colWidthsCmp[1], $n1Plain) + 2);
                    $maxH = max($maxH, $pdf->getStringHeight($colWidthsCmp[2], $commonText) + 2);
                    $maxH = max($maxH, $pdf->getStringHeight($colWidthsCmp[3], $n2Plain) + 2);
                    $startY = $pdf->GetY();
                    if ($startY + $maxH > $pdf->getPageHeight() - $mBottom) {
                        $pdf->AddPage();
                        $startY = $pdf->GetY();
                    }
                    $fill = $alternateRows && ($ri % 2 === 1);
                    $pdf->SetFillColor($alternateBg[0], $alternateBg[1], $alternateBg[2]);

                    // Title
                    $pdf->SetTextColor($bodyRgb[0], $bodyRgb[1], $bodyRgb[2]);
                    $pdf->SetFont($bodyFont, '', $cmpFontSize);
                    $pdf->MultiCell($colWidthsCmp[0], $maxH, $titleText, 1, 'L', $fill, 0, $mLeft, $startY, true, 0, false, true, $maxH, 'M');

                    // N1 cell
                    $x1 = $mLeft + $colWidthsCmp[0];
                    $pdf->SetXY($x1, $startY);
                    $pdf->Cell($colWidthsCmp[1], $maxH, '', 1, 0, 'C', $fill);
                    $html1 = $renderDiffHtml((int) $row[1], (int) $row[2]);
                    $contentH1 = $pdf->getStringHeight($colWidthsCmp[1], $n1Plain);
                    $yOff1 = max(0, ($maxH - $contentH1) / 2);
                    $pdf->writeHTMLCell($colWidthsCmp[1], 0, $x1, $startY + $yOff1, $html1, 0, 0, false, true, 'C', true);

                    // Common
                    $x2 = $x1 + $colWidthsCmp[1];
                    $pdf->SetTextColor($bodyRgb[0], $bodyRgb[1], $bodyRgb[2]);
                    $pdf->SetFont($bodyFont, '', $cmpFontSize);
                    $pdf->MultiCell($colWidthsCmp[2], $maxH, $commonText, 1, 'C', $fill, 0, $x2, $startY, true, 0, false, true, $maxH, 'M');

                    // N2 cell
                    $x3 = $x2 + $colWidthsCmp[2];
                    $pdf->SetXY($x3, $startY);
                    $pdf->Cell($colWidthsCmp[3], $maxH, '', 1, 0, 'C', $fill);
                    $html2 = $renderDiffHtml((int) $row[4], (int) $row[5]);
                    $contentH2 = $pdf->getStringHeight($colWidthsCmp[3], $n2Plain);
                    $yOff2 = max(0, ($maxH - $contentH2) / 2);
                    $pdf->writeHTMLCell($colWidthsCmp[3], 0, $x3, $startY + $yOff2, $html2, 0, 0, false, true, 'C', true);

                    $pdf->SetXY($mLeft, $startY + $maxH);
                }
                $pdf->SetTextColor($bodyRgb[0], $bodyRgb[1], $bodyRgb[2]);

                if ($pSpaceAfter > 0) {
                    $pdf->Ln($pSpaceAfter);
                }
                $prevType = 'comparison_summary';

            } elseif ($type === 'comparison_detail') {
                $cdNode1Id = (int) ($block['node1Id'] ?? 0);
                $cdNode2Id = (int) ($block['node2Id'] ?? 0);
                $cdCat = (string) ($block['categoryName'] ?? '');
                $cdShowOnlyDiffs = !empty($block['showOnlyDiffs']);
                $cdPresent = (string) ($block['presentTemplate'] ?? '-');
                $cdMissing = (string) ($block['missingTemplate'] ?? '');
                $cdDifferent = (string) ($block['differentTemplate'] ?? '');
                $cdMatchColumns = $block['matchColumns'] ?? [];
                if (!is_array($cdMatchColumns)) $cdMatchColumns = [];
                $cdShowHeader = !empty($block['showHeader']);
                $cdFontSize = !empty($block['fontSize']) ? (int) $block['fontSize'] : (!empty($styles['table']['fontSize']) ? (int) $styles['table']['fontSize'] : $bodySize);

                if (!$cdNode1Id || !$cdNode2Id || $cdCat === '') {
                    continue;
                }
                $cdNode1 = $this->em->getRepository(Node::class)->find($cdNode1Id);
                $cdNode2 = $this->em->getRepository(Node::class)->find($cdNode2Id);
                if (!$cdNode1 || !$cdNode2) {
                    continue;
                }

                $invRepo2 = $this->em->getRepository(NodeInventoryEntry::class);
                $loadByKey = function (Node $n) use ($invRepo2, $cdCat): array {
                    $entries = $invRepo2->createQueryBuilder('e')
                        ->where('e.node = :n')
                        ->andWhere('e.categoryName = :cat')
                        ->setParameter('n', $n)
                        ->setParameter('cat', $cdCat)
                        ->getQuery()
                        ->getResult();
                    $byKey = [];
                    foreach ($entries as $e) {
                        $k = $e->getEntryKey() ?? '';
                        $cl = $e->getColLabel() ?? '';
                        if (!isset($byKey[$k])) $byKey[$k] = [];
                        $byKey[$k][mb_strtolower($cl)] = $e->getValue() ?? '';
                    }
                    return $byKey;
                };

                $d1 = $loadByKey($cdNode1);
                $d2 = $loadByKey($cdNode2);

                $allKeys = array_values(array_unique(array_merge(array_keys($d1), array_keys($d2))));
                sort($allKeys, SORT_NATURAL | SORT_FLAG_CASE);

                $renderTpl = function (string $tpl, string $key, array $cols): string {
                    $tpl = preg_replace_callback('/\{\{\s*key\s*\}\}/i', fn() => $key, $tpl);
                    $tpl = preg_replace_callback('/\{\{\s*loop\.([A-Za-z0-9 _#-]+)\s*\}\}/', function ($m) use ($cols) {
                        return (string) ($cols[mb_strtolower(trim($m[1]))] ?? '');
                    }, $tpl);
                    return $tpl;
                };

                $identity = function (array $cols) use ($cdMatchColumns): string {
                    if (empty($cdMatchColumns)) return '';
                    $parts = [];
                    foreach ($cdMatchColumns as $mc) {
                        $parts[] = $cols[mb_strtolower((string) $mc)] ?? '';
                    }
                    return implode("\x1f", $parts);
                };

                $orDash = fn(string $s): string => $s !== '' ? $s : '-';

                $cdRows = [];
                foreach ($allKeys as $k) {
                    $in1 = isset($d1[$k]);
                    $in2 = isset($d2[$k]);

                    if ($in1 && $in2) {
                        $sameId = $identity($d1[$k]) === $identity($d2[$k]);
                        if ($sameId) {
                            if ($cdShowOnlyDiffs) continue;
                            $left = $orDash($renderTpl($cdPresent, $k, $d1[$k]));
                            $right = $orDash($renderTpl($cdPresent, $k, $d2[$k]));
                            $leftRed = false; $rightRed = false;
                        } else {
                            $tpl = $cdDifferent !== '' ? $cdDifferent : $cdPresent;
                            $left = $orDash($renderTpl($tpl, $k, $d1[$k]));
                            $right = $orDash($renderTpl($tpl, $k, $d2[$k]));
                            $leftRed = true; $rightRed = true;
                        }
                    } elseif ($in1) {
                        $left = $orDash($renderTpl($cdPresent, $k, $d1[$k]));
                        $right = $cdMissing !== '' ? $renderTpl($cdMissing, $k, $d1[$k]) : '';
                        $leftRed = false; $rightRed = true;
                    } else {
                        $left = $cdMissing !== '' ? $renderTpl($cdMissing, $k, $d2[$k]) : '';
                        $right = $orDash($renderTpl($cdPresent, $k, $d2[$k]));
                        $leftRed = true; $rightRed = false;
                    }

                    $cdRows[] = [$left, $right, $leftRed, $rightRed];
                }

                if (empty($cdRows)) {
                    continue;
                }

                if ($firstBlock) {
                    $pdf->SetMargins($mLeft, $mTop, $mRight);
                    $pdf->SetAutoPageBreak(true, $mBottom);
                    $pdf->AddPage();
                    $firstBlock = false;
                } else {
                    $pdf->Ln($pSpaceBefore > 0 ? $pSpaceBefore : 4);
                }

                $tableStyle = $styles['table'] ?? ReportTheme::DEFAULT_STYLES['table'];
                $headerBg = $this->hexToRgb($tableStyle['headerBg'] ?? '#1e293b');
                $headerColor = $this->hexToRgb($tableStyle['headerColor'] ?? '#ffffff');
                $borderColor = $this->hexToRgb($tableStyle['borderColor'] ?? '#e2e8f0');
                $alternateRows = $tableStyle['alternateRows'] ?? true;
                $alternateBg = $this->hexToRgb($tableStyle['alternateBg'] ?? '#f8fafc');
                $missingBg = $this->hexToRgb('#fee2e2');

                $cdN1Label = (string) ($block['node1Label'] ?? '');
                if ($cdN1Label === '') {
                    $cdN1Label = $cdNode1->getHostname() ?: $cdNode1->getName() ?: $cdNode1->getIpAddress();
                }
                $cdN2Label = (string) ($block['node2Label'] ?? '');
                if ($cdN2Label === '') {
                    $cdN2Label = $cdNode2->getHostname() ?: $cdNode2->getName() ?: $cdNode2->getIpAddress();
                }

                $pageW = $pdf->getPageWidth();
                $contentW = $pageW - $mLeft - $mRight;
                $colW = $contentW / 2;
                $minLineH = $cdFontSize * 0.3528 + 3;

                $pdf->SetDrawColor($borderColor[0], $borderColor[1], $borderColor[2]);
                $pdf->SetLineWidth(0.2);

                if ($cdShowHeader) {
                    $pdf->SetFillColor($headerBg[0], $headerBg[1], $headerBg[2]);
                    $pdf->SetTextColor($headerColor[0], $headerColor[1], $headerColor[2]);
                    $pdf->SetFont($bodyFont, 'B', $cdFontSize);
                    $maxH = $minLineH;
                    $maxH = max($maxH, $pdf->getStringHeight($colW, $cdN1Label) + 2);
                    $maxH = max($maxH, $pdf->getStringHeight($colW, $cdN2Label) + 2);
                    $startY = $pdf->GetY();
                    $pdf->MultiCell($colW, $maxH, $cdN1Label, 1, 'C', true, 0, $mLeft, $startY, true, 0, false, true, $maxH, 'M');
                    $pdf->MultiCell($colW, $maxH, $cdN2Label, 1, 'C', true, 0, $mLeft + $colW, $startY, true, 0, false, true, $maxH, 'M');
                    $pdf->SetXY($mLeft, $startY + $maxH);
                }

                $pdf->SetFont($bodyFont, '', $cdFontSize);
                $pdf->SetTextColor($bodyRgb[0], $bodyRgb[1], $bodyRgb[2]);
                foreach ($cdRows as $ri => $row) {
                    [$left, $right, $leftRed, $rightRed] = $row;
                    $maxH = $minLineH;
                    $maxH = max($maxH, $pdf->getStringHeight($colW, $left) + 2);
                    $maxH = max($maxH, $pdf->getStringHeight($colW, $right) + 2);
                    $startY = $pdf->GetY();
                    if ($startY + $maxH > $pdf->getPageHeight() - $mBottom) {
                        $pdf->AddPage();
                        $startY = $pdf->GetY();
                    }
                    $altFill = $alternateRows && ($ri % 2 === 1);
                    if ($leftRed) {
                        $pdf->SetFillColor($missingBg[0], $missingBg[1], $missingBg[2]);
                        $fillL = true;
                    } elseif ($altFill) {
                        $pdf->SetFillColor($alternateBg[0], $alternateBg[1], $alternateBg[2]);
                        $fillL = true;
                    } else {
                        $fillL = false;
                    }
                    $pdf->MultiCell($colW, $maxH, $left, 1, 'L', $fillL, 0, $mLeft, $startY, true, 0, false, true, $maxH, 'M');
                    if ($rightRed) {
                        $pdf->SetFillColor($missingBg[0], $missingBg[1], $missingBg[2]);
                        $fillR = true;
                    } elseif ($altFill) {
                        $pdf->SetFillColor($alternateBg[0], $alternateBg[1], $alternateBg[2]);
                        $fillR = true;
                    } else {
                        $fillR = false;
                    }
                    $pdf->MultiCell($colW, $maxH, $right, 1, 'L', $fillR, 0, $mLeft + $colW, $startY, true, 0, false, true, $maxH, 'M');
                    $pdf->SetXY($mLeft, $startY + $maxH);
                }

                if ($pSpaceAfter > 0) {
                    $pdf->Ln($pSpaceAfter);
                }
                $prevType = 'comparison_detail';

            } elseif ($type === 'inventory_diff') {
                $idTag1 = trim((string) ($block['tag1'] ?? ''));
                $idTag2 = trim((string) ($block['tag2'] ?? ''));
                $idCat = (string) ($block['categoryName'] ?? '');
                $idEntryKey = (string) ($block['entryKey'] ?? '');
                $idCol = (string) ($block['colLabel'] ?? '');
                $idScope = (string) ($block['scope'] ?? 'all');
                if (!in_array($idScope, ['all', 'node', 'tag'], true)) $idScope = 'all';
                $idShowOnlyDiffs = !empty($block['showOnlyDiffs']);
                $idShowHeader = !empty($block['showHeader']);
                $idFontSize = !empty($block['fontSize']) ? (int) $block['fontSize'] : (!empty($styles['table']['fontSize']) ? (int) $styles['table']['fontSize'] : $bodySize);

                if ($idTag1 === '' || $idTag2 === '' || $idCat === '' || $idCol === '') {
                    continue;
                }

                // Resolve target nodes
                $targetNodes = [];
                if ($forNode) {
                    $targetNodes = [$forNode];
                } else {
                    $reportContext = $report?->getContext();
                    if (!$reportContext) {
                        continue;
                    }
                    if ($idScope === 'node') {
                        $nid = (int) ($block['nodeId'] ?? 0);
                        if ($nid > 0) {
                            $n = $this->em->getRepository(Node::class)->find($nid);
                            if ($n && $n->getContext() === $reportContext) {
                                $targetNodes = [$n];
                            }
                        }
                    } elseif ($idScope === 'tag') {
                        $tagIds = array_map('intval', (array) ($block['tagIds'] ?? []));
                        if (!empty($tagIds)) {
                            $targetNodes = $this->tagResolver->getNodesWithAnyTag($reportContext, $tagIds);
                        }
                    } else {
                        $targetNodes = $this->em->getRepository(Node::class)->findBy(['context' => $reportContext]);
                    }
                }

                if (empty($targetNodes)) {
                    continue;
                }

                // Disable the LatestInventoryFilter so we can read both tag snapshots.
                $filters = $this->em->getFilters();
                $hadFilter = $filters->isEnabled(LatestInventoryFilter::NAME);
                if ($hadFilter) $filters->disable(LatestInventoryFilter::NAME);

                try {
                    $invRepoDiff = $this->em->getRepository(NodeInventoryEntry::class);
                    $loadValues = function (Node $n, string $tagName) use ($invRepoDiff, $idCat, $idEntryKey, $idCol): array {
                        $qb = $invRepoDiff->createQueryBuilder('e')
                            ->select('e.entryKey AS k, e.value AS v')
                            ->innerJoin('e.collectionTag', 't')
                            ->where('e.node = :n')
                            ->andWhere('e.categoryName = :cat')
                            ->andWhere('e.colLabel = :col')
                            ->andWhere('t.name = :tag')
                            ->setParameter('n', $n)
                            ->setParameter('cat', $idCat)
                            ->setParameter('col', $idCol)
                            ->setParameter('tag', $tagName);
                        if ($idEntryKey !== '') {
                            $qb->andWhere('e.entryKey = :ek')->setParameter('ek', $idEntryKey);
                        }
                        $rows = $qb->getQuery()->getArrayResult();
                        $byKey = [];
                        foreach ($rows as $r) {
                            $k = (string) ($r['k'] ?? '');
                            $byKey[$k] = (string) ($r['v'] ?? '');
                        }
                        return $byKey;
                    };

                    // Build (node, key) → (v1, v2)
                    $idRows = [];
                    foreach ($targetNodes as $n) {
                        $v1 = $loadValues($n, $idTag1);
                        $v2 = $loadValues($n, $idTag2);
                        $allKeys = array_values(array_unique(array_merge(array_keys($v1), array_keys($v2))));
                        sort($allKeys, SORT_NATURAL | SORT_FLAG_CASE);
                        if (empty($allKeys)) {
                            // No data for either tag — still show node with empty values when not "diffs only"
                            if (!$idShowOnlyDiffs) {
                                $idRows[] = [
                                    'node' => $n,
                                    'key' => $idEntryKey,
                                    'v1' => '',
                                    'v2' => '',
                                    'differs' => false,
                                ];
                            }
                            continue;
                        }
                        foreach ($allKeys as $k) {
                            $a = $v1[$k] ?? '';
                            $b = $v2[$k] ?? '';
                            $differs = ($a !== $b);
                            if ($idShowOnlyDiffs && !$differs) continue;
                            $idRows[] = [
                                'node' => $n,
                                'key' => $k,
                                'v1' => $a,
                                'v2' => $b,
                                'differs' => $differs,
                            ];
                        }
                    }
                } finally {
                    if ($hadFilter) $filters->enable(LatestInventoryFilter::NAME);
                }

                if (empty($idRows)) {
                    continue;
                }

                if ($firstBlock) {
                    $pdf->SetMargins($mLeft, $mTop, $mRight);
                    $pdf->SetAutoPageBreak(true, $mBottom);
                    $pdf->AddPage();
                    $firstBlock = false;
                } else {
                    $pdf->Ln($pSpaceBefore > 0 ? $pSpaceBefore : 4);
                }

                if (!empty($block['pageBreakBefore'])) {
                    $pdf->AddPage();
                }

                $tableStyle = $styles['table'] ?? ReportTheme::DEFAULT_STYLES['table'];
                $headerBg = $this->hexToRgb($tableStyle['headerBg'] ?? '#1e293b');
                $headerColor = $this->hexToRgb($tableStyle['headerColor'] ?? '#ffffff');
                $borderColor = $this->hexToRgb($tableStyle['borderColor'] ?? '#e2e8f0');
                $alternateRows = $tableStyle['alternateRows'] ?? true;
                $alternateBg = $this->hexToRgb($tableStyle['alternateBg'] ?? '#f8fafc');
                $diffBg = $this->hexToRgb('#fef3c7');

                $idTag1Label = (string) ($block['tag1Label'] ?? '');
                if ($idTag1Label === '') $idTag1Label = $idTag1;
                $idTag2Label = (string) ($block['tag2Label'] ?? '');
                if ($idTag2Label === '') $idTag2Label = $idTag2;

                $multiNode = count($targetNodes) > 1;
                $multiKey = ($idEntryKey === '');
                $columns = [];
                if ($multiNode) $columns[] = 'equipment';
                if ($multiKey) $columns[] = 'key';
                $columns[] = 'v1';
                $columns[] = 'v2';

                $headerLabels = [];
                foreach ($columns as $c) {
                    if ($c === 'equipment') $headerLabels[] = 'Equipement';
                    elseif ($c === 'key') $headerLabels[] = 'Clef';
                    elseif ($c === 'v1') $headerLabels[] = $idTag1Label;
                    elseif ($c === 'v2') $headerLabels[] = $idTag2Label;
                }

                $pageW = $pdf->getPageWidth();
                $contentW = $pageW - $mLeft - $mRight;
                $colCount = count($columns);
                $minLineH = $idFontSize * 0.3528 + 3;
                $cellPadding = 6;

                $cellOf = function (array $row, string $c) {
                    $n = $row['node'];
                    if ($c === 'equipment') return (string) ($n->getHostname() ?: $n->getName() ?: $n->getIpAddress() ?: '—');
                    if ($c === 'key') return (string) $row['key'];
                    if ($c === 'v1') return (string) $row['v1'];
                    if ($c === 'v2') return (string) $row['v2'];
                    return '';
                };

                $maxWidths = array_fill(0, $colCount, 0);
                $pdf->SetFont($bodyFont, 'B', $idFontSize);
                foreach ($headerLabels as $hi => $h) {
                    $maxWidths[$hi] = max($maxWidths[$hi], $pdf->GetStringWidth($h) + $cellPadding);
                }
                $pdf->SetFont($bodyFont, '', $idFontSize);
                foreach ($idRows as $row) {
                    foreach ($columns as $ci => $c) {
                        $text = $cellOf($row, $c);
                        $maxWidths[$ci] = max($maxWidths[$ci], $pdf->GetStringWidth($text) + $cellPadding);
                    }
                }
                $totalNatural = array_sum($maxWidths);
                $colWidths = [];
                if ($totalNatural < $contentW) {
                    $extra = $contentW - $totalNatural;
                    // Distribute extra width to value columns first
                    $valueCols = [];
                    foreach ($columns as $ci => $c) {
                        if ($c === 'v1' || $c === 'v2') $valueCols[] = $ci;
                    }
                    $share = !empty($valueCols) ? ($extra / count($valueCols)) : 0;
                    foreach ($maxWidths as $ci => $w) {
                        $colWidths[$ci] = $w + (in_array($ci, $valueCols, true) ? $share : 0);
                    }
                } else {
                    $scale = $contentW / max($totalNatural, 0.01);
                    foreach ($maxWidths as $w) $colWidths[] = $w * $scale;
                }

                $pdf->SetDrawColor($borderColor[0], $borderColor[1], $borderColor[2]);
                $pdf->SetLineWidth(0.2);

                if ($idShowHeader) {
                    $pdf->SetFillColor($headerBg[0], $headerBg[1], $headerBg[2]);
                    $pdf->SetTextColor($headerColor[0], $headerColor[1], $headerColor[2]);
                    $pdf->SetFont($bodyFont, 'B', $idFontSize);
                    $maxH = $minLineH;
                    foreach ($headerLabels as $hi => $h) {
                        $maxH = max($maxH, $pdf->getStringHeight($colWidths[$hi], $h) + 2);
                    }
                    $startY = $pdf->GetY();
                    $startX = $mLeft;
                    foreach ($headerLabels as $hi => $h) {
                        $pdf->MultiCell($colWidths[$hi], $maxH, $h, 1, 'C', true, 0, $startX, $startY, true, 0, false, true, $maxH, 'M');
                        $startX += $colWidths[$hi];
                    }
                    $pdf->SetXY($mLeft, $startY + $maxH);
                }

                $pdf->SetFont($bodyFont, '', $idFontSize);
                $pdf->SetTextColor($bodyRgb[0], $bodyRgb[1], $bodyRgb[2]);
                foreach ($idRows as $ri => $row) {
                    $maxH = $minLineH;
                    foreach ($columns as $ci => $c) {
                        $maxH = max($maxH, $pdf->getStringHeight($colWidths[$ci], $cellOf($row, $c)) + 2);
                    }
                    $startY = $pdf->GetY();
                    if ($startY + $maxH > $pdf->getPageHeight() - $mBottom) {
                        $pdf->AddPage();
                        $startY = $pdf->GetY();
                    }
                    $altFill = $alternateRows && ($ri % 2 === 1);
                    $startX = $mLeft;
                    foreach ($columns as $ci => $c) {
                        $highlight = $row['differs'] && ($c === 'v1' || $c === 'v2');
                        if ($highlight) {
                            $pdf->SetFillColor($diffBg[0], $diffBg[1], $diffBg[2]);
                            $fill = true;
                        } elseif ($altFill) {
                            $pdf->SetFillColor($alternateBg[0], $alternateBg[1], $alternateBg[2]);
                            $fill = true;
                        } else {
                            $fill = false;
                        }
                        $align = ($c === 'v1' || $c === 'v2') ? 'L' : 'L';
                        $pdf->MultiCell($colWidths[$ci], $maxH, $cellOf($row, $c), 1, $align, $fill, 0, $startX, $startY, true, 0, false, true, $maxH, 'M');
                        $startX += $colWidths[$ci];
                    }
                    $pdf->SetXY($mLeft, $startY + $maxH);
                }

                if ($pSpaceAfter > 0) {
                    $pdf->Ln($pSpaceAfter);
                }
                $prevType = 'inventory_diff';

            } elseif ($type === 'two_column') {
                if (!empty($block['pageBreakBefore']) || $firstBlock) {
                    $pdf->SetMargins($mLeft, $mTop, $mRight);
                    $pdf->SetAutoPageBreak(true, $mBottom);
                    $pdf->AddPage();
                    $firstBlock = false;
                }
                $this->renderTwoColumn(
                    $pdf, $block, $headingsByLevel, $styles, $numberingEnabled,
                    $mLeft, $mTop, $mRight, $mBottom,
                    $forNode, $report, $summaryPageMap, $collectedPageMap,
                    $counters
                );
                $prevType = 'two_column';

            } elseif ($type === 'conditional') {
                $condTree = is_array($block['condition'] ?? null) ? $block['condition'] : null;
                $shouldRender = $this->blockConditionEvaluator->evaluate($condTree, $forNode, $report);
                if ($shouldRender) {
                    if (!empty($block['pageBreakBefore']) || $firstBlock) {
                        $pdf->SetMargins($mLeft, $mTop, $mRight);
                        $pdf->SetAutoPageBreak(true, $mBottom);
                        $pdf->AddPage();
                        $firstBlock = false;
                    }
                    $children = is_array($block['children'] ?? null) ? $block['children'] : [];
                    if (!empty($block['inheritScopeToChildren'])) {
                        $parentScope = $this->blockConditionEvaluator->extractInheritedScope($condTree);
                        if ($parentScope !== null) {
                            $children = array_map(
                                fn($c) => is_array($c) ? $this->overlayScopeOnBlock($c, $parentScope) : $c,
                                $children,
                            );
                        }
                    }
                    $this->renderBlocks(
                        $pdf, $children, $headingsByLevel, $styles, $numberingEnabled,
                        $mLeft, $mTop, $mRight, $mBottom,
                        $forNode, $report, $summaryPageMap, $collectedPageMap,
                        true,
                        $counters,
                    );
                    $prevType = 'conditional';
                }

            } elseif ($type === 'repeat_per_node') {
                $rpnNodes = $this->resolveRepeatNodes($block, $forNode, $report);
                if (empty($rpnNodes)) {
                    continue;
                }
                $rpnChildren = is_array($block['children'] ?? null) ? $block['children'] : [];
                if (empty($rpnChildren)) {
                    continue;
                }
                if (!empty($block['pageBreakBefore']) || $firstBlock) {
                    $pdf->SetMargins($mLeft, $mTop, $mRight);
                    $pdf->SetAutoPageBreak(true, $mBottom);
                    $pdf->AddPage();
                    $firstBlock = false;
                }
                foreach ($rpnNodes as $iterNode) {
                    $overlaid = array_map(
                        fn($c) => is_array($c) ? $this->overlayCurrentNodeOnBlock($c, $iterNode) : $c,
                        $rpnChildren,
                    );
                    $this->renderBlocks(
                        $pdf, $overlaid, $headingsByLevel, $styles, $numberingEnabled,
                        $mLeft, $mTop, $mRight, $mBottom,
                        $forNode, $report, $summaryPageMap, $collectedPageMap,
                        true,
                        $counters,
                    );
                }
                $prevType = 'repeat_per_node';
            }
        }
    }

    /**
     * Render a two_column container block.
     *
     * Strategy:
     *   - Restrict TCPDF margins per column (enlarge the right margin for the
     *     left column and vice-versa) so children render within the column box.
     *   - Phase 1: dry-run each column inside a TCPDF transaction to measure its
     *     height. When both columns end on the start page, vAlign offsets are
     *     applied so each column can be top/middle/bottom-aligned independently.
     *   - Phase 2: render each column for real. Auto page-break works inside the
     *     column box, so overflow continues at the top of the next page within
     *     that same column. Multi-page layouts may not stay perfectly side-by-side
     *     when one column is much taller — vAlign is skipped in that case.
     *   - Restore margins and place the cursor on the deeper column's end.
     */
    private function renderTwoColumn(
        TCPDF $pdf,
        array $block,
        array $headingsByLevel,
        array $styles,
        bool $numberingEnabled,
        float $mLeft,
        float $mTop,
        float $mRight,
        float $mBottom,
        ?Node $forNode,
        ?Report $report,
        array $summaryPageMap,
        array &$collectedPageMap,
        array &$counters,
    ): void {
        $leftPct = (float) ($block['leftWidthPct'] ?? 50);
        if ($leftPct < 10) $leftPct = 10;
        if ($leftPct > 90) $leftPct = 90;
        $gap = max(0.0, (float) ($block['gapMm'] ?? 4));
        $leftBlocks = is_array($block['leftBlocks'] ?? null) ? $block['leftBlocks'] : [];
        $rightBlocks = is_array($block['rightBlocks'] ?? null) ? $block['rightBlocks'] : [];
        $leftVAlign = (string) ($block['leftVAlign'] ?? 'top');
        $rightVAlign = (string) ($block['rightVAlign'] ?? 'top');

        $pageW = $pdf->getPageWidth();
        $contentW = $pageW - $mLeft - $mRight;
        $effW = max(1.0, $contentW - $gap);
        $leftW = $effW * $leftPct / 100.0;
        $rightW = $effW - $leftW;

        $leftRightM = $mRight + $rightW + $gap;
        $rightLeftM = $mLeft + $leftW + $gap;

        $startY = $pdf->GetY();
        $startPage = $pdf->getPage();

        // PHASE 1: measure both columns (single-page case for vAlign).
        // Use a SNAPSHOT of $counters: TCPDF rolls back its own state but PHP
        // arrays keep their mutations, so without this the measure passes would
        // pre-increment heading numbers and the real render would skip them.
        $unused = [];
        $measureCounters = $counters;
        $pdf->startTransaction();
        $pdf->SetMargins($mLeft, $mTop, $leftRightM);
        $pdf->SetAutoPageBreak(true, $mBottom);
        $pdf->setPage($startPage);
        $pdf->SetXY($mLeft, $startY);
        $this->renderBlocks(
            $pdf, $leftBlocks, $headingsByLevel, $styles, $numberingEnabled,
            $mLeft, $mTop, $leftRightM, $mBottom,
            $forNode, $report, $summaryPageMap, $unused,
            true, $measureCounters,
        );
        $leftMeasuredEndY = $pdf->GetY();
        $leftMeasuredEndPage = $pdf->getPage();
        $pdf->rollbackTransaction(true);

        $unused = [];
        $measureCounters = $counters;
        $pdf->startTransaction();
        $pdf->SetMargins($rightLeftM, $mTop, $mRight);
        $pdf->SetAutoPageBreak(true, $mBottom);
        $pdf->setPage($startPage);
        $pdf->SetXY($rightLeftM, $startY);
        $this->renderBlocks(
            $pdf, $rightBlocks, $headingsByLevel, $styles, $numberingEnabled,
            $rightLeftM, $mTop, $mRight, $mBottom,
            $forNode, $report, $summaryPageMap, $unused,
            true, $measureCounters,
        );
        $rightMeasuredEndY = $pdf->GetY();
        $rightMeasuredEndPage = $pdf->getPage();
        $pdf->rollbackTransaction(true);

        $singlePage = ($leftMeasuredEndPage === $startPage) && ($rightMeasuredEndPage === $startPage);
        $leftOffset = 0.0;
        $rightOffset = 0.0;
        if ($singlePage) {
            $leftH = max(0.0, $leftMeasuredEndY - $startY);
            $rightH = max(0.0, $rightMeasuredEndY - $startY);
            $blockH = max($leftH, $rightH);
            $leftOffset = $this->valignOffset($leftVAlign, $leftH, $blockH);
            $rightOffset = $this->valignOffset($rightVAlign, $rightH, $blockH);
        }

        // PHASE 2: render LEFT column
        $pdf->SetMargins($mLeft, $mTop, $leftRightM);
        $pdf->SetAutoPageBreak(true, $mBottom);
        $pdf->setPage($startPage);
        $pdf->SetXY($mLeft, $startY + $leftOffset);
        $this->renderBlocks(
            $pdf, $leftBlocks, $headingsByLevel, $styles, $numberingEnabled,
            $mLeft, $mTop, $leftRightM, $mBottom,
            $forNode, $report, $summaryPageMap, $collectedPageMap,
            true, $counters,
        );
        $leftEndY = $pdf->GetY();
        $leftEndPage = $pdf->getPage();

        // PHASE 3: render RIGHT column
        $pdf->SetMargins($rightLeftM, $mTop, $mRight);
        $pdf->SetAutoPageBreak(true, $mBottom);
        $pdf->setPage($startPage);
        $pdf->SetXY($rightLeftM, $startY + $rightOffset);
        $this->renderBlocks(
            $pdf, $rightBlocks, $headingsByLevel, $styles, $numberingEnabled,
            $rightLeftM, $mTop, $mRight, $mBottom,
            $forNode, $report, $summaryPageMap, $collectedPageMap,
            true, $counters,
        );
        $rightEndY = $pdf->GetY();
        $rightEndPage = $pdf->getPage();

        // PHASE 4: restore margins, sync cursor to deeper column
        $pdf->SetMargins($mLeft, $mTop, $mRight);
        $pdf->SetAutoPageBreak(true, $mBottom);
        if ($leftEndPage > $rightEndPage) {
            $pdf->setPage($leftEndPage);
            $pdf->SetXY($mLeft, $leftEndY);
        } elseif ($rightEndPage > $leftEndPage) {
            $pdf->setPage($rightEndPage);
            $pdf->SetXY($mLeft, $rightEndY);
        } else {
            $pdf->SetXY($mLeft, max($leftEndY, $rightEndY));
        }
    }

    private function valignOffset(string $align, float $h, float $blockH): float
    {
        if ($align === 'middle') return max(0.0, ($blockH - $h) / 2.0);
        if ($align === 'bottom') return max(0.0, $blockH - $h);
        return 0.0;
    }

    /**
     * Apply a scope inherited from a parent "conditional" block onto a child.
     *
     * $parentScope is shaped as { scope: 'all'|'tag'|'nodes', nodeIds?: int[], tagIds?: int[] }
     * (produced by BlockConditionEvaluator::extractInheritedScope). The mapping
     * adapts each block type's scope-field convention:
     *   - compliance_recommendations:  scope = 'all'|'tag'|'device' (+ nodeTagIds, nodeIds)
     *   - chart_inventory:             deviceSelectionMode = 'all'|'tag'|'device'
     *   - inventory_diff:              scope = 'all'|'tag'|'node' (single nodeId)
     *   - rule_recommendation:         single nodeId
     *   - rule_non_compliant / rule_nodes_table / inventory_table / cli_command / timeline:
     *       multi-node nodeIds (or tagIds for cli_command)
     *
     * Children that opt out via inheritFromParent === false are returned unchanged.
     * Containers (two_column) recurse so their inner blocks also inherit. A nested
     * conditional defines its own scope and is left alone.
     */
    private function overlayScopeOnBlock(array $block, array $parentScope): array
    {
        if (array_key_exists('inheritFromParent', $block) && $block['inheritFromParent'] === false) {
            return $block;
        }
        $type = (string) ($block['type'] ?? '');
        $scope = (string) ($parentScope['scope'] ?? 'all');
        $nodeIds = array_values(array_map('intval', (array) ($parentScope['nodeIds'] ?? [])));
        $tagIds = array_values(array_map('intval', (array) ($parentScope['tagIds'] ?? [])));

        switch ($type) {
            case 'compliance_recommendations':
                if ($scope === 'nodes') {
                    $block['scope'] = 'device';
                    $block['nodeIds'] = $nodeIds;
                } elseif ($scope === 'tag') {
                    $block['scope'] = 'tag';
                    $block['nodeTagIds'] = $tagIds;
                } else {
                    $block['scope'] = 'all';
                }
                break;

            case 'rule_non_compliant':
            case 'rule_nodes_table':
            case 'rule_items_table':
            case 'inventory_table':
                if ($scope === 'nodes') {
                    $block['nodeIds'] = $nodeIds;
                }
                // 'tag' / 'all' do not have a direct equivalent on these blocks.
                break;

            case 'rule_recommendation':
                if ($scope === 'nodes' && !empty($nodeIds)) {
                    $block['nodeId'] = $nodeIds[0];
                }
                break;

            case 'chart_inventory':
                if ($scope === 'nodes') {
                    $block['deviceSelectionMode'] = 'device';
                    $block['nodeIds'] = $nodeIds;
                } elseif ($scope === 'tag') {
                    $block['deviceSelectionMode'] = 'tag';
                    $block['tagIds'] = $tagIds;
                } else {
                    $block['deviceSelectionMode'] = 'all';
                }
                break;

            case 'inventory_diff':
                if ($scope === 'nodes' && !empty($nodeIds)) {
                    $block['scope'] = 'node';
                    $block['nodeId'] = $nodeIds[0];
                } elseif ($scope === 'tag') {
                    $block['scope'] = 'tag';
                    $block['tagIds'] = $tagIds;
                } else {
                    $block['scope'] = 'all';
                }
                break;

            case 'cli_command':
                // Inherited scope is authoritative: clear manufacturer/model filters
                // so they cannot re-widen the node selection beyond the parent scope.
                if ($scope === 'nodes') {
                    $block['nodeIds'] = $nodeIds;
                    $block['tagIds'] = [];
                    $block['manufacturerIds'] = [];
                    $block['modelIds'] = [];
                } elseif ($scope === 'tag') {
                    $block['tagIds'] = $tagIds;
                    $block['nodeIds'] = [];
                    $block['manufacturerIds'] = [];
                    $block['modelIds'] = [];
                }
                break;

            case 'timeline':
                if ($scope === 'nodes') {
                    $block['mode'] = 'node';
                    $block['nodeIds'] = $nodeIds;
                }
                break;

            case 'two_column':
                $block['leftBlocks'] = array_map(
                    fn($c) => is_array($c) ? $this->overlayScopeOnBlock($c, $parentScope) : $c,
                    $block['leftBlocks'] ?? [],
                );
                $block['rightBlocks'] = array_map(
                    fn($c) => is_array($c) ? $this->overlayScopeOnBlock($c, $parentScope) : $c,
                    $block['rightBlocks'] ?? [],
                );
                break;

            // 'conditional': nested conditional defines its own scope; leave untouched.
        }

        return $block;
    }

    /**
     * Join the {label,value} parts of an ACL firewall cell, or the "all"
     * fallback when empty. Used for the source / destination columns.
     *
     * @param array<int, array{label?: string, value?: string}> $parts
     */
    /**
     * Badges for a source/destination ACL cell. Returns an "any" badge with the
     * "all" label when empty.
     *
     * @param array<int, array{label?: string, value?: string}> $parts
     * @return array<int, array{text: string, kind: string}>
     */
    private function aclCellBadges(array $parts, string $allLabel, string $role): array
    {
        $out = [];
        foreach ($parts as $p) {
            $v = is_array($p) ? trim((string) ($p['value'] ?? '')) : '';
            if ($v === '') continue;
            $kind = $this->aclClassify($v, $role);
            $out[] = ['text' => $this->aclBadgeText($v, $kind), 'kind' => $kind];
        }
        return $out === [] ? [['text' => $allLabel, 'kind' => 'any']] : $out;
    }

    /**
     * Service badges, combining protocol + source/destination ports
     * (TCP/22, TCP src:1024 -> dst:443) plus standalone L2 services.
     *
     * @return array<int, array{text: string, kind: string}>
     */
    private function aclServiceBadges(array $ace, string $allLabel): array
    {
        $protocol = $ace['protocol'] ?? [];
        $portDst = !empty($ace['portDst']) ? $ace['portDst'] : ($ace['port'] ?? []);
        $portSrc = $ace['portSrc'] ?? [];
        $rows = max(count($protocol), count($portSrc), count($portDst));

        $out = [];
        for ($i = 0; $i < $rows; $i++) {
            $proto = isset($protocol[$i]['value']) ? strtoupper(trim((string) $protocol[$i]['value'])) : '';
            $src = isset($portSrc[$i]['value']) ? trim((string) $portSrc[$i]['value']) : '';
            $dst = isset($portDst[$i]['value']) ? trim((string) $portDst[$i]['value']) : '';
            if ($proto === '' && $src === '' && $dst === '') continue;

            if ($src !== '' && $dst !== '') {
                $text = trim(($proto !== '' ? $proto . ' ' : '') . 'src:' . $this->aclPortText($src) . ' -> dst:' . $this->aclPortText($dst));
            } elseif ($src !== '') {
                $text = trim(($proto !== '' ? $proto . ' ' : '') . 'src:' . $this->aclPortText($src));
            } elseif ($dst !== '') {
                $text = $proto !== '' ? $proto . '/' . $this->aclPortText($dst) : $this->aclPortText($dst);
            } else {
                $text = $proto;
            }
            $out[] = ['text' => $text, 'kind' => 'port'];
        }
        foreach (($ace['service'] ?? []) as $s) {
            $v = is_array($s) ? trim((string) ($s['value'] ?? '')) : '';
            if ($v === '') continue;
            $kind = $this->aclClassify($v, 'service');
            $out[] = ['text' => $this->aclBadgeText($v, $kind), 'kind' => $kind];
        }
        return $out === [] ? [['text' => $allLabel, 'kind' => 'any']] : $out;
    }

    /**
     * Action badges: the primary action (colour by permit/deny) plus qualifiers.
     *
     * @return array<int, array{text: string, kind: string, action?: string}>
     */
    private function aclActionBadges(array $ace): array
    {
        $out = [];
        if (!empty($ace['action'])) {
            $out[] = ['text' => (string) $ace['action'], 'kind' => 'action', 'action' => (string) $ace['action']];
        }
        foreach (($ace['actions'] ?? []) as $q) {
            if (!is_array($q)) continue;
            $label = $q['label'] ?? null;
            $value = $q['value'] ?? null;
            if ($label === null || $label === '') continue;
            // Qualifiers (count, remark-dscp, ...) render as neutral action badges
            // with a small dot icon.
            $out[] = [
                'text' => $value !== null && $value !== '' ? $label . ': ' . $value : (string) $label,
                'kind' => 'action',
                'action' => (string) $label,
            ];
        }
        return $out;
    }

    /** Classify a raw value into a badge kind (mac/ipv4/ipv6/port/protocol/any/text). */
    private function aclClassify(string $value, string $role): string
    {
        $v = strtolower(trim($value));
        if (in_array($v, ['any', 'all', '*', '0.0.0.0/0', '::/0'], true)) return 'any';
        if (preg_match('/^([0-9a-f]{2}[:-]){5}[0-9a-f]{2}/i', $v) || preg_match('/^([0-9a-f]{4}\.){2}[0-9a-f]{4}/i', $v)) return 'mac';
        if (preg_match('/^\d{1,3}(\.\d{1,3}){3}/', $v)) return 'ipv4';
        if ($role === 'service') {
            if (preg_match('/^\d{1,5}/', $v)) return 'port';
            if ($this->aclIsProtocol($v)) return 'protocol';
        }
        if (preg_match('/^[0-9a-f:]+:[0-9a-f:]*/i', $v) && str_contains($v, ':')) return 'ipv6';
        if ($this->aclIsProtocol($v)) return 'protocol';
        if (preg_match('/^\d{1,5}$/', $v)) return 'port';
        return 'text';
    }

    private function aclIsProtocol(string $v): bool
    {
        return in_array(preg_replace('/[^a-z0-9]/i', '', strtolower($v)), self::ACL_PROTOCOLS, true);
    }

    /** Enriched badge text: known port names, CIDR for masked IPv4, MAC + mask. */
    private function aclBadgeText(string $value, string $kind): string
    {
        $v = trim($value);
        if ($kind === 'port') return $this->aclPortText($v);
        if ($kind === 'ipv4') {
            if (preg_match('/^(\d{1,3}(?:\.\d{1,3}){3})[\s\/]+(\d{1,3}(?:\.\d{1,3}){3})$/', $v, $m)) {
                $cidr = $this->aclMaskToCidr($m[2]);
                return $cidr !== null ? $m[1] . '/' . $cidr : $m[1] . ' ' . $m[2];
            }
        }
        return $v;
    }

    /** Port text: known service name (22 -> "22 SSH") or masked range (20480 0xfc00 -> 20480-21503). */
    private function aclPortText(string $raw): string
    {
        $v = trim($raw);
        if (preg_match('/^(\d{1,5})[\s\/]+(0x[0-9a-f]+|\d{1,5})$/i', $v, $m)) {
            $base = (int) $m[1];
            $mask = str_starts_with(strtolower($m[2]), '0x') ? hexdec($m[2]) : (int) $m[2];
            if ($base <= 0xffff && $mask <= 0xffff) {
                $free = (~$mask) & 0xffff;
                if ($free === 0) return (string) $base;
                if ((($free + 1) & $free) === 0) {
                    $lo = $base & $mask & 0xffff;
                    return $lo . '-' . ($lo + $free);
                }
            }
            return $m[1] . ' ' . $m[2];
        }
        $name = self::ACL_PORT_NAMES[$v] ?? null;
        return $name ? $v . ' ' . $name : $v;
    }

    /** IPv4 wildcard/netmask -> CIDR prefix length, or null for non-contiguous. */
    private function aclMaskToCidr(string $mask): ?int
    {
        $o = array_map('intval', explode('.', $mask));
        if (count($o) !== 4) return null;
        foreach ($o as $x) { if ($x < 0 || $x > 255) return null; }
        $val = ($o[0] << 24) | ($o[1] << 16) | ($o[2] << 8) | $o[3];
        $bits = 0;
        for ($i = 0; $i < 32; $i++) { if (($val >> $i) & 1) $bits++; }
        $prefix = (($val >> 31) & 1) ? $bits : 32 - $bits;
        return ($prefix >= 0 && $prefix <= 32) ? $prefix : null;
    }

    /**
     * Render a stack of coloured badges flowing within a fixed-width cell at
     * (x, y). Returns the total height consumed. When $measureOnly is true,
     * nothing is drawn — used to pre-compute the row height.
     *
     * @param array<int, array{text: string, kind: string, action?: string}> $badges
     */
    private function aclRenderBadges(
        TCPDF $pdf,
        array $badges,
        float $x,
        float $y,
        float $cellW,
        string $font,
        float $fontSize,
        bool $measureOnly = false,
        float $cellH = 0.0,
    ): float {
        // Badge text is rendered smaller than the table font for a compact look.
        $badgeFs = max(4.0, $fontSize - 1.5);
        $padL = 1.0;          // left padding inside a badge
        $padR = 1.3;          // right padding (slightly larger for breathing room)
        $padY = 0.5;          // vertical padding inside a badge
        $gap = 0.6;           // gap between badges
        $iconGap = 0.15;      // gap between icon and text
        // GetStringWidth slightly under-measures the rendered font, so pad the
        // measured text width a touch to keep clear space before the right edge.
        $textSlack = 0.4;
        $lineH = $badgeFs * 0.3528 + 2 * $padY;
        $iconSize = $lineH - 2 * $padY;  // square icon, fits the badge height
        $marginX = 0.7;       // inset from the cell's left/right edges

        // Cell uses its own padding, but badge text is drawn with raw Text() so
        // it is never shifted by TCPDF's internal cell margin (which caused the
        // earlier right-overflow).
        $pdf->SetFont($font, '', $badgeFs);

        $maxW = $cellW - 2 * $marginX;

        // First pass: lay out badges into rows so we know the total height and
        // can centre the whole block vertically within the cell.
        $rows = [];                   // each row: list of [b, text, icon, iconW, bw]
        $cur = [];
        $curW = 0.0;
        foreach ($badges as $b) {
            $icon = $this->aclIconFor($b);
            $iconW = $icon !== null ? $iconSize + $iconGap : 0.0;
            $textMaxW = $maxW - $iconW - $padL - $padR - $textSlack;
            $text = $this->aclFitText($pdf, (string) $b['text'], max(1.0, $textMaxW));
            $bw = $iconW + $pdf->GetStringWidth($text) + $textSlack + $padL + $padR;
            if ($bw > $maxW) $bw = $maxW;

            if ($cur !== [] && $curW + $bw > $maxW + 0.01) {
                $rows[] = $cur;
                $cur = [];
                $curW = 0.0;
            }
            $cur[] = ['b' => $b, 'text' => $text, 'icon' => $icon, 'iconW' => $iconW, 'bw' => $bw];
            $curW += $bw + $gap;
        }
        if ($cur !== []) $rows[] = $cur;

        $blockH = count($rows) * $lineH + max(0, count($rows) - 1) * $gap;
        $totalH = $blockH + 2 * 0.6;
        if ($measureOnly) {
            return $totalH;
        }

        // Vertically centre the badge block within the cell (fallback to top
        // padding when the cell height is unknown).
        $startY = $cellH > 0 ? $y + max(0.6, ($cellH - $blockH) / 2) : $y + 0.6;

        $curY = $startY;
        foreach ($rows as $row) {
            $curX = $x + $marginX;
            foreach ($row as $item) {
                $b = $item['b'];
                $text = $item['text'];
                $icon = $item['icon'];
                $iconW = $item['iconW'];
                $bw = $item['bw'];

                [$bg, $fg] = $this->aclBadgeColors($b);
                $pdf->SetFillColor($bg[0], $bg[1], $bg[2]);
                $pdf->SetTextColor($fg[0], $fg[1], $fg[2]);
                $pdf->RoundedRect($curX, $curY, $bw, $lineH, 0.4, '1111', 'F');
                if ($icon !== null) {
                    $this->aclDrawIcon($pdf, $icon, $curX + $padL, $curY + $padY, $iconSize, $fg);
                }
                // Raw text, vertically centred, no cell margin -> no right overflow.
                $textY = $curY + ($lineH - $badgeFs * 0.3528) / 2;
                $pdf->Text($curX + $padL + $iconW, $textY, $text);

                $curX += $bw + $gap;
            }
            $curY += $lineH + $gap;
        }

        return $totalH;
    }

    /** Truncate text with a trailing ellipsis so it fits within $maxW mm. */
    private function aclFitText(TCPDF $pdf, string $text, float $maxW): string
    {
        if ($pdf->GetStringWidth($text) <= $maxW) return $text;
        $ell = "\u{2026}";
        $out = $text;
        while ($out !== '' && $pdf->GetStringWidth($out . $ell) > $maxW) {
            $out = mb_substr($out, 0, mb_strlen($out) - 1);
        }
        return $out === '' ? $ell : $out . $ell;
    }

    /**
     * Icon glyph name for a badge, or null when it has no icon. Actions map to
     * permit/deny/qualifier glyphs based on the keyword.
     *
     * @param array{text?: string, kind?: string, action?: string} $b
     */
    private function aclIconFor(array $b): ?string
    {
        $kind = $b['kind'] ?? 'text';
        if ($kind === 'action') {
            $a = strtolower((string) ($b['action'] ?? $b['text'] ?? ''));
            if (str_contains($a, 'permit') || str_contains($a, 'allow') || str_contains($a, 'accept')) return 'check';
            if (str_contains($a, 'deny') || str_contains($a, 'drop') || str_contains($a, 'block') || str_contains($a, 'reject')) return 'ban';
            return 'dot';
        }
        return match ($kind) {
            'mac' => 'chip',
            'ipv4' => 'network',
            'ipv6' => 'globe',
            'port' => 'plug',
            'protocol' => 'layers',
            'any' => 'asterisk',
            default => null,
        };
    }

    /**
     * Draw a tiny vector icon (font-independent) inside a badge. Colour matches
     * the badge text. Icons are simplified glyphs evoking the lucide set used
     * in the web UI (chip/network/globe/plug/layers).
     *
     * @param array{0:int,1:int,2:int} $rgb
     */
    private function aclDrawIcon(TCPDF $pdf, string $icon, float $x, float $y, float $s, array $rgb): void
    {
        $line = ['width' => 0.12, 'color' => $rgb];
        $cx = $x + $s / 2;
        $cy = $y + $s / 2;
        $pdf->SetDrawColor($rgb[0], $rgb[1], $rgb[2]);
        $pdf->SetLineWidth(0.12);

        switch ($icon) {
            case 'network': // a node linked to two below
                $pdf->Circle($cx, $y + $s * 0.22, $s * 0.16, 0, 360, 'D', $line);
                $pdf->Circle($x + $s * 0.25, $y + $s * 0.82, $s * 0.14, 0, 360, 'D', $line);
                $pdf->Circle($x + $s * 0.75, $y + $s * 0.82, $s * 0.14, 0, 360, 'D', $line);
                $pdf->Line($cx, $y + $s * 0.38, $x + $s * 0.25, $y + $s * 0.68, $line);
                $pdf->Line($cx, $y + $s * 0.38, $x + $s * 0.75, $y + $s * 0.68, $line);
                break;
            case 'globe': // circle + meridians
                $pdf->Circle($cx, $cy, $s * 0.40, 0, 360, 'D', $line);
                $pdf->Ellipse($cx, $cy, $s * 0.18, $s * 0.40, 0, 0, 360, 'D', $line);
                $pdf->Line($x + $s * 0.10, $cy, $x + $s * 0.90, $cy, $line);
                break;
            case 'chip': // square + pins (MAC)
                $pdf->Rect($x + $s * 0.28, $y + $s * 0.28, $s * 0.44, $s * 0.44, 'D', ['all' => $line]);
                foreach ([0.40, 0.60] as $f) {
                    $pdf->Line($x + $s * $f, $y + $s * 0.12, $x + $s * $f, $y + $s * 0.28, $line);
                    $pdf->Line($x + $s * $f, $y + $s * 0.72, $x + $s * $f, $y + $s * 0.88, $line);
                    $pdf->Line($x + $s * 0.12, $y + $s * $f, $x + $s * 0.28, $y + $s * $f, $line);
                    $pdf->Line($x + $s * 0.72, $y + $s * $f, $x + $s * 0.88, $y + $s * $f, $line);
                }
                break;
            case 'plug': // simple plug/port
                $pdf->Rect($x + $s * 0.30, $y + $s * 0.20, $s * 0.40, $s * 0.40, 'D', ['all' => $line]);
                $pdf->Line($x + $s * 0.40, $y + $s * 0.10, $x + $s * 0.40, $y + $s * 0.20, $line);
                $pdf->Line($x + $s * 0.60, $y + $s * 0.10, $x + $s * 0.60, $y + $s * 0.20, $line);
                $pdf->Line($cx, $y + $s * 0.60, $cx, $y + $s * 0.90, $line);
                break;
            case 'layers': // stacked diamonds (protocol)
                $top = $y + $s * 0.18; $mid = $y + $s * 0.50; $bot = $y + $s * 0.74;
                $lft = $x + $s * 0.12; $rgt = $x + $s * 0.88;
                $pdf->PolyLine([$cx, $top, $rgt, $mid, $cx, $y + $s * 0.82, $lft, $mid, $cx, $top], 'D', $line);
                $pdf->Line($lft, $bot, $cx, $y + $s * 0.96, $line);
                $pdf->Line($rgt, $bot, $cx, $y + $s * 0.96, $line);
                break;
            case 'check': // permit — circle + check mark
                $pdf->Circle($cx, $cy, $s * 0.42, 0, 360, 'D', $line);
                $pdf->PolyLine([$x + $s * 0.30, $y + $s * 0.52, $x + $s * 0.45, $y + $s * 0.66, $x + $s * 0.72, $y + $s * 0.34], 'D', $line);
                break;
            case 'ban': // deny — circle + slash
                $pdf->Circle($cx, $cy, $s * 0.42, 0, 360, 'D', $line);
                $pdf->Line($x + $s * 0.24, $y + $s * 0.24, $x + $s * 0.76, $y + $s * 0.76, $line);
                break;
            case 'dot': // qualifier (e.g. count) — small filled dot
                $pdf->SetFillColor($rgb[0], $rgb[1], $rgb[2]);
                $pdf->Circle($cx, $cy, $s * 0.18, 0, 360, 'F', [], $rgb);
                break;
            case 'asterisk': // any / all — asterisk strokes
                $pdf->Line($cx, $y + $s * 0.18, $cx, $y + $s * 0.82, $line);
                $pdf->Line($x + $s * 0.22, $y + $s * 0.32, $x + $s * 0.78, $y + $s * 0.68, $line);
                $pdf->Line($x + $s * 0.22, $y + $s * 0.68, $x + $s * 0.78, $y + $s * 0.32, $line);
                break;
        }
    }

    /** Resolve a badge's [bg, text] RGB, with permit/deny colours for actions. */
    private function aclBadgeColors(array $b): array
    {
        if (($b['kind'] ?? '') === 'action') {
            $a = strtolower((string) ($b['action'] ?? $b['text'] ?? ''));
            if (str_contains($a, 'permit') || str_contains($a, 'allow') || str_contains($a, 'accept')) {
                return [[220, 252, 231], [21, 128, 61]];
            }
            if (str_contains($a, 'deny') || str_contains($a, 'drop') || str_contains($a, 'block') || str_contains($a, 'reject')) {
                return [[254, 226, 226], [185, 28, 28]];
            }
            return self::ACL_KIND_RGB['text'];
        }
        return self::ACL_KIND_RGB[$b['kind']] ?? self::ACL_KIND_RGB['text'];
    }

    /**
     * Resolve the ordered set of nodes a repeat_per_node block iterates over,
     * combining manual nodeIds + auto-rules (InventoryNodeRuleEvaluator). For
     * node-type reports, $forNode wins and short-circuits everything (same
     * pattern as inventory_table).
     *
     * @return Node[]
     */
    private function resolveRepeatNodes(array $block, ?Node $forNode, ?Report $report): array
    {
        if ($forNode) return [$forNode];
        $context = $report?->getContext();
        if (!$context) return [];

        $ids = [];
        foreach ((array) ($block['nodeIds'] ?? []) as $nid) {
            $nid = (int) $nid;
            if ($nid > 0) $ids[$nid] = true;
        }
        $rules = is_array($block['nodeRules'] ?? null) ? $block['nodeRules'] : [];
        if (!empty($rules)) {
            $match = (($block['nodeRulesMatch'] ?? 'any') === 'all') ? 'all' : 'any';
            foreach ($this->inventoryRuleEvaluator->matchNodeIds($context, $rules, $match) as $rid) {
                $ids[(int) $rid] = true;
            }
        }
        if (empty($ids)) return [];

        $nodes = $this->em->getRepository(Node::class)->findBy(['context' => $context, 'id' => array_keys($ids)]);
        // Preserve manual-selection order: manual nodeIds first (in given order),
        // then auto-matched nodes in repository order.
        $byId = [];
        foreach ($nodes as $n) $byId[$n->getId()] = $n;
        $ordered = [];
        foreach ((array) ($block['nodeIds'] ?? []) as $nid) {
            $nid = (int) $nid;
            if (isset($byId[$nid])) {
                $ordered[] = $byId[$nid];
                unset($byId[$nid]);
            }
        }
        foreach ($byId as $n) $ordered[] = $n;
        return $ordered;
    }

    /**
     * Bind a repeat_per_node iteration's current $node onto a child block.
     * The mapping per type mirrors how each block reads its "single node"
     * field — same shape as overlayScopeOnBlock, but with a concrete node
     * instead of an inherited scope. Add cases here when adding new allowed
     * child block types to the repeat container.
     */
    private function overlayCurrentNodeOnBlock(array $block, Node $node): array
    {
        $type = (string) ($block['type'] ?? '');
        $nodeId = (int) $node->getId();

        switch ($type) {
            case 'inventory_table':
                // Force single_node_full and bind the iteration's node.
                $block['mode'] = 'single_node_full';
                $block['singleNodeId'] = $nodeId;
                break;

            case 'heading':
                // Resolve {{for.node.xxx}} placeholders against the iteration node.
                if (isset($block['content']) && is_string($block['content'])) {
                    $block['content'] = $this->resolveForNodeVariables($block['content'], $node);
                }
                break;

            case 'paragraph':
                if (isset($block['content']) && is_string($block['content'])) {
                    $block['content'] = $this->resolveForNodeVariables($block['content'], $node);
                }
                break;

            case 'two_column':
                $block['leftBlocks'] = array_map(
                    fn($c) => is_array($c) ? $this->overlayCurrentNodeOnBlock($c, $node) : $c,
                    $block['leftBlocks'] ?? [],
                );
                $block['rightBlocks'] = array_map(
                    fn($c) => is_array($c) ? $this->overlayCurrentNodeOnBlock($c, $node) : $c,
                    $block['rightBlocks'] ?? [],
                );
                break;
        }

        return $block;
    }

    /**
     * Resolve {{for.node.xxx}} placeholders against a given iteration node.
     * Two shapes are accepted:
     *   - {{for.node.<field>}}              → single-segment simple field
     *     (hostname, name, ip/ipAddress, manufacturer, model, version /
     *     discoveredVersion, productModel)
     *   - {{for.node.<cat>.<key>[.<col>]}}  → inventory lookup, matching the
     *     existing {{node.<cat>.<key>[.<col>]}} convention
     * Anything else is left untouched so the standard resolver can still pick
     * it up later in the pipeline.
     */
    private function resolveForNodeVariables(string $text, Node $node): string
    {
        if (strpos($text, '{{') === false) {
            return $text;
        }

        $simpleFields = [
            'hostname' => fn() => (string) ($node->getHostname() ?? ''),
            'name' => fn() => (string) ($node->getName() ?? ''),
            'ip' => fn() => (string) ($node->getIpAddress() ?? ''),
            'ipaddress' => fn() => (string) ($node->getIpAddress() ?? ''),
            'manufacturer' => fn() => (string) ($node->getManufacturer()?->getName() ?? ''),
            'model' => fn() => (string) ($node->getModel()?->getName() ?? ''),
            'version' => fn() => (string) ($node->getDiscoveredVersion() ?? ''),
            'discoveredversion' => fn() => (string) ($node->getDiscoveredVersion() ?? ''),
            'productmodel' => fn() => (string) ($node->getProductModel() ?? ''),
        ];

        // Inventory data cache for this node, keyed by lowercase
        // category → key → colLabel → value.
        $invData = null;
        $loadInv = function () use ($node, &$invData): array {
            if ($invData !== null) return $invData;
            $entries = $this->em->getRepository(NodeInventoryEntry::class)->findBy(['node' => $node]);
            $data = [];
            foreach ($entries as $entry) {
                $cat = mb_strtolower((string) $entry->getCategoryName());
                $key = mb_strtolower((string) $entry->getEntryKey());
                $col = mb_strtolower((string) $entry->getColLabel());
                $data[$cat][$key][$col] = $entry->getValue() ?? '';
            }
            $invData = $data;
            return $invData;
        };

        return preg_replace_callback(
            '/\{\{\s*for\.node\.([^}]+?)\s*\}\}/',
            function ($matches) use ($simpleFields, $loadInv) {
                $raw = trim($matches[1]);
                if ($raw === '') return $matches[0];

                $parts = explode('.', $raw);
                if (count($parts) === 1) {
                    $field = mb_strtolower($parts[0]);
                    if (isset($simpleFields[$field])) {
                        return $simpleFields[$field]();
                    }
                    // Unknown single-segment field — leave intact rather than
                    // emit an empty string, so the user spots the typo.
                    return $matches[0];
                }
                if (count($parts) === 2 || count($parts) === 3) {
                    $data = $loadInv();
                    $cat = mb_strtolower($parts[0]);
                    $key = mb_strtolower($parts[1]);
                    if (count($parts) === 2) {
                        if (isset($data[$cat][$key])) {
                            return (string) reset($data[$cat][$key]);
                        }
                        return '';
                    }
                    $col = mb_strtolower($parts[2]);
                    return (string) ($data[$cat][$key][$col] ?? '');
                }
                return $matches[0];
            },
            $text,
        );
    }

    /**
     * Walk the block tree to compute TOC entries. Mirrors the rendering pass:
     *   - "conditional" branches recurse only when their condition evaluates true
     *   - "two_column" recurses into both columns
     *   - any other "first" content block consumes the implicit AddPage of renderBlocks
     */
    private function collectTocEntries(
        array $blocks,
        int &$pageNum,
        bool &$firstBlockDone,
        array &$tocEntries,
        ?Node $forNode,
        ?Report $report,
    ): void {
        foreach ($blocks as $block) {
            $type = (string) ($block['type'] ?? '');

            if ($type === 'heading') {
                if (!$firstBlockDone) {
                    $pageNum++;
                    $firstBlockDone = true;
                } elseif (!empty($block['pageBreakBefore'])) {
                    $pageNum++;
                }
                $tocEntries[] = [
                    'level' => $block['level'] ?? 1,
                    'title' => $this->resolveNodeVariables($block['content'] ?? '', $forNode, $report),
                    'page' => $pageNum,
                ];
            } elseif ($type === 'two_column') {
                if (!$firstBlockDone) {
                    $pageNum++;
                    $firstBlockDone = true;
                } elseif (!empty($block['pageBreakBefore'])) {
                    $pageNum++;
                }
                $left = is_array($block['leftBlocks'] ?? null) ? $block['leftBlocks'] : [];
                $right = is_array($block['rightBlocks'] ?? null) ? $block['rightBlocks'] : [];
                $this->collectTocEntries($left, $pageNum, $firstBlockDone, $tocEntries, $forNode, $report);
                $this->collectTocEntries($right, $pageNum, $firstBlockDone, $tocEntries, $forNode, $report);
            } elseif ($type === 'conditional') {
                $shouldRender = $this->blockConditionEvaluator->evaluate(
                    is_array($block['condition'] ?? null) ? $block['condition'] : null,
                    $forNode,
                    $report,
                );
                if ($shouldRender) {
                    if (!$firstBlockDone) {
                        $pageNum++;
                        $firstBlockDone = true;
                    } elseif (!empty($block['pageBreakBefore'])) {
                        $pageNum++;
                    }
                    $children = is_array($block['children'] ?? null) ? $block['children'] : [];
                    $this->collectTocEntries($children, $pageNum, $firstBlockDone, $tocEntries, $forNode, $report);
                }
            } elseif ($type === 'repeat_per_node') {
                $rpnNodes = $this->resolveRepeatNodes($block, $forNode, $report);
                if (empty($rpnNodes)) {
                    continue;
                }
                if (!$firstBlockDone) {
                    $pageNum++;
                    $firstBlockDone = true;
                } elseif (!empty($block['pageBreakBefore'])) {
                    $pageNum++;
                }
                $children = is_array($block['children'] ?? null) ? $block['children'] : [];
                // Walk once per iteration so headings inside (when supported)
                // get a TOC entry per node. The current allowed children
                // (inventory_table) don't contribute headings, so this is a
                // no-op today but stays correct as more child types open up.
                foreach ($rpnNodes as $iterNode) {
                    $overlaid = array_map(
                        fn($c) => is_array($c) ? $this->overlayCurrentNodeOnBlock($c, $iterNode) : $c,
                        $children,
                    );
                    $this->collectTocEntries($overlaid, $pageNum, $firstBlockDone, $tocEntries, $forNode, $report);
                }
            } else {
                // Any other content block contributes only by consuming the implicit first AddPage.
                if (!$firstBlockDone) {
                    $pageNum++;
                    $firstBlockDone = true;
                }
            }
        }
    }

    /**
     * Walk the block tree and return a flat list of recommendation source
     * blocks (`compliance_recommendations`, `static_recommendations`) in document
     * order, descending into containers exactly like the rendering pass:
     *   - two_column: visit leftBlocks then rightBlocks
     *   - conditional: visit children only when the condition evaluates true,
     *     applying the same scope inheritance as renderBlocks() so the
     *     produced blocks match what was actually rendered.
     * The returned blocks can then be looked up against $summaryPageMap which
     * is populated during the rendering pass.
     */
    private function collectRecommendationSources(array $blocks, ?Node $forNode, ?Report $report): array
    {
        $out = [];
        foreach ($blocks as $b) {
            if (!is_array($b)) continue;
            $type = (string) ($b['type'] ?? '');
            if ($type === 'compliance_recommendations' || $type === 'static_recommendations') {
                $out[] = $b;
            } elseif ($type === 'two_column') {
                $left = is_array($b['leftBlocks'] ?? null) ? $b['leftBlocks'] : [];
                $right = is_array($b['rightBlocks'] ?? null) ? $b['rightBlocks'] : [];
                foreach ($this->collectRecommendationSources($left, $forNode, $report) as $x) $out[] = $x;
                foreach ($this->collectRecommendationSources($right, $forNode, $report) as $x) $out[] = $x;
            } elseif ($type === 'conditional') {
                $cond = is_array($b['condition'] ?? null) ? $b['condition'] : null;
                if (!$this->blockConditionEvaluator->evaluate($cond, $forNode, $report)) continue;
                $children = is_array($b['children'] ?? null) ? $b['children'] : [];
                if (!empty($b['inheritScopeToChildren'])) {
                    $parentScope = $this->blockConditionEvaluator->extractInheritedScope($cond);
                    if ($parentScope !== null) {
                        $children = array_map(
                            fn($c) => is_array($c) ? $this->overlayScopeOnBlock($c, $parentScope) : $c,
                            $children,
                        );
                    }
                }
                foreach ($this->collectRecommendationSources($children, $forNode, $report) as $x) $out[] = $x;
            } elseif ($type === 'repeat_per_node') {
                $rpnNodes = $this->resolveRepeatNodes($b, $forNode, $report);
                $children = is_array($b['children'] ?? null) ? $b['children'] : [];
                foreach ($rpnNodes as $iterNode) {
                    $overlaid = array_map(
                        fn($c) => is_array($c) ? $this->overlayCurrentNodeOnBlock($c, $iterNode) : $c,
                        $children,
                    );
                    foreach ($this->collectRecommendationSources($overlaid, $forNode, $report) as $x) $out[] = $x;
                }
            }
        }
        return $out;
    }

    /**
     * True when a `recommendation_summary` block exists anywhere in the tree
     * (top-level, in two_column columns, or nested inside conditionals — even
     * conditionals whose condition is currently false). The check is
     * unconditional on purpose: it triggers the two-pass render that builds
     * $summaryPageMap, so a false positive only costs an extra pass while a
     * false negative would silently break page numbering in the summary.
     */
    private function containsRecommendationSummary(array $blocks): bool
    {
        foreach ($blocks as $b) {
            if (!is_array($b)) continue;
            $type = (string) ($b['type'] ?? '');
            if ($type === 'recommendation_summary') return true;
            if ($type === 'two_column') {
                $left = is_array($b['leftBlocks'] ?? null) ? $b['leftBlocks'] : [];
                $right = is_array($b['rightBlocks'] ?? null) ? $b['rightBlocks'] : [];
                if ($this->containsRecommendationSummary($left)) return true;
                if ($this->containsRecommendationSummary($right)) return true;
            } elseif ($type === 'conditional') {
                $children = is_array($b['children'] ?? null) ? $b['children'] : [];
                if ($this->containsRecommendationSummary($children)) return true;
            } elseif ($type === 'repeat_per_node') {
                $children = is_array($b['children'] ?? null) ? $b['children'] : [];
                if ($this->containsRecommendationSummary($children)) return true;
            }
        }
        return false;
    }

    /**
     * Resolve the set of nodes for chart_inventory blocks. Supports three modes:
     *   - all     : every node of the report's context
     *   - tag     : nodes carrying any of the selected tags (block['tagIds'])
     *   - device  : nodes explicitly listed in block['nodeIds']
     * Defaults to "all" when no mode is set so an empty selection still renders.
     * For node-type reports, $forNode short-circuits everything.
     */
    private function resolveChartNodes(array $block, ?Node $forNode, ?Report $report): array
    {
        if ($forNode) {
            return [$forNode];
        }
        $context = $report?->getContext();
        if (!$context) return [];

        $mode = (string) ($block['deviceSelectionMode'] ?? 'all');
        if (!in_array($mode, ['all', 'tag', 'device'], true)) $mode = 'all';

        if ($mode === 'device') {
            $explicit = [];
            foreach (($block['nodeIds'] ?? []) as $nid) {
                $n = $this->em->getRepository(Node::class)->find((int) $nid);
                if ($n && $n->getContext() === $context) {
                    $explicit[$n->getId()] = $n;
                }
            }
            return array_values($explicit);
        }

        if ($mode === 'tag') {
            $tagIds = array_map('intval', (array) ($block['tagIds'] ?? []));
            if (empty($tagIds)) return [];
            return $this->tagResolver->getNodesWithAnyTag($context, $tagIds);
        }

        // mode = all
        return $this->em->getRepository(Node::class)->findBy(['context' => $context]);
    }

    /**
     * Compute (labels, series) from nodes + dimensions for chart_inventory.
     * Returns [array<string>, array<{name,color,data:array<float>}>].
     *
     * @param array|null $metric { kind: count|value, category, entryKey?, colLabel, aggregation?: sum|avg|min|max }
     */
    private function aggregateChartData(array $nodes, array $primary, ?array $secondary, string $kind, ?array $metric = null): array
    {
        $invRepo = $this->em->getRepository(NodeInventoryEntry::class);

        $resolveDim = function (Node $n, array $dim) use ($invRepo): array {
            $kindD = (string) ($dim['kind'] ?? '');
            switch ($kindD) {
                case 'device':
                    return [(string) ($n->getHostname() ?? $n->getName() ?? $n->getIpAddress() ?? '—')];
                case 'discoveredVersion':
                    return [(string) ($n->getDiscoveredVersion() ?? '—')];
                case 'productModel':
                    return [(string) ($n->getProductModel() ?? '—')];
                case 'manufacturer':
                    return [(string) ($n->getManufacturer()?->getName() ?? '—')];
                case 'model':
                    return [(string) ($n->getModel()?->getName() ?? '—')];
                case 'productRange': {
                    $pr = $this->lifecycleCalculator->findProductRange($n);
                    return [$pr ? (string) $pr->getName() : '—'];
                }
                case 'tag': {
                    $names = [];
                    foreach ($this->tagResolver->getTagsForNode($n) as $tg) {
                        $names[] = (string) $tg->getName();
                    }
                    return empty($names) ? ['—'] : $names;
                }
                case 'inventory': {
                    $cat = (string) ($dim['category'] ?? '');
                    $col = (string) ($dim['colLabel'] ?? '');
                    $entry = (string) ($dim['entryKey'] ?? '');
                    if ($cat === '' || $col === '') return ['—'];
                    $qb = $invRepo->createQueryBuilder('e')
                        ->select('e.value AS val')
                        ->where('e.node = :n')
                        ->andWhere('e.categoryName = :cat')
                        ->andWhere('e.colLabel = :col')
                        ->setParameter('n', $n)
                        ->setParameter('cat', $cat)
                        ->setParameter('col', $col);
                    if ($entry !== '') {
                        $qb->andWhere('e.entryKey = :entry')->setParameter('entry', $entry);
                    }
                    $rows = $qb->getQuery()->getArrayResult();
                    $vals = [];
                    foreach ($rows as $r) {
                        $v = trim((string) ($r['val'] ?? ''));
                        if ($v !== '') $vals[] = $v;
                    }
                    return empty($vals) ? ['—'] : $vals;
                }
                default:
                    return ['—'];
            }
        };

        // Resolve a numeric value for $n from the metric configuration. Returns
        // null when no value is available (entry missing, non-parsable). The
        // raw inventory string is parsed for its first numeric token, so values
        // like "35.5°C" or "55%" become 35.5 / 55.
        $metricKind = (string) ($metric['kind'] ?? 'count');
        $metricCat = (string) ($metric['category'] ?? '');
        $metricCol = (string) ($metric['colLabel'] ?? '');
        $metricEntry = (string) ($metric['entryKey'] ?? '');
        $resolveValue = function (Node $n) use ($invRepo, $metricCat, $metricCol, $metricEntry): ?array {
            if ($metricCat === '' || $metricCol === '') return null;
            $qb = $invRepo->createQueryBuilder('e')
                ->select('e.value AS val')
                ->where('e.node = :n')
                ->andWhere('e.categoryName = :cat')
                ->andWhere('e.colLabel = :col')
                ->setParameter('n', $n)
                ->setParameter('cat', $metricCat)
                ->setParameter('col', $metricCol);
            if ($metricEntry !== '') {
                $qb->andWhere('e.entryKey = :entry')->setParameter('entry', $metricEntry);
            }
            $rows = $qb->getQuery()->getArrayResult();
            $vals = [];
            foreach ($rows as $r) {
                $raw = (string) ($r['val'] ?? '');
                if (preg_match('/-?\d+(?:[.,]\d+)?/', $raw, $m)) {
                    $vals[] = (float) str_replace(',', '.', $m[0]);
                }
            }
            return empty($vals) ? null : $vals;
        };

        // Aggregator: sum/avg/min/max applied to the bucket. We accumulate raw
        // numeric values per bucket then reduce at the end.
        $useValue = ($metricKind === 'value');
        $agg = (string) ($metric['aggregation'] ?? 'sum');
        if (!in_array($agg, ['sum', 'avg', 'min', 'max'], true)) $agg = 'sum';

        $bucketsRaw = [];   // pv => svKey => float[]  (raw values, mode value)
        $counts = [];       // pv => svKey => float    (mode count, or reduced result)
        $primaryOrder = [];
        $secondaryOrder = [];
        foreach ($nodes as $n) {
            $primVals = $resolveDim($n, $primary);
            $secVals = $secondary ? $resolveDim($n, $secondary) : [null];
            $nodeNumericValues = $useValue ? ($resolveValue($n) ?? null) : null;
            foreach ($primVals as $pv) {
                if (!isset($counts[$pv])) {
                    $counts[$pv] = [];
                    $bucketsRaw[$pv] = [];
                    $primaryOrder[] = $pv;
                }
                foreach ($secVals as $sv) {
                    $svKey = $sv === null ? '__total__' : $sv;
                    if (!isset($counts[$pv][$svKey])) {
                        $counts[$pv][$svKey] = 0;
                        $bucketsRaw[$pv][$svKey] = [];
                        if ($sv !== null && !in_array($sv, $secondaryOrder, true)) {
                            $secondaryOrder[] = $sv;
                        }
                    }
                    if ($useValue) {
                        if ($nodeNumericValues !== null) {
                            foreach ($nodeNumericValues as $nv) {
                                $bucketsRaw[$pv][$svKey][] = $nv;
                            }
                        }
                    } else {
                        $counts[$pv][$svKey]++;
                    }
                }
            }
        }

        // Reduce raw numeric values according to aggregation when in value mode.
        if ($useValue) {
            foreach ($bucketsRaw as $pv => $svBuckets) {
                foreach ($svBuckets as $svKey => $vals) {
                    if (empty($vals)) {
                        $counts[$pv][$svKey] = 0;
                        continue;
                    }
                    $counts[$pv][$svKey] = match ($agg) {
                        'avg' => array_sum($vals) / count($vals),
                        'min' => min($vals),
                        'max' => max($vals),
                        default => array_sum($vals),
                    };
                }
            }
        }

        // Sort labels alphabetically for stability
        sort($primaryOrder);
        sort($secondaryOrder);

        $palette = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#a855f7', '#84cc16', '#f97316', '#ec4899', '#14b8a6'];

        if (!$secondary) {
            // Single series — use primary palette per label for pie/treemap, single series for others
            $data = [];
            foreach ($primaryOrder as $pv) {
                $data[] = (float) ($counts[$pv]['__total__'] ?? 0);
            }
            $isPieLike = ($kind === 'pie' || $kind === 'treemap');
            if ($isPieLike) {
                $series = [];
                foreach ($primaryOrder as $idxP => $pv) {
                    $series[] = [
                        'name' => $pv,
                        'color' => $palette[$idxP % count($palette)],
                        'data' => [$data[$idxP]],
                    ];
                }
                return [['Total'], $series];
            }
            return [$primaryOrder, [[
                'name' => 'Total',
                'color' => $palette[0],
                'data' => $data,
            ]]];
        }

        // With secondary: each secondary value becomes a series
        $series = [];
        foreach ($secondaryOrder as $idxS => $sv) {
            $row = [];
            foreach ($primaryOrder as $pv) {
                $row[] = (float) ($counts[$pv][$sv] ?? 0);
            }
            $series[] = [
                'name' => $sv,
                'color' => $palette[$idxS % count($palette)],
                'data' => $row,
            ];
        }
        return [$primaryOrder, $series];
    }

    /**
     * Compute the [width, height] in mm for a chart block, respecting the
     * widthAuto/heightAuto flags. Auto width fills the page content width;
     * auto height fills the remaining vertical space on the current page.
     * Triggers a page break when auto-height would otherwise be < 50mm so
     * an "auto" chart still gets a usable canvas instead of squeezing into
     * a few mm at the bottom of a page.
     */
    private function resolveChartDimensions(TCPDF $pdf, array $block, float $mLeft, float $mRight, float $mTop, float $mBottom): array
    {
        $contentW = $pdf->getPageWidth() - $mLeft - $mRight;
        $w = !empty($block['widthAuto']) ? $contentW : (float) ($block['width'] ?? 160);
        $w = min($w, $contentW);

        if (!empty($block['heightAuto'])) {
            $remaining = $pdf->getPageHeight() - $mBottom - max($pdf->GetY(), $mTop);
            // Title (≈6) + legend (≈6) + buffer (4) ≈ 16mm overhead
            $available = $remaining - 16;
            if ($available < 50) {
                // Not enough room — start fresh on next page
                $pdf->AddPage();
                $available = $pdf->getPageHeight() - $mBottom - $pdf->GetY() - 16;
            }
            $h = max(50.0, $available);
        } else {
            $h = (float) ($block['height'] ?? 80);
        }
        return [$w, $h];
    }

    /**
     * Reorder labels (and the parallel series.data arrays) according to a sort
     * configuration. `$sort = ['by' => 'label'|'value', 'direction' => 'asc'|'desc']`.
     * For 'value', sorts by total of all series at each label position.
     * Mutates $labels and $series in place.
     */
    private function applyChartSort(array &$labels, array &$series, ?array $sort): void
    {
        if (!$sort) return;
        $by = (string) ($sort['by'] ?? 'label');
        $dirSign = (($sort['direction'] ?? 'asc') === 'desc') ? -1 : 1;
        $n = count($labels);
        if ($n <= 1) return;
        $indices = range(0, $n - 1);
        if ($by === 'label') {
            usort($indices, fn($a, $b) => strcmp((string) $labels[$a], (string) $labels[$b]) * $dirSign);
        } elseif ($by === 'value') {
            usort($indices, function ($a, $b) use ($series, $dirSign) {
                $sumA = 0.0; $sumB = 0.0;
                foreach ($series as $s) {
                    $sumA += (float) (($s['data'] ?? [])[$a] ?? 0);
                    $sumB += (float) (($s['data'] ?? [])[$b] ?? 0);
                }
                return ($sumA <=> $sumB) * $dirSign;
            });
        } else {
            return;
        }
        $labels = array_values(array_map(fn($i) => $labels[$i], $indices));
        $series = array_map(function ($s) use ($indices) {
            $newData = [];
            foreach ($indices as $i) {
                $newData[] = ($s['data'] ?? [])[$i] ?? 0;
            }
            $s['data'] = $newData;
            return $s;
        }, $series);
    }

    /**
     * Apply a color rule against (label, seriesName, value); first match wins.
     * Returns the rule color or $default when no rule matches.
     */
    private function pickRuleColor(array $rules, string $label, string $seriesName, ?float $value, string $default): string
    {
        foreach ($rules as $r) {
            $kind = (string) ($r['kind'] ?? 'label');
            $color = (string) ($r['color'] ?? $default);
            if ($kind === 'value') {
                if ($value === null) continue;
                $op = (string) ($r['valueOp'] ?? 'eq');
                $a = (float) ($r['valueA'] ?? 0);
                $b = (float) ($r['valueB'] ?? 0);
                $match = match ($op) {
                    'lt' => $value < $a,
                    'lte' => $value <= $a,
                    'gt' => $value > $a,
                    'gte' => $value >= $a,
                    'eq' => abs($value - $a) < 1e-9,
                    'between' => $value >= min($a, $b) && $value <= max($a, $b),
                    default => false,
                };
                if ($match) return $color;
            } else {
                $haystack = $kind === 'series' ? $seriesName : $label;
                $op = (string) ($r['textOp'] ?? 'eq');
                $needle = (string) ($r['text'] ?? '');
                $match = match ($op) {
                    'eq' => $haystack === $needle,
                    'neq' => $haystack !== $needle,
                    'contains' => $needle !== '' && stripos($haystack, $needle) !== false,
                    'starts_with' => $needle !== '' && stripos($haystack, $needle) === 0,
                    default => false,
                };
                if ($match) return $color;
            }
        }
        return $default;
    }

    /**
     * Generic chart renderer dispatching on $kind. All loop variables prefixed with `$ch*`
     * to avoid collisions with the outer renderBlocks() loop.
     */
    private function renderChartArea(
        TCPDF $pdf,
        string $kind,
        string $title,
        array $labels,
        array $series,
        float $w,
        float $h,
        bool $showLegend,
        bool $showValues,
        bool $showAxes,
        float $mLeft,
        float $mRight,
        float $mBottom,
        string $bodyFont,
        array $bodyRgb,
        string $orientation = 'vertical',
        array $colorRules = [],
    ): void {
        // Apply series-level rules first: if a rule matches the series name,
        // override series.color so kinds that draw per-series (line, area, radar)
        // pick up the override automatically. Per-cell overrides for bars are
        // re-evaluated inside renderBarChart with full (label, series, value).
        if (!empty($colorRules)) {
            $series = array_map(function ($s) use ($colorRules) {
                $name = (string) ($s['name'] ?? '');
                $orig = (string) ($s['color'] ?? '#6366f1');
                $s['color'] = $this->pickRuleColor($colorRules, '', $name, null, $orig);
                return $s;
            }, $series);
        }
        $chPageW = $pdf->getPageWidth();
        $chContentW = $chPageW - $mLeft - $mRight;
        $chW = min($w, $chContentW);

        // Title
        $chTitleH = 0;
        if ($title !== '') {
            $chTitleH = 6;
        }

        // Legend layout
        $chLegendH = 0;
        if ($showLegend) {
            $chLegendH = 6;
        }

        $chTotalH = $chTitleH + $h + $chLegendH;
        $chYStart = $pdf->GetY();
        if ($chYStart + $chTotalH > $pdf->getPageHeight() - $mBottom) {
            $pdf->AddPage();
            $chYStart = $pdf->GetY();
        }

        $chX = $mLeft;
        $chY = $chYStart;

        if ($title !== '') {
            $pdf->SetFont($bodyFont, 'B', 11);
            $pdf->SetTextColor($bodyRgb[0], $bodyRgb[1], $bodyRgb[2]);
            $pdf->SetXY($chX, $chY);
            $pdf->Cell($chW, $chTitleH, $title, 0, 0, 'L');
            $chY += $chTitleH;
        }

        $chPlotX = $chX;
        $chPlotY = $chY;
        $chPlotW = $chW;
        $chPlotH = $h;

        switch ($kind) {
            case 'pie':
                $this->renderPieChart($pdf, $chPlotX, $chPlotY, $chPlotW, $chPlotH, $labels, $series, $showValues, $bodyFont, $bodyRgb, $colorRules);
                break;
            case 'treemap':
                $this->renderTreemap($pdf, $chPlotX, $chPlotY, $chPlotW, $chPlotH, $labels, $series, $showValues, $bodyFont, $bodyRgb, $colorRules);
                break;
            case 'radar':
                $this->renderRadar($pdf, $chPlotX, $chPlotY, $chPlotW, $chPlotH, $labels, $series, $showValues, $bodyFont, $bodyRgb);
                break;
            case 'line':
                $this->renderLineChart($pdf, $chPlotX, $chPlotY, $chPlotW, $chPlotH, $labels, $series, false, $showValues, $showAxes, $bodyFont, $bodyRgb);
                break;
            case 'area':
                $this->renderLineChart($pdf, $chPlotX, $chPlotY, $chPlotW, $chPlotH, $labels, $series, true, $showValues, $showAxes, $bodyFont, $bodyRgb);
                break;
            case 'stacked_bar':
                $this->renderBarChart($pdf, $chPlotX, $chPlotY, $chPlotW, $chPlotH, $labels, $series, $showValues, $showAxes, $bodyFont, $bodyRgb, 'stacked', $orientation, $colorRules);
                break;
            case 'bar':
            // Legacy 'histogram' blocks (saved before removal) fall through to grouped bars.
            case 'histogram':
            default:
                $this->renderBarChart($pdf, $chPlotX, $chPlotY, $chPlotW, $chPlotH, $labels, $series, $showValues, $showAxes, $bodyFont, $bodyRgb, 'grouped', $orientation, $colorRules);
                break;
        }

        $chY += $chPlotH;

        if ($showLegend) {
            $this->renderChartLegend($pdf, $chX, $chY, $chW, $chLegendH, $kind, $labels, $series, $bodyFont, $bodyRgb);
            $chY += $chLegendH;
        }

        $pdf->SetXY($mLeft, $chYStart + $chTotalH);
    }

    private function renderChartLegend(TCPDF $pdf, float $x, float $y, float $w, float $h, string $kind, array $labels, array $series, string $bodyFont, array $bodyRgb): void
    {
        $pdf->SetFont($bodyFont, '', 8);
        $pdf->SetTextColor($bodyRgb[0], $bodyRgb[1], $bodyRgb[2]);
        $clItems = [];
        if ($kind === 'pie' || $kind === 'treemap') {
            foreach ($series as $clIdx => $s) {
                $clItems[] = ['name' => (string) ($s['name'] ?? "#$clIdx"), 'color' => (string) ($s['color'] ?? '#6366f1')];
            }
        } else {
            foreach ($series as $clIdx => $s) {
                $clItems[] = ['name' => (string) ($s['name'] ?? "#$clIdx"), 'color' => (string) ($s['color'] ?? '#6366f1')];
            }
        }
        if (empty($clItems)) return;
        $clX = $x;
        $clY = $y + 1;
        foreach ($clItems as $clItem) {
            $clRgb = $this->hexToRgb($clItem['color']);
            $pdf->SetFillColor($clRgb[0], $clRgb[1], $clRgb[2]);
            $pdf->Rect($clX, $clY + 0.8, 3, 3, 'F');
            $clTxt = ' ' . $clItem['name'];
            $clTxtW = $pdf->GetStringWidth($clTxt) + 4;
            $pdf->SetXY($clX + 3, $clY);
            $pdf->Cell($clTxtW, 4, $clTxt, 0, 0, 'L');
            $clX += 3 + $clTxtW + 3;
            if ($clX > $x + $w - 20) {
                $clX = $x;
                $clY += 4;
            }
        }
    }

    /**
     * Render a bar/histogram/stacked-bar chart.
     * @param string $variant 'grouped' (default), 'stacked', or 'histogram'
     */
    private function renderBarChart(TCPDF $pdf, float $x, float $y, float $w, float $h, array $labels, array $series, bool $showValues, bool $showAxes, string $bodyFont, array $bodyRgb, string $variant = 'grouped', string $orientation = 'vertical', array $colorRules = []): void
    {
        if ($orientation === 'horizontal') {
            $this->renderBarChartHorizontal($pdf, $x, $y, $w, $h, $labels, $series, $showValues, $showAxes, $bodyFont, $bodyRgb, $variant, $colorRules);
            return;
        }
        $bcLabelCount = max(1, count($labels));
        $bcSeriesCount = max(1, count($series));
        $bcAxisLeft = $showAxes ? 14 : 2;
        $bcAxisBottom = $showAxes ? 9 : 2;
        $bcPlotX = $x + $bcAxisLeft;
        $bcPlotY = $y + 3;
        $bcPlotW = $w - $bcAxisLeft - 2;
        $bcPlotH = $h - $bcAxisBottom - 3;

        // Compute Y max — for stacked bars, the max is the per-category sum
        $bcMax = 0.0;
        if ($variant === 'stacked') {
            for ($bcLi = 0; $bcLi < $bcLabelCount; $bcLi++) {
                $bcSum = 0.0;
                foreach ($series as $bcS) {
                    $bcSum += max(0.0, (float) (($bcS['data'] ?? [])[$bcLi] ?? 0));
                }
                $bcMax = max($bcMax, $bcSum);
            }
        } else {
            foreach ($series as $bcS) {
                foreach (($bcS['data'] ?? []) as $bcV) {
                    $bcMax = max($bcMax, (float) $bcV);
                }
            }
        }
        if ($bcMax <= 0) $bcMax = 1.0;
        $bcNiceMax = $this->niceCeil($bcMax);

        // Horizontal grid lines first (under bars)
        $bcTicks = 4;
        $pdf->SetDrawColor(226, 232, 240);
        $pdf->SetLineWidth(0.1);
        for ($bcTick = 0; $bcTick <= $bcTicks; $bcTick++) {
            $bcTickY = $bcPlotY + $bcPlotH - ($bcPlotH * $bcTick / $bcTicks);
            $pdf->Line($bcPlotX, $bcTickY, $bcPlotX + $bcPlotW, $bcTickY);
        }

        if ($showAxes) {
            $pdf->SetDrawColor(148, 163, 184);
            $pdf->SetLineWidth(0.2);
            $pdf->Line($bcPlotX, $bcPlotY, $bcPlotX, $bcPlotY + $bcPlotH);
            $pdf->Line($bcPlotX, $bcPlotY + $bcPlotH, $bcPlotX + $bcPlotW, $bcPlotY + $bcPlotH);
            $pdf->SetFont($bodyFont, '', 6.5);
            $pdf->SetTextColor($bodyRgb[0], $bodyRgb[1], $bodyRgb[2]);
            for ($bcTick = 0; $bcTick <= $bcTicks; $bcTick++) {
                $bcTickV = $bcNiceMax * ($bcTick / $bcTicks);
                $bcTickY = $bcPlotY + $bcPlotH - ($bcPlotH * $bcTick / $bcTicks);
                $pdf->Line($bcPlotX - 0.8, $bcTickY, $bcPlotX, $bcTickY);
                $bcTickStr = (string) round($bcTickV, 1);
                $pdf->Text($bcPlotX - 1 - $pdf->GetStringWidth($bcTickStr), $bcTickY - 1.2, $bcTickStr);
            }
        }

        // Group geometry differs per variant:
        //  - histogram : no gap between bars (continuous distribution)
        //  - grouped   : 30% gap if 1 series else 20%, series side-by-side
        //  - stacked   : same gap as grouped but a single bar per category
        $bcGroupW = $bcPlotW / $bcLabelCount;
        $bcGroupGap = $bcGroupW * (($variant === 'stacked' || $bcSeriesCount === 1) ? 0.30 : 0.20);
        $bcBarsW = $bcGroupW - $bcGroupGap;
        if ($variant === 'stacked') {
            $bcBarW = $bcBarsW;
        } else {
            $bcInterBar = $bcSeriesCount > 1 ? 0.5 : 0;
            $bcBarW = ($bcBarsW - $bcInterBar * ($bcSeriesCount - 1)) / $bcSeriesCount;
        }

        // Vertical-center offset used by Text() to place the *visual* center of a
        // glyph at the requested Y. TCPDF's Text() renders a Cell(h=0), so the
        // visual cap-center sits at `y + FontSize × cell_height_ratio / 2`.
        // For our font (cell_height_ratio = 1.25): offset = FontSize_mm × 0.625.
        $bcCenterOffset6 = 6 * 0.3528 * 0.625;   // ≈ 1.32mm
        $bcCenterOffset65 = 6.5 * 0.3528 * 0.625; // ≈ 1.43mm

        if ($variant === 'stacked') {
            // One bar per category; iterate labels first, stack series from bottom up.
            foreach ($labels as $bcLi => $bcLabel) {
                $bcBx = $bcPlotX + $bcLi * $bcGroupW + $bcGroupGap / 2;
                $bcCurY = $bcPlotY + $bcPlotH;
                $bcStackTotal = 0.0;
                foreach ($series as $bcSi => $bcS) {
                    $bcVal = max(0.0, (float) (($bcS['data'] ?? [])[$bcLi] ?? 0));
                    if ($bcVal <= 0) continue;
                    $bcSegH = $bcPlotH * ($bcVal / $bcNiceMax);
                    $bcDefaultHex = (string) ($bcS['color'] ?? '#6366f1');
                    $bcCellHex = $this->pickRuleColor($colorRules, (string) $bcLabel, (string) ($bcS['name'] ?? ''), $bcVal, $bcDefaultHex);
                    $bcColor = $this->hexToRgb($bcCellHex);
                    $pdf->SetFillColor($bcColor[0], $bcColor[1], $bcColor[2]);
                    $pdf->SetDrawColor(max(0, $bcColor[0] - 30), max(0, $bcColor[1] - 30), max(0, $bcColor[2] - 30));
                    $pdf->SetLineWidth(0.15);
                    $pdf->Rect($bcBx, $bcCurY - $bcSegH, $bcBarW, $bcSegH, 'FD');
                    if ($showValues && $bcSegH > 4) {
                        $pdf->SetFont($bodyFont, 'B', 6);
                        $pdf->SetTextColor(255, 255, 255);
                        $bcValStr = (string) (int) round($bcVal);
                        $bcSegCenter = $bcCurY - $bcSegH / 2;
                        $pdf->Text(
                            $bcBx + ($bcBarW - $pdf->GetStringWidth($bcValStr)) / 2,
                            $bcSegCenter - $bcCenterOffset6,
                            $bcValStr
                        );
                    }
                    $bcCurY -= $bcSegH;
                    $bcStackTotal += $bcVal;
                }
                // Total above the stack — only stacked + histogram show a total
                if ($showValues && $bcStackTotal > 0) {
                    $pdf->SetFont($bodyFont, 'B', 6.5);
                    $pdf->SetTextColor($bodyRgb[0], $bodyRgb[1], $bodyRgb[2]);
                    $bcTotStr = (string) (int) round($bcStackTotal);
                    // Visual cap-bottom 0.5mm above bar top: Text(y) places visual
                    // center at y + 1.43; we want center at bcCurY - 1.5.
                    $pdf->Text(
                        $bcBx + ($bcBarW - $pdf->GetStringWidth($bcTotStr)) / 2,
                        $bcCurY - 1.5 - $bcCenterOffset65,
                        $bcTotStr
                    );
                }
            }
        } else {
            // grouped: single bar per series per category, side-by-side.
            foreach ($series as $bcSi => $bcS) {
                $bcDefaultHex = (string) ($bcS['color'] ?? '#6366f1');
                foreach ($labels as $bcLi => $bcLabel) {
                    $bcVal = (float) (($bcS['data'] ?? [])[$bcLi] ?? 0);
                    $bcBarH = $bcPlotH * ($bcVal / $bcNiceMax);
                    if ($bcBarH < 0) $bcBarH = 0;
                    $bcInterBar = $bcSeriesCount > 1 ? 0.5 : 0;
                    $bcBx = $bcPlotX + $bcLi * $bcGroupW + $bcGroupGap / 2 + $bcSi * ($bcBarW + $bcInterBar);
                    $bcBy = $bcPlotY + $bcPlotH - $bcBarH;
                    $bcCellHex = $this->pickRuleColor($colorRules, (string) $bcLabel, (string) ($bcS['name'] ?? ''), $bcVal, $bcDefaultHex);
                    $bcColor = $this->hexToRgb($bcCellHex);
                    $pdf->SetFillColor($bcColor[0], $bcColor[1], $bcColor[2]);
                    $pdf->SetDrawColor(max(0, $bcColor[0] - 30), max(0, $bcColor[1] - 30), max(0, $bcColor[2] - 30));
                    $pdf->SetLineWidth(0.15);
                    if ($bcBarH > 0.1) {
                        $pdf->Rect($bcBx, $bcBy, $bcBarW, $bcBarH, 'FD');
                    }
                    if ($showValues && $bcVal > 0) {
                        $bcValStr = (string) (int) round($bcVal);
                        $bcStrW = $pdf->GetStringWidth($bcValStr);
                        $bcCx = $bcBx + ($bcBarW - $bcStrW) / 2;
                        // Value INSIDE the bar (centered) when there's room
                        if ($bcBarH >= 4) {
                            $pdf->SetFont($bodyFont, 'B', 6);
                            $pdf->SetTextColor(255, 255, 255);
                            $bcBarCenter = $bcBy + $bcBarH / 2;
                            $pdf->Text($bcCx, $bcBarCenter - $bcCenterOffset6, $bcValStr);
                        } else {
                            // Bar too small — show value above instead, body color
                            $pdf->SetFont($bodyFont, 'B', 6);
                            $pdf->SetTextColor($bodyRgb[0], $bodyRgb[1], $bodyRgb[2]);
                            $pdf->Text($bcCx, $bcBy - 1.5 - $bcCenterOffset6, $bcValStr);
                        }
                    }
                }
            }
        }

        // X labels
        if ($showAxes) {
            $pdf->SetFont($bodyFont, '', 6.5);
            $pdf->SetTextColor($bodyRgb[0], $bodyRgb[1], $bodyRgb[2]);
            foreach ($labels as $bcLi => $bcLabel) {
                $bcLx = $bcPlotX + $bcLi * $bcGroupW + $bcGroupW / 2;
                $bcDisplay = (string) $bcLabel;
                $bcLabelW = $pdf->GetStringWidth($bcDisplay);
                if ($bcLabelW > $bcGroupW - 1) {
                    while ($bcLabelW > $bcGroupW - 1 && strlen($bcDisplay) > 3) {
                        $bcDisplay = substr($bcDisplay, 0, -1);
                        $bcLabelW = $pdf->GetStringWidth($bcDisplay . '…');
                    }
                    $bcDisplay .= '…';
                }
                $pdf->Text($bcLx - $pdf->GetStringWidth($bcDisplay) / 2, $bcPlotY + $bcPlotH + 2, $bcDisplay);
            }
        }
    }

    /**
     * Horizontal bar variant: categories on Y axis, values on X axis.
     * Variables prefixed `$hb*` for clarity (h = horizontal).
     */
    private function renderBarChartHorizontal(TCPDF $pdf, float $x, float $y, float $w, float $h, array $labels, array $series, bool $showValues, bool $showAxes, string $bodyFont, array $bodyRgb, string $variant = 'grouped', array $colorRules = []): void
    {
        $hbLabelCount = max(1, count($labels));
        $hbSeriesCount = max(1, count($series));

        // Reserve a left strip for category labels — width adapts to longest label.
        $pdf->SetFont($bodyFont, '', 6.5);
        $hbCatW = 0.0;
        foreach ($labels as $hbLbl) {
            $hbCatW = max($hbCatW, $pdf->GetStringWidth((string) $hbLbl));
        }
        $hbCatW = min(max(20, $hbCatW + 3), $w * 0.45);
        $hbAxisBottom = $showAxes ? 8 : 2;
        $hbPlotX = $x + $hbCatW;
        $hbPlotY = $y + 2;
        $hbPlotW = $w - $hbCatW - 4;
        $hbPlotH = $h - $hbAxisBottom - 2;

        // Compute X max (was Y max in vertical mode)
        $hbMax = 0.0;
        if ($variant === 'stacked') {
            for ($hbLi = 0; $hbLi < $hbLabelCount; $hbLi++) {
                $hbSum = 0.0;
                foreach ($series as $hbS) {
                    $hbSum += max(0.0, (float) (($hbS['data'] ?? [])[$hbLi] ?? 0));
                }
                $hbMax = max($hbMax, $hbSum);
            }
        } else {
            foreach ($series as $hbS) {
                foreach (($hbS['data'] ?? []) as $hbV) {
                    $hbMax = max($hbMax, (float) $hbV);
                }
            }
        }
        if ($hbMax <= 0) $hbMax = 1.0;
        $hbNiceMax = $this->niceCeil($hbMax);

        // Vertical grid lines
        $hbTicks = 4;
        $pdf->SetDrawColor(226, 232, 240);
        $pdf->SetLineWidth(0.1);
        for ($hbTick = 0; $hbTick <= $hbTicks; $hbTick++) {
            $hbTickX = $hbPlotX + $hbPlotW * $hbTick / $hbTicks;
            $pdf->Line($hbTickX, $hbPlotY, $hbTickX, $hbPlotY + $hbPlotH);
        }

        if ($showAxes) {
            $pdf->SetDrawColor(148, 163, 184);
            $pdf->SetLineWidth(0.2);
            $pdf->Line($hbPlotX, $hbPlotY, $hbPlotX, $hbPlotY + $hbPlotH);
            $pdf->Line($hbPlotX, $hbPlotY + $hbPlotH, $hbPlotX + $hbPlotW, $hbPlotY + $hbPlotH);
            $pdf->SetFont($bodyFont, '', 6.5);
            $pdf->SetTextColor($bodyRgb[0], $bodyRgb[1], $bodyRgb[2]);
            for ($hbTick = 0; $hbTick <= $hbTicks; $hbTick++) {
                $hbTickV = $hbNiceMax * ($hbTick / $hbTicks);
                $hbTickX = $hbPlotX + $hbPlotW * $hbTick / $hbTicks;
                $pdf->Line($hbTickX, $hbPlotY + $hbPlotH, $hbTickX, $hbPlotY + $hbPlotH + 0.8);
                $hbTickStr = (string) round($hbTickV, 1);
                $pdf->Text($hbTickX - $pdf->GetStringWidth($hbTickStr) / 2, $hbPlotY + $hbPlotH + 1.5, $hbTickStr);
            }
        }

        $hbGroupH = $hbPlotH / $hbLabelCount;
        $hbGroupGap = $hbGroupH * (($variant === 'stacked' || $hbSeriesCount === 1) ? 0.30 : 0.20);
        $hbBarsH = $hbGroupH - $hbGroupGap;
        if ($variant === 'stacked') {
            $hbBarH = $hbBarsH;
        } else {
            $hbInterBar = $hbSeriesCount > 1 ? 0.5 : 0;
            $hbBarH = ($hbBarsH - $hbInterBar * ($hbSeriesCount - 1)) / $hbSeriesCount;
        }

        // Centering offsets (text size in mm × 0.625)
        $hbCenterOffset6 = 6 * 0.3528 * 0.625;
        $hbCenterOffset65 = 6.5 * 0.3528 * 0.625;

        // Category labels (left strip). Use a Cell with valign='M' centered on
        // the bar's row — this aligns label baseline-correctly regardless of
        // TCPDF's cell_height_ratio, avoiding manual baseline math.
        $pdf->SetFont($bodyFont, '', 6.5);
        $pdf->SetTextColor($bodyRgb[0], $bodyRgb[1], $bodyRgb[2]);
        // Save & zero cell padding so the label cell hugs the row geometry.
        $hbSavedPadding = $pdf->getCellPaddings();
        $pdf->SetCellPaddings(0, 0, 0, 0);
        foreach ($labels as $hbLi => $hbLbl) {
            // Center the bar block (height $hbBarsH) on the row's middle.
            $hbBarBlockTop = $hbPlotY + $hbLi * $hbGroupH + $hbGroupGap / 2;
            $hbDisplay = (string) $hbLbl;
            // Truncate to fit the left strip
            while ($pdf->GetStringWidth($hbDisplay) > $hbCatW - 1.5 && strlen($hbDisplay) > 3) {
                $hbDisplay = substr($hbDisplay, 0, -1);
            }
            if ($hbDisplay !== (string) $hbLbl) $hbDisplay .= '…';
            $pdf->SetXY($x, $hbBarBlockTop);
            $pdf->Cell($hbCatW - 1.5, $hbBarsH, $hbDisplay, 0, 0, 'R', false, '', 0, false, 'T', 'M');
        }
        $pdf->SetCellPaddings($hbSavedPadding['L'], $hbSavedPadding['T'], $hbSavedPadding['R'], $hbSavedPadding['B']);

        if ($variant === 'stacked') {
            foreach ($labels as $hbLi => $hbLbl) {
                $hbBy = $hbPlotY + $hbLi * $hbGroupH + $hbGroupGap / 2;
                $hbCurX = $hbPlotX;
                $hbStackTotal = 0.0;
                foreach ($series as $hbS) {
                    $hbVal = max(0.0, (float) (($hbS['data'] ?? [])[$hbLi] ?? 0));
                    if ($hbVal <= 0) continue;
                    $hbSegW = $hbPlotW * ($hbVal / $hbNiceMax);
                    $hbDefaultHex = (string) ($hbS['color'] ?? '#6366f1');
                    $hbCellHex = $this->pickRuleColor($colorRules, (string) $hbLbl, (string) ($hbS['name'] ?? ''), $hbVal, $hbDefaultHex);
                    $hbColor = $this->hexToRgb($hbCellHex);
                    $pdf->SetFillColor($hbColor[0], $hbColor[1], $hbColor[2]);
                    $pdf->SetDrawColor(max(0, $hbColor[0] - 30), max(0, $hbColor[1] - 30), max(0, $hbColor[2] - 30));
                    $pdf->SetLineWidth(0.15);
                    $pdf->Rect($hbCurX, $hbBy, $hbSegW, $hbBarH, 'FD');
                    if ($showValues && $hbSegW > 6) {
                        $pdf->SetFont($bodyFont, 'B', 6);
                        $pdf->SetTextColor(255, 255, 255);
                        $hbValStr = (string) (int) round($hbVal);
                        $hbStrW2 = $pdf->GetStringWidth($hbValStr);
                        $pdf->Text(
                            $hbCurX + ($hbSegW - $hbStrW2) / 2,
                            $hbBy + $hbBarH / 2 - $hbCenterOffset6,
                            $hbValStr
                        );
                    }
                    $hbCurX += $hbSegW;
                    $hbStackTotal += $hbVal;
                }
                if ($showValues && $hbStackTotal > 0) {
                    $pdf->SetFont($bodyFont, 'B', 6.5);
                    $pdf->SetTextColor($bodyRgb[0], $bodyRgb[1], $bodyRgb[2]);
                    $hbTotStr = (string) (int) round($hbStackTotal);
                    $pdf->Text(
                        $hbCurX + 1.0,
                        $hbBy + $hbBarH / 2 - $hbCenterOffset65,
                        $hbTotStr
                    );
                }
            }
        } else {
            foreach ($series as $hbSi => $hbS) {
                $hbDefaultHex = (string) ($hbS['color'] ?? '#6366f1');
                foreach ($labels as $hbLi => $hbLbl) {
                    $hbVal = (float) (($hbS['data'] ?? [])[$hbLi] ?? 0);
                    $hbBarW = $hbPlotW * ($hbVal / $hbNiceMax);
                    if ($hbBarW < 0) $hbBarW = 0;
                    $hbInterBar = $hbSeriesCount > 1 ? 0.5 : 0;
                    $hbBy = $hbPlotY + $hbLi * $hbGroupH + $hbGroupGap / 2 + $hbSi * ($hbBarH + $hbInterBar);
                    $hbCellHex = $this->pickRuleColor($colorRules, (string) $hbLbl, (string) ($hbS['name'] ?? ''), $hbVal, $hbDefaultHex);
                    $hbColor = $this->hexToRgb($hbCellHex);
                    $pdf->SetFillColor($hbColor[0], $hbColor[1], $hbColor[2]);
                    $pdf->SetDrawColor(max(0, $hbColor[0] - 30), max(0, $hbColor[1] - 30), max(0, $hbColor[2] - 30));
                    $pdf->SetLineWidth(0.15);
                    if ($hbBarW > 0.1) {
                        $pdf->Rect($hbPlotX, $hbBy, $hbBarW, $hbBarH, 'FD');
                    }
                    if ($showValues && $hbVal > 0) {
                        $hbValStr = (string) (int) round($hbVal);
                        $pdf->SetFont($bodyFont, 'B', 6);
                        $hbStrW2 = $pdf->GetStringWidth($hbValStr);
                        if ($hbBarW >= $hbStrW2 + 2) {
                            $pdf->SetTextColor(255, 255, 255);
                            $pdf->Text(
                                $hbPlotX + $hbBarW - $hbStrW2 - 1,
                                $hbBy + $hbBarH / 2 - $hbCenterOffset6,
                                $hbValStr
                            );
                        } else {
                            $pdf->SetTextColor($bodyRgb[0], $bodyRgb[1], $bodyRgb[2]);
                            $pdf->Text(
                                $hbPlotX + $hbBarW + 1,
                                $hbBy + $hbBarH / 2 - $hbCenterOffset6,
                                $hbValStr
                            );
                        }
                    }
                }
            }
        }
    }

    /**
     * Round a positive number up to a "nice" value (1, 2, 5 × 10^k) for chart Y axes.
     */
    private function niceCeil(float $v): float
    {
        if ($v <= 0) return 1.0;
        $exp = (int) floor(log10($v));
        $base = pow(10, $exp);
        $frac = $v / $base;
        if ($frac <= 1) return 1 * $base;
        if ($frac <= 2) return 2 * $base;
        if ($frac <= 5) return 5 * $base;
        return 10 * $base;
    }

    private function renderLineChart(TCPDF $pdf, float $x, float $y, float $w, float $h, array $labels, array $series, bool $area, bool $showValues, bool $showAxes, string $bodyFont, array $bodyRgb): void
    {
        $lcLabelCount = max(1, count($labels));
        $lcAxisLeft = $showAxes ? 12 : 2;
        $lcAxisBottom = $showAxes ? 8 : 2;
        $lcPlotX = $x + $lcAxisLeft;
        $lcPlotY = $y + 2;
        $lcPlotW = $w - $lcAxisLeft - 2;
        $lcPlotH = $h - $lcAxisBottom - 2;

        $lcMax = 0.0;
        foreach ($series as $lcS) {
            foreach (($lcS['data'] ?? []) as $lcV) {
                $lcMax = max($lcMax, (float) $lcV);
            }
        }
        if ($lcMax <= 0) $lcMax = 1.0;

        if ($showAxes) {
            $pdf->SetDrawColor(180, 180, 180);
            $pdf->SetLineWidth(0.15);
            $pdf->Line($lcPlotX, $lcPlotY, $lcPlotX, $lcPlotY + $lcPlotH);
            $pdf->Line($lcPlotX, $lcPlotY + $lcPlotH, $lcPlotX + $lcPlotW, $lcPlotY + $lcPlotH);
            $pdf->SetFont($bodyFont, '', 6.5);
            $pdf->SetTextColor($bodyRgb[0], $bodyRgb[1], $bodyRgb[2]);
            for ($lcTick = 0; $lcTick <= 4; $lcTick++) {
                $lcTickY = $lcPlotY + $lcPlotH - ($lcPlotH * $lcTick / 4);
                $pdf->Line($lcPlotX - 0.8, $lcTickY, $lcPlotX, $lcTickY);
                $pdf->Text($x + 1, $lcTickY - 1.2, (string) round($lcMax * $lcTick / 4, 1));
            }
        }

        $lcStepX = $lcLabelCount > 1 ? $lcPlotW / ($lcLabelCount - 1) : $lcPlotW;

        foreach ($series as $lcS) {
            $lcColor = $this->hexToRgb((string) ($lcS['color'] ?? '#6366f1'));
            $lcData = $lcS['data'] ?? [];
            $lcPoints = [];
            foreach ($labels as $lcLi => $lcLabel) {
                $lcVal = (float) ($lcData[$lcLi] ?? 0);
                $lcPx = $lcPlotX + ($lcLabelCount > 1 ? $lcLi * $lcStepX : $lcPlotW / 2);
                $lcPy = $lcPlotY + $lcPlotH - $lcPlotH * ($lcVal / $lcMax);
                $lcPoints[] = [$lcPx, $lcPy, $lcVal];
            }

            if ($area && count($lcPoints) >= 2) {
                $lcPoly = [];
                foreach ($lcPoints as $lcPt) {
                    $lcPoly[] = $lcPt[0];
                    $lcPoly[] = $lcPt[1];
                }
                $lcLast = end($lcPoints);
                $lcFirst = $lcPoints[0];
                $lcPoly[] = $lcLast[0];
                $lcPoly[] = $lcPlotY + $lcPlotH;
                $lcPoly[] = $lcFirst[0];
                $lcPoly[] = $lcPlotY + $lcPlotH;
                $pdf->SetFillColor($lcColor[0], $lcColor[1], $lcColor[2]);
                $pdf->SetAlpha(0.3);
                $pdf->Polygon($lcPoly, 'F');
                $pdf->SetAlpha(1.0);
            }

            $pdf->SetDrawColor($lcColor[0], $lcColor[1], $lcColor[2]);
            $pdf->SetLineWidth(0.5);
            for ($lcK = 1; $lcK < count($lcPoints); $lcK++) {
                $pdf->Line($lcPoints[$lcK - 1][0], $lcPoints[$lcK - 1][1], $lcPoints[$lcK][0], $lcPoints[$lcK][1]);
            }
            $pdf->SetFillColor($lcColor[0], $lcColor[1], $lcColor[2]);
            foreach ($lcPoints as $lcPt) {
                $pdf->Circle($lcPt[0], $lcPt[1], 0.8, 0, 360, 'F');
                if ($showValues && $lcPt[2] > 0) {
                    $pdf->SetFont($bodyFont, '', 6);
                    $pdf->SetTextColor($bodyRgb[0], $bodyRgb[1], $bodyRgb[2]);
                    $pdf->Text($lcPt[0] + 1, $lcPt[1] - 2.5, (string) (int) round($lcPt[2]));
                }
            }
        }

        if ($showAxes) {
            $pdf->SetFont($bodyFont, '', 6.5);
            $pdf->SetTextColor($bodyRgb[0], $bodyRgb[1], $bodyRgb[2]);
            foreach ($labels as $lcLi => $lcLabel) {
                $lcLx = $lcPlotX + ($lcLabelCount > 1 ? $lcLi * $lcStepX : $lcPlotW / 2);
                $lcDisplay = (string) $lcLabel;
                $pdf->Text($lcLx - $pdf->GetStringWidth($lcDisplay) / 2, $lcPlotY + $lcPlotH + 1.5, $lcDisplay);
            }
        }
    }

    private function renderPieChart(TCPDF $pdf, float $x, float $y, float $w, float $h, array $labels, array $series, bool $showValues, string $bodyFont, array $bodyRgb, array $colorRules = []): void
    {
        $pcCx = $x + $w / 2;
        $pcCy = $y + $h / 2;
        $pcR = min($w, $h) / 2 - 2;

        $pcTotal = 0.0;
        foreach ($series as $pcS) {
            $pcTotal += (float) ($pcS['data'][0] ?? 0);
        }
        if ($pcTotal <= 0) return;

        $pcAngle = 0.0;
        foreach ($series as $pcS) {
            $pcVal = (float) ($pcS['data'][0] ?? 0);
            if ($pcVal <= 0) continue;
            $pcSweep = ($pcVal / $pcTotal) * 360.0;
            $pcDefaultColor = (string) ($pcS['color'] ?? '#6366f1');
            // Each pie series corresponds to one slice; rules apply at series-name OR value level.
            $pcSliceLabel = (string) ($pcS['name'] ?? '');
            $pcFinalColor = $this->pickRuleColor($colorRules, $pcSliceLabel, $pcSliceLabel, $pcVal, $pcDefaultColor);
            $pcRgb = $this->hexToRgb($pcFinalColor);
            $pcS['color'] = $pcFinalColor;
            $pdf->SetFillColor($pcRgb[0], $pcRgb[1], $pcRgb[2]);
            $pdf->SetDrawColor(255, 255, 255);
            $pdf->SetLineWidth(0.3);
            $pdf->PieSector($pcCx, $pcCy, $pcR, $pcAngle, $pcAngle + $pcSweep, 'FD');
            // Skip values for tiny slices (< 8°) — they wouldn't fit visually
            if ($showValues && $pcSweep >= 8.0) {
                // Slice centroid radius: (2/3) R sin(θ/2) / (θ/2). For wide slices
                // we still cap at 0.62R so the label stays well inside the slice.
                $pcSweepRad = deg2rad($pcSweep);
                $pcCentroidR = $pcR * (2.0 / 3.0) * (sin($pcSweepRad / 2) / max(0.0001, $pcSweepRad / 2));
                $pcCentroidR = min($pcCentroidR, $pcR * 0.62);
                // TCPDF PieSector measures angles CLOCKWISE from 12 o'clock.
                // Convert to screen coords (y grows down):
                //   x = cx + sin(θ) × r      (θ=0 → top, θ=90° → right)
                //   y = cy − cos(θ) × r
                $pcMidRad = deg2rad($pcAngle + $pcSweep / 2);
                $pcLx = $pcCx + sin($pcMidRad) * $pcCentroidR;
                $pcLy = $pcCy - cos($pcMidRad) * $pcCentroidR;
                $pcFontSz = 7;
                $pdf->SetFont($bodyFont, 'B', $pcFontSz);
                $pdf->SetTextColor(255, 255, 255);
                $pcLabel = (string) (int) round($pcVal);
                $pcLblW = $pdf->GetStringWidth($pcLabel);
                // TCPDF Text(x, y, ...) draws via Cell(h=0) which uses cell height
                // = FontSize × cell_height_ratio (1.25). With valign='M', the visual
                // glyph center sits at y + FontSize_mm × 0.625. Subtract that to
                // place the visual center exactly on (pcLx, pcLy).
                $pcCenterOffset = $pcFontSz * 0.3528 * 0.625; // ≈ 1.54mm
                $pdf->Text(
                    $pcLx - $pcLblW / 2,
                    $pcLy - $pcCenterOffset,
                    $pcLabel
                );
            }
            $pcAngle += $pcSweep;
        }
    }

    private function renderRadar(TCPDF $pdf, float $x, float $y, float $w, float $h, array $labels, array $series, bool $showValues, string $bodyFont, array $bodyRgb): void
    {
        $rdAxes = count($labels);
        if ($rdAxes < 3) {
            $this->renderBarChart($pdf, $x, $y, $w, $h, $labels, $series, $showValues, true, $bodyFont, $bodyRgb);
            return;
        }
        // Reserve outer margin for axis labels
        $rdLblMargin = 12;
        $rdCx = $x + $w / 2;
        $rdCy = $y + $h / 2;
        $rdR = max(8.0, min($w, $h) / 2 - $rdLblMargin);

        $rdMax = 0.0;
        foreach ($series as $rdS) {
            foreach (($rdS['data'] ?? []) as $rdV) {
                $rdMax = max($rdMax, (float) $rdV);
            }
        }
        if ($rdMax <= 0) $rdMax = 1.0;

        // Concentric grid (filled background for first ring, then outline rings)
        $rdRings = 4;
        $pdf->SetFillColor(248, 250, 252);
        $pdf->SetDrawColor(203, 213, 225);
        $pdf->SetLineWidth(0.15);
        $rdOuter = [];
        for ($rdAi = 0; $rdAi < $rdAxes; $rdAi++) {
            $rdAng = -M_PI / 2 + (2 * M_PI * $rdAi / $rdAxes);
            $rdOuter[] = $rdCx + cos($rdAng) * $rdR;
            $rdOuter[] = $rdCy + sin($rdAng) * $rdR;
        }
        $pdf->Polygon($rdOuter, 'F');
        for ($rdRing = 1; $rdRing <= $rdRings; $rdRing++) {
            $rdRingR = $rdR * $rdRing / $rdRings;
            $rdPoly = [];
            for ($rdAi = 0; $rdAi < $rdAxes; $rdAi++) {
                $rdAng = -M_PI / 2 + (2 * M_PI * $rdAi / $rdAxes);
                $rdPoly[] = $rdCx + cos($rdAng) * $rdRingR;
                $rdPoly[] = $rdCy + sin($rdAng) * $rdRingR;
            }
            $pdf->Polygon($rdPoly, 'D');
        }
        // Radial spokes + axis labels
        for ($rdAi = 0; $rdAi < $rdAxes; $rdAi++) {
            $rdAng = -M_PI / 2 + (2 * M_PI * $rdAi / $rdAxes);
            $rdEx = $rdCx + cos($rdAng) * $rdR;
            $rdEy = $rdCy + sin($rdAng) * $rdR;
            $pdf->SetDrawColor(203, 213, 225);
            $pdf->SetLineWidth(0.15);
            $pdf->Line($rdCx, $rdCy, $rdEx, $rdEy);

            $pdf->SetFont($bodyFont, '', 7);
            $pdf->SetTextColor($bodyRgb[0], $bodyRgb[1], $bodyRgb[2]);
            $rdLbl = (string) ($labels[$rdAi] ?? '');
            $rdLblW = $pdf->GetStringWidth($rdLbl);
            // Position label radially outside the ring, anchor based on direction
            $rdLblR = $rdR + 3.5;
            $rdLx = $rdCx + cos($rdAng) * $rdLblR;
            $rdLy = $rdCy + sin($rdAng) * $rdLblR;
            // Horizontal anchor: shift by half-width times -cos (right side: shift 0, left: shift -W)
            $rdTx = $rdLx - $rdLblW * (0.5 - cos($rdAng) * 0.5);
            $rdTy = $rdLy + (sin($rdAng) > 0 ? 2.2 : -0.5);
            $pdf->Text($rdTx, $rdTy, $rdLbl);
        }

        // Series polygons (fill first under, then strong outline on top)
        foreach ($series as $rdS) {
            $rdRgb = $this->hexToRgb((string) ($rdS['color'] ?? '#6366f1'));
            $rdPoly = [];
            $rdData = $rdS['data'] ?? [];
            $rdVerts = [];
            for ($rdAi = 0; $rdAi < $rdAxes; $rdAi++) {
                $rdVal = (float) ($rdData[$rdAi] ?? 0);
                $rdAng = -M_PI / 2 + (2 * M_PI * $rdAi / $rdAxes);
                $rdRr = $rdR * ($rdVal / $rdMax);
                $rdPx = $rdCx + cos($rdAng) * $rdRr;
                $rdPy = $rdCy + sin($rdAng) * $rdRr;
                $rdPoly[] = $rdPx;
                $rdPoly[] = $rdPy;
                $rdVerts[] = ['x' => $rdPx, 'y' => $rdPy, 'v' => $rdVal];
            }
            $pdf->SetFillColor($rdRgb[0], $rdRgb[1], $rdRgb[2]);
            $pdf->SetDrawColor($rdRgb[0], $rdRgb[1], $rdRgb[2]);
            $pdf->SetAlpha(0.30);
            $pdf->Polygon($rdPoly, 'F');
            $pdf->SetAlpha(1.0);
            $pdf->SetLineWidth(0.6);
            $pdf->Polygon($rdPoly, 'D');
            // Vertex dots and value labels
            foreach ($rdVerts as $rdVx) {
                $pdf->SetFillColor($rdRgb[0], $rdRgb[1], $rdRgb[2]);
                $pdf->Circle($rdVx['x'], $rdVx['y'], 0.9, 0, 360, 'F');
                if ($showValues && $rdVx['v'] > 0) {
                    $pdf->SetFont($bodyFont, 'B', 6);
                    $pdf->SetTextColor($bodyRgb[0], $bodyRgb[1], $bodyRgb[2]);
                    $rdValStr = (string) (int) round($rdVx['v']);
                    $pdf->Text($rdVx['x'] - $pdf->GetStringWidth($rdValStr) / 2, $rdVx['y'] - 2.5, $rdValStr);
                }
            }
        }
    }

    private function renderTreemap(TCPDF $pdf, float $x, float $y, float $w, float $h, array $labels, array $series, bool $showValues, string $bodyFont, array $bodyRgb, array $colorRules = []): void
    {
        // Each series has data[0] = value, plus name + color (single-series semantic from chart_inventory)
        $tmItems = [];
        foreach ($series as $tmS) {
            $tmVal = (float) ($tmS['data'][0] ?? 0);
            if ($tmVal <= 0) continue;
            $tmName = (string) ($tmS['name'] ?? '');
            $tmDefault = (string) ($tmS['color'] ?? '#6366f1');
            $tmItems[] = [
                'name' => $tmName,
                'value' => $tmVal,
                'color' => $this->pickRuleColor($colorRules, $tmName, $tmName, $tmVal, $tmDefault),
            ];
        }
        if (empty($tmItems)) return;

        usort($tmItems, fn($a, $b) => $b['value'] <=> $a['value']);
        $tmTotal = array_sum(array_column($tmItems, 'value'));
        if ($tmTotal <= 0) return;

        // Simple slice-and-dice layout: alternate horizontal/vertical splits
        $tmRect = ['x' => $x, 'y' => $y, 'w' => $w, 'h' => $h];
        $this->treemapLayout($pdf, $tmItems, $tmRect, $tmTotal, true, $showValues, $bodyFont);
    }

    private function treemapLayout(TCPDF $pdf, array $items, array $rect, float $total, bool $horizontal, bool $showValues, string $bodyFont): void
    {
        if (empty($items) || $total <= 0) return;
        if (count($items) === 1) {
            $tlIt = $items[0];
            $tlRgb = $this->hexToRgb($tlIt['color']);
            $pdf->SetFillColor($tlRgb[0], $tlRgb[1], $tlRgb[2]);
            $pdf->SetDrawColor(255, 255, 255);
            $pdf->SetLineWidth(0.3);
            $pdf->Rect($rect['x'], $rect['y'], $rect['w'], $rect['h'], 'FD');
            if ($showValues && $rect['w'] > 12 && $rect['h'] > 8) {
                $pdf->SetFont($bodyFont, 'B', 7);
                $pdf->SetTextColor(255, 255, 255);
                $tlText = $tlIt['name'] . ' (' . (int) round($tlIt['value']) . ')';
                $pdf->SetXY($rect['x'] + 1, $rect['y'] + 1);
                $pdf->Cell($rect['w'] - 2, 4, $tlText, 0, 0, 'L');
            }
            return;
        }
        // Split items in half by value
        $tlAcc = 0;
        $tlSplit = 0;
        $tlHalf = $total / 2;
        for ($tlK = 0; $tlK < count($items); $tlK++) {
            $tlAcc += $items[$tlK]['value'];
            if ($tlAcc >= $tlHalf) {
                $tlSplit = $tlK + 1;
                break;
            }
        }
        if ($tlSplit <= 0) $tlSplit = 1;
        if ($tlSplit >= count($items)) $tlSplit = count($items) - 1;

        $tlA = array_slice($items, 0, $tlSplit);
        $tlB = array_slice($items, $tlSplit);
        $tlASum = array_sum(array_column($tlA, 'value'));
        $tlBSum = $total - $tlASum;
        if ($horizontal) {
            $tlAW = $rect['w'] * ($tlASum / $total);
            $tlRectA = ['x' => $rect['x'], 'y' => $rect['y'], 'w' => $tlAW, 'h' => $rect['h']];
            $tlRectB = ['x' => $rect['x'] + $tlAW, 'y' => $rect['y'], 'w' => $rect['w'] - $tlAW, 'h' => $rect['h']];
        } else {
            $tlAH = $rect['h'] * ($tlASum / $total);
            $tlRectA = ['x' => $rect['x'], 'y' => $rect['y'], 'w' => $rect['w'], 'h' => $tlAH];
            $tlRectB = ['x' => $rect['x'], 'y' => $rect['y'] + $tlAH, 'w' => $rect['w'], 'h' => $rect['h'] - $tlAH];
        }
        $this->treemapLayout($pdf, $tlA, $tlRectA, $tlASum, !$horizontal, $showValues, $bodyFont);
        $this->treemapLayout($pdf, $tlB, $tlRectB, $tlBSum, !$horizontal, $showValues, $bodyFont);
    }

    /**
     * Render the timeline block. All loop variables prefixed `$tl*` to avoid
     * collisions with the outer renderBlocks() $i counter.
     */
    private function renderTimelineArea(
        TCPDF $pdf,
        array $entries,
        bool $showRelease,
        bool $showEoS,
        bool $showEoSp,
        bool $showEoL,
        bool $showNow,
        bool $showLegend,
        float $barH,
        float $rowSpacing,
        float $mLeft,
        float $mRight,
        float $mBottom,
        string $bodyFont,
        array $bodyRgb,
    ): void {
        $tlPageW = $pdf->getPageWidth();
        $tlContentW = $tlPageW - $mLeft - $mRight;
        $tlNowMs = (new \DateTimeImmutable())->getTimestamp();

        $tlMilestoneDefs = [
            'release' => ['label' => 'Release', 'color' => '#10b981', 'show' => $showRelease, 'getter' => 'getReleaseDate'],
            'eos' => ['label' => 'EoS', 'color' => '#eab308', 'show' => $showEoS, 'getter' => 'getEndOfSaleDate'],
            'eosp' => ['label' => 'EoSp', 'color' => '#f97316', 'show' => $showEoSp, 'getter' => 'getEndOfSupportDate'],
            'eol' => ['label' => 'EoL', 'color' => '#dc2626', 'show' => $showEoL, 'getter' => 'getEndOfLifeDate'],
        ];

        if ($showLegend) {
            $tlYLeg = $pdf->GetY();
            $tlLegX = $mLeft;
            $pdf->SetFont($bodyFont, '', 7);
            $pdf->SetTextColor($bodyRgb[0], $bodyRgb[1], $bodyRgb[2]);
            foreach ($tlMilestoneDefs as $tlMs) {
                if (!$tlMs['show']) continue;
                $tlLegRgb = $this->hexToRgb($tlMs['color']);
                $pdf->SetFillColor($tlLegRgb[0], $tlLegRgb[1], $tlLegRgb[2]);
                $pdf->Rect($tlLegX, $tlYLeg + 0.5, 2.5, 2.5, 'F');
                $tlLegTxt = ' ' . $tlMs['label'];
                $tlLegW = $pdf->GetStringWidth($tlLegTxt) + 4;
                $pdf->SetXY($tlLegX + 2.5, $tlYLeg);
                $pdf->Cell($tlLegW, 4, $tlLegTxt, 0, 0, 'L');
                $tlLegX += 2.5 + $tlLegW + 3;
            }
            if ($showNow) {
                $pdf->SetDrawColor(15, 23, 42);
                $pdf->SetLineWidth(0.35);
                $pdf->Line($tlLegX, $tlYLeg + 0.5, $tlLegX, $tlYLeg + 3);
                $pdf->SetXY($tlLegX + 1, $tlYLeg);
                $pdf->Cell(20, 4, ' Today', 0, 0, 'L');
            }
            $pdf->Ln(5);
        }

        foreach ($entries as $tlEntry) {
            $tlPr = $tlEntry['range'];
            $tlLabel = (string) ($tlEntry['label'] ?? '');
            $tlSub = (string) ($tlEntry['subLabel'] ?? '');

            $tlMilestones = [];
            foreach ($tlMilestoneDefs as $tlKey => $tlMs) {
                if (!$tlMs['show']) continue;
                $tlGetter = $tlMs['getter'];
                $tlDate = $tlPr->{$tlGetter}();
                if ($tlDate instanceof \DateTimeInterface) {
                    $tlMilestones[] = [
                        'key' => $tlKey,
                        'label' => $tlMs['label'],
                        'color' => $tlMs['color'],
                        't' => $tlDate->getTimestamp(),
                    ];
                }
            }
            usort($tlMilestones, fn($a, $b) => $a['t'] <=> $b['t']);

            $tlYStart = $pdf->GetY();
            if ($tlYStart + $rowSpacing > $pdf->getPageHeight() - $mBottom) {
                $pdf->AddPage();
                $tlYStart = $pdf->GetY();
            }

            // Header label
            $pdf->SetFont($bodyFont, 'B', 9);
            $pdf->SetTextColor($bodyRgb[0], $bodyRgb[1], $bodyRgb[2]);
            $pdf->SetXY($mLeft, $tlYStart);
            $pdf->Cell($tlContentW * 0.6, 4, $tlLabel, 0, 0, 'L');
            if ($tlSub !== '') {
                $pdf->SetFont($bodyFont, '', 7.5);
                $pdf->SetTextColor(120, 120, 120);
                $pdf->SetXY($mLeft + $tlContentW * 0.6, $tlYStart);
                $pdf->Cell($tlContentW * 0.4, 4, $tlSub, 0, 0, 'R');
            }

            $tlBarY = $tlYStart + 8;
            $tlBarX = $mLeft;
            $tlBarW = $tlContentW;

            // No lifecycle data: draw an empty bar with a "no data" notice and skip markers
            if (empty($tlMilestones)) {
                $tlGrayEmpty = $this->hexToRgb('#e2e8f0');
                $pdf->SetFillColor($tlGrayEmpty[0], $tlGrayEmpty[1], $tlGrayEmpty[2]);
                $pdf->SetDrawColor(255, 255, 255);
                $pdf->SetLineWidth(0);
                $pdf->Rect($tlBarX, $tlBarY, $tlBarW, $barH, 'F');
                $pdf->SetFont($bodyFont, 'I', 7);
                $pdf->SetTextColor(120, 120, 120);
                $tlNoData = 'No lifecycle data available';
                $pdf->Text($tlBarX + ($tlBarW - $pdf->GetStringWidth($tlNoData)) / 2, $tlBarY + $barH + 1.5, $tlNoData);
                $pdf->SetY($tlYStart + $rowSpacing);
                continue;
            }

            $tlAll = array_map(fn($m) => $m['t'], $tlMilestones);
            $tlAll[] = $tlNowMs;
            $tlMin = min($tlAll);
            $tlMax = max($tlAll);
            $tlSpan = max($tlMax - $tlMin, 1);
            $tlPad = (int) ($tlSpan * 0.08);
            $tlLo = $tlMin - $tlPad;
            $tlHi = $tlMax + $tlPad;
            $tlRange = max($tlHi - $tlLo, 1);

            // Background segments: gray before first, then milestone color until next
            $tlPrevX = $tlBarX;
            $tlGray = $this->hexToRgb('#e2e8f0');
            $pdf->SetDrawColor(255, 255, 255);
            $pdf->SetLineWidth(0);
            // Initial gray segment up to first milestone
            $tlFirstX = $tlBarX + (($tlMilestones[0]['t'] - $tlLo) / $tlRange) * $tlBarW;
            $pdf->SetFillColor($tlGray[0], $tlGray[1], $tlGray[2]);
            if ($tlFirstX > $tlBarX) {
                $pdf->Rect($tlBarX, $tlBarY, $tlFirstX - $tlBarX, $barH, 'F');
            }
            for ($tlMi = 0; $tlMi < count($tlMilestones); $tlMi++) {
                $tlStartX = $tlBarX + (($tlMilestones[$tlMi]['t'] - $tlLo) / $tlRange) * $tlBarW;
                $tlEndX = ($tlMi + 1 < count($tlMilestones))
                    ? $tlBarX + (($tlMilestones[$tlMi + 1]['t'] - $tlLo) / $tlRange) * $tlBarW
                    : $tlBarX + $tlBarW;
                $tlSegRgb = $this->hexToRgb($tlMilestones[$tlMi]['color']);
                $pdf->SetFillColor($tlSegRgb[0], $tlSegRgb[1], $tlSegRgb[2]);
                if ($tlEndX > $tlStartX) {
                    $pdf->Rect($tlStartX, $tlBarY, $tlEndX - $tlStartX, $barH, 'F');
                }
            }

            // Milestone markers + labels
            $pdf->SetDrawColor(255, 255, 255);
            $pdf->SetLineWidth(0.2);
            foreach ($tlMilestones as $tlM) {
                $tlMx = $tlBarX + (($tlM['t'] - $tlLo) / $tlRange) * $tlBarW;
                $tlRgb = $this->hexToRgb($tlM['color']);
                $pdf->SetFillColor($tlRgb[0], $tlRgb[1], $tlRgb[2]);
                $pdf->Circle($tlMx, $tlBarY + $barH / 2, 1.4, 0, 360, 'FD');

                $pdf->SetFont($bodyFont, '', 6.5);
                $pdf->SetTextColor($bodyRgb[0], $bodyRgb[1], $bodyRgb[2]);
                $tlDateStr = (new \DateTimeImmutable('@' . $tlM['t']))->format('Y-m-d');
                $tlW1 = $pdf->GetStringWidth($tlM['label']);
                $tlW2 = $pdf->GetStringWidth($tlDateStr);
                $pdf->Text($tlMx - $tlW1 / 2, $tlBarY + $barH + 1.5, $tlM['label']);
                $pdf->Text($tlMx - $tlW2 / 2, $tlBarY + $barH + 4, $tlDateStr);
            }

            // Now marker
            if ($showNow) {
                $tlNowX = $tlBarX + (($tlNowMs - $tlLo) / $tlRange) * $tlBarW;
                $tlNowX = max($tlBarX, min($tlBarX + $tlBarW, $tlNowX));
                $tlNowLbl = 'NOW';
                $tlNowFontSz = 6.5;
                $tlNowLblH = 3.5;
                $tlNowGap = 0.5;
                $pdf->SetFont($bodyFont, 'B', $tlNowFontSz);
                $tlNowLblW = $pdf->GetStringWidth($tlNowLbl) + 2.4;
                $tlNowRectX = $tlNowX - $tlNowLblW / 2;
                $tlNowRectY = $tlBarY - $tlNowLblH - $tlNowGap;
                $pdf->SetDrawColor(15, 23, 42);
                $pdf->SetLineWidth(0.45);
                $pdf->Line($tlNowX, $tlNowRectY + $tlNowLblH, $tlNowX, $tlBarY + $barH + 1.5);
                $pdf->SetFillColor(15, 23, 42);
                $pdf->Rect($tlNowRectX, $tlNowRectY, $tlNowLblW, $tlNowLblH, 'F');
                $pdf->SetTextColor(255, 255, 255);
                $pdf->MultiCell(
                    $tlNowLblW, $tlNowLblH, $tlNowLbl, 0, 'C', false, 0,
                    $tlNowRectX, $tlNowRectY, true, 0, false, true, $tlNowLblH, 'M'
                );
            }

            $pdf->SetY($tlYStart + $rowSpacing);
        }
    }


    private function renderAuthorsPage(TCPDF $pdf, array $authors, array $recipients, array $t, array $styles, float $mLeft, float $mRight, float $mBottom, array $headingsByLevel): void
    {
        if (empty($authors) && empty($recipients)) return;

        $tableStyle = $styles['table'] ?? ReportTheme::DEFAULT_STYLES['table'];
        $bodyStyle = $styles['body'] ?? ReportTheme::DEFAULT_STYLES['body'];
        $bodyFont = $this->mapFont($bodyStyle['font'] ?? 'Calibri');
        $bodySize = !empty($tableStyle['fontSize']) ? (int) $tableStyle['fontSize'] : ($bodyStyle['size'] ?? 11);
        $bodyRgb = $this->hexToRgb($bodyStyle['color'] ?? '#1e293b');
        $headerBg = $this->hexToRgb($tableStyle['headerBg'] ?? '#1e293b');
        $headerColor = $this->hexToRgb($tableStyle['headerColor'] ?? '#ffffff');
        $borderColor = $this->hexToRgb($tableStyle['borderColor'] ?? '#e2e8f0');
        $alternateRows = $tableStyle['alternateRows'] ?? true;
        $alternateBg = $this->hexToRgb($tableStyle['alternateBg'] ?? '#f8fafc');

        // H2 style for section subtitles
        $h2 = $headingsByLevel[2] ?? null;
        $h2Font = $this->mapFont($h2['font'] ?? 'Calibri');
        $h2Size = $h2['size'] ?? 22;
        $h2Bold = ($h2['bold'] ?? true) ? 'B' : '';
        $h2Italic = ($h2['italic'] ?? false) ? 'I' : '';
        $h2Rgb = $this->hexToRgb($h2['color'] ?? '#1e293b');
        $h2SpaceAfter = (float) ($h2['spaceAfter'] ?? 2);
        $h2Background = $h2['background'] ?? '';

        $contentW = $pdf->getPageWidth() - $mLeft - $mRight;
        $colHeaders = [$t['col_lastname'], $t['col_firstname'], $t['col_position'], $t['col_email'], $t['col_phone']];
        $colWidths = [$contentW * 0.18, $contentW * 0.18, $contentW * 0.22, $contentW * 0.25, $contentW * 0.17];
        $minLineH = $bodySize * 0.3528 + 3;

        $renderTable = function (array $entries, string $sectionTitle) use ($pdf, $bodyFont, $bodySize, $bodyRgb, $headerBg, $headerColor, $borderColor, $alternateRows, $alternateBg, $colHeaders, $colWidths, $minLineH, $mLeft, $mRight, $mBottom, $h2Font, $h2Size, $h2Bold, $h2Italic, $h2Rgb, $h2SpaceAfter, $h2Background, $contentW) {
            if (empty($entries)) return;

            // Section subtitle in H2 style
            $pdf->SetTextColor($h2Rgb[0], $h2Rgb[1], $h2Rgb[2]);
            $pdf->SetFont($h2Font, $h2Bold . $h2Italic, $h2Size);
            $h2LineH = $h2Size * 0.3528 + 1;
            if ($h2Background) {
                $bgRgb = $this->hexToRgb($h2Background);
                $pdf->SetFillColor($bgRgb[0], $bgRgb[1], $bgRgb[2]);
                $pdf->MultiCell($contentW, $h2LineH + 2, ' ' . $sectionTitle, 0, 'L', true);
            } else {
                $pdf->Cell(0, $h2LineH, $sectionTitle, 0, 1, 'L');
            }
            $pdf->Ln($h2SpaceAfter);

            $pdf->SetDrawColor($borderColor[0], $borderColor[1], $borderColor[2]);
            $pdf->SetLineWidth(0.2);

            // Header
            $pdf->SetFillColor($headerBg[0], $headerBg[1], $headerBg[2]);
            $pdf->SetTextColor($headerColor[0], $headerColor[1], $headerColor[2]);
            $pdf->SetFont($bodyFont, 'B', $bodySize);

            $startY = $pdf->GetY();
            $startX = $mLeft;
            foreach ($colHeaders as $ci => $label) {
                $pdf->MultiCell($colWidths[$ci], $minLineH, $label, 1, 'L', true, 0, $startX, $startY, true, 0, false, true, $minLineH, 'M');
                $startX += $colWidths[$ci];
            }
            $pdf->SetXY($mLeft, $startY + $minLineH);

            // Data rows
            foreach ($entries as $ri => $entry) {
                $fill = false;
                if ($alternateRows && $ri % 2 === 1) {
                    $pdf->SetFillColor($alternateBg[0], $alternateBg[1], $alternateBg[2]);
                    $fill = true;
                } elseif ($alternateRows) {
                    $pdf->SetFillColor(255, 255, 255);
                    $fill = true;
                }
                $pdf->SetTextColor($bodyRgb[0], $bodyRgb[1], $bodyRgb[2]);
                $pdf->SetFont($bodyFont, '', $bodySize);

                $cells = [
                    $entry['lastName'] ?? '',
                    $entry['firstName'] ?? '',
                    $entry['position'] ?? '',
                    $entry['email'] ?? '',
                    $entry['phone'] ?? '',
                ];

                $maxH = $minLineH;
                foreach ($cells as $ci => $val) {
                    $h = $pdf->getStringHeight($colWidths[$ci], $val) + 2;
                    $maxH = max($maxH, $h);
                }

                $startY = $pdf->GetY();
                if ($startY + $maxH > $pdf->getPageHeight() - $mBottom) {
                    $pdf->AddPage();
                    $startY = $pdf->GetY();
                }

                $startX = $mLeft;
                foreach ($cells as $ci => $val) {
                    $pdf->MultiCell($colWidths[$ci], $maxH, $val, 1, 'L', $fill, 0, $startX, $startY, true, 0, false, true, $maxH, 'M');
                    $startX += $colWidths[$ci];
                }
                $pdf->SetXY($mLeft, $startY + $maxH);
            }
        };

        // Group authors by "group" field
        $authorGroups = [];
        foreach ($authors as $a) {
            $g = $a['group'] ?? '';
            if (!isset($authorGroups[$g])) $authorGroups[$g] = [];
            $authorGroups[$g][] = $a;
        }

        if (count($authorGroups) <= 1 && array_key_first($authorGroups) === '') {
            $renderTable($authors, $t['authors']);
        } else {
            $pdf->SetTextColor($h2Rgb[0], $h2Rgb[1], $h2Rgb[2]);
            $pdf->SetFont($h2Font, $h2Bold . $h2Italic, $h2Size);
            $h2LineH = $h2Size * 0.3528 + 1;
            if ($h2Background) {
                $bgRgb = $this->hexToRgb($h2Background);
                $pdf->SetFillColor($bgRgb[0], $bgRgb[1], $bgRgb[2]);
                $pdf->MultiCell($contentW, $h2LineH + 2, ' ' . $t['authors'], 0, 'L', true);
            } else {
                $pdf->Cell(0, $h2LineH, $t['authors'], 0, 1, 'L');
            }
            $pdf->Ln(2);

            foreach ($authorGroups as $groupName => $groupAuthors) {
                $label = $groupName ?: $t['authors'];
                $pdf->SetFont($bodyFont, 'B', $bodySize);
                $pdf->SetTextColor($bodyRgb[0], $bodyRgb[1], $bodyRgb[2]);
                $pdf->Cell(0, $bodySize * 0.5, $label, 0, 1, 'L');
                $pdf->Ln(1);
                $pdf->SetDrawColor($borderColor[0], $borderColor[1], $borderColor[2]);
                $pdf->SetLineWidth(0.2);
                $pdf->SetFillColor($headerBg[0], $headerBg[1], $headerBg[2]);
                $pdf->SetTextColor($headerColor[0], $headerColor[1], $headerColor[2]);
                $pdf->SetFont($bodyFont, 'B', $bodySize);
                $startY = $pdf->GetY(); $startX = $mLeft;
                foreach ($colHeaders as $ci => $lbl) { $pdf->MultiCell($colWidths[$ci], $minLineH, $lbl, 1, 'L', true, 0, $startX, $startY, true, 0, false, true, $minLineH, 'M'); $startX += $colWidths[$ci]; }
                $pdf->SetXY($mLeft, $startY + $minLineH);
                foreach ($groupAuthors as $ri => $entry) {
                    $fill = $alternateRows && $ri % 2 === 1;
                    if ($fill) $pdf->SetFillColor($alternateBg[0], $alternateBg[1], $alternateBg[2]);
                    else if ($alternateRows) $pdf->SetFillColor(255, 255, 255);
                    $pdf->SetTextColor($bodyRgb[0], $bodyRgb[1], $bodyRgb[2]);
                    $pdf->SetFont($bodyFont, '', $bodySize);
                    $cells = [$entry['lastName'] ?? '', $entry['firstName'] ?? '', $entry['position'] ?? '', $entry['email'] ?? '', $entry['phone'] ?? ''];
                    $maxH = $minLineH;
                    foreach ($cells as $ci => $val) { $maxH = max($maxH, $pdf->getStringHeight($colWidths[$ci], $val) + 2); }
                    $startY = $pdf->GetY();
                    if ($startY + $maxH > $pdf->getPageHeight() - $mBottom) { $pdf->AddPage(); $startY = $pdf->GetY(); }
                    $startX = $mLeft;
                    foreach ($cells as $ci => $val) { $pdf->MultiCell($colWidths[$ci], $maxH, $val, 1, 'L', $fill || ($alternateRows && $ri % 2 === 0), 0, $startX, $startY, true, 0, false, true, $maxH, 'M'); $startX += $colWidths[$ci]; }
                    $pdf->SetXY($mLeft, $startY + $maxH);
                }
                $pdf->Ln(4);
            }
        }

        if (!empty($authors) && !empty($recipients)) {
            $pdf->Ln(6);
        }

        // Group recipients by "group" field
        $recipientGroups = [];
        foreach ($recipients as $r) {
            $g = $r['group'] ?? '';
            if (!isset($recipientGroups[$g])) $recipientGroups[$g] = [];
            $recipientGroups[$g][] = $r;
        }

        if (count($recipientGroups) <= 1 && array_key_first($recipientGroups) === '') {
            // No groups defined — render flat like before
            $renderTable($recipients, $t['recipients']);
        } else {
            // Render main title
            $pdf->SetTextColor($h2Rgb[0], $h2Rgb[1], $h2Rgb[2]);
            $pdf->SetFont($h2Font, $h2Bold . $h2Italic, $h2Size);
            $h2LineH = $h2Size * 0.3528 + 1;
            if ($h2Background) {
                $bgRgb = $this->hexToRgb($h2Background);
                $pdf->SetFillColor($bgRgb[0], $bgRgb[1], $bgRgb[2]);
                $pdf->MultiCell($contentW, $h2LineH + 2, ' ' . $t['recipients'], 0, 'L', true);
            } else {
                $pdf->Cell(0, $h2LineH, $t['recipients'], 0, 1, 'L');
            }
            $pdf->Ln(2);

            // Render each group as a sub-table
            foreach ($recipientGroups as $groupName => $groupRecipients) {
                $label = $groupName ?: $t['recipients'];
                // Sub-group title
                $pdf->SetFont($bodyFont, 'B', $bodySize);
                $pdf->SetTextColor($bodyRgb[0], $bodyRgb[1], $bodyRgb[2]);
                $pdf->Cell(0, $bodySize * 0.5, $label, 0, 1, 'L');
                $pdf->Ln(1);

                // Render table without section title
                $pdf->SetDrawColor($borderColor[0], $borderColor[1], $borderColor[2]);
                $pdf->SetLineWidth(0.2);
                $pdf->SetFillColor($headerBg[0], $headerBg[1], $headerBg[2]);
                $pdf->SetTextColor($headerColor[0], $headerColor[1], $headerColor[2]);
                $pdf->SetFont($bodyFont, 'B', $bodySize);
                $startY = $pdf->GetY();
                $startX = $mLeft;
                foreach ($colHeaders as $ci => $lbl) {
                    $pdf->MultiCell($colWidths[$ci], $minLineH, $lbl, 1, 'L', true, 0, $startX, $startY, true, 0, false, true, $minLineH, 'M');
                    $startX += $colWidths[$ci];
                }
                $pdf->SetXY($mLeft, $startY + $minLineH);

                foreach ($groupRecipients as $ri => $entry) {
                    $fill = $alternateRows && $ri % 2 === 1;
                    if ($fill) $pdf->SetFillColor($alternateBg[0], $alternateBg[1], $alternateBg[2]);
                    else if ($alternateRows) $pdf->SetFillColor(255, 255, 255);
                    $pdf->SetTextColor($bodyRgb[0], $bodyRgb[1], $bodyRgb[2]);
                    $pdf->SetFont($bodyFont, '', $bodySize);
                    $cells = [$entry['lastName'] ?? '', $entry['firstName'] ?? '', $entry['position'] ?? '', $entry['email'] ?? '', $entry['phone'] ?? ''];
                    $maxH = $minLineH;
                    foreach ($cells as $ci => $val) { $maxH = max($maxH, $pdf->getStringHeight($colWidths[$ci], $val) + 2); }
                    $startY = $pdf->GetY();
                    if ($startY + $maxH > $pdf->getPageHeight() - $mBottom) { $pdf->AddPage(); $startY = $pdf->GetY(); }
                    $startX = $mLeft;
                    foreach ($cells as $ci => $val) {
                        $pdf->MultiCell($colWidths[$ci], $maxH, $val, 1, 'L', $fill || ($alternateRows && $ri % 2 === 0), 0, $startX, $startY, true, 0, false, true, $maxH, 'M');
                        $startX += $colWidths[$ci];
                    }
                    $pdf->SetXY($mLeft, $startY + $maxH);
                }
                $pdf->Ln(4);
            }
        }
    }

    private function renderRevisionsPage(TCPDF $pdf, array $revisions, array $t, array $styles, float $mLeft, float $mRight, float $mBottom): void
    {
        if (empty($revisions)) return;

        $tableStyle = $styles['table'] ?? ReportTheme::DEFAULT_STYLES['table'];
        $bodyStyle = $styles['body'] ?? ReportTheme::DEFAULT_STYLES['body'];
        $bodyFont = $this->mapFont($bodyStyle['font'] ?? 'Calibri');
        $bodySize = !empty($tableStyle['fontSize']) ? (int) $tableStyle['fontSize'] : ($bodyStyle['size'] ?? 11);
        $bodyRgb = $this->hexToRgb($bodyStyle['color'] ?? '#1e293b');
        $headerBg = $this->hexToRgb($tableStyle['headerBg'] ?? '#1e293b');
        $headerColor = $this->hexToRgb($tableStyle['headerColor'] ?? '#ffffff');
        $borderColor = $this->hexToRgb($tableStyle['borderColor'] ?? '#e2e8f0');
        $alternateRows = $tableStyle['alternateRows'] ?? true;
        $alternateBg = $this->hexToRgb($tableStyle['alternateBg'] ?? '#f8fafc');

        $contentW = $pdf->getPageWidth() - $mLeft - $mRight;
        $headers = [$t['col_version'], $t['col_date'], $t['col_description']];
        $colWidths = [$contentW * 0.15, $contentW * 0.20, $contentW * 0.65];
        $minLineH = $bodySize * 0.3528 + 3;

        $pdf->SetDrawColor($borderColor[0], $borderColor[1], $borderColor[2]);
        $pdf->SetLineWidth(0.2);

        // Header
        $pdf->SetFillColor($headerBg[0], $headerBg[1], $headerBg[2]);
        $pdf->SetTextColor($headerColor[0], $headerColor[1], $headerColor[2]);
        $pdf->SetFont($bodyFont, 'B', $bodySize);

        $startY = $pdf->GetY();
        $startX = $mLeft;
        foreach ($headers as $ci => $label) {
            $pdf->MultiCell($colWidths[$ci], $minLineH, $label, 1, 'L', true, 0, $startX, $startY, true, 0, false, true, $minLineH, 'M');
            $startX += $colWidths[$ci];
        }
        $pdf->SetXY($mLeft, $startY + $minLineH);

        // Data rows
        foreach ($revisions as $ri => $rev) {
            $fill = false;
            if ($alternateRows && $ri % 2 === 1) {
                $pdf->SetFillColor($alternateBg[0], $alternateBg[1], $alternateBg[2]);
                $fill = true;
            } elseif ($alternateRows) {
                $pdf->SetFillColor(255, 255, 255);
                $fill = true;
            }
            $pdf->SetTextColor($bodyRgb[0], $bodyRgb[1], $bodyRgb[2]);
            $pdf->SetFont($bodyFont, '', $bodySize);

            $cells = [
                $rev['version'] ?? '',
                $rev['date'] ?? '',
                $rev['description'] ?? '',
            ];

            // Compute row height
            $maxH = $minLineH;
            foreach ($cells as $ci => $val) {
                $h = $pdf->getStringHeight($colWidths[$ci], $val) + 2;
                $maxH = max($maxH, $h);
            }

            $startY = $pdf->GetY();
            if ($startY + $maxH > $pdf->getPageHeight() - $mBottom) {
                $pdf->AddPage();
                $startY = $pdf->GetY();
            }

            $startX = $mLeft;
            foreach ($cells as $ci => $val) {
                $pdf->MultiCell($colWidths[$ci], $maxH, $val, 1, 'L', $fill, 0, $startX, $startY, true, 0, false, true, $maxH, 'M');
                $startX += $colWidths[$ci];
            }
            $pdf->SetXY($mLeft, $startY + $maxH);
        }
    }

    private function sanitizeParagraphHtml(string $html): string
    {
        // <span> is kept so the rich-text editor's inline color and
        // font-family marks survive into TCPDF's HTML parser.
        $html = strip_tags($html, ['p', 'br', 'b', 'strong', 'i', 'em', 'ul', 'ol', 'li', 'span']);

        // TCPDF cannot resolve arbitrary CSS family names (e.g. "Consolas"); it
        // only ships the core fonts helvetica/times/courier. Translate every
        // inline font-family declaration to the matching core font so the
        // chosen typeface (notably monospace) actually renders.
        $html = preg_replace_callback(
            '/font-family\s*:\s*([^;"\']+)/i',
            function (array $m): string {
                $first = trim(explode(',', $m[1])[0], " '\"");
                return 'font-family:' . $this->mapFont($first);
            },
            $html
        );

        // TCPDF's HTML parser only understands a handful of named entities
        // (&nbsp; &amp; &lt; &gt; &quot;) plus numeric ones. Named spacing
        // entities like &emsp;/&ensp;/&thinsp; are otherwise printed verbatim.
        // Their numeric code points (U+2003, …) have no glyph in the bundled
        // fonts, so they render zero-width — we therefore expand them into
        // non-breaking spaces, which TCPDF never collapses nor trims at the
        // start of a paragraph.
        //
        // The editor stores literal "&emsp;" text double-encoded as
        // "&amp;emsp;"; TCPDF then decodes "&amp;" back to "&" and prints the
        // entity verbatim, so we handle both the single- and double-encoded
        // forms here.
        $em = str_repeat('&nbsp;', 4);
        $en = str_repeat('&nbsp;', 2);
        $thin = '&nbsp;';
        $html = strtr($html, [
            '&amp;emsp;' => $em,
            '&amp;ensp;' => $en,
            '&amp;thinsp;' => $thin,
            '&emsp;' => $em,
            '&ensp;' => $en,
            '&thinsp;' => $thin,
            '&amp;zwnj;' => '',
            '&amp;zwj;' => '',
            '&zwnj;' => '',
            '&zwj;' => '',
        ]);

        return $html;
    }

    private function sanitizeHtml(string $html): string
    {
        return strip_tags($html, ['b', 'i', 'br']);
    }

    /**
     * Evaluate a comparison operator between a cell value and a rule value,
     * with numeric-aware comparison when both sides look numeric.
     * Shared by inventory style rules and conditional remark columns.
     * Operators: eq, neq, gt, gte, lt, lte, contains, not_contains.
     */
    private function evaluateInventoryOperator(string $cellVal, string $op, string $ruleVal): bool
    {
        $numCell = is_numeric($cellVal) ? (float) $cellVal : null;
        $numRule = is_numeric($ruleVal) ? (float) $ruleVal : null;

        switch ($op) {
            case 'eq':
                return ($numCell !== null && $numRule !== null) ? $numCell == $numRule : $cellVal === $ruleVal;
            case 'neq':
                return ($numCell !== null && $numRule !== null) ? $numCell != $numRule : $cellVal !== $ruleVal;
            case 'gt':
                return ($numCell !== null && $numRule !== null) && $numCell > $numRule;
            case 'gte':
                return ($numCell !== null && $numRule !== null) && $numCell >= $numRule;
            case 'lt':
                return ($numCell !== null && $numRule !== null) && $numCell < $numRule;
            case 'lte':
                return ($numCell !== null && $numRule !== null) && $numCell <= $numRule;
            case 'contains':
                return str_contains(mb_strtolower($cellVal), mb_strtolower($ruleVal));
            case 'not_contains':
                return !str_contains(mb_strtolower($cellVal), mb_strtolower($ruleVal));
            default:
                return false;
        }
    }

    private function matchCountValue(string $cellVal, string $matchVal, string $op): bool
    {
        switch ($op) {
            case 'neq':
                return $cellVal !== $matchVal;
            case 'contains':
                return $matchVal !== '' && str_contains(mb_strtolower($cellVal), mb_strtolower($matchVal));
            case 'not_contains':
                return $matchVal === '' || !str_contains(mb_strtolower($cellVal), mb_strtolower($matchVal));
            case 'eq':
            default:
                return $cellVal === $matchVal;
        }
    }

    /**
     * Evaluate inventory list-mode filters against an entry's key and value.
     * Each filter: { field: 'key'|'value', operator, value }.
     * Match mode 'all' = AND (default), 'any' = OR.
     */
    private function matchListFilters(string $entryKey, string $entryValue, array $filters, string $match): bool
    {
        if (empty($filters)) return true;
        $results = [];
        foreach ($filters as $f) {
            $field = ($f['field'] ?? 'value') === 'key' ? 'key' : 'value';
            $op = (string) ($f['operator'] ?? 'eq');
            $needle = (string) ($f['value'] ?? '');
            $haystack = $field === 'key' ? $entryKey : $entryValue;
            $hl = mb_strtolower($haystack);
            $nl = mb_strtolower($needle);
            switch ($op) {
                case 'neq':
                    $results[] = $haystack !== $needle;
                    break;
                case 'contains':
                    $results[] = $needle !== '' && str_contains($hl, $nl);
                    break;
                case 'not_contains':
                    $results[] = $needle === '' || !str_contains($hl, $nl);
                    break;
                case 'starts_with':
                    $results[] = $needle !== '' && str_starts_with($hl, $nl);
                    break;
                case 'ends_with':
                    $results[] = $needle !== '' && str_ends_with($hl, $nl);
                    break;
                case 'eq':
                default:
                    $results[] = $haystack === $needle;
                    break;
            }
        }
        return $match === 'any' ? in_array(true, $results, true) : !in_array(false, $results, true);
    }

    /**
     * Collapse consecutive numeric "interface-like" keys into ranges.
     *
     * An item is rangeable when it is composed only of integer segments
     * separated by '/' or ':' (e.g. "1/1", "1:2", "1/1/4"). Two rangeable
     * items merge into a run when they share the same leading segments and
     * the same separator pattern, and their last segments are consecutive.
     *
     * The input list is expected to be already sorted (natural case).
     * Non-rangeable items are kept in place but never merged.
     *
     * @param string[] $items
     * @return string[]
     */
    private function compactNumericRanges(array $items): array
    {
        $parse = static function (string $s): ?array {
            if (!preg_match('#^\d+(?:[/:]\d+)*$#', $s)) {
                return null;
            }
            $segs = preg_split('#([/:])#', $s, -1, PREG_SPLIT_DELIM_CAPTURE);
            if ($segs === false) {
                return null;
            }
            $stem = implode('', array_slice($segs, 0, -1));
            $last = (int) $segs[count($segs) - 1];
            return ['stem' => $stem, 'last' => $last];
        };

        $out = [];
        $n = count($items);
        $i = 0;
        while ($i < $n) {
            $a = $items[$i];
            $pa = $parse($a);
            if ($pa === null) {
                $out[] = $a;
                $i++;
                continue;
            }
            $j = $i;
            $prevLast = $pa['last'];
            while ($j + 1 < $n) {
                $pb = $parse($items[$j + 1]);
                if ($pb === null) break;
                if ($pb['stem'] !== $pa['stem']) break;
                if ($pb['last'] !== $prevLast + 1) break;
                $j++;
                $prevLast = $pb['last'];
            }
            $out[] = ($j === $i) ? $a : ($a . '-' . $items[$j]);
            $i = $j + 1;
        }
        return $out;
    }

    /**
     * Resolve the rendering width of an inventory table from its maxTableWidth (%) option.
     * Valid range is (0, 100]; outside the range or unset means "auto" (full content width).
     */
    private function resolveInventoryTableWidth(array $block, float $contentW): float
    {
        $pct = $block['maxTableWidth'] ?? null;
        if ($pct === null || $pct === '') {
            return $contentW;
        }
        $pct = (float) $pct;
        if ($pct <= 0 || $pct > 100) {
            return $contentW;
        }
        return $contentW * ($pct / 100);
    }

    /**
     * Distribute column widths for an inventory table.
     *
     * - $naturalWidths : measured widths per column (used as fallback ratio for auto cols).
     * - $explicitPcts  : same length; entry is a percentage (1-100) of $tableW, or null = auto.
     * - $tableW        : total table width to fill.
     *
     * Columns with an explicit percentage get that fraction of $tableW. The remainder
     * is distributed across auto columns proportionally to their natural widths.
     * If explicit percentages sum to more than 100, they are scaled down and no
     * space is left for auto columns (each gets a tiny minimum width to avoid 0).
     */
    private function distributeInventoryColumnWidths(array $naturalWidths, array $explicitPcts, float $tableW): array
    {
        $n = count($naturalWidths);
        if ($n === 0) return [];

        $totalFixedPct = 0.0;
        $autoIdx = [];
        for ($i = 0; $i < $n; $i++) {
            $p = $explicitPcts[$i] ?? null;
            if ($p !== null && $p > 0) {
                $totalFixedPct += (float) $p;
            } else {
                $autoIdx[] = $i;
            }
        }

        $widths = array_fill(0, $n, 0.0);

        if ($totalFixedPct >= 100) {
            $scale = $totalFixedPct > 0 ? (100.0 / $totalFixedPct) : 0;
            for ($i = 0; $i < $n; $i++) {
                $p = $explicitPcts[$i] ?? null;
                if ($p !== null && $p > 0) {
                    $widths[$i] = $tableW * (((float) $p) * $scale) / 100.0;
                } else {
                    $widths[$i] = 0.5; // minimal fallback, prevents 0-width cells
                }
            }
            return $widths;
        }

        for ($i = 0; $i < $n; $i++) {
            $p = $explicitPcts[$i] ?? null;
            if ($p !== null && $p > 0) {
                $widths[$i] = $tableW * ((float) $p) / 100.0;
            }
        }

        $remainingW = $tableW * (100.0 - $totalFixedPct) / 100.0;
        if (!empty($autoIdx)) {
            $autoNaturalSum = 0.0;
            foreach ($autoIdx as $i) $autoNaturalSum += (float) $naturalWidths[$i];
            if ($autoNaturalSum <= 0) {
                $each = $remainingW / count($autoIdx);
                foreach ($autoIdx as $i) $widths[$i] = $each;
            } else {
                $scale = $remainingW / $autoNaturalSum;
                foreach ($autoIdx as $i) $widths[$i] = (float) $naturalWidths[$i] * $scale;
            }
        }

        return $widths;
    }

    private function hexToRgb(string $hex): array
    {
        $hex = ltrim($hex, '#');
        if (strlen($hex) === 3) {
            $hex = $hex[0].$hex[0].$hex[1].$hex[1].$hex[2].$hex[2];
        }
        return [
            hexdec(substr($hex, 0, 2)),
            hexdec(substr($hex, 2, 2)),
            hexdec(substr($hex, 4, 2)),
        ];
    }

    private function mapFont(string $font): string
    {
        $map = [
            'calibri' => 'helvetica',
            'arial' => 'helvetica',
            'times new roman' => 'times',
            'georgia' => 'times',
            'verdana' => 'helvetica',
            'cambria' => 'times',
            'garamond' => 'times',
            'trebuchet ms' => 'helvetica',
            'tahoma' => 'helvetica',
            'century gothic' => 'helvetica',
            'palatino linotype' => 'times',
            'book antiqua' => 'times',
            'roboto' => 'helvetica',
            'open sans' => 'helvetica',
            'lato' => 'helvetica',
            'source sans pro' => 'helvetica',
            'consolas' => 'courier',
            'courier new' => 'courier',
            'courier' => 'courier',
            // Generic CSS families, used as fallbacks for inline font-family.
            'monospace' => 'courier',
            'serif' => 'times',
            'sans-serif' => 'helvetica',
        ];
        return $map[strtolower($font)] ?? 'helvetica';
    }

    private function renderHeaderFooterBar(
        TCPDF $pdf,
        array $config,
        array $variables,
        int $totalPages,
        int $currentPage,
        float $mLeft,
        float $mRight,
        bool $isHeader,
    ): void {
        if (empty($config['enabled'])) return;

        // Migrate old format: if no 'left' key, skip (old format)
        if (!isset($config['left'])) return;

        $pageW = $pdf->getPageWidth();
        $pageH = $pdf->getPageHeight();
        $contentW = $pageW - $mLeft - $mRight;
        $slotW = $contentW / 3;
        $offset = $config['offset'] ?? 5;

        // Calculate the tallest slot to determine bar height
        $maxSlotH = 0;
        $positions = ['left', 'center', 'right'];
        foreach ($positions as $pos) {
            $slot = $config[$pos] ?? ['type' => 'none'];
            $maxSlotH = max($maxSlotH, $this->getSlotHeight($slot));
        }
        if ($maxSlotH <= 0) $maxSlotH = 3; // fallback
        $barH = $maxSlotH;

        if ($isHeader) {
            $y = $offset;
        } else {
            $y = $pageH - $offset - $barH;
        }

        // Render 3 slots first
        $aligns = ['L', 'C', 'R'];
        foreach ($positions as $i => $pos) {
            $slot = $config[$pos] ?? ['type' => 'none'];
            $x = $mLeft + $i * $slotW;
            $this->renderSlotContent($pdf, $slot, $variables, $totalPages, $currentPage, $x, $y, $slotW, $barH, $aligns[$i]);
        }

        // Separator line: 2mm gap from content
        if (!empty($config['separator'])) {
            $sepRgb = $this->hexToRgb($config['separatorColor'] ?? '#e2e8f0');
            $pdf->SetDrawColor($sepRgb[0], $sepRgb[1], $sepRgb[2]);
            $pdf->SetLineWidth(0.2);
            if ($isHeader) {
                $lineY = $y + $barH + 2;
            } else {
                $lineY = $y - 2;
            }
            $pdf->Line($mLeft, $lineY, $pageW - $mRight, $lineY);
        }
    }

    private function getSlotHeight(array $slot): float
    {
        $type = $slot['type'] ?? 'none';
        if ($type === 'none') return 0;
        if ($type === 'image') return (float) ($slot['imageMaxHeight'] ?? 8);
        // Text-based: height from font size
        $size = (float) (($slot['style']['size'] ?? 8));
        return $size * 0.3528 + 0.5;
    }

    private function renderSlotContent(
        TCPDF $pdf,
        array $slot,
        array $variables,
        int $totalPages,
        int $currentPage,
        float $x,
        float $y,
        float $w,
        float $h,
        string $align,
    ): void {
        $type = $slot['type'] ?? 'none';
        if ($type === 'none') return;

        if ($type === 'image') {
            $src = $slot['imageSrc'] ?? '';
            $maxH = $slot['imageMaxHeight'] ?? 8;
            $imgPath = null;
            if ($src && preg_match('#^/api/cover-page-images/(.+)$#', $src, $m)) {
                $imgPath = '/var/www/var/uploads/cover-pages/' . basename($m[1]);
            } elseif ($src && file_exists('/var/www/public' . $src)) {
                $imgPath = '/var/www/public' . $src;
            }
            if ($imgPath && file_exists($imgPath)) {
                $imgY = $y + ($h - $maxH) / 2;
                if ($align === 'C') {
                    $imgX = $x + ($w - $maxH) / 2;
                } elseif ($align === 'R') {
                    $imgX = $x + $w - $maxH;
                } else {
                    $imgX = $x;
                }
                $pdf->Image($imgPath, $imgX, max($imgY, $y), 0, min($maxH, $h), '', '', '', true, 300);
            }
            return;
        }

        // Text-based slots: text, variable, pageNumber
        $style = $slot['style'] ?? ['font' => 'Calibri', 'size' => 8, 'bold' => false, 'italic' => false, 'color' => '#64748b'];
        $font = $this->mapFont($style['font'] ?? 'Calibri');
        $size = (float) ($style['size'] ?? 8);
        $bold = ($style['bold'] ?? false) ? 'B' : '';
        $italic = ($style['italic'] ?? false) ? 'I' : '';
        $rgb = $this->hexToRgb($style['color'] ?? '#64748b');

        $text = '';
        if ($type === 'text') {
            $text = $slot['text'] ?? '';
        } elseif ($type === 'variable') {
            $varName = $slot['variable'] ?? 'title';
            $text = $variables[$varName] ?? '';
        } elseif ($type === 'pageNumber') {
            $text = $currentPage . ' / ' . $totalPages;
        }

        if ($text === '') return;

        // Force font reset before each slot to avoid pollution from previous rendering
        $pdf->SetFont($font, $bold . $italic, $size);
        $pdf->SetTextColor($rgb[0], $rgb[1], $rgb[2]);
        $lineH = $size * 0.3528 + 0.5; // pt to mm
        $pdf->SetXY($x, $y + ($h - $lineH) / 2);
        $pdf->Cell($w, $lineH, $text, 0, 0, $align);
    }

    /**
     * Resolve {{node.category.key}} or {{node.category.key.colLabel}} for node-type reports,
     * and {{node[ip].category.key}} or {{node[ip].category.key.colLabel}} for general reports.
     * Lookups are case-insensitive on category, key, and colLabel.
     */
    private function resolveNodeVariables(string $text, ?Node $forNode, Report $report): string
    {
        if (strpos($text, '{{') === false) {
            return $text;
        }

        $invRepo = $this->em->getRepository(NodeInventoryEntry::class);
        $nodeRepo = $this->em->getRepository(Node::class);
        $cache = [];

        // Helper: load inventory data for a node (cached), keyed by lowercase
        $getNodeData = function (int $nodeId) use ($invRepo, &$cache): array {
            if (isset($cache[$nodeId])) {
                return $cache[$nodeId];
            }
            $entries = $invRepo->findBy(['node' => $nodeId]);
            // Build two maps: lowercased keys for lookup, original values
            $data = [];       // lcCat -> lcKey -> lcCol -> value
            foreach ($entries as $entry) {
                $cat = mb_strtolower($entry->getCategoryName());
                $key = mb_strtolower($entry->getEntryKey());
                $col = mb_strtolower($entry->getColLabel());
                $data[$cat][$key][$col] = $entry->getValue() ?? '';
            }
            $cache[$nodeId] = $data;
            return $data;
        };

        // Helper: resolve a value from inventory data (case-insensitive)
        $resolve = function (array $data, array $parts): string {
            if (count($parts) === 2) {
                // {{node.category.key}} — return first colLabel value
                $cat = mb_strtolower($parts[0]);
                $key = mb_strtolower($parts[1]);
                if (isset($data[$cat][$key])) {
                    $cols = $data[$cat][$key];
                    return (string) reset($cols);
                }
            } elseif (count($parts) === 3) {
                // {{node.category.key.colLabel}}
                $cat = mb_strtolower($parts[0]);
                $key = mb_strtolower($parts[1]);
                $col = mb_strtolower($parts[2]);
                return (string) ($data[$cat][$key][$col] ?? '');
            }
            return '';
        };

        // Pattern for node-type reports: {{node.category.key}} or {{node.category.key.colLabel}}
        // Must NOT match {{node[...].xxx}} — so require the char after "node" to be a dot, not a bracket
        if ($forNode) {
            $text = preg_replace_callback(
                '/\{\{node\.([^}\[]+)\}\}/',
                function ($matches) use ($forNode, $getNodeData, $resolve) {
                    $parts = explode('.', $matches[1]);
                    if (count($parts) < 2 || count($parts) > 3) {
                        return $matches[0];
                    }
                    $data = $getNodeData($forNode->getId());
                    return $resolve($data, $parts);
                },
                $text
            );

            // Legacy format (without "node." prefix): {{category.key}} or {{category.key.colLabel}}
            // Only matches 2 or 3 dot-separated identifiers and excludes reserved prefixes
            $text = preg_replace_callback(
                '/\{\{([A-Za-z_][A-Za-z0-9 _-]*(?:\.[A-Za-z0-9 _#-]+){1,2})\}\}/',
                function ($matches) use ($forNode, $getNodeData, $resolve) {
                    $parts = explode('.', $matches[1]);
                    // Skip reserved prefixes
                    $first = strtolower($parts[0]);
                    if (in_array($first, ['node', 'fn', 'fn:'], true) || str_starts_with($first, 'fn:')) {
                        return $matches[0];
                    }
                    if (count($parts) < 2 || count($parts) > 3) {
                        return $matches[0];
                    }
                    $data = $getNodeData($forNode->getId());
                    $resolved = $resolve($data, $parts);
                    return $resolved !== '' ? $resolved : $matches[0];
                },
                $text
            );
        }

        // Pattern for general reports (or also in node reports for cross-node reference):
        // {{node[10.201.100.41].category.key}} or {{node[10.201.100.41].category.key.colLabel}}
        $text = preg_replace_callback(
            '/\{\{node\[([^\]]+)\]\.([^}]+)\}\}/',
            function ($matches) use ($nodeRepo, $report, $getNodeData, $resolve) {
                $identifier = trim($matches[1], '"\'');
                $parts = explode('.', $matches[2]);
                if (count($parts) < 2 || count($parts) > 3) {
                    return $matches[0];
                }
                // Find node by IP in the report's context
                $node = $nodeRepo->findOneBy([
                    'ipAddress' => $identifier,
                    'context' => $report->getContext(),
                ]);
                if (!$node) {
                    return '';
                }
                $data = $getNodeData($node->getId());
                return $resolve($data, $parts);
            },
            $text
        );

        // Resolve functions: {{fn:name(args)}}
        $text = $this->resolveTemplateFunctions($text, $report);

        return $text;
    }

    /**
     * Resolve template functions like {{fn:countByManufacturer("name")}}, {{fn:listWhere("cat","key","op","val")}}, etc.
     */
    private function resolveTemplateFunctions(string $text, Report $report): string
    {
        $context = $report->getContext();
        $nodeRepo = $this->em->getRepository(Node::class);
        $invRepo = $this->em->getRepository(NodeInventoryEntry::class);
        $tagRepo = $this->em->getRepository(\App\Entity\NodeTag::class);

        return preg_replace_callback('/\{\{fn:(\w+)\(([^)]*)\)\}\}/', function ($matches) use ($context, $nodeRepo, $invRepo, $tagRepo) {
            $fn = $matches[1];
            // Parse arguments: "arg1", "arg2", ...
            $rawArgs = $matches[2];
            $args = [];
            preg_match_all('/"([^"]*)"/', $rawArgs, $argMatches);
            $args = $argMatches[1] ?? [];
            // Rich-text blocks store the content as HTML, so operators like ">"
            // and "<" arrive encoded ("&gt;", "&lt;"). Decode every argument so
            // comparisons and category/key lookups match the raw values.
            $args = array_map(static fn(string $a): string => html_entity_decode($a, ENT_QUOTES | ENT_HTML5), $args);

            $contextNodes = $nodeRepo->findBy(['context' => $context]);

            switch ($fn) {
                case 'countByManufacturer':
                    $name = $args[0] ?? '';
                    $count = 0;
                    foreach ($contextNodes as $n) {
                        if ($n->getManufacturer() && strcasecmp($n->getManufacturer()->getName(), $name) === 0) $count++;
                    }
                    return (string) $count;

                case 'countByModel':
                    $name = $args[0] ?? '';
                    $count = 0;
                    foreach ($contextNodes as $n) {
                        if ($n->getModel() && strcasecmp($n->getModel()->getName(), $name) === 0) $count++;
                    }
                    return (string) $count;

                case 'countByTag':
                    $tagName = $args[0] ?? '';
                    $count = 0;
                    foreach ($contextNodes as $n) {
                        foreach ($this->tagResolver->getTagsForNode($n) as $tag) {
                            if (strcasecmp($tag->getName(), $tagName) === 0) { $count++; break; }
                        }
                    }
                    return (string) $count;

                case 'listWhere':
                case 'countWhere':
                    $category = $args[0] ?? '';
                    $key = $args[1] ?? '';
                    $operator = $args[2] ?? '=';
                    $compareValue = $args[3] ?? '';
                    $colLabel = $args[4] ?? null;

                    $matched = [];
                    foreach ($contextNodes as $n) {
                        $criteria = ['node' => $n, 'categoryName' => $category, 'entryKey' => $key];
                        if ($colLabel) $criteria['colLabel'] = $colLabel;
                        $entries = $invRepo->findBy($criteria);
                        foreach ($entries as $entry) {
                            $val = $entry->getValue();
                            $match = match ($operator) {
                                '=', '==' => $val === $compareValue,
                                '!=' => $val !== $compareValue,
                                '<' => version_compare($val, $compareValue, '<'),
                                '>' => version_compare($val, $compareValue, '>'),
                                '<=' => version_compare($val, $compareValue, '<='),
                                '>=' => version_compare($val, $compareValue, '>='),
                                'contains' => str_contains($val, $compareValue),
                                default => false,
                            };
                            if ($match) {
                                $label = $n->getName() ?: $n->getHostname() ?: $n->getIpAddress();
                                $matched[$n->getId()] = $label;
                                break;
                            }
                        }
                    }

                    if ($fn === 'countWhere') {
                        return (string) count($matched);
                    }
                    return implode(', ', array_values($matched));

                case 'collectionCommands':
                case 'collectionFiles':
                case 'collectionWorker':
                case 'collectionDate':
                    $nodeIdentifier = $args[0] ?? '';
                    $collTag = $args[1] ?? 'latest';
                    $dateFormat = $args[2] ?? 'Y-m-d H:i:s';

                    // Resolve node by IP (strip "node:" prefix if present)
                    $ip = str_starts_with($nodeIdentifier, 'node:') ? substr($nodeIdentifier, 5) : $nodeIdentifier;
                    $ip = trim($ip, '"\'');
                    $targetNode = $nodeRepo->findOneBy(['ipAddress' => $ip, 'context' => $context]);
                    if (!$targetNode) return '';

                    // Find collection by tag
                    $conn = $this->em->getConnection();
                    $sql = 'SELECT id FROM collection WHERE node_id = :node AND status = :status AND tags::text LIKE :tag ORDER BY completed_at DESC LIMIT 1';
                    $row = $conn->fetchAssociative($sql, [
                        'node' => $targetNode->getId(),
                        'status' => \App\Entity\Collection::STATUS_COMPLETED,
                        'tag' => '%"' . $collTag . '"%',
                    ]);

                    if (!$row) return '';
                    $collection = $this->em->getRepository(\App\Entity\Collection::class)->find($row['id']);
                    if (!$collection) return '';

                    return match ($fn) {
                        'collectionCommands' => (string) ($collection->getCommandCount() ?? 0),
                        'collectionFiles' => (string) ($collection->getCompletedCount() ?? 0),
                        'collectionWorker' => $collection->getWorker() ?? '',
                        'collectionDate' => $collection->getCompletedAt() ? $collection->getCompletedAt()->format($dateFormat) : '',
                        default => '',
                    };

                default:
                    return $matches[0]; // Unknown function — leave as is
            }
        }, $text) ?? $text;
    }

    private function publish(Report $report, string $status): void
    {
        $this->hub->publish(new Update(
            sprintf('reports/%d', $report->getId()),
            json_encode([
                'event' => 'generation',
                'status' => $status,
                'reportId' => $report->getId(),
                'generatedAt' => $report->getGeneratedAt()?->format('c'),
            ])
        ));
    }
}
