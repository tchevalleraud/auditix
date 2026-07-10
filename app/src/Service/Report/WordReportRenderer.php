<?php

namespace App\Service\Report;

use App\Entity\Node;
use App\Entity\NodeInventoryEntry;
use App\Entity\Report;
use App\Entity\ReportTheme;
use App\Service\AclExtractor;
use App\Service\BlockConditionEvaluator;
use App\Service\ComplianceEvaluator;
use App\Service\InventoryNodeRuleEvaluator;
use App\Service\NodeTagResolver;
use App\Service\ReportSchemaSvgRenderer;
use App\Service\SvgRasterizer;
use App\Service\SystemUpdateScoreCalculator;
use App\Service\TopologyV2SvgRenderer;
use Doctrine\ORM\EntityManagerInterface;
use PhpOffice\PhpWord\Element\AbstractContainer;
use PhpOffice\PhpWord\Element\Section;
use PhpOffice\PhpWord\IOFactory;
use PhpOffice\PhpWord\PhpWord;
use PhpOffice\PhpWord\Settings;
use PhpOffice\PhpWord\Shared\Converter;
use PhpOffice\PhpWord\Style\Tab;
use Psr\Log\LoggerInterface;

/**
 * Renders a Report to a Word (.docx) document, mirroring the PDF generator's
 * theme handling and block coverage but emitting native, editable Word content
 * via PhpWord.
 *
 * Charts and the timeline are rendered as faithful data tables (Word cannot
 * reuse the TCPDF vector drawing); topology/schema reuse the existing
 * SVG → PNG rasterization. Every other block is rendered natively.
 */
class WordReportRenderer
{
    use RendersBusinessBlocks;

    private const A4_W_TWIP = 11906;
    private const A4_H_TWIP = 16838;

    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly InventoryNodeRuleEvaluator $inventoryRuleEvaluator,
        private readonly ComplianceEvaluator $complianceEvaluator,
        private readonly SystemUpdateScoreCalculator $lifecycleCalculator,
        private readonly BlockConditionEvaluator $blockConditionEvaluator,
        private readonly TopologyV2SvgRenderer $topologyV2Renderer,
        private readonly ReportSchemaSvgRenderer $reportSchemaRenderer,
        private readonly SvgRasterizer $svgRasterizer,
        private readonly NodeTagResolver $tagResolver,
        private readonly AclExtractor $aclExtractor,
        private readonly \App\Service\StackResolver $stackResolver,
        private readonly LoggerInterface $logger,
    ) {}

    public function render(Report $report, ?Node $forNode, string $filePath): void
    {
        $styles = $this->resolveStyles($report);
        $headingsByLevel = [];
        foreach (($styles['headings'] ?? []) as $h) {
            $headingsByLevel[(int) ($h['level'] ?? 1)] = $h;
        }
        $numberingEnabled = (bool) ($styles['headingNumbering'] ?? true);
        $variables = $this->buildVariables($report, $forNode);

        $ctx = new WordRenderContext($report, $forNode, $styles, $headingsByLevel, $numberingEnabled, $variables);

        // Critical: make PhpWord escape & < > in all text. Without this the
        // raw text is written verbatim into document.xml and Word rejects it.
        Settings::setOutputEscapingEnabled(true);

        $phpWord = new PhpWord();
        // Tell Word to refresh fields (the TOC page numbers) when the document
        // is first opened, instead of showing an empty TOC.
        $phpWord->getSettings()->setUpdateFields(true);
        $phpWord->setDefaultFontName($ctx->bodyFont());
        $phpWord->setDefaultFontSize($ctx->bodySize());
        $this->registerHeadingStyles($phpWord, $ctx);

        // Pre-pass: collect figure captions so the illustrations page can list them.
        $figures = [];
        $this->collectFigures($report->getBlocks(), $figures);

        // 1. Cover page (own section, no header/footer).
        $this->addCoverSection($phpWord, $ctx);

        // 2. Front matter + content share one section carrying header/footer.
        $section = $this->addContentSection($phpWord, $ctx);

        if ($report->getShowAuthorsPage()) {
            $this->addAuthorsPage($section, $ctx);
        }
        if ($report->getShowRevisionPage()) {
            $this->addRevisionsPage($section, $ctx);
        }
        if ($report->getShowTableOfContents()) {
            $this->addTableOfContents($section, $ctx);
        }
        if ($report->getShowIllustrationsPage() && $figures) {
            $this->addIllustrationsPage($section, $ctx, $figures);
        }

        // 3. Main content.
        $this->renderBlocks($section, $report->getBlocks(), $ctx);

        $dir = \dirname($filePath);
        if (!is_dir($dir)) {
            mkdir($dir, 0775, true);
        }
        IOFactory::createWriter($phpWord, 'Word2007')->save($filePath);

        foreach ($ctx->tempFiles as $tmp) {
            if (is_file($tmp)) {
                @unlink($tmp);
            }
        }
    }

    /**
     * @return array<string,mixed>
     */
    private function resolveStyles(Report $report): array
    {
        $styles = $report->getTheme()->getStyles();

        return $this->deepMerge(ReportTheme::DEFAULT_STYLES, is_array($styles) ? $styles : []);
    }

    private function deepMerge(array $base, array $override): array
    {
        foreach ($override as $k => $v) {
            if (is_array($v) && isset($base[$k]) && is_array($base[$k]) && $this->isAssoc($base[$k])) {
                $base[$k] = $this->deepMerge($base[$k], $v);
            } else {
                $base[$k] = $v;
            }
        }

        return $base;
    }

    private function isAssoc(array $a): bool
    {
        return $a !== [] && array_keys($a) !== range(0, count($a) - 1);
    }

    /**
     * @return array<string,string>
     */
    private function buildVariables(Report $report, ?Node $forNode): array
    {
        $vars = [
            'title' => $report->getTitle() ?: $report->getName(),
            'subtitle' => (string) $report->getSubtitle(),
            'date' => (new \DateTimeImmutable())->format($report->getLocale() === 'fr' ? 'd/m/Y' : 'Y-m-d'),
            'context' => $report->getContext()->getName(),
        ];
        if ($forNode) {
            $vars['nodeName'] = (string) $forNode->getName();
            $vars['nodeIp'] = (string) $forNode->getIpAddress();
            $vars['nodeHostname'] = (string) $forNode->getHostname();
        }

        return $vars;
    }

    private function registerHeadingStyles(PhpWord $phpWord, WordRenderContext $ctx): void
    {
        for ($level = 1; $level <= 6; $level++) {
            $h = $ctx->headingsByLevel[$level] ?? $ctx->headingsByLevel[1] ?? [];
            $font = WordStyleHelper::fontStyle($h, ['bold' => true]);
            $para = [
                'spaceBefore' => Converter::cmToTwip(((float) ($h['spaceBefore'] ?? 2)) / 10),
                'spaceAfter' => Converter::cmToTwip(((float) ($h['spaceAfter'] ?? 1)) / 10),
                'keepNext' => true,
            ];
            $bg = WordStyleHelper::color($h['background'] ?? null);
            if ($bg !== null) {
                $para['shading'] = ['fill' => $bg];
            }
            $phpWord->addTitleStyle($level, $font, $para);
        }
    }

    // ---------------------------------------------------------------------
    // Document structure
    // ---------------------------------------------------------------------

    private function addCoverSection(PhpWord $phpWord, WordRenderContext $ctx): void
    {
        $section = $phpWord->addSection([
            'pageSizeW' => self::A4_W_TWIP,
            'pageSizeH' => self::A4_H_TWIP,
            'marginTop' => WordStyleHelper::mmToTwip(40),
            'marginBottom' => WordStyleHelper::mmToTwip(20),
            'marginLeft' => WordStyleHelper::mmToTwip(20),
            'marginRight' => WordStyleHelper::mmToTwip(20),
        ]);

        $cover = $ctx->styles['coverPage'] ?? [];
        $elements = $cover['elements'] ?? [];
        if (is_array($elements) && $elements) {
            $this->renderCoverElements($section, $elements, $ctx);

            return;
        }

        $colors = $ctx->styles['colors'] ?? [];
        $primary = WordStyleHelper::color($colors['primary'] ?? '#1e293b') ?? '1E293B';
        $secondary = WordStyleHelper::color($colors['secondary'] ?? '#3b82f6') ?? '3B82F6';

        $section->addTextBreak(6);
        $section->addText(
            $ctx->variables['title'] ?? '',
            ['name' => $ctx->bodyFont(), 'size' => 28, 'bold' => true, 'color' => $primary],
            ['alignment' => 'left', 'spaceAfter' => 120]
        );
        if (!empty($ctx->variables['subtitle'])) {
            $section->addText(
                $ctx->variables['subtitle'],
                ['name' => $ctx->bodyFont(), 'size' => 16, 'color' => $secondary],
                ['alignment' => 'left', 'spaceAfter' => 240]
            );
        }
        $section->addTextBreak(2);

        $meta = ['name' => $ctx->bodyFont(), 'size' => 10, 'color' => '64748B'];
        if ($ctx->forNode) {
            $section->addText((string) ($ctx->variables['nodeName'] ?? ''), $meta);
            $section->addText((string) ($ctx->variables['nodeIp'] ?? ''), $meta);
        }
        $section->addText($ctx->variables['context'] ?? '', $meta);
        $section->addText($ctx->variables['date'] ?? '', $meta);
        $section->addText('Auditix', $meta);
    }

    /**
     * Render themed cover-page elements positioned in percent of the page,
     * using absolutely-positioned text boxes / images.
     *
     * @param array<int,array<string,mixed>> $elements
     */
    private function renderCoverElements(Section $section, array $elements, WordRenderContext $ctx): void
    {
        $pageWmm = 210.0;
        $pageHmm = 297.0;
        foreach ($elements as $el) {
            $x = (float) ($el['x'] ?? 0) / 100 * $pageWmm;
            $y = (float) ($el['y'] ?? 0) / 100 * $pageHmm;
            $w = (float) ($el['width'] ?? 50) / 100 * $pageWmm;
            $h = (float) ($el['height'] ?? 10) / 100 * $pageHmm;
            $type = (string) ($el['type'] ?? 'text');
            $style = (array) ($el['style'] ?? []);

            $boxStyle = [
                'width' => WordStyleHelper::mmToTwip($w),
                'height' => WordStyleHelper::mmToTwip(max($h, 5)),
                'positioning' => 'absolute',
                'posHorizontal' => 'absolute',
                'posVertical' => 'absolute',
                'posHorizontalRel' => 'page',
                'posVerticalRel' => 'page',
                'marginLeft' => WordStyleHelper::mmToTwip($x),
                'marginTop' => WordStyleHelper::mmToTwip($y),
                'wrappingStyle' => 'infront',
                'borderSize' => 0,
            ];

            try {
                if ($type === 'image') {
                    $path = $this->resolveImagePath((string) ($el['src'] ?? ''));
                    if ($path) {
                        $box = $section->addTextBox($boxStyle);
                        $box->addImage($path, ['width' => WordStyleHelper::mmToPixel($w), 'height' => WordStyleHelper::mmToPixel($h)]);
                    }
                    continue;
                }

                $text = $type === 'variable'
                    ? (string) ($ctx->variables[(string) ($el['variable'] ?? '')] ?? '')
                    : $this->resolveVariables((string) ($el['content'] ?? ''), $ctx);

                $font = [
                    'name' => WordStyleHelper::mapFont((string) ($style['fontFamily'] ?? $ctx->bodyFont())),
                    'size' => (float) ($style['fontSize'] ?? 14),
                    'bold' => ($style['fontWeight'] ?? '') === 'bold',
                    'italic' => ($style['fontStyle'] ?? '') === 'italic',
                ];
                if ($c = WordStyleHelper::color($style['color'] ?? null)) {
                    $font['color'] = $c;
                }
                $para = ['alignment' => WordStyleHelper::alignment($style['textAlign'] ?? 'center'), 'spaceAfter' => 0];

                $box = $section->addTextBox($boxStyle);
                foreach (preg_split('/\r\n|\r|\n/', $text) as $idx => $line) {
                    $box->addText(WordStyleHelper::xmlSafe($line), $font, $para);
                }
            } catch (\Throwable $e) {
                $this->logger->error('[word-generator] cover element failed', ['type' => $type, 'error' => $e->getMessage()]);
            }
        }
    }

    private function addContentSection(PhpWord $phpWord, WordRenderContext $ctx): Section
    {
        $m = $ctx->styles['margins'] ?? [];
        $section = $phpWord->addSection([
            'pageSizeW' => self::A4_W_TWIP,
            'pageSizeH' => self::A4_H_TWIP,
            'marginTop' => WordStyleHelper::mmToTwip((float) ($m['top'] ?? 20)),
            'marginBottom' => WordStyleHelper::mmToTwip((float) ($m['bottom'] ?? 20)),
            'marginLeft' => WordStyleHelper::mmToTwip((float) ($m['left'] ?? 20)),
            'marginRight' => WordStyleHelper::mmToTwip((float) ($m['right'] ?? 20)),
            'breakType' => 'nextPage',
        ]);

        $headerCfg = $ctx->styles['header'] ?? [];
        if (!empty($headerCfg['enabled'])) {
            $this->buildBar($section->addHeader(), $headerCfg, $ctx, true);
        }
        $footerCfg = $ctx->styles['footer'] ?? [];
        if (!empty($footerCfg['enabled'])) {
            $this->buildBar($section->addFooter(), $footerCfg, $ctx, false);
        }

        return $section;
    }

    /**
     * Build a header/footer bar. Left/center/right slots are laid out in a single
     * paragraph using center/right tab stops (no table, so no stray borders),
     * with an optional separator line via the paragraph border.
     *
     * @param array<string,mixed> $cfg
     */
    private function buildBar(AbstractContainer $container, array $cfg, WordRenderContext $ctx, bool $isHeader): void
    {
        $contentWidth = (int) (self::A4_W_TWIP
            - WordStyleHelper::mmToTwip((float) (($ctx->styles['margins']['left'] ?? 20)))
            - WordStyleHelper::mmToTwip((float) (($ctx->styles['margins']['right'] ?? 20))));

        $para = [
            'spaceBefore' => 0,
            'spaceAfter' => 0,
            'tabs' => [
                new Tab('center', (int) ($contentWidth / 2)),
                new Tab('right', $contentWidth),
            ],
        ];
        if (!empty($cfg['separator'])) {
            $sepColor = WordStyleHelper::color($cfg['separatorColor'] ?? '#e2e8f0') ?? 'E2E8F0';
            if ($isHeader) {
                $para['borderBottomSize'] = 4;
                $para['borderBottomColor'] = $sepColor;
            } else {
                $para['borderTopSize'] = 4;
                $para['borderTopColor'] = $sepColor;
            }
        }

        $run = $container->addTextRun($para);
        $this->addBarSlot($run, $cfg['left'] ?? ['type' => 'none'], $ctx);
        $run->addText("\t");
        $this->addBarSlot($run, $cfg['center'] ?? ['type' => 'none'], $ctx);
        $run->addText("\t");
        $this->addBarSlot($run, $cfg['right'] ?? ['type' => 'none'], $ctx);
    }

    /**
     * @param array<string,mixed> $slot
     */
    private function addBarSlot(\PhpOffice\PhpWord\Element\TextRun $run, array $slot, WordRenderContext $ctx): void
    {
        $type = $slot['type'] ?? 'none';
        $font = WordStyleHelper::fontStyle($slot['style'] ?? [], ['size' => 8, 'color' => '#64748b']);

        switch ($type) {
            case 'pageNumber':
                $run->addField('PAGE', [], [], null, $font);
                $run->addText(' / ', $font);
                $run->addField('NUMPAGES', [], [], null, $font);
                break;
            case 'text':
                $run->addText(WordStyleHelper::xmlSafe((string) ($slot['text'] ?? '')), $font);
                break;
            case 'variable':
                $run->addText(WordStyleHelper::xmlSafe((string) ($ctx->variables[(string) ($slot['variable'] ?? '')] ?? '')), $font);
                break;
            case 'image':
                $path = $this->resolveImagePath((string) ($slot['imageSrc'] ?? ($slot['filename'] ?? '')));
                if ($path) {
                    $run->addImage($path, ['height' => WordStyleHelper::mmToPixel((float) ($slot['imageMaxHeight'] ?? 8))]);
                }
                break;
        }
    }

    private function addAuthorsPage(Section $section, WordRenderContext $ctx): void
    {
        $t = $this->t($ctx);
        $this->addSectionTitle($section, $t['authors_page'], $ctx);

        $authors = $ctx->report->getAuthors();
        if ($authors) {
            $this->addPeopleTable($section, $t['authors'], $authors, $ctx);
        }
        $recipients = $ctx->report->getRecipients();
        if ($recipients) {
            $this->addPeopleTable($section, $t['recipients'], $recipients, $ctx);
        }
        $section->addPageBreak();
    }

    /**
     * @param array<int,array<string,mixed>> $people
     */
    private function addPeopleTable(Section $section, string $title, array $people, WordRenderContext $ctx): void
    {
        $section->addText($title, ['name' => $ctx->bodyFont(), 'size' => 14, 'bold' => true], ['spaceBefore' => 120, 'spaceAfter' => 60]);
        $t = $this->t($ctx);
        $headers = [$t['col_lastname'], $t['col_firstname'], $t['col_position'], $t['col_email'], $t['col_phone']];
        $rows = [];
        foreach ($people as $p) {
            $rows[] = [
                (string) ($p['lastName'] ?? $p['lastname'] ?? ''),
                (string) ($p['firstName'] ?? $p['firstname'] ?? ''),
                (string) ($p['position'] ?? $p['role'] ?? ''),
                (string) ($p['email'] ?? ''),
                (string) ($p['phone'] ?? ''),
            ];
        }
        $this->addStripedTable($section, $headers, $rows, $ctx, [18, 18, 22, 25, 17]);
    }

    private function addRevisionsPage(Section $section, WordRenderContext $ctx): void
    {
        $t = $this->t($ctx);
        $this->addSectionTitle($section, $t['revisions_page'], $ctx);
        $headers = [$t['col_version'], $t['col_date'], $t['col_description']];
        $rows = [];
        foreach ($ctx->report->getRevisions() as $r) {
            $rows[] = [
                (string) ($r['version'] ?? ''),
                (string) ($r['date'] ?? ''),
                (string) ($r['description'] ?? ''),
            ];
        }
        $this->addStripedTable($section, $headers, $rows, $ctx, [15, 20, 65]);
        $section->addPageBreak();
    }

    private function addTableOfContents(Section $section, WordRenderContext $ctx): void
    {
        $t = $this->t($ctx);
        $this->addSectionTitle($section, $t['toc'], $ctx);
        $tocStyle = ['tabLeader' => empty($ctx->styles['toc']['dotLeader']) ? '' : 'dot'];
        $section->addTOC(['name' => $ctx->bodyFont(), 'size' => $ctx->bodySize()], $tocStyle, 1, 6);
        $section->addPageBreak();
    }

    /**
     * @param list<array{label:string,number:int}> $figures
     */
    private function addIllustrationsPage(Section $section, WordRenderContext $ctx, array $figures): void
    {
        $t = $this->t($ctx);
        $this->addSectionTitle($section, $t['illustrations_page'], $ctx);
        foreach ($figures as $fig) {
            $section->addText(
                sprintf('Figure %d — %s', $fig['number'], $fig['label']),
                ['name' => $ctx->bodyFont(), 'size' => $ctx->bodySize()],
                ['spaceAfter' => 40]
            );
        }
        $section->addPageBreak();
    }

    private function addSectionTitle(Section $section, string $title, WordRenderContext $ctx): void
    {
        $colors = $ctx->styles['colors'] ?? [];
        $section->addText(
            $title,
            ['name' => $ctx->bodyFont(), 'size' => 20, 'bold' => true, 'color' => WordStyleHelper::color($colors['primary'] ?? '#1e293b')],
            ['spaceAfter' => 160]
        );
    }

    // ---------------------------------------------------------------------
    // Block dispatch
    // ---------------------------------------------------------------------

    /**
     * @param array<int,array<string,mixed>> $blocks
     */
    public function renderBlocks(Section $section, array $blocks, WordRenderContext $ctx): void
    {
        foreach ($blocks as $block) {
            if (!is_array($block)) {
                continue;
            }
            $this->renderBlock($section, $block, $ctx);
        }
    }

    /**
     * @param array<string,mixed> $block
     */
    private function renderBlock(Section $section, array $block, WordRenderContext $ctx): void
    {
        if (!empty($block['pageBreakBefore'])) {
            $section->addPageBreak();
        }

        $type = (string) ($block['type'] ?? '');
        try {
            switch ($type) {
                case 'heading':
                    $this->renderHeading($section, $block, $ctx);
                    break;
                case 'paragraph':
                    $this->renderParagraph($section, $block, $ctx);
                    break;
                case 'image':
                    $this->renderImage($section, $block, $ctx);
                    break;
                case 'table':
                    $this->renderTable($section, $block, $ctx);
                    break;
                case 'two_column':
                    $this->renderTwoColumn($section, $block, $ctx);
                    break;
                case 'conditional':
                    $this->renderConditional($section, $block, $ctx);
                    break;
                case 'repeat_per_node':
                    $this->renderRepeatPerNode($section, $block, $ctx);
                    break;
                case 'topology':
                    $this->renderTopology($section, $block, $ctx);
                    break;
                case 'schema':
                    $this->renderSchema($section, $block, $ctx);
                    break;
                default:
                    if (!$this->renderBusinessBlock($section, $block, $type, $ctx)) {
                        $this->logger->warning('[word-generator] unsupported block type', ['type' => $type]);
                    }
            }
        } catch (\Throwable $e) {
            $this->logger->error('[word-generator] block render failed', ['type' => $type, 'error' => $e->getMessage()]);
        }
    }

    // ---------------------------------------------------------------------
    // Core blocks
    // ---------------------------------------------------------------------

    private function renderHeading(Section $section, array $block, WordRenderContext $ctx): void
    {
        $level = max(1, min(6, (int) ($block['level'] ?? 1)));
        $content = $this->resolveVariables((string) ($block['content'] ?? ''), $ctx);
        $prefix = '';
        if ($ctx->numberingEnabled) {
            $prefix = $this->headingNumber($ctx, $level) . ' ';
        }
        $section->addTitle($prefix . $content, $level);
    }

    private function headingNumber(WordRenderContext $ctx, int $level): string
    {
        $ctx->counters[$level] = ($ctx->counters[$level] ?? 0) + 1;
        for ($l = $level + 1; $l <= 6; $l++) {
            $ctx->counters[$l] = 0;
        }
        $parts = [];
        for ($l = 1; $l <= $level; $l++) {
            $parts[] = $ctx->counters[$l] ?? 0;
        }

        return implode('.', $parts) . '.';
    }

    private function renderParagraph(Section $section, array $block, WordRenderContext $ctx): void
    {
        $html = $this->resolveVariables((string) ($block['content'] ?? ''), $ctx);
        $align = WordStyleHelper::alignment($block['align'] ?? ($ctx->styles['paragraph']['alignment'] ?? 'left'));
        $para = [
            'alignment' => $align,
            'spaceBefore' => Converter::cmToTwip(((float) ($ctx->styles['paragraph']['spaceBefore'] ?? 2)) / 10),
            'spaceAfter' => Converter::cmToTwip(((float) ($ctx->styles['paragraph']['spaceAfter'] ?? 2)) / 10),
        ];
        $this->addHtml($section, $html, $ctx, $para);
    }

    private function renderImage(Section $section, array $block, WordRenderContext $ctx): void
    {
        $path = $this->resolveImagePath((string) ($block['filename'] ?? ''));
        if (!$path) {
            return;
        }
        $this->addConstrainedImage($section, $path, (float) ($block['width'] ?? 100), $ctx);
        $this->renderCaption($section, $block, $ctx);
    }

    /**
     * Insert an image scaled to a percentage of the content width, never wider
     * than the printable area, keeping the native aspect ratio so it can't
     * overflow into the right margin.
     */
    private function addConstrainedImage(Section $section, string $path, float $widthPct, WordRenderContext $ctx): void
    {
        $contentMm = 210 - (float) ($ctx->styles['margins']['left'] ?? 20) - (float) ($ctx->styles['margins']['right'] ?? 20);
        $targetMm = min($contentMm * max(1.0, $widthPct) / 100, $contentMm - 1);
        $wPx = WordStyleHelper::mmToPixel($targetMm);

        $style = ['width' => $wPx, 'alignment' => 'center'];
        $info = @getimagesize($path);
        if ($info && ($info[0] ?? 0) > 0) {
            $style['height'] = (int) round($wPx * $info[1] / $info[0]);
        }
        $section->addImage($path, $style);
    }

    private function renderCaption(Section $section, array $block, WordRenderContext $ctx): void
    {
        if (empty($block['showCaption']) || empty($block['caption'])) {
            return;
        }
        $ctx->figures[] = ['label' => (string) $block['caption'], 'number' => count($ctx->figures) + 1];
        $section->addText(
            $this->resolveVariables((string) $block['caption'], $ctx),
            ['name' => $ctx->bodyFont(), 'size' => max(7, $ctx->bodySize() - 1), 'italic' => true],
            ['alignment' => 'center', 'spaceAfter' => 80]
        );
    }

    private function renderTable(Section $section, array $block, WordRenderContext $ctx): void
    {
        $headers = [];
        if (!empty($block['showHeader']) && !empty($block['headers'])) {
            foreach ($block['headers'] as $h) {
                $headers[] = $this->cellText($h, $ctx);
            }
        }
        $rows = [];
        foreach (($block['rows'] ?? []) as $r) {
            $cells = [];
            foreach ((array) $r as $c) {
                $cells[] = $this->cellText($c, $ctx);
            }
            $rows[] = $cells;
        }
        $widths = [];
        foreach (($block['columnWidths'] ?? []) as $w) {
            $widths[] = (float) $w;
        }
        $aligns = $block['columnAligns'] ?? [];
        $this->addStripedTable($section, $headers, $rows, $ctx, $widths ?: null, $aligns);
    }

    /**
     * @param mixed $cell string or {value,bold,italic,size}
     */
    private function cellText($cell, WordRenderContext $ctx): string
    {
        if (is_array($cell)) {
            return $this->resolveVariables((string) ($cell['value'] ?? ''), $ctx);
        }

        return $this->resolveVariables((string) $cell, $ctx);
    }

    private function renderTwoColumn(Section $section, array $block, WordRenderContext $ctx): void
    {
        $leftPct = max(10, min(90, (float) ($block['leftWidthPct'] ?? 50)));
        $contentMm = 210 - (float) ($ctx->styles['margins']['left'] ?? 20) - (float) ($ctx->styles['margins']['right'] ?? 20);
        $gap = (float) ($block['gapMm'] ?? 4);
        $effMm = max(1, $contentMm - $gap);
        $leftW = WordStyleHelper::mmToTwip($effMm * $leftPct / 100);
        $rightW = WordStyleHelper::mmToTwip($effMm * (100 - $leftPct) / 100);

        $table = $section->addTable(['borderSize' => 0, 'cellMargin' => WordStyleHelper::mmToTwip($gap / 2)]);
        $row = $table->addRow();
        $leftCell = $row->addCell($leftW, ['valign' => $this->vAlign($block['leftVAlign'] ?? 'top')]);
        $rightCell = $row->addCell($rightW, ['valign' => $this->vAlign($block['rightVAlign'] ?? 'top')]);

        $this->renderBlocksInto($leftCell, (array) ($block['leftBlocks'] ?? []), $ctx);
        $this->renderBlocksInto($rightCell, (array) ($block['rightBlocks'] ?? []), $ctx);
    }

    private function vAlign(?string $v): string
    {
        return match ($v) {
            'middle' => 'center',
            'bottom' => 'bottom',
            default => 'top',
        };
    }

    /**
     * Render child blocks into an arbitrary container (table cell). A reduced
     * dispatch is used since a cell cannot host page breaks or nested sections.
     *
     * @param array<int,array<string,mixed>> $blocks
     */
    private function renderBlocksInto(AbstractContainer $container, array $blocks, WordRenderContext $ctx): void
    {
        foreach ($blocks as $block) {
            if (!is_array($block)) {
                continue;
            }
            $type = (string) ($block['type'] ?? '');
            try {
                switch ($type) {
                    case 'heading':
                        $level = max(1, min(6, (int) ($block['level'] ?? 1)));
                        $h = $ctx->headingsByLevel[$level] ?? [];
                        $container->addText(
                            $this->resolveVariables((string) ($block['content'] ?? ''), $ctx),
                            WordStyleHelper::fontStyle($h, ['bold' => true]),
                            ['spaceAfter' => 60]
                        );
                        break;
                    case 'paragraph':
                        $this->addHtml($container, $this->resolveVariables((string) ($block['content'] ?? ''), $ctx), $ctx, []);
                        break;
                    case 'image':
                        $path = $this->resolveImagePath((string) ($block['filename'] ?? ''));
                        if ($path) {
                            $container->addImage($path, ['width' => WordStyleHelper::mmToPixel(60), 'alignment' => 'center']);
                        }
                        break;
                    default:
                        // Tables/business blocks inside a column: best-effort text fallback.
                        $text = $this->resolveVariables((string) ($block['content'] ?? ''), $ctx);
                        if ($text !== '') {
                            $container->addText($text, ['name' => $ctx->bodyFont(), 'size' => $ctx->bodySize()]);
                        }
                }
            } catch (\Throwable $e) {
                $this->logger->error('[word-generator] column block failed', ['type' => $type, 'error' => $e->getMessage()]);
            }
        }
    }

    private function renderConditional(Section $section, array $block, WordRenderContext $ctx): void
    {
        $condTree = is_array($block['condition'] ?? null) ? $block['condition'] : null;
        if (!$this->blockConditionEvaluator->evaluate($condTree, $ctx->forNode, $ctx->report)) {
            return;
        }
        $this->renderBlocks($section, (array) ($block['children'] ?? []), $ctx);
    }

    private function renderRepeatPerNode(Section $section, array $block, WordRenderContext $ctx): void
    {
        $nodes = $this->resolveRepeatNodes($block, $ctx);
        $children = (array) ($block['children'] ?? []);
        foreach ($nodes as $node) {
            $nodeCtx = new WordRenderContext(
                $ctx->report,
                $node,
                $ctx->styles,
                $ctx->headingsByLevel,
                $ctx->numberingEnabled,
                $this->buildVariables($ctx->report, $node),
            );
            $nodeCtx->counters = $ctx->counters;
            $this->renderBlocks($section, $children, $nodeCtx);
            $ctx->counters = $nodeCtx->counters;
        }
    }

    // ---------------------------------------------------------------------
    // Media blocks (topology / schema reuse SVG → PNG rasterization)
    // ---------------------------------------------------------------------

    private function renderTopology(Section $section, array $block, WordRenderContext $ctx): void
    {
        $topology = $this->em->getRepository(\App\Entity\Topology::class)->find($block['topologyId'] ?? 0);
        if (!$topology) {
            return;
        }
        $opts = [
            'protocolFilter' => $block['protocolFilter'] ?? 'manual',
            'canvasWidth' => 1200,
            'mstpInstance' => $block['mstpInstance'] ?? null,
            'showLegend' => (bool) ($block['showLegend'] ?? true),
            'viewportFrame' => $block['viewportFrame'] ?? null,
        ];
        $svg = $this->topologyV2Renderer->render($topology, $opts);
        $this->addRasterizedSvg($section, $svg, $block, $ctx);
        $this->renderCaption($section, $block, $ctx);
    }

    private function renderSchema(Section $section, array $block, WordRenderContext $ctx): void
    {
        $schema = $this->em->getRepository(\App\Entity\ReportSchema::class)->find($block['schemaId'] ?? 0);
        if (!$schema) {
            return;
        }
        $svg = $this->reportSchemaRenderer->render($schema, [
            'canvasWidth' => 1200,
            'viewportFrame' => $block['viewportFrame'] ?? null,
        ]);
        $this->addRasterizedSvg($section, $svg, $block, $ctx);
        $this->renderCaption($section, $block, $ctx);
    }

    private function addRasterizedSvg(Section $section, string $svg, array $block, WordRenderContext $ctx): void
    {
        // Some topology widths are stored as a fraction (>100 means full width).
        $widthPct = min(100.0, max(1.0, (float) ($block['width'] ?? 100)));
        $contentMm = 210 - (float) ($ctx->styles['margins']['left'] ?? 20) - (float) ($ctx->styles['margins']['right'] ?? 20);
        $targetMm = min($contentMm * $widthPct / 100, $contentMm - 1);
        $targetPx = (int) round($targetMm / 25.4 * 250);

        $png = $this->svgRasterizer->toPngFile($svg, $targetPx);
        if ($png && is_file($png)) {
            $style = ['width' => WordStyleHelper::mmToPixel($targetMm), 'alignment' => 'center'];
            $info = @getimagesize($png);
            if ($info && ($info[0] ?? 0) > 0) {
                $style['height'] = (int) round($style['width'] * $info[1] / $info[0]);
            }
            $section->addImage($png, $style);
            // PhpWord only reads the file at save() time, so defer deletion.
            $ctx->tempFiles[] = $png;
        }
    }

    /**
     * Recursively collect figure captions for the illustrations page.
     *
     * @param array<int,mixed> $blocks
     * @param list<array{label:string,number:int}> $figures
     */
    private function collectFigures(array $blocks, array &$figures): void
    {
        foreach ($blocks as $block) {
            if (!is_array($block)) {
                continue;
            }
            $type = (string) ($block['type'] ?? '');
            if (in_array($type, ['image', 'topology', 'schema'], true) && !empty($block['showCaption']) && !empty($block['caption'])) {
                $figures[] = ['label' => (string) $block['caption'], 'number' => count($figures) + 1];
            }
            foreach (['children', 'leftBlocks', 'rightBlocks'] as $key) {
                if (!empty($block[$key]) && is_array($block[$key])) {
                    $this->collectFigures($block[$key], $figures);
                }
            }
        }
    }

    // ---------------------------------------------------------------------
    // Shared helpers
    // ---------------------------------------------------------------------

    /**
     * Add a striped table (theme `table` styling) with optional header row.
     *
     * @param list<string> $headers
     * @param list<list<string>> $rows
     * @param list<float>|null $widthsPct per-column width percentages
     * @param array<int,string> $aligns per-column alignment
     */
    private function addStripedTable(Section $section, array $headers, array $rows, WordRenderContext $ctx, ?array $widthsPct = null, array $aligns = []): void
    {
        $ts = $ctx->styles['table'] ?? [];
        $borderColor = WordStyleHelper::color($ts['borderColor'] ?? '#e2e8f0') ?? 'E2E8F0';
        $headerBg = WordStyleHelper::color($ts['headerBg'] ?? '#1e293b') ?? '1E293B';
        $headerColor = WordStyleHelper::color($ts['headerColor'] ?? '#ffffff') ?? 'FFFFFF';
        $altBg = WordStyleHelper::color($ts['alternateBg'] ?? '#f8fafc');
        $alternate = (bool) ($ts['alternateRows'] ?? true);
        $fontSize = ((int) ($ts['fontSize'] ?? 0)) > 0 ? (int) $ts['fontSize'] : $ctx->bodySize();

        $colCount = max(count($headers), ...array_map('count', $rows ?: [[]]));
        if ($colCount < 1) {
            return;
        }

        $contentMm = 210 - (float) ($ctx->styles['margins']['left'] ?? 20) - (float) ($ctx->styles['margins']['right'] ?? 20);
        $colWidths = $this->columnTwips($colCount, $widthsPct, $contentMm);

        $table = $section->addTable([
            'borderSize' => 4,
            'borderColor' => $borderColor,
            'cellMarginTop' => WordStyleHelper::mmToTwip(0.3),
            'cellMarginBottom' => WordStyleHelper::mmToTwip(0.3),
            'cellMarginLeft' => WordStyleHelper::mmToTwip(1),
            'cellMarginRight' => WordStyleHelper::mmToTwip(1),
            'unit' => 'dxa',
            'width' => WordStyleHelper::mmToTwip($contentMm),
            'layout' => 'fixed',
        ]);

        if ($headers) {
            $row = $table->addRow(null, ['tblHeader' => true]);
            foreach ($headers as $i => $h) {
                $cell = $row->addCell($colWidths[$i] ?? null, ['bgColor' => $headerBg, 'valign' => 'center']);
                $cell->addText(WordStyleHelper::xmlSafe($h), ['name' => $ctx->bodyFont(), 'size' => $fontSize, 'bold' => true, 'color' => $headerColor], ['alignment' => WordStyleHelper::alignment($aligns[$i] ?? 'left'), 'spaceBefore' => 0, 'spaceAfter' => 0]);
            }
        }

        foreach ($rows as $ri => $cells) {
            $row = $table->addRow();
            $bg = ($alternate && $ri % 2 === 1 && $altBg) ? $altBg : null;
            for ($ci = 0; $ci < $colCount; $ci++) {
                $cellStyle = ['valign' => 'center'];
                if ($bg) {
                    $cellStyle['bgColor'] = $bg;
                }
                $cell = $row->addCell($colWidths[$ci] ?? null, $cellStyle);
                $cell->addText(
                    WordStyleHelper::xmlSafe((string) ($cells[$ci] ?? '')),
                    ['name' => $ctx->bodyFont(), 'size' => $fontSize, 'color' => $ctx->bodyColor() ?? '1E293B'],
                    ['alignment' => WordStyleHelper::alignment($aligns[$ci] ?? 'left'), 'spaceBefore' => 0, 'spaceAfter' => 0]
                );
            }
        }
    }

    /**
     * @param list<float>|null $widthsPct
     * @return array<int,int> twips per column
     */
    private function columnTwips(int $colCount, ?array $widthsPct, float $contentMm): array
    {
        $totalTwip = WordStyleHelper::mmToTwip($contentMm);
        $out = [];
        if ($widthsPct && count($widthsPct) === $colCount && array_sum($widthsPct) > 0) {
            $sum = array_sum($widthsPct);
            foreach ($widthsPct as $i => $w) {
                $out[$i] = (int) round($totalTwip * $w / $sum);
            }
        } else {
            $each = (int) round($totalTwip / $colCount);
            for ($i = 0; $i < $colCount; $i++) {
                $out[$i] = $each;
            }
        }

        return $out;
    }

    /**
     * Resolve a block-image / cover-image API path or basename to an absolute
     * filesystem path, mirroring the PDF generator's resolution rules.
     */
    private function resolveImagePath(string $filename): ?string
    {
        if ($filename === '') {
            return null;
        }
        if (preg_match('#^/api/block-images/(.+)$#', $filename, $m)) {
            $p = '/var/www/var/uploads/block-images/' . basename($m[1]);

            return is_file($p) ? $p : null;
        }
        if (preg_match('#^/api/cover-page-images/(.+)$#', $filename, $m)) {
            $p = '/var/www/var/uploads/cover-pages/' . basename($m[1]);

            return is_file($p) ? $p : null;
        }
        foreach (['/var/www/var/uploads/block-images/', '/var/www/var/uploads/cover-pages/'] as $dir) {
            $p = $dir . basename($filename);
            if (is_file($p)) {
                return $p;
            }
        }

        return is_file($filename) ? $filename : null;
    }

    /**
     * Inventory value lookup used by variable resolution and some blocks.
     */
    private function getInventoryValue(Node $node, string $category, string $key, ?string $col = null): ?string
    {
        $qb = $this->em->getRepository(NodeInventoryEntry::class)->createQueryBuilder('e')
            ->andWhere('e.node = :node')
            ->andWhere('LOWER(e.categoryName) = :cat')
            ->andWhere('LOWER(e.entryKey) = :key')
            ->setParameter('node', $node)
            ->setParameter('cat', mb_strtolower($category))
            ->setParameter('key', mb_strtolower($key))
            ->setMaxResults(1);
        if ($col !== null) {
            $qb->andWhere('LOWER(e.colLabel) = :col')->setParameter('col', mb_strtolower($col));
        }
        $entry = $qb->getQuery()->getOneOrNullResult();

        return $entry?->getValue();
    }

    /**
     * Resolve {{...}} placeholders in heading/paragraph/caption text. Covers the
     * common node fields and inventory lookups; advanced template functions
     * fall back to an empty string.
     */
    private function resolveVariables(string $text, WordRenderContext $ctx): string
    {
        if (!str_contains($text, '{{')) {
            return WordStyleHelper::xmlSafe($text);
        }

        if (str_contains($text, '{{fn:')) {
            $text = $this->resolveTemplateFunctions($text, $ctx);
        }

        return WordStyleHelper::xmlSafe((string) preg_replace_callback('/\{\{\s*([^}]+?)\s*\}\}/', function (array $m) use ($ctx): string {
            $expr = trim($m[1]);
            $expr = preg_replace('/^for\.node\./', 'node.', $expr);

            if (str_starts_with($expr, 'node.')) {
                $rest = substr($expr, 5);
                $node = $ctx->forNode;
                if (!$node) {
                    return '';
                }
                $parts = explode('.', $rest);
                if (count($parts) === 1) {
                    return $this->nodeField($node, $parts[0]);
                }
                if (count($parts) === 2) {
                    return (string) $this->getInventoryValue($node, $parts[0], $parts[1]);
                }
                if (count($parts) >= 3) {
                    return (string) $this->getInventoryValue($node, $parts[0], $parts[1], $parts[2]);
                }
            }

            return (string) ($ctx->variables[$expr] ?? '');
        }, $text));
    }

    private function nodeField(Node $node, string $field): string
    {
        return match (strtolower($field)) {
            'hostname' => (string) $node->getHostname(),
            'name' => (string) $node->getName(),
            'ip', 'ipaddress' => (string) $node->getIpAddress(),
            'manufacturer' => $node->getManufacturer()?->getName() ?? '',
            'model' => $node->getModel()?->getName() ?? '',
            default => '',
        };
    }

    /**
     * Resolve {{fn:name("arg", ...)}} template functions over the report context,
     * mirroring the PDF generator's resolveTemplateFunctions().
     */
    private function resolveTemplateFunctions(string $text, WordRenderContext $ctx): string
    {
        $context = $ctx->report->getContext();
        $contextNodes = $this->em->getRepository(Node::class)->findBy(['context' => $context]);
        $invRepo = $this->em->getRepository(NodeInventoryEntry::class);

        return (string) preg_replace_callback('/\{\{fn:(\w+)\(([^)]*)\)\}\}/', function (array $m) use ($contextNodes, $invRepo): string {
            $fn = $m[1];
            preg_match_all('/"([^"]*)"/', $m[2], $am);
            $args = array_map(static fn (string $a): string => html_entity_decode($a, ENT_QUOTES | ENT_HTML5), $am[1] ?? []);

            switch ($fn) {
                case 'countByManufacturer':
                    return (string) count(array_filter($contextNodes, fn (Node $n) => $n->getManufacturer() && strcasecmp((string) $n->getManufacturer()->getName(), $args[0] ?? '') === 0));
                case 'countByModel':
                    return (string) count(array_filter($contextNodes, fn (Node $n) => $n->getModel() && strcasecmp((string) $n->getModel()->getName(), $args[0] ?? '') === 0));
                case 'countByTag':
                    $tagName = $args[0] ?? '';
                    $count = 0;
                    foreach ($contextNodes as $n) {
                        foreach ($this->tagResolver->getTagsForNode($n) as $tag) {
                            if (strcasecmp((string) $tag->getName(), $tagName) === 0) {
                                $count++;
                                break;
                            }
                        }
                    }

                    return (string) $count;
                case 'listWhere':
                case 'countWhere':
                    $category = $args[0] ?? '';
                    $key = $args[1] ?? '';
                    $operator = $args[2] ?? '=';
                    $compare = $args[3] ?? '';
                    $colLabel = $args[4] ?? null;
                    $matched = [];
                    foreach ($contextNodes as $n) {
                        $criteria = ['node' => $n, 'categoryName' => $category, 'entryKey' => $key];
                        if ($colLabel) {
                            $criteria['colLabel'] = $colLabel;
                        }
                        foreach ($invRepo->findBy($criteria) as $entry) {
                            $val = (string) $entry->getValue();
                            $ok = match ($operator) {
                                '=', '==' => $val === $compare,
                                '!=' => $val !== $compare,
                                '<' => version_compare($val, $compare, '<'),
                                '>' => version_compare($val, $compare, '>'),
                                '<=' => version_compare($val, $compare, '<='),
                                '>=' => version_compare($val, $compare, '>='),
                                'contains' => str_contains($val, $compare),
                                default => false,
                            };
                            if ($ok) {
                                $matched[$n->getId()] = $n->getName() ?: $n->getHostname() ?: $n->getIpAddress();
                                break;
                            }
                        }
                    }

                    return $fn === 'countWhere' ? (string) count($matched) : implode(', ', array_values($matched));
                default:
                    return '';
            }
        }, $text);
    }

    /**
     * @return array<string,string>
     */
    private function t(WordRenderContext $ctx): array
    {
        return self::TRANSLATIONS[$ctx->report->getLocale()] ?? self::TRANSLATIONS['en'];
    }

    private const TRANSLATIONS = [
        'fr' => [
            'toc' => 'Table des matières', 'authors_page' => 'Auteurs et diffusion',
            'authors' => 'Auteurs', 'recipients' => 'Diffusion',
            'revisions_page' => 'Historique des versions', 'illustrations_page' => 'Table des illustrations',
            'col_lastname' => 'Nom', 'col_firstname' => 'Prénom', 'col_position' => 'Poste',
            'col_email' => 'Email', 'col_phone' => 'Téléphone',
            'col_version' => 'Version', 'col_date' => 'Date', 'col_description' => 'Description',
        ],
        'en' => [
            'toc' => 'Table of Contents', 'authors_page' => 'Authors and Distribution',
            'authors' => 'Authors', 'recipients' => 'Distribution',
            'revisions_page' => 'Revision History', 'illustrations_page' => 'Table of Illustrations',
            'col_lastname' => 'Last Name', 'col_firstname' => 'First Name', 'col_position' => 'Position',
            'col_email' => 'Email', 'col_phone' => 'Phone',
            'col_version' => 'Version', 'col_date' => 'Date', 'col_description' => 'Description',
        ],
    ];
}
