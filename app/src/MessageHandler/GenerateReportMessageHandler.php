<?php

namespace App\MessageHandler;

use App\Entity\Node;
use App\Entity\NodeInventoryEntry;
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

            $filePath = $dir . '/report.pdf';
            $this->generatePdf($report, $filePath);

            $report->setGeneratingStatus(null);
            $report->setGeneratedAt(new \DateTimeImmutable());
            $report->setGeneratedFile(sprintf('reports/%d/report.pdf', $report->getId()));
            $this->em->flush();

            $this->publish($report, 'completed');
        } catch (\Throwable $e) {
            $report->setGeneratingStatus(null);
            $this->em->flush();
            $this->publish($report, 'failed');
            throw $e;
        }
    }

    private function generatePdf(Report $report, string $filePath): void
    {
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

        $variables = [
            'title' => $title,
            'subtitle' => $subtitle,
            'date' => (new \DateTime())->format('d/m/Y'),
            'author' => 'Auditix',
            'context' => $contextName,
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
        $pageNum = 1; // cover page
        $tocEntries = [];

        if ($report->getShowTableOfContents()) {
            $pageNum++;
            // TOC page itself is $pageNum, not listed in TOC
        }

        if ($report->getShowAuthorsPage()) {
            $pageNum++;
            $tocEntries[] = ['level' => 1, 'title' => 'Auteurs et diffusion', 'page' => $pageNum];
        }

        if ($report->getShowRevisionPage()) {
            $pageNum++;
            $tocEntries[] = ['level' => 1, 'title' => 'Historique des versions', 'page' => $pageNum];
        }

        if ($report->getShowIllustrationsPage()) {
            $pageNum++;
            $tocEntries[] = ['level' => 1, 'title' => 'Table des illustrations', 'page' => $pageNum];
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
                        'title' => $block['content'] ?? '',
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
                    'title' => $block['content'] ?? '',
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
        $this->renderCoverPage($pdf, $coverPage, $variables, $colors);

        // Table of Contents
        if ($report->getShowTableOfContents()) {
            $this->addTitledPage($pdf, 'Table des matieres', $mLeft, $mTop, $mRight, $mBottom, $headingsByLevel);
            $this->renderTocEntries($pdf, $tocEntries, $headingsByLevel, $tocStyle, $numberingEnabled, $mLeft, $mRight);
        }

        // Authors / Diffusion
        if ($report->getShowAuthorsPage()) {
            $this->addTitledPage($pdf, 'Auteurs et diffusion', $mLeft, $mTop, $mRight, $mBottom, $headingsByLevel);
        }

        // Revision history
        if ($report->getShowRevisionPage()) {
            $this->addTitledPage($pdf, 'Historique des versions', $mLeft, $mTop, $mRight, $mBottom, $headingsByLevel);
        }

        // Illustrations
        if ($report->getShowIllustrationsPage()) {
            $this->addTitledPage($pdf, 'Table des illustrations', $mLeft, $mTop, $mRight, $mBottom, $headingsByLevel);
        }

        // Render structure blocks
        $this->renderBlocks($pdf, $blocks, $headingsByLevel, $styles, $numberingEnabled, $mLeft, $mTop, $mRight, $mBottom);

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

    private function renderCoverPage(TCPDF $pdf, array $coverPage, array $variables, array $colors): void
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
                    $text = $this->sanitizeHtml(str_replace("\n", '<br>', $el['content'] ?? ''));
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
                $content = $block['content'] ?? '';
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
                $content = $block['content'] ?? '';
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

                $pageW = $pdf->getPageWidth();
                $contentW = $pageW - $mLeft - $mRight;
                $colCount = max(count($headers), !empty($rows[0]) ? count($rows[0]) : 1);
                $minLineH = $bodySize * 0.3528 + 3;

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
                        $p = $prepareCellData($cell, $bodySize, true);
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
                        $p = $prepareCellData($cell, $bodySize, false);
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
                $nodeIds = $block['nodeIds'] ?? [];
                $showHeader = !empty($block['showHeader']);
                $invFontSize = !empty($block['fontSize']) ? (int) $block['fontSize'] : $bodySize;
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
                $command = $block['command'] ?? '';
                if (empty(trim($command))) continue;

                $lineFilter = $block['lineFilter'] ?? '';
                $showEllipsis = !empty($block['showEllipsis']);
                $cliFontSize = !empty($block['fontSize']) ? (int) $block['fontSize'] : null;
                $cliRules = $block['styleRules'] ?? [];

                // CLI theme style
                $cliStyle = $styles['cliCommand'] ?? ReportTheme::DEFAULT_STYLES['cliCommand'];
                $cliFont = $this->mapFont($cliStyle['font'] ?? 'Consolas');
                $cliFontSz = $cliFontSize ?? ($cliStyle['size'] ?? 9);
                $cliBg = $this->hexToRgb($cliStyle['bgColor'] ?? '#f1f5f9');
                $cliText = $this->hexToRgb($cliStyle['textColor'] ?? '#1e293b');
                $cliBorder = $this->hexToRgb($cliStyle['borderColor'] ?? '#e2e8f0');
                $cliLineNumColor = $this->hexToRgb($cliStyle['lineNumberColor'] ?? '#94a3b8');
                $cliBorderRadius = (float) ($cliStyle['borderRadius'] ?? 2);
                $cliShowLineNum = $cliStyle['showLineNumbers'] ?? true;

                // Parse line filter
                $visibleLines = null;
                if (!empty($lineFilter)) {
                    $visibleLines = [];
                    foreach (explode(',', $lineFilter) as $part) {
                        $part = trim($part);
                        if (str_contains($part, '-')) {
                            [$start, $end] = array_map('intval', explode('-', $part, 2));
                            for ($i = $start; $i <= $end; $i++) {
                                $visibleLines[$i] = true;
                            }
                        } else {
                            $n = (int) $part;
                            if ($n > 0) $visibleLines[$n] = true;
                        }
                    }
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

                $contentW = $pdf->getPageWidth() - $mLeft - $mRight;
                $lineH = $cliFontSz * 0.3528 + 2;
                $padding = 3; // mm internal padding
                $lineNumW = $cliShowLineNum ? 10 : 0; // width for line numbers

                // Build visible output lines
                $allLines = explode("\n", $command);
                $outputLines = [];
                $prevVisible = true;
                foreach ($allLines as $i => $line) {
                    $lineNum = $i + 1;
                    $isVisible = $visibleLines === null || isset($visibleLines[$lineNum]);
                    if ($isVisible) {
                        $outputLines[] = ['type' => 'line', 'num' => $lineNum, 'text' => $line];
                        $prevVisible = true;
                    } elseif ($prevVisible && $showEllipsis) {
                        $outputLines[] = ['type' => 'ellipsis'];
                        $prevVisible = false;
                    }
                }

                // Calculate total box height
                $totalBoxH = ($padding * 2) + (count($outputLines) * $lineH);

                // Check page break
                $startY = $pdf->GetY();
                if ($startY + $totalBoxH > $pdf->getPageHeight() - $mBottom) {
                    $pdf->AddPage();
                    $startY = $pdf->GetY();
                }

                // Draw background box with rounded corners
                $pdf->SetDrawColor($cliBorder[0], $cliBorder[1], $cliBorder[2]);
                $pdf->SetFillColor($cliBg[0], $cliBg[1], $cliBg[2]);
                $pdf->SetLineWidth(0.3);
                if ($cliBorderRadius > 0) {
                    $pdf->RoundedRect($mLeft, $startY, $contentW, $totalBoxH, $cliBorderRadius, '1111', 'DF');
                } else {
                    $pdf->Rect($mLeft, $startY, $contentW, $totalBoxH, 'DF');
                }

                // Render lines
                $curY = $startY + $padding;
                $textX = $mLeft + $padding + $lineNumW;
                $textW = $contentW - ($padding * 2) - $lineNumW;

                foreach ($outputLines as $ol) {
                    if ($ol['type'] === 'ellipsis') {
                        $pdf->SetFont($cliFont, 'I', $cliFontSz);
                        $pdf->SetTextColor($cliLineNumColor[0], $cliLineNumColor[1], $cliLineNumColor[2]);
                        $pdf->MultiCell($textW, $lineH, '[...]', 0, 'L', false, 0, $textX, $curY, true, 0, false, true, $lineH, 'M');
                        $curY += $lineH;
                        continue;
                    }

                    $lineText = $ol['text'];
                    $lineNum = $ol['num'];

                    // Evaluate style rules for this line (first match wins)
                    $matchedRule = null;
                    $matchedSegments = null; // for "match" highlight mode
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
                        $pdf->MultiCell($lineNumW - 2, $lineH, (string) $lineNum, 0, 'R', false, 0, $mLeft + $padding, $curY, true, 0, false, true, $lineH, 'M');
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
                        // Highlight entire line background
                        $hlRgb = $this->hexToRgb($highlightColor);
                        $pdf->SetFillColor($hlRgb[0], $hlRgb[1], $hlRgb[2]);
                        $lineStrW = $pdf->GetStringWidth($lineText) + 2;
                        $pdf->Rect($textX, $curY, min($lineStrW, $textW), $lineH, 'F');
                    }

                    if ($highlightColor && $highlightMode === 'match' && $matchedSegments && !empty($matchedSegments[0])) {
                        // Highlight only the matched portion
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
                    $pdf->MultiCell($textW, $lineH, $lineText, 0, 'L', false, 0, $textX, $curY, true, 0, false, true, $lineH, 'M');

                    $curY += $lineH;
                }

                // Reset fill color for background box
                $pdf->SetFillColor($cliBg[0], $cliBg[1], $cliBg[2]);

                $pdf->SetXY($mLeft, $startY + $totalBoxH);
                $pdf->SetFont($bodyFont, '', $bodySize);
                $pdf->SetTextColor($bodyRgb[0], $bodyRgb[1], $bodyRgb[2]);

                if ($pSpaceAfter > 0) {
                    $pdf->Ln($pSpaceAfter);
                }

                $prevType = 'cli_command';
            }
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
