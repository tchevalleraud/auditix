<?php

namespace App\MessageHandler;

use App\Entity\Collection;
use App\Entity\Node;
use App\Entity\NodeInventoryEntry;
use App\Entity\NodeTag;
use App\Entity\Report;
use App\Entity\ReportTheme;
use App\Message\GenerateReportMessage;
use Doctrine\ORM\EntityManagerInterface;
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
    ) {}

    public function __invoke(GenerateReportMessage $message): void
    {
        $report = $this->em->getRepository(Report::class)->find($message->getReportId());
        if (!$report) return;

        $report->setGeneratingStatus('running');
        $this->em->flush();
        $this->publish($report, 'running');

        try {
            $dir = sprintf('/var/www/var/reports/%d', $report->getId());
            if (!is_dir($dir)) {
                mkdir($dir, 0775, true);
            }

            if ($report->getType() === Report::TYPE_NODE) {
                // Generate one PDF per associated node
                $generatedFiles = [];
                foreach ($report->getNodes() as $node) {
                    $nodeDir = $dir . '/node_' . $node->getId();
                    if (!is_dir($nodeDir)) {
                        mkdir($nodeDir, 0775, true);
                    }
                    $filePath = $nodeDir . '/report.pdf';
                    $this->generatePdf($report, $filePath, $node);
                    $generatedFiles[(string) $node->getId()] = sprintf('reports/%d/node_%d/report.pdf', $report->getId(), $node->getId());
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

            $this->publish($report, 'completed');
        } catch (\Throwable $e) {
            $report->setGeneratingStatus(null);
            $this->em->flush();
            $this->publish($report, 'failed');
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
        ],
    ];

    private function generatePdf(Report $report, string $filePath, ?Node $forNode = null): void
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

        // Blocks: compute TOC entries and page numbers
        $blocks = $report->getBlocks();
        $firstBlockDone = false;
        foreach ($blocks as $block) {
            if (!$firstBlockDone) {
                $pageNum++;
                $firstBlockDone = true;
                if ($block['type'] === 'heading') {
                    $tocEntries[] = [
                        'level' => $block['level'] ?? 1,
                        'title' => $this->resolveNodeVariables($block['content'] ?? '', $forNode, $report),
                        'page' => $pageNum,
                    ];
                }
                continue;
            }
            if ($block['type'] === 'heading') {
                if (!empty($block['pageBreakBefore'])) {
                    $pageNum++;
                }
                $tocEntries[] = [
                    'level' => $block['level'] ?? 1,
                    'title' => $this->resolveNodeVariables($block['content'] ?? '', $forNode, $report),
                    'page' => $pageNum,
                ];
            }
        }

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

        // Render structure blocks
        $this->renderBlocks($pdf, $blocks, $headingsByLevel, $styles, $numberingEnabled, $mLeft, $mTop, $mRight, $mBottom, $forNode, $report);

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

        // Heading numbering counters
        $counters = [];
        $firstBlock = true;
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

                // Background color
                if ($background) {
                    $bgRgb = $this->hexToRgb($background);
                    $pdf->SetFillColor($bgRgb[0], $bgRgb[1], $bgRgb[2]);
                    $pageW = $pdf->getPageWidth();
                    $contentW = $pageW - $mLeft - $mRight;
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
                $columns = $block['columns'] ?? [];
                $nodeIds = $forNode ? [$forNode->getId()] : ($block['nodeIds'] ?? []);
                $showHeader = !empty($block['showHeader']);
                $invTableStyle = $styles['table'] ?? ReportTheme::DEFAULT_STYLES['table'];
                $invThemeFontSize = !empty($invTableStyle['fontSize']) ? (int) $invTableStyle['fontSize'] : $bodySize;
                $invFontSize = !empty($block['fontSize']) ? (int) $block['fontSize'] : $invThemeFontSize;
                $hostnameHeaderLabel = !empty($block['hostnameHeaderLabel']) ? $block['hostnameHeaderLabel'] : 'Hostname';
                $styleRules = $block['styleRules'] ?? [];

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
                // Build lookup: nodeId -> "cat|key|col" -> value
                $invData = [];
                foreach ($nodeIds as $nid) {
                    $invData[$nid] = [];
                }
                foreach ($columns as $colDef) {
                    $cat = $colDef['category'] ?? '';
                    $key = $colDef['entryKey'] ?? '';
                    $col = $colDef['colLabel'] ?? '';
                    if (empty($cat) || empty($key) || empty($col)) continue;

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
                        $lookupKey = $cat . '|' . $key . '|' . $col;
                        $invData[$nid][$lookupKey] = $entry->getValue() ?? '';
                    }
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
                        $lookupKey = ($colDef['category'] ?? '') . '|' . ($colDef['entryKey'] ?? '') . '|' . ($colDef['colLabel'] ?? '');
                        $val = $invData[$nid][$lookupKey] ?? '';
                        $maxWidths[$ci + 1] = max($maxWidths[$ci + 1], $pdf->GetStringWidth($val) + $cellPadding);
                    }
                }

                // Scale widths to fit contentW
                $totalNatural = array_sum($maxWidths);
                $colWidthsInv = [];
                if ($totalNatural <= $contentW) {
                    // Content fits: scale up proportionally to fill available space
                    $scale = $contentW / max($totalNatural, 1);
                    foreach ($maxWidths as $w) {
                        $colWidthsInv[] = $w * $scale;
                    }
                } else {
                    // Content overflows: scale down proportionally
                    $scale = $contentW / $totalNatural;
                    foreach ($maxWidths as $w) {
                        $colWidthsInv[] = $w * $scale;
                    }
                }

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
                        $lookupKey = ($colDef['category'] ?? '') . '|' . ($colDef['entryKey'] ?? '') . '|' . ($colDef['colLabel'] ?? '');
                        $allValues[] = $invData[$nid][$lookupKey] ?? '';
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
                        $match = false;
                        $numCell = is_numeric($cellVal) ? (float) $cellVal : null;
                        $numRule = is_numeric($ruleVal) ? (float) $ruleVal : null;

                        switch ($ruleOp) {
                            case 'eq':
                                $match = ($numCell !== null && $numRule !== null) ? $numCell == $numRule : $cellVal === $ruleVal;
                                break;
                            case 'neq':
                                $match = ($numCell !== null && $numRule !== null) ? $numCell != $numRule : $cellVal !== $ruleVal;
                                break;
                            case 'gt':
                                $match = ($numCell !== null && $numRule !== null) && $numCell > $numRule;
                                break;
                            case 'gte':
                                $match = ($numCell !== null && $numRule !== null) && $numCell >= $numRule;
                                break;
                            case 'lt':
                                $match = ($numCell !== null && $numRule !== null) && $numCell < $numRule;
                                break;
                            case 'lte':
                                $match = ($numCell !== null && $numRule !== null) && $numCell <= $numRule;
                                break;
                            case 'contains':
                                $match = str_contains(mb_strtolower($cellVal), mb_strtolower($ruleVal));
                                break;
                            case 'not_contains':
                                $match = !str_contains(mb_strtolower($cellVal), mb_strtolower($ruleVal));
                                break;
                        }

                        if ($match) {
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

                    // Resolve nodes from tags
                    if (!empty($cliTagIds)) {
                        foreach ($cliTagIds as $tagId) {
                            $tag = $this->em->getRepository(NodeTag::class)->find($tagId);
                            if (!$tag) continue;
                            // Find all nodes with this tag in the same context
                            $nodesWithTag = $this->em->getRepository(Node::class)->createQueryBuilder('n')
                                ->innerJoin('n.tags', 't')
                                ->where('t.id = :tagId')
                                ->andWhere('n.context = :ctx')
                                ->setParameter('tagId', $tagId)
                                ->setParameter('ctx', $report->getContext())
                                ->getQuery()
                                ->getResult();
                            foreach ($nodesWithTag as $n) {
                                if (!in_array($n->getId(), $resolvedNodeIds, true)) {
                                    $resolvedNodeIds[] = $n->getId();
                                }
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

                    // Calculate total box height: header + padding + lines + padding
                    $bodyH = ($cliPadding * 2) + (count($outputLines) * $lineH);
                    $totalBoxH = $headerH + $bodyH;

                    // Check page break
                    $startY = $pdf->GetY();
                    if ($startY + $totalBoxH > $pdf->getPageHeight() - $mBottom) {
                        $pdf->AddPage();
                        $startY = $pdf->GetY();
                    }

                    // Draw the full outer box: body background + border (single rounded rect)
                    $pdf->SetDrawColor($cliBorder[0], $cliBorder[1], $cliBorder[2]);
                    $pdf->SetLineWidth(0.3);
                    $pdf->SetFillColor($cliBg[0], $cliBg[1], $cliBg[2]);
                    if ($cliBorderRadius > 0) {
                        $pdf->RoundedRect($mLeft, $startY, $contentW, $totalBoxH, $cliBorderRadius, '1111', 'DF');
                    } else {
                        $pdf->Rect($mLeft, $startY, $contentW, $totalBoxH, 'DF');
                    }

                    // --- Header bar overlay ---
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

                    // Render lines
                    $curY = $startY + $headerH + $cliPadding;
                    $textX = $mLeft + $cliPadding + $lineNumW;
                    $textW = $contentW - ($cliPadding * 2) - $lineNumW;

                    // Clip content to the box area with padding so text doesn't touch the border
                    $pdf->StartTransform();
                    $pdf->Rect($mLeft + $cliPadding, $startY, $contentW - ($cliPadding * 2), $totalBoxH, 'CNZ');

                    foreach ($outputLines as $ol) {
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

                    $pdf->SetXY($mLeft, $startY + $totalBoxH);
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
                $mapId = $block['topologyMapId'] ?? null;
                $topoWidth = (float) ($block['width'] ?? 100);
                $topoProto = $block['protocol'] ?? '';
                $showLabels = !empty($block['showLabels']);
                $showLegend = !empty($block['showLegend']);
                $caption = $block['caption'] ?? '';
                $pageBreak = !empty($block['pageBreakBefore']);
                $showMonitoring = !empty($block['showMonitoring']);
                $showCompliance = !empty($block['showCompliance']);
                $viewportFrame = $block['viewportFrame'] ?? null;

                if (!$mapId) continue;

                $map = $this->em->getRepository(\App\Entity\TopologyMap::class)->find($mapId);
                if (!$map) continue;

                if ($pageBreak || $firstBlock) {
                    $pdf->SetMargins($mLeft, $mTop, $mRight);
                    $pdf->SetAutoPageBreak(true, $mBottom);
                    $pdf->AddPage();
                    $firstBlock = false;
                } else {
                    $pdf->Ln($pSpaceBefore > 0 ? $pSpaceBefore : 4);
                }

                $svg = $this->renderTopologySvg($map, $topoProto, $showLabels, $showLegend, $showMonitoring, $showCompliance, $viewportFrame);

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
            }
        }
    }

    private function renderTopologySvg(\App\Entity\TopologyMap $map, string $protocol, bool $showLabels, bool $showLegend, bool $showMonitoring = false, bool $showCompliance = false, ?array $viewportFrame = null): string
    {
        $devices = $this->em->getRepository(\App\Entity\TopologyDevice::class)->findBy(['map' => $map]);
        $linkQb = $this->em->createQueryBuilder()
            ->select('l')->from(\App\Entity\TopologyLink::class, 'l')
            ->where('l.map = :map')->setParameter('map', $map);
        if ($protocol) {
            $linkQb->andWhere('l.protocol = :p')->setParameter('p', $protocol);
        }
        $links = $linkQb->getQuery()->getResult();

        $layout = $map->getLayout() ?? [];
        $dc = $map->getDesignConfig();
        $nodeConf = $dc['node'] ?? [];
        $labelConf = $dc['label'] ?? [];
        $edgeConf = $dc['edge'] ?? [];
        $zones = $dc['zones'] ?? [];

        $nodeW = (float) ($nodeConf['width'] ?? 40);
        $nodeH = (float) ($nodeConf['height'] ?? 40);
        $nodeBg = $nodeConf['bgColor'] ?? '#e2e8f0';
        $nodeBorder = $nodeConf['borderColor'] ?? '#3b82f6';
        $nodeBorderW = (float) ($nodeConf['borderWidth'] ?? 2.5);
        $nodeShape = $nodeConf['shape'] ?? 'ellipse';

        $edgeW = (float) ($edgeConf['width'] ?? 2.5);
        $edgeColor = $edgeConf['color'] ?? '';

        $protocolColors = ['lldp' => '#6366f1', 'stp' => '#0ea5e9', 'ospf' => '#10b981', 'bgp' => '#f59e0b', 'isis' => '#ec4899'];

        // Build device position map
        $devicePositions = [];

        foreach ($devices as $d) {
            $key = (string) $d->getId();
            $pos = $layout[$key] ?? null;
            if (!$pos) continue;
            $x = (float) $pos['x'];
            $y = (float) $pos['y'];
            $devicePositions[$key] = ['x' => $x, 'y' => $y, 'device' => $d];
        }

        if (empty($devicePositions)) {
            return '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="100"><text x="200" y="50" text-anchor="middle" fill="#94a3b8" font-size="14">No positioned devices</text></svg>';
        }

        // Determine viewport bounds
        if ($viewportFrame !== null) {
            // Use user-defined viewport frame
            $minX = (float) $viewportFrame['x'];
            $minY = (float) $viewportFrame['y'];
            $vw = (float) $viewportFrame['width'];
            $vh = (float) $viewportFrame['height'];
        } else {
            // Auto-fit: compute from all device positions + zones + padding
            $minX = PHP_INT_MAX; $minY = PHP_INT_MAX; $maxX = PHP_INT_MIN; $maxY = PHP_INT_MIN;

            foreach ($devicePositions as $dp) {
                $minX = min($minX, $dp['x'] - $nodeW);
                $minY = min($minY, $dp['y'] - $nodeH);
                $maxX = max($maxX, $dp['x'] + $nodeW);
                $maxY = max($maxY, $dp['y'] + $nodeH);
            }

            foreach ($zones as $z) {
                $zPos = $layout[$z['id']] ?? $z['position'] ?? null;
                if (!$zPos) continue;
                $zx = (float) $zPos['x']; $zy = (float) $zPos['y'];
                $zw = (float) ($z['width'] ?? 200) / 2; $zh = (float) ($z['height'] ?? 150) / 2;
                $minX = min($minX, $zx - $zw); $minY = min($minY, $zy - $zh);
                $maxX = max($maxX, $zx + $zw); $maxY = max($maxY, $zy + $zh);
            }

            $pad = 60;
            $minX -= $pad; $minY -= $pad; $maxX += $pad; $maxY += $pad;
            $vw = $maxX - $minX;
            $vh = $maxY - $minY;
        }
        $svgW = 800;
        $svgH = $svgW * ($vh / max($vw, 1));

        // Offset to normalize all coordinates to positive (TCPDF doesn't handle negative viewBox well)
        $ox = -$minX;
        $oy = -$minY;

        // Shift all device positions
        foreach ($devicePositions as &$dp) {
            $dp['x'] += $ox;
            $dp['y'] += $oy;
        }
        unset($dp);

        $svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' . $svgW . '" height="' . round($svgH) . '" viewBox="0 0 ' . round($vw) . ' ' . round($vh) . '">';
        $svg .= '<defs><clipPath id="vp"><rect x="0" y="0" width="' . round($vw) . '" height="' . round($vh) . '"/></clipPath></defs>';
        $svg .= '<rect width="' . round($vw) . '" height="' . round($vh) . '" fill="white"/>';
        $svg .= '<g clip-path="url(#vp)">';

        // Helper: check if a rectangle overlaps the viewport (all in offset coordinates)
        $inView = function (float $rx, float $ry, float $rw, float $rh) use ($vw, $vh): bool {
            return $rx + $rw > 0 && $rx < $vw && $ry + $rh > 0 && $ry < $vh;
        };

        // Zones (background)
        usort($zones, fn($a, $b) => ($a['layer'] ?? 0) - ($b['layer'] ?? 0));
        foreach ($zones as $z) {
            $zPos = $layout[$z['id']] ?? $z['position'] ?? null;
            if (!$zPos) continue;
            $zx = (float) $zPos['x'] + $ox; $zy = (float) $zPos['y'] + $oy;
            $zw = (float) ($z['width'] ?? 200); $zh = (float) ($z['height'] ?? 150);
            if (!$inView($zx - $zw / 2, $zy - $zh / 2, $zw, $zh)) continue;
            $style = $z['style'] ?? [];
            $bg = $style['bgColor'] ?? '#dbeafe';
            $bgOp = (float) ($style['bgOpacity'] ?? 0.3);
            $bc = $style['borderColor'] ?? '#3b82f6';
            $bw = (float) ($style['borderWidth'] ?? 2);
            $br = (float) ($style['borderRadius'] ?? 12);
            $lbl = htmlspecialchars($z['label'] ?? '');
            $lblColor = $style['labelColor'] ?? '#1e40af';
            $lblSize = (float) ($style['labelSize'] ?? 14);

            if (($z['type'] ?? 'rectangle') === 'ellipse') {
                $svg .= '<ellipse cx="' . $zx . '" cy="' . $zy . '" rx="' . ($zw / 2) . '" ry="' . ($zh / 2) . '" fill="' . $bg . '" fill-opacity="' . $bgOp . '" stroke="' . $bc . '" stroke-width="' . $bw . '"/>';
            } else {
                $svg .= '<rect x="' . ($zx - $zw / 2) . '" y="' . ($zy - $zh / 2) . '" width="' . $zw . '" height="' . $zh . '" rx="' . $br . '" fill="' . $bg . '" fill-opacity="' . $bgOp . '" stroke="' . $bc . '" stroke-width="' . $bw . '"/>';
            }
            if ($lbl) {
                $ly = ($style['labelPosition'] ?? 'top') === 'top' ? $zy - $zh / 2 + $lblSize + 4 : (($style['labelPosition'] ?? 'top') === 'bottom' ? $zy + $zh / 2 - 4 : $zy);
                $svg .= '<text x="' . $zx . '" y="' . $ly . '" text-anchor="middle" fill="' . $lblColor . '" font-size="' . $lblSize . '" font-weight="600">' . $lbl . '</text>';
            }
        }

        // Edges — group by node pair to curve parallel links
        $edgeGroups = [];
        foreach ($links as $l) {
            $sKey = (string) $l->getSourceDevice()->getId();
            $tKey = (string) $l->getTargetDevice()->getId();
            if (!isset($devicePositions[$sKey]) || !isset($devicePositions[$tKey])) continue;
            $pairKey = min($sKey, $tKey) . ':' . max($sKey, $tKey);
            $edgeGroups[$pairKey][] = $l;
        }

        foreach ($edgeGroups as $group) {
            $count = count($group);
            foreach ($group as $idx => $l) {
                $sKey = (string) $l->getSourceDevice()->getId();
                $tKey = (string) $l->getTargetDevice()->getId();
                $sp = $devicePositions[$sKey];
                $tp = $devicePositions[$tKey];
                // Skip edge if both endpoints are completely outside the viewport
                $sIn = $sp['x'] >= 0 && $sp['x'] <= $vw && $sp['y'] >= 0 && $sp['y'] <= $vh;
                $tIn = $tp['x'] >= 0 && $tp['x'] <= $vw && $tp['y'] >= 0 && $tp['y'] <= $vh;
                if (!$sIn && !$tIn) continue;
                $color = $edgeColor ?: ($protocolColors[$l->getProtocol()] ?? '#94a3b8');

                $mx = ($sp['x'] + $tp['x']) / 2;
                $my = ($sp['y'] + $tp['y']) / 2;

                if ($count === 1) {
                    // Single link: straight line
                    $svg .= '<line x1="' . $sp['x'] . '" y1="' . $sp['y'] . '" x2="' . $tp['x'] . '" y2="' . $tp['y'] . '" stroke="' . $color . '" stroke-width="' . $edgeW . '" fill="none"/>';
                } else {
                    // Multiple links: use quadratic bezier curves with offset
                    $dx = $tp['x'] - $sp['x'];
                    $dy = $tp['y'] - $sp['y'];
                    $len = max(sqrt($dx * $dx + $dy * $dy), 1);
                    // Normal vector (perpendicular)
                    $nx = -$dy / $len;
                    $ny = $dx / $len;
                    // Spread: center the offsets around 0
                    $offset = ($idx - ($count - 1) / 2) * 30;
                    $cx = $mx + $nx * $offset;
                    $cy = $my + $ny * $offset;
                    $svg .= '<path d="M' . $sp['x'] . ',' . $sp['y'] . ' Q' . round($cx, 1) . ',' . round($cy, 1) . ' ' . $tp['x'] . ',' . $tp['y'] . '" stroke="' . $color . '" stroke-width="' . $edgeW . '" fill="none"/>';
                    $mx = $cx;
                    $my = $cy;
                }

                // Port labels — placed at 30% from source along the link path
                if ($showLabels) {
                    $ports = array_filter([$l->getSourcePort(), $l->getTargetPort()]);
                    if ($ports) {
                        // Position at 30% along the link (not midpoint) to avoid overlap
                        $t = 0.5;
                        if ($count > 1) {
                            // For bezier curves: Q(t) = (1-t)²·S + 2(1-t)t·C + t²·T
                            $t1 = 1 - $t;
                            $lblX = $t1 * $t1 * $sp['x'] + 2 * $t1 * $t * $mx + $t * $t * $tp['x'];
                            $lblY = $t1 * $t1 * $sp['y'] + 2 * $t1 * $t * $my + $t * $t * $tp['y'];
                            // Tangent at t for rotation
                            $tanX = 2 * $t1 * ($mx - $sp['x']) + 2 * $t * ($tp['x'] - $mx);
                            $tanY = 2 * $t1 * ($my - $sp['y']) + 2 * $t * ($tp['y'] - $my);
                        } else {
                            // Straight line: lerp at 30%
                            $lblX = $sp['x'] + $t * ($tp['x'] - $sp['x']);
                            $lblY = $sp['y'] + $t * ($tp['y'] - $sp['y']);
                            $tanX = $tp['x'] - $sp['x'];
                            $tanY = $tp['y'] - $sp['y'];
                        }
                        $angleDeg = rad2deg(atan2($tanY, $tanX));
                        if ($angleDeg > 90) $angleDeg -= 180;
                        if ($angleDeg < -90) $angleDeg += 180;
                        // Perpendicular — always push label "above" the line (toward negative Y)
                        $tanLen = max(sqrt($tanX * $tanX + $tanY * $tanY), 1);
                        $pnx = -$tanY / $tanLen;
                        $pny = $tanX / $tanLen;
                        if ($pny > 0 || ($pny == 0 && $pnx > 0)) {
                            $pnx = -$pnx;
                            $pny = -$pny;
                        }
                        $lbx = round($lblX + $pnx * 6, 1);
                        $lby = round($lblY + $pny * 6, 1);
                        $svg .= '<text x="' . $lbx . '" y="' . $lby . '" text-anchor="middle" fill="#64748b" font-size="7" transform="rotate(' . round($angleDeg, 1) . ',' . $lbx . ',' . $lby . ')">' . htmlspecialchars(implode(' — ', $ports)) . '</text>';
                    }
                }
            }
        }

        // Nodes
        foreach ($devicePositions as $dp) {
            $x = $dp['x']; $y = $dp['y'];
            $d = $dp['device'];

            // Per-node style override
            $so = $d->getStyleOverride();
            $bg = $so['bgColor'] ?? $nodeBg;
            $border = $so['borderColor'] ?? $nodeBorder;
            $bw = (float) ($so['borderWidth'] ?? $nodeBorderW);
            $shape = $so['shape'] ?? $nodeShape;
            $w = (float) ($so['width'] ?? $nodeW);
            $h = (float) ($so['height'] ?? $nodeH);

            // Skip node if completely outside the viewport
            if (!$inView($x - $w / 2, $y - $h / 2, $w, $h)) continue;

            if ($d->isExternal()) {
                $border = '#94a3b8';
            }

            if ($shape === 'rectangle' || $shape === 'round-rectangle') {
                $rx = $shape === 'round-rectangle' ? 6 : 0;
                $svg .= '<rect x="' . ($x - $w / 2) . '" y="' . ($y - $h / 2) . '" width="' . $w . '" height="' . $h . '" rx="' . $rx . '" fill="' . $bg . '" stroke="' . $border . '" stroke-width="' . $bw . '"/>';
            } else {
                $svg .= '<ellipse cx="' . $x . '" cy="' . $y . '" rx="' . ($w / 2) . '" ry="' . ($h / 2) . '" fill="' . $bg . '" stroke="' . $border . '" stroke-width="' . $bw . '"/>';
            }

            // Label
            if ($showLabels) {
                $labelElements = $labelConf['elements'] ?? [];
                if (empty($labelElements)) {
                    $labelElements = [['field' => 'name', 'x' => 0, 'y' => $h / 2 + 12, 'fontSize' => 11, 'color' => '#1e293b', 'fontWeight' => 600, 'fontFamily' => 'sans-serif']];
                }
                $node = $d->getNode();
                $fieldValues = [
                    'name' => $node?->getName() ?? $node?->getHostname() ?? $d->getName(),
                    'hostname' => $node?->getHostname() ?? '',
                    'ipAddress' => $node?->getIpAddress() ?? $d->getMgmtAddress() ?? '',
                    'manufacturer' => $node?->getManufacturer()?->getName() ?? '',
                    'model' => $node?->getModel()?->getName() ?? '',
                    'chassisId' => $d->getChassisId() ?? '',
                    'sysDescr' => $d->getSysDescr() ?? '',
                ];

                $gradeColors = ['A' => '#22c55e', 'B' => '#84cc16', 'C' => '#f59e0b', 'D' => '#f97316', 'E' => '#ef4444', 'F' => '#dc2626'];
                $isReachable = $node?->getIsReachable();
                $score = $node?->getScore();

                foreach ($labelElements as $el) {
                    $field = $el['field'] ?? 'name';
                    $lx = $x + (float) ($el['x'] ?? 0);
                    $ly = $y + (float) ($el['y'] ?? 0);
                    $fs = (float) ($el['fontSize'] ?? 11);

                    if ($field === 'badge:monitoring') {
                        if (!$showMonitoring || $isReachable === null) continue;
                        $badgeColor = $isReachable ? '#22c55e' : '#ef4444';
                        $r = $fs / 2;
                        $svg .= '<circle cx="' . $lx . '" cy="' . $ly . '" r="' . $r . '" fill="' . $badgeColor . '" stroke="white" stroke-width="1.5"/>';
                    } elseif ($field === 'badge:compliance') {
                        if (!$showCompliance || !$score) continue;
                        $badgeColor = $gradeColors[$score] ?? '#94a3b8';
                        $r = $fs / 2;
                        $svg .= '<circle cx="' . $lx . '" cy="' . $ly . '" r="' . $r . '" fill="' . $badgeColor . '" stroke="white" stroke-width="1.5"/>';
                        $svg .= '<text x="' . $lx . '" y="' . round($ly + $r * 0.38, 1) . '" text-anchor="middle" fill="white" font-size="' . round($r * 1.2, 1) . '" font-weight="bold">' . $score . '</text>';
                    } else {
                        $value = $fieldValues[$field] ?? '';
                        if (!$value) continue;
                        $color = $el['color'] ?? '#1e293b';
                        $fw = ((int) ($el['fontWeight'] ?? 400)) >= 600 ? ' font-weight="bold"' : '';
                        $fi = ($el['fontStyle'] ?? '') === 'italic' ? ' font-style="italic"' : '';
                        $textY = $ly + $fs * 0.35;
                        $svg .= '<text x="' . $lx . '" y="' . round($textY, 1) . '" text-anchor="middle" fill="' . $color . '" font-size="' . $fs . '"' . $fw . $fi . '>' . htmlspecialchars($value) . '</text>';
                    }
                }
            }
        }

        // Legend
        if ($showLegend) {
            $protocols = array_values(array_unique(array_map(fn($l) => $l->getProtocol(), $links)));
            if (!empty($protocols)) {
                $legendX = 10;
                $legendY = $vh - 10 - count($protocols) * 16;
                $svg .= '<rect x="' . $legendX . '" y="' . ($legendY - 4) . '" width="80" height="' . (count($protocols) * 16 + 8) . '" fill="white" fill-opacity="0.9" rx="4" stroke="#e2e8f0"/>';
                foreach ($protocols as $i => $p) {
                    $py = $legendY + $i * 16 + 8;
                    $c = $protocolColors[$p] ?? '#94a3b8';
                    $svg .= '<line x1="' . ($legendX + 8) . '" y1="' . $py . '" x2="' . ($legendX + 24) . '" y2="' . $py . '" stroke="' . $c . '" stroke-width="2.5"/>';
                    $svg .= '<text x="' . ($legendX + 30) . '" y="' . ($py + 4) . '" fill="#475569" font-size="10">' . strtoupper($p) . '</text>';
                }
            }
        }

        $svg .= '</g></svg>';
        return $svg;
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
        return strip_tags($html, ['p', 'br', 'b', 'strong', 'i', 'em', 'ul', 'ol', 'li']);
    }

    private function sanitizeHtml(string $html): string
    {
        return strip_tags($html, ['b', 'i', 'br']);
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
                        foreach ($n->getTags() as $tag) {
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
