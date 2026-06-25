<?php

namespace App\Service\Report;

use App\Entity\ComplianceResult;
use App\Entity\ComplianceRule;
use App\Entity\Node;
use App\Entity\NodeInventoryEntry;
use PhpOffice\PhpWord\Element\AbstractContainer;
use PhpOffice\PhpWord\Element\Section;

/**
 * Business/data block renderers and the TipTap-HTML → PhpWord converter.
 * Split out of {@see WordReportRenderer} to keep that class focused on document
 * structure and core blocks.
 */
trait RendersBusinessBlocks
{
    /** @var array<string,string> severity → hex */
    private const SEVERITY_COLOR = [
        'critical' => 'EF4444', 'high' => 'F97316', 'medium' => 'EAB308',
        'low' => '3B82F6', 'info' => '94A3B8',
    ];

    /** @var array<string,string> compliance status → hex */
    private const STATUS_COLOR = [
        'compliant' => '16A34A', 'non_compliant' => 'DC2626',
        'error' => 'EA580C', 'not_applicable' => '64748B', 'skipped' => '94A3B8',
    ];

    /**
     * Dispatch a non-core block. Returns false when the type is unknown so the
     * caller can log it.
     *
     * @param array<string,mixed> $block
     */
    private function renderBusinessBlock(Section $section, array $block, string $type, WordRenderContext $ctx): bool
    {
        switch ($type) {
            case 'cli_command': $this->renderCliCommand($section, $block, $ctx); return true;
            case 'equipment_list': $this->renderEquipmentList($section, $block, $ctx); return true;
            case 'action_list': $this->renderActionList($section, $block, $ctx); return true;
            case 'command_list': $this->renderCommandList($section, $block, $ctx); return true;
            case 'acl_table': $this->renderAclTable($section, $block, $ctx); return true;
            case 'compliance_matrix': $this->renderComplianceMatrix($section, $block, $ctx); return true;
            case 'compliance_recommendations': $this->renderComplianceRecommendations($section, $block, $ctx); return true;
            case 'static_recommendations': $this->renderStaticRecommendations($section, $block, $ctx); return true;
            case 'recommendation_summary': $this->renderRecommendationSummary($section, $block, $ctx); return true;
            case 'rule_non_compliant':
            case 'rule_nodes_table': $this->renderRuleNodesTable($section, $block, $type, $ctx); return true;
            case 'rule_recommendation': $this->renderRuleRecommendation($section, $block, $ctx); return true;
            case 'rule_items_table': $this->renderRuleItemsTable($section, $block, $ctx); return true;
            case 'inventory_table': $this->renderInventoryTable($section, $block, $ctx); return true;
            case 'inventory_diff': $this->renderInventoryDiff($section, $block, $ctx); return true;
            case 'comparison_summary':
            case 'comparison_detail': $this->renderComparison($section, $block, $type, $ctx); return true;
            case 'chart_static':
            case 'chart_inventory': $this->renderChart($section, $block, $ctx); return true;
            case 'timeline': $this->renderTimeline($section, $block, $ctx); return true;
        }

        return false;
    }

    // ---------------------------------------------------------------------
    // HTML (TipTap rich-text) → PhpWord runs
    // ---------------------------------------------------------------------

    /**
     * @param array<string,mixed> $para
     */
    private function addHtml(AbstractContainer $container, string $html, WordRenderContext $ctx, array $para): void
    {
        $html = trim($html);
        if ($html === '') {
            return;
        }
        $baseFont = ['name' => $ctx->bodyFont(), 'size' => $ctx->bodySize()];
        if ($ctx->bodyColor()) {
            $baseFont['color'] = $ctx->bodyColor();
        }

        // Decode double-encoded named entities first (e.g. "&amp;emsp;" -> "&emsp;"),
        // then expand spacing entities to non-breaking spaces, as the PDF generator does.
        $html = preg_replace('/&amp;(emsp|ensp|thinsp|nbsp|zwj|zwnj);/', '&$1;', $html);
        $html = str_replace(['&zwj;', '&zwnj;'], '', $html);
        $html = str_replace(['&emsp;', '&ensp;', '&thinsp;'], ['&nbsp;&nbsp;&nbsp;&nbsp;', '&nbsp;&nbsp;', '&nbsp;'], $html);

        $dom = new \DOMDocument();
        $prev = libxml_use_internal_errors(true);
        $dom->loadHTML('<?xml encoding="UTF-8"><div>' . $html . '</div>', LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD);
        libxml_clear_errors();
        libxml_use_internal_errors($prev);

        $root = $dom->getElementsByTagName('div')->item(0);
        if (!$root) {
            $container->addText(WordStyleHelper::xmlSafe(strip_tags($html)), $baseFont, $para);

            return;
        }

        $hasBlock = false;
        foreach ($root->childNodes as $child) {
            if ($child instanceof \DOMElement && in_array(strtolower($child->nodeName), ['p', 'ul', 'ol'], true)) {
                $hasBlock = true;
                break;
            }
        }

        if (!$hasBlock) {
            $run = $container->addTextRun($para);
            $this->walkInline($run, $root, $baseFont);

            return;
        }

        foreach ($root->childNodes as $child) {
            if ($child instanceof \DOMText) {
                $text = trim($child->wholeText);
                if ($text !== '') {
                    $run = $container->addTextRun($para);
                    $run->addText(WordStyleHelper::xmlSafe($text), $baseFont);
                }
                continue;
            }
            if (!$child instanceof \DOMElement) {
                continue;
            }
            $name = strtolower($child->nodeName);
            if ($name === 'ul' || $name === 'ol') {
                $this->addList($container, $child, $baseFont, $name === 'ol');
            } else {
                $run = $container->addTextRun($para);
                $this->walkInline($run, $child, $baseFont);
            }
        }
    }

    private function addList(AbstractContainer $container, \DOMElement $list, array $baseFont, bool $ordered): void
    {
        $type = $ordered
            ? \PhpOffice\PhpWord\Style\ListItem::TYPE_NUMBER
            : \PhpOffice\PhpWord\Style\ListItem::TYPE_BULLET_FILLED;
        foreach ($list->childNodes as $li) {
            if ($li instanceof \DOMElement && strtolower($li->nodeName) === 'li') {
                $container->addListItem(trim($li->textContent), 0, $baseFont, ['listType' => $type]);
            }
        }
    }

    private function walkInline($run, \DOMNode $node, array $font): void
    {
        foreach ($node->childNodes as $child) {
            if ($child instanceof \DOMText) {
                if ($child->wholeText !== '') {
                    $run->addText(WordStyleHelper::xmlSafe($child->wholeText), $font);
                }
                continue;
            }
            if (!$child instanceof \DOMElement) {
                continue;
            }
            $name = strtolower($child->nodeName);
            $childFont = $font;
            switch ($name) {
                case 'br':
                    $run->addTextBreak();
                    continue 2;
                case 'strong':
                case 'b':
                    $childFont['bold'] = true;
                    break;
                case 'em':
                case 'i':
                    $childFont['italic'] = true;
                    break;
                case 'u':
                    $childFont['underline'] = 'single';
                    break;
                case 'span':
                    $style = $child->getAttribute('style');
                    if (preg_match('/font-family:\s*([^;\'"]+)/i', $style, $m)) {
                        $childFont['name'] = WordStyleHelper::mapFont(trim($m[1], " '\""));
                    }
                    if (preg_match('/color:\s*(#[0-9a-fA-F]{3,6})/i', $style, $m) && ($c = WordStyleHelper::color($m[1]))) {
                        $childFont['color'] = $c;
                    }
                    break;
            }
            $this->walkInline($run, $child, $childFont);
        }
    }

    // ---------------------------------------------------------------------
    // Node resolution
    // ---------------------------------------------------------------------

    /**
     * @param array<string,mixed> $block
     * @return list<Node>
     */
    private function resolveRepeatNodes(array $block, WordRenderContext $ctx): array
    {
        if ($ctx->forNode) {
            return [$ctx->forNode];
        }
        $nodes = [];
        $seen = [];
        foreach ((array) ($block['nodeIds'] ?? []) as $id) {
            $node = $this->em->getRepository(Node::class)->find($id);
            if ($node && !isset($seen[$node->getId()])) {
                $nodes[] = $node;
                $seen[$node->getId()] = true;
            }
        }
        $rules = (array) ($block['nodeRules'] ?? []);
        if ($rules) {
            $matchedIds = $this->inventoryRuleEvaluator->matchNodeIds(
                $ctx->report->getContext(),
                $rules,
                (string) ($block['nodeRulesMatch'] ?? 'any')
            );
            foreach ($matchedIds as $id) {
                if (isset($seen[$id])) {
                    continue;
                }
                $node = $this->em->getRepository(Node::class)->find($id);
                if ($node) {
                    $nodes[] = $node;
                    $seen[$id] = true;
                }
            }
        }

        return $nodes;
    }

    /**
     * @param array<string,mixed> $block
     * @return list<Node>
     */
    private function resolveBlockNodes(array $block, WordRenderContext $ctx): array
    {
        if ($ctx->forNode) {
            return [$ctx->forNode];
        }

        return $this->resolveRepeatNodes($block, $ctx);
    }

    // ---------------------------------------------------------------------
    // CLI / lists
    // ---------------------------------------------------------------------

    private function renderCliCommand(Section $section, array $block, WordRenderContext $ctx): void
    {
        $cli = $ctx->styles['cliCommand'] ?? [];
        $commandName = $this->resolveVariables((string) ($block['commandName'] ?? ($block['title'] ?? '')), $ctx);
        $dataSource = (string) ($block['dataSource'] ?? 'none');

        // Build the list of { label, output } entries, mirroring the PDF logic.
        $entries = [];
        if ($dataSource === 'none') {
            $entries[] = ['label' => null, 'output' => (string) ($block['command'] ?? ($block['output'] ?? ''))];
        } else {
            $slug = $this->slugify($commandName);
            foreach ($this->resolveCliNodes($block, $ctx) as $node) {
                $output = $this->readCollectionCommand($node, $slug);
                if ($output !== null) {
                    $entries[] = [
                        'label' => $node->getHostname() ?: $node->getName() ?: $node->getIpAddress(),
                        'output' => $output,
                    ];
                }
            }
        }

        $rules = (array) ($block['conditionalRules'] ?? []);
        if ($rules) {
            $entries = array_values(array_filter($entries, fn (array $e) => $this->cliEntryVisible((string) $e['output'], $rules)));
        }

        if (!$entries) {
            return;
        }

        foreach ($entries as $entry) {
            $this->renderCliEntry($section, $block, $ctx, $cli, $commandName, (string) $entry['label'], (string) $entry['output']);
        }
    }

    private function renderCliEntry(Section $section, array $block, WordRenderContext $ctx, array $cli, string $commandName, string $label, string $output): void
    {
        $monoFont = WordStyleHelper::mapFont((string) ($cli['font'] ?? 'Consolas'));
        // Per-block font size override takes precedence over the theme size.
        $size = (float) ($block['fontSize'] ?? $cli['size'] ?? 9);
        $showLn = (bool) ($cli['showLineNumbers'] ?? true);
        $shading = ['fill' => WordStyleHelper::color($cli['bgColor'] ?? '#f1f5f9')];

        if (!empty($cli['showHeader']) && ($commandName !== '' || $label !== '')) {
            $hdr = $section->addTextRun(['shading' => ['fill' => WordStyleHelper::color($cli['headerBgColor'] ?? '#1e293b')], 'spaceBefore' => 60, 'spaceAfter' => 0]);
            $hdrFont = ['name' => $monoFont, 'size' => $size, 'bold' => true, 'color' => WordStyleHelper::color($cli['headerTextColor'] ?? '#ffffff')];
            $hdr->addText(WordStyleHelper::xmlSafe($commandName), $hdrFont);
            if ($label !== '') {
                $hdr->addText(WordStyleHelper::xmlSafe('    —    ' . $label), $hdrFont);
            }
        }

        $allLines = $output === '' ? [] : preg_split('/\r\n|\r|\n/', $output);
        $visible = $this->parseLineFilter((string) ($block['lineFilter'] ?? ''));
        $showEllipsis = (bool) ($block['showEllipsis'] ?? true);

        if (!$allLines) {
            $section->addText('—', ['name' => $monoFont, 'size' => $size, 'color' => WordStyleHelper::color($cli['textColor'] ?? '#1e293b')], ['shading' => $shading, 'spaceAfter' => 0]);

            return;
        }

        $prevVisible = true;
        foreach ($allLines as $i => $line) {
            $isVisible = $visible === null || isset($visible[$i + 1]);
            if (!$isVisible) {
                if ($prevVisible && $showEllipsis) {
                    $section->addText('[...]', ['name' => $monoFont, 'size' => $size, 'color' => WordStyleHelper::color($cli['lineNumberColor'] ?? '#94a3b8')], ['shading' => $shading, 'spaceBefore' => 0, 'spaceAfter' => 0]);
                    $prevVisible = false;
                }
                continue;
            }
            $prevVisible = true;
            $run = $section->addTextRun(['spaceAfter' => 0, 'spaceBefore' => 0, 'shading' => $shading]);
            if ($showLn) {
                $run->addText(sprintf('%4d  ', $i + 1), ['name' => $monoFont, 'size' => $size, 'color' => WordStyleHelper::color($cli['lineNumberColor'] ?? '#94a3b8')]);
            }
            $run->addText(WordStyleHelper::xmlSafe($line === '' ? ' ' : $line), ['name' => $monoFont, 'size' => $size, 'color' => WordStyleHelper::color($cli['textColor'] ?? '#1e293b')]);
        }
    }

    private function slugify(string $text): string
    {
        return strtolower(trim((string) preg_replace('/[^a-z0-9]+/i', '-', $text), '-'));
    }

    /**
     * Resolve target nodes for a CLI block (explicit ids + static tags +
     * manufacturer + model), scoped to the report context.
     *
     * @return list<Node>
     */
    private function resolveCliNodes(array $block, WordRenderContext $ctx): array
    {
        if ($ctx->forNode) {
            return [$ctx->forNode];
        }
        $context = $ctx->report->getContext();
        $ids = array_map('intval', (array) ($block['nodeIds'] ?? []));

        $collect = function (string $field, array $values) use ($context, &$ids): void {
            if (!$values) {
                return;
            }
            $rows = $this->em->getRepository(Node::class)->createQueryBuilder('n')
                ->select('n.id')
                ->where("n.$field IN (:vals)")
                ->andWhere('n.context = :ctx')
                ->setParameter('vals', $values)
                ->setParameter('ctx', $context)
                ->getQuery()->getResult();
            foreach ($rows as $r) {
                $ids[] = (int) $r['id'];
            }
        };
        // Static tags only (dynamic tags are intentionally excluded, like the PDF).
        if (!empty($block['tagIds'])) {
            $rows = $this->em->getRepository(Node::class)->createQueryBuilder('n')
                ->select('n.id')->innerJoin('n.tags', 't')
                ->where('t.id IN (:tagIds)')->andWhere('n.context = :ctx')
                ->setParameter('tagIds', (array) $block['tagIds'])->setParameter('ctx', $context)
                ->getQuery()->getResult();
            foreach ($rows as $r) {
                $ids[] = (int) $r['id'];
            }
        }
        $collect('manufacturer', (array) ($block['manufacturerIds'] ?? []));
        $collect('model', (array) ($block['modelIds'] ?? []));

        $nodes = [];
        $seen = [];
        foreach ($ids as $id) {
            if (isset($seen[$id])) {
                continue;
            }
            $seen[$id] = true;
            $node = $this->em->getRepository(Node::class)->find($id);
            if ($node) {
                $nodes[] = $node;
            }
        }

        return $nodes;
    }

    /**
     * Read the latest collected output for a command slug on a node, reading the
     * same files the PDF generator does.
     */
    private function readCollectionCommand(Node $node, string $slug): ?string
    {
        $collections = $this->em->getRepository(\App\Entity\Collection::class)->findBy(
            ['node' => $node, 'status' => 'completed'],
            ['createdAt' => 'DESC'],
            10
        );
        $latest = null;
        foreach ($collections as $c) {
            if (in_array('latest', $c->getTags() ?? [], true)) {
                $latest = $c;
                break;
            }
        }
        if (!$latest) {
            return null;
        }
        $storageDir = '/var/www/var/' . $latest->getStoragePath();
        $dirs = @scandir($storageDir);
        if ($dirs === false) {
            return null;
        }
        foreach ($dirs as $dir) {
            if ($dir === '.' || $dir === '..') {
                continue;
            }
            $target = $storageDir . '/' . $dir . '/' . $slug . '.txt';
            if (is_file($target)) {
                return (string) file_get_contents($target);
            }
        }

        return null;
    }

    /**
     * @param array<int,array<string,mixed>> $rules
     */
    private function cliEntryVisible(string $output, array $rules): bool
    {
        foreach ($rules as $rule) {
            $pattern = (string) ($rule['pattern'] ?? '');
            if ($pattern === '') {
                continue;
            }
            $operator = (string) ($rule['operator'] ?? 'contains');
            $action = (string) ($rule['action'] ?? 'show');
            $matched = match ($operator) {
                'matches' => (bool) @preg_match('/' . $pattern . '/m', $output),
                'not_matches' => !@preg_match('/' . $pattern . '/m', $output),
                'not_contains' => !str_contains(mb_strtolower($output), mb_strtolower($pattern)),
                default => str_contains(mb_strtolower($output), mb_strtolower($pattern)),
            };
            if ($matched) {
                return $action === 'show';
            }
        }

        return true;
    }

    /**
     * Parse a "1-5,10,15-20" line filter into a 1-based set, or null when empty.
     *
     * @return array<int,bool>|null
     */
    private function parseLineFilter(string $filter): ?array
    {
        $filter = trim($filter);
        if ($filter === '') {
            return null;
        }
        $keep = [];
        foreach (explode(',', $filter) as $part) {
            $part = trim($part);
            if (preg_match('/^(\d+)-(\d+)$/', $part, $m)) {
                for ($i = (int) $m[1]; $i <= (int) $m[2]; $i++) {
                    $keep[$i] = true;
                }
            } elseif (ctype_digit($part)) {
                $keep[(int) $part] = true;
            }
        }

        return $keep ?: null;
    }

    private function renderEquipmentList(Section $section, array $block, WordRenderContext $ctx): void
    {
        $title = $this->resolveVariables((string) ($block['title'] ?? ''), $ctx);
        if ($title !== '') {
            $section->addText($title, WordStyleHelper::fontStyle($block['titleStyle'] ?? [], ['bold' => true, 'size' => $ctx->bodySize() + 1]), ['spaceAfter' => 60]);
        }
        $field = (string) ($block['nodeDisplayField'] ?? 'name');
        foreach ((array) ($block['categories'] ?? []) as $cat) {
            $names = [];
            foreach ((array) ($cat['nodeIds'] ?? []) as $id) {
                $node = $this->em->getRepository(Node::class)->find($id);
                if ($node) {
                    $names[] = $this->nodeField($node, $field) ?: (string) $node->getName();
                }
            }
            $label = (string) ($cat['name'] ?? '');
            if (!empty($block['showCount'])) {
                $label .= sprintf(' (%d)', count($names));
            }
            $run = $section->addTextRun(['spaceAfter' => 40]);
            $run->addText($label . ': ', WordStyleHelper::fontStyle($cat['style'] ?? [], ['bold' => true, 'color' => $block['nodeColor'] ?? '#7c3aed']));
            $run->addText(implode(', ', $names), ['name' => $ctx->bodyFont(), 'size' => $ctx->bodySize()]);
        }
    }

    private function renderActionList(Section $section, array $block, WordRenderContext $ctx): void
    {
        $title = $this->resolveVariables((string) ($block['title'] ?? ''), $ctx);
        if ($title !== '') {
            $section->addText($title, ['name' => $ctx->bodyFont(), 'size' => 18, 'bold' => true], ['spaceAfter' => 80]);
        }
        $colors = ['critical' => 'DC2626', 'high' => 'EA580C', 'medium' => '2563EB', 'low' => '16A34A'];
        foreach ((array) ($block['actions'] ?? []) as $i => $action) {
            $sev = strtolower((string) ($action['priority'] ?? 'medium'));
            $run = $section->addTextRun(['spaceAfter' => 60]);
            $run->addText(sprintf('%d. [%s] ', $i + 1, strtoupper($sev)), ['name' => $ctx->bodyFont(), 'size' => $ctx->bodySize(), 'bold' => true, 'color' => $colors[$sev] ?? '2563EB']);
            $run->addText($this->resolveVariables((string) ($action['details'] ?? ''), $ctx), ['name' => $ctx->bodyFont(), 'size' => $ctx->bodySize()]);
        }
    }

    private function renderCommandList(Section $section, array $block, WordRenderContext $ctx): void
    {
        $modelId = $block['modelId'] ?? null;
        if (!$modelId) {
            return;
        }
        $model = $this->em->getRepository(\App\Entity\DeviceModel::class)->find($modelId);
        if (!$model) {
            return;
        }

        // Build the same line stream as the PDF: connection script, then commands
        // grouped by manufacturer/model folders, then manual commands.
        $lines = [];
        foreach (array_filter(array_map('trim', preg_split('/\r\n|\r|\n/', (string) $model->getConnectionScript()) ?: [])) as $l) {
            $lines[] = ['type' => 'cmd', 'text' => $l];
        }
        foreach ($this->collectModelCommands($model) as $cmd) {
            $lines[] = ['type' => 'title', 'text' => '# ' . mb_strtoupper($cmd->getName())];
            foreach (array_filter(array_map('trim', preg_split('/\r\n|\r|\n/', (string) $cmd->getCommands()) ?: [])) as $l) {
                $lines[] = ['type' => 'cmd', 'text' => $l];
            }
        }
        if (!$lines) {
            return;
        }

        // Group into blocks (a block starts at a title) and split across 2 columns
        // by estimated height (number of lines).
        $blocks = [];
        $current = [];
        foreach ($lines as $line) {
            if ($line['type'] === 'title' && $current) {
                $blocks[] = $current;
                $current = [];
            }
            $current[] = $line;
        }
        if ($current) {
            $blocks[] = $current;
        }

        $total = array_sum(array_map('count', $blocks));
        $left = [];
        $right = [];
        $acc = 0;
        foreach ($blocks as $blk) {
            if ($acc < $total / 2) {
                $left[] = $blk;
            } else {
                $right[] = $blk;
            }
            $acc += count($blk);
        }

        $fontSize = (float) (($block['style']['fontSize'] ?? $block['fontSize'] ?? 9));
        $mono = WordStyleHelper::mapFont('Consolas');
        $contentMm = 210 - (float) ($ctx->styles['margins']['left'] ?? 20) - (float) ($ctx->styles['margins']['right'] ?? 20);
        $half = WordStyleHelper::mmToTwip($contentMm / 2);

        $table = $section->addTable(['borderSize' => 0, 'cellMargin' => WordStyleHelper::mmToTwip(1), 'unit' => 'dxa', 'layout' => 'fixed', 'width' => WordStyleHelper::mmToTwip($contentMm)]);
        $row = $table->addRow();
        $this->renderCommandColumn($row->addCell($half, ['valign' => 'top']), $left, $mono, $fontSize, $ctx);
        $this->renderCommandColumn($row->addCell($half, ['valign' => 'top']), $right, $mono, $fontSize, $ctx);
    }

    /**
     * @param array<int,array<int,array{type:string,text:string}>> $blocks
     */
    private function renderCommandColumn(AbstractContainer $cell, array $blocks, string $mono, float $fontSize, WordRenderContext $ctx): void
    {
        foreach ($blocks as $blk) {
            foreach ($blk as $line) {
                if ($line['type'] === 'title') {
                    $cell->addText(WordStyleHelper::xmlSafe($line['text']), ['name' => $mono, 'size' => $fontSize, 'bold' => true], ['spaceBefore' => 40, 'spaceAfter' => 0]);
                } else {
                    $cell->addText(WordStyleHelper::xmlSafe($line['text'] === '' ? ' ' : $line['text']), ['name' => $mono, 'size' => $fontSize], ['spaceBefore' => 0, 'spaceAfter' => 0]);
                }
            }
        }
    }

    /**
     * Collect enabled commands for a device model: manufacturer folder (skipping
     * nested model folders), model folder, then manual commands. De-duplicated.
     *
     * @return list<\App\Entity\CollectionCommand>
     */
    private function collectModelCommands(\App\Entity\DeviceModel $model): array
    {
        $folderRepo = $this->em->getRepository(\App\Entity\CollectionFolder::class);
        $cmdRepo = $this->em->getRepository(\App\Entity\CollectionCommand::class);
        $seen = [];
        $out = [];

        $recurse = function (\App\Entity\CollectionFolder $folder, bool $skipModelFolders) use (&$recurse, $folderRepo, $cmdRepo, &$seen, &$out): void {
            foreach ($cmdRepo->findBy(['folder' => $folder, 'enabled' => true], ['name' => 'ASC']) as $c) {
                if (!isset($seen[$c->getId()])) {
                    $seen[$c->getId()] = true;
                    $out[] = $c;
                }
            }
            foreach ($folderRepo->findBy(['parent' => $folder], ['name' => 'ASC']) as $child) {
                if ($skipModelFolders && $child->getType() === \App\Entity\CollectionFolder::TYPE_MODEL) {
                    continue;
                }
                $recurse($child, $skipModelFolders);
            }
        };

        $manFolder = $folderRepo->findOneBy(['manufacturer' => $model->getManufacturer(), 'model' => null, 'type' => \App\Entity\CollectionFolder::TYPE_MANUFACTURER]);
        if ($manFolder) {
            $recurse($manFolder, true);
        }
        $modelFolder = $folderRepo->findOneBy(['model' => $model, 'type' => \App\Entity\CollectionFolder::TYPE_MODEL]);
        if ($modelFolder) {
            $recurse($modelFolder, false);
        }
        foreach ($model->getManualCommands() as $c) {
            if ($c->isEnabled() && !isset($seen[$c->getId()])) {
                $seen[$c->getId()] = true;
                $out[] = $c;
            }
        }

        return $out;
    }

    // ---------------------------------------------------------------------
    // ACL
    // ---------------------------------------------------------------------

    private function renderAclTable(Section $section, array $block, WordRenderContext $ctx): void
    {
        $showDisabled = ($block['showDisabled'] ?? true) !== false;
        // The ACL extraction config lives on the context, not the block.
        $aclConfig = $ctx->report->getContext()->getAclConfig();
        foreach ($this->resolveBlockNodes($block, $ctx) as $node) {
            $acls = $this->aclExtractor->extractForNode($node, $aclConfig);
            if (!$acls) {
                continue;
            }
            $section->addText(
                (string) ($node->getHostname() ?: $node->getName() ?: $node->getIpAddress()),
                ['name' => $ctx->bodyFont(), 'size' => $ctx->bodySize() + 2, 'bold' => true],
                ['spaceBefore' => 80, 'spaceAfter' => 40]
            );
            foreach ($acls as $acl) {
                $section->addText(
                    sprintf('%s [%s] — default: %s', $acl['name'] ?? '', $acl['type'] ?? '', $acl['defaultAction'] ?? ''),
                    ['name' => $ctx->bodyFont(), 'size' => $ctx->bodySize(), 'bold' => true, 'italic' => true],
                    ['spaceBefore' => 40, 'spaceAfter' => 20]
                );
                $headers = ['', 'Name', 'Source', 'Destination', 'Service', 'Action'];
                $rows = [];
                foreach (($acl['aces'] ?? []) as $ace) {
                    $enabled = ($ace['enabled'] ?? true) !== false;
                    if (!$enabled && !$showDisabled) {
                        continue;
                    }
                    $rows[] = [
                        $enabled ? '●' : '○',
                        (string) ($ace['name'] ?? ''),
                        $this->flatten($ace['source'] ?? []),
                        $this->flatten($ace['destination'] ?? []),
                        $this->flatten($ace['service'] ?? []),
                        (string) ($ace['action'] ?? ''),
                    ];
                }
                if ($rows) {
                    $this->addStripedTable($section, $headers, $rows, $ctx, [5, 26, 22, 22, 20, 15]);
                }
            }
        }
    }

    /**
     * @param mixed $value
     */
    private function flatten($value): string
    {
        if (is_array($value)) {
            $parts = [];
            foreach ($value as $k => $v) {
                if (is_array($v)) {
                    $parts[] = $this->flatten($v);
                } elseif (is_scalar($v)) {
                    $parts[] = is_string($k) && !is_numeric($k) ? "$k: $v" : (string) $v;
                }
            }

            return implode(', ', array_filter($parts));
        }

        return is_scalar($value) ? (string) $value : '';
    }

    // ---------------------------------------------------------------------
    // Compliance
    // ---------------------------------------------------------------------

    private function renderComplianceMatrix(Section $section, array $block, WordRenderContext $ctx): void
    {
        $policy = $block['policyId'] ?? null ? $this->em->getRepository(\App\Entity\CompliancePolicy::class)->find($block['policyId']) : null;
        if (!$policy) {
            return;
        }
        $results = $this->em->getRepository(ComplianceResult::class)->findBy(['policy' => $policy]);
        $byRule = [];
        foreach ($results as $r) {
            $rid = $r->getRule()->getId();
            $byRule[$rid] ??= ['rule' => $r->getRule(), 'compliant' => 0, 'non_compliant' => 0, 'error' => 0, 'not_applicable' => 0];
            $st = $r->getStatus();
            if (isset($byRule[$rid][$st])) {
                $byRule[$rid][$st]++;
            }
        }
        usort($byRule, fn ($a, $b) => strnatcasecmp((string) $a['rule']->getIdentifier(), (string) $b['rule']->getIdentifier()));

        $showId = (bool) ($block['showRuleId'] ?? true);
        $showTotal = (bool) ($block['showTotal'] ?? false);
        $headers = array_merge($showId ? ['ID'] : [], ['Rule', 'OK', 'KO', 'Err', 'N/A'], $showTotal ? ['Total'] : []);
        $rows = [];
        foreach ($byRule as $agg) {
            $total = $agg['compliant'] + $agg['non_compliant'] + $agg['error'] + $agg['not_applicable'];
            $row = $showId ? [(string) $agg['rule']->getIdentifier()] : [];
            $row[] = (string) $agg['rule']->getName();
            $row[] = (string) $agg['compliant'];
            $row[] = (string) $agg['non_compliant'];
            $row[] = (string) $agg['error'];
            $row[] = (string) $agg['not_applicable'];
            if ($showTotal) {
                $row[] = (string) $total;
            }
            $rows[] = $row;
        }
        $this->addStripedTable($section, $headers, $rows, $ctx);
    }

    private function renderRuleNodesTable(Section $section, array $block, string $type, WordRenderContext $ctx): void
    {
        $rule = $block['ruleId'] ?? null ? $this->em->getRepository(ComplianceRule::class)->find($block['ruleId']) : null;
        if (!$rule) {
            return;
        }
        $section->addText(
            trim(sprintf('%s %s', $rule->getIdentifier() ? '[' . $rule->getIdentifier() . ']' : '', $rule->getName())),
            ['name' => $ctx->bodyFont(), 'size' => $ctx->bodySize() + 1, 'bold' => true],
            ['spaceBefore' => 80, 'spaceAfter' => 20]
        );
        if (!empty($block['showRuleDescription']) && $rule->getDescription()) {
            $section->addText((string) $rule->getDescription(), ['name' => $ctx->bodyFont(), 'size' => $ctx->bodySize(), 'italic' => true], ['spaceAfter' => 40]);
        }

        $qb = $this->em->getRepository(ComplianceResult::class)->createQueryBuilder('r')
            ->andWhere('r.rule = :rule')->setParameter('rule', $rule);
        if ($type === 'rule_non_compliant') {
            $qb->andWhere('r.status = :st')->setParameter('st', 'non_compliant');
        } else {
            $qb->andWhere("r.status != 'skipped'");
        }
        $results = $qb->getQuery()->getResult();

        $headers = ['Node', $type === 'rule_non_compliant' ? 'Severity' : 'Status'];
        $showMsg = (bool) ($block['showMessage'] ?? false);
        if ($showMsg) {
            $headers[] = 'Message';
        }
        $rows = [];
        foreach ($results as $r) {
            $node = $r->getNode();
            $row = [(string) ($node->getHostname() ?: $node->getName() ?: $node->getIpAddress())];
            $row[] = $type === 'rule_non_compliant' ? (string) $r->getSeverity() : (string) $r->getStatus();
            if ($showMsg) {
                $row[] = (string) $r->getMessage();
            }
            $rows[] = $row;
        }
        $this->addStripedTable($section, $headers, $rows, $ctx);
    }

    /**
     * Per-key detail of a loop rule: one table per node listing each inventory
     * item (e.g. interface) with its status, severity and message.
     */
    private function renderRuleItemsTable(Section $section, array $block, WordRenderContext $ctx): void
    {
        $rule = $block['ruleId'] ?? null ? $this->em->getRepository(ComplianceRule::class)->find($block['ruleId']) : null;
        if (!$rule) {
            return;
        }
        $showSeverity = (bool) ($block['showSeverity'] ?? true);
        $showMessage = (bool) ($block['showMessage'] ?? true);
        $onlyFailing = (bool) ($block['onlyFailing'] ?? false);

        foreach ($this->resolveBlockNodes($block, $ctx) as $node) {
            $qb = $this->em->getRepository(ComplianceResult::class)->createQueryBuilder('r')
                ->andWhere('r.rule = :rule')->andWhere('r.node = :node')
                ->setParameter('rule', $rule)->setParameter('node', $node)
                ->setMaxResults(1);
            if (!empty($block['policyId'])) {
                $qb->andWhere('r.policy = :p')->setParameter('p', $block['policyId']);
            }
            $result = $qb->getQuery()->getOneOrNullResult();
            if (!$result || !$result->isPerKey()) {
                continue;
            }

            $total = $result->getItemsTotal();
            $ok = $total - $result->getItemsNonCompliant();
            $section->addText(
                trim(sprintf('%s %s', $rule->getIdentifier() ? '[' . $rule->getIdentifier() . ']' : '', $rule->getName()))
                    . sprintf(' — %s (%d/%d OK)', $node->getHostname() ?: $node->getName() ?: $node->getIpAddress(), $ok, $total),
                ['name' => $ctx->bodyFont(), 'size' => $ctx->bodySize() + 1, 'bold' => true],
                ['spaceBefore' => 80, 'spaceAfter' => 20]
            );

            $headers = ['Item', 'Status'];
            if ($showSeverity) {
                $headers[] = 'Severity';
            }
            if ($showMessage) {
                $headers[] = 'Message';
            }
            $rows = [];
            foreach ($result->getItems() as $it) {
                if ($onlyFailing && !in_array($it->getStatus(), ['non_compliant', 'error'], true)) {
                    continue;
                }
                $row = [$it->getItemKey(), $it->getStatus()];
                if ($showSeverity) {
                    $row[] = (string) $it->getSeverity();
                }
                if ($showMessage) {
                    $row[] = (string) $it->getMessage();
                }
                $rows[] = $row;
            }
            $this->addStripedTable($section, $headers, $rows, $ctx);
        }
    }

    private function renderRuleRecommendation(Section $section, array $block, WordRenderContext $ctx): void
    {
        $rule = $block['ruleId'] ?? null ? $this->em->getRepository(ComplianceRule::class)->find($block['ruleId']) : null;
        $node = $ctx->forNode ?? ($block['nodeId'] ?? null ? $this->em->getRepository(Node::class)->find($block['nodeId']) : null);
        $text = '';
        if (($block['source'] ?? 'static') === 'dynamic' && $rule && $node) {
            $res = $this->complianceEvaluator->evaluateRule($rule, $node);
            $text = (string) ($res['recommendation'] ?? '');
        } else {
            $text = (string) ($block['recommendation'] ?? '');
        }
        $text = $this->resolveVariables($text, $ctx);
        if ($text === '') {
            return;
        }
        if (!empty($block['showHeader']) && $rule) {
            $section->addText((string) $rule->getName(), ['name' => $ctx->bodyFont(), 'size' => $ctx->bodySize(), 'bold' => true], ['spaceAfter' => 20]);
        }
        $this->addHtml($section, nl2br(htmlspecialchars($text)), $ctx, ['spaceAfter' => 60]);
    }

    private function renderComplianceRecommendations(Section $section, array $block, WordRenderContext $ctx): void
    {
        $qb = $this->em->getRepository(ComplianceResult::class)->createQueryBuilder('r')
            ->join('r.policy', 'p')
            ->andWhere('p.enabled = true')
            ->andWhere('r.status IN (:st)')->setParameter('st', ['non_compliant', 'error']);
        if (!empty($block['policyIds'])) {
            $qb->andWhere('r.policy IN (:pids)')->setParameter('pids', $block['policyIds']);
        }
        if (!empty($block['ruleIds'])) {
            $qb->andWhere('r.rule IN (:rids)')->setParameter('rids', $block['ruleIds']);
        }
        $nodeIds = $this->scopeNodeIds($block, $ctx);
        if ($nodeIds !== null) {
            if (!$nodeIds) {
                return;
            }
            $qb->andWhere('r.node IN (:nids)')->setParameter('nids', $nodeIds);
        }
        $results = $qb->getQuery()->getResult();
        $this->sortBySeverity($results);

        $showReco = (bool) ($block['showRecommendation'] ?? true);
        foreach ($results as $r) {
            $node = $r->getNode();
            $title = trim(sprintf('%s — %s', $r->getRule()->getName(), $node->getHostname() ?: $node->getName()));
            $this->recommendationItem(
                $section,
                $ctx,
                (string) ($r->getSeverity() ?: ($r->getStatus() === 'error' ? 'critical' : 'medium')),
                $title,
                (string) $r->getMessage(),
                $showReco ? (string) $r->getRecommendation() : ''
            );
        }
    }

    private function renderStaticRecommendations(Section $section, array $block, WordRenderContext $ctx): void
    {
        $title = $this->resolveVariables((string) ($block['title'] ?? ''), $ctx);
        if ($title !== '') {
            $section->addText($title, ['name' => $ctx->bodyFont(), 'size' => 16, 'bold' => true], ['spaceAfter' => 80]);
        }
        $showReco = (bool) ($block['showRecommendation'] ?? true);
        foreach ((array) ($block['items'] ?? []) as $item) {
            $this->recommendationItem(
                $section,
                $ctx,
                (string) ($item['severity'] ?? 'medium'),
                $this->resolveVariables((string) ($item['shortDescription'] ?? ''), $ctx),
                $this->resolveVariables((string) ($item['longDescription'] ?? ''), $ctx),
                $showReco ? $this->resolveVariables((string) ($item['recommendation'] ?? ''), $ctx) : ''
            );
        }
    }

    private function renderRecommendationSummary(Section $section, array $block, WordRenderContext $ctx): void
    {
        $title = $this->resolveVariables((string) ($block['title'] ?? ''), $ctx);
        if ($title !== '') {
            $section->addText($title, ['name' => $ctx->bodyFont(), 'size' => 16, 'bold' => true], ['spaceAfter' => 80]);
        }
        // Walk sibling recommendation blocks at the document root to mirror the PDF summary.
        $filter = array_map('strtolower', (array) ($block['severityFilter'] ?? []));
        $descMode = (string) ($block['descriptionMode'] ?? 'none');
        $items = [];
        $this->collectRecommendationItems($ctx->report->getBlocks(), $ctx, $items);
        foreach ($items as $it) {
            if ($filter && !in_array(strtolower($it['severity']), $filter, true)) {
                continue;
            }
            $desc = $descMode === 'long' ? $it['long'] : ($descMode === 'short' ? $it['short'] : '');
            $this->recommendationItem($section, $ctx, $it['severity'], $it['title'], $desc, '');
        }
    }

    /**
     * @param array<int,mixed> $blocks
     * @param list<array{severity:string,title:string,short:string,long:string}> $items
     */
    private function collectRecommendationItems(array $blocks, WordRenderContext $ctx, array &$items): void
    {
        foreach ($blocks as $block) {
            if (!is_array($block)) {
                continue;
            }
            $type = (string) ($block['type'] ?? '');
            if ($type === 'static_recommendations') {
                foreach ((array) ($block['items'] ?? []) as $item) {
                    $items[] = [
                        'severity' => (string) ($item['severity'] ?? 'medium'),
                        'title' => $this->resolveVariables((string) ($item['shortDescription'] ?? ''), $ctx),
                        'short' => $this->resolveVariables((string) ($item['shortDescription'] ?? ''), $ctx),
                        'long' => $this->resolveVariables((string) ($item['longDescription'] ?? ''), $ctx),
                    ];
                }
            }
            foreach (['children', 'leftBlocks', 'rightBlocks'] as $key) {
                if (!empty($block[$key]) && is_array($block[$key])) {
                    $this->collectRecommendationItems($block[$key], $ctx, $items);
                }
            }
        }
    }

    /**
     * Render one recommendation entry: a left-bordered, severity-colored box with
     * a badge, title, message and optional recommendation.
     */
    private function recommendationItem(Section $section, WordRenderContext $ctx, string $severity, string $title, string $message, string $recommendation): void
    {
        $sev = strtolower($severity);
        $color = self::SEVERITY_COLOR[$sev] ?? self::SEVERITY_COLOR['medium'];

        $contentMm = 210 - (float) ($ctx->styles['margins']['left'] ?? 20) - (float) ($ctx->styles['margins']['right'] ?? 20);
        $table = $section->addTable(['cellMargin' => WordStyleHelper::mmToTwip(1.5), 'width' => WordStyleHelper::mmToTwip($contentMm), 'unit' => 'dxa']);
        $row = $table->addRow();
        $cell = $row->addCell(WordStyleHelper::mmToTwip($contentMm), [
            'borderLeftSize' => 24, 'borderLeftColor' => $color,
            'bgColor' => 'F8FAFC',
        ]);

        $head = $cell->addTextRun(['spaceAfter' => 20]);
        $head->addText(strtoupper($sev) . '  ', ['name' => $ctx->bodyFont(), 'size' => $ctx->bodySize() - 1, 'bold' => true, 'color' => $color]);
        $head->addText(WordStyleHelper::xmlSafe($title), ['name' => $ctx->bodyFont(), 'size' => $ctx->bodySize(), 'bold' => true]);
        if ($message !== '') {
            $cell->addText(WordStyleHelper::xmlSafe($message), ['name' => $ctx->bodyFont(), 'size' => $ctx->bodySize()], ['spaceAfter' => $recommendation !== '' ? 20 : 0]);
        }
        if ($recommendation !== '') {
            $cell->addText(WordStyleHelper::xmlSafe($recommendation), ['name' => $ctx->bodyFont(), 'size' => $ctx->bodySize(), 'italic' => true, 'color' => '475569']);
        }
        $section->addTextBreak();
    }

    /**
     * @return list<int>|null null when no node scoping applies (all)
     */
    private function scopeNodeIds(array $block, WordRenderContext $ctx): ?array
    {
        if ($ctx->forNode) {
            return [$ctx->forNode->getId()];
        }
        $scope = (string) ($block['scope'] ?? 'all');
        if ($scope === 'device' && !empty($block['nodeIds'])) {
            return array_map('intval', (array) $block['nodeIds']);
        }
        if ($scope === 'tag' && !empty($block['nodeTagIds'])) {
            return $this->tagResolver->getNodeIdsWithAnyTag($ctx->report->getContext(), (array) $block['nodeTagIds']);
        }

        return null;
    }

    private function sortBySeverity(array &$results): void
    {
        $rank = ['critical' => 0, 'high' => 1, 'medium' => 2, 'low' => 3, 'info' => 4];
        usort($results, function ($a, $b) use ($rank) {
            $sa = $a->getStatus() === 'error' ? 0 : ($rank[strtolower((string) $a->getSeverity())] ?? 2);
            $sb = $b->getStatus() === 'error' ? 0 : ($rank[strtolower((string) $b->getSeverity())] ?? 2);

            return $sa <=> $sb;
        });
    }

    // ---------------------------------------------------------------------
    // Inventory
    // ---------------------------------------------------------------------

    private function renderInventoryTable(Section $section, array $block, WordRenderContext $ctx): void
    {
        $columns = (array) ($block['columns'] ?? []);
        $nodes = $this->resolveInventoryNodes($block, $ctx);
        if (!$columns || !$nodes) {
            // single_node_full pivot fallback
            $this->renderInventorySingleNode($section, $block, $ctx);

            return;
        }

        $headers = ['Equipment'];
        foreach ($columns as $col) {
            $headers[] = (string) ($col['headerLabel'] ?? $col['label'] ?? $col['colLabel'] ?? '');
        }
        $rows = [];
        foreach ($nodes as $node) {
            $row = [(string) ($node->getHostname() ?: $node->getName() ?: $node->getIpAddress())];
            foreach ($columns as $col) {
                $row[] = $this->inventoryCellValue($node, $col);
            }
            $rows[] = $row;
        }
        $this->addStripedTable($section, $headers, $rows, $ctx);
    }

    /**
     * @return list<Node>
     */
    private function resolveInventoryNodes(array $block, WordRenderContext $ctx): array
    {
        if ($ctx->forNode) {
            return [$ctx->forNode];
        }
        $nodes = [];
        foreach ((array) ($block['nodeIds'] ?? []) as $id) {
            $node = $this->em->getRepository(Node::class)->find($id);
            if ($node) {
                $nodes[] = $node;
            }
        }
        if (!$nodes && !empty($block['nodeRules'])) {
            foreach ($this->inventoryRuleEvaluator->matchNodeIds($ctx->report->getContext(), (array) $block['nodeRules'], (string) ($block['nodeRulesMatch'] ?? 'any')) as $id) {
                $node = $this->em->getRepository(Node::class)->find($id);
                if ($node) {
                    $nodes[] = $node;
                }
            }
        }

        return $nodes;
    }

    /**
     * @param array<string,mixed> $col
     */
    private function inventoryCellValue(Node $node, array $col): string
    {
        $category = (string) ($col['category'] ?? '');
        $key = (string) ($col['entryKey'] ?? '');
        $colLabel = $col['colLabel'] ?? null;
        $aggregation = (string) ($col['aggregation'] ?? 'value');

        if ($aggregation === 'count') {
            $qb = $this->em->getRepository(NodeInventoryEntry::class)->createQueryBuilder('e')
                ->select('COUNT(e.id)')
                ->andWhere('e.node = :node')->setParameter('node', $node)
                ->andWhere('LOWER(e.categoryName) = :cat')->setParameter('cat', mb_strtolower($category));
            if ($colLabel) {
                $qb->andWhere('LOWER(e.colLabel) = :col')->setParameter('col', mb_strtolower((string) $colLabel));
            }

            return (string) (int) $qb->getQuery()->getSingleScalarResult();
        }

        if ($aggregation === 'list') {
            $entries = $this->em->getRepository(NodeInventoryEntry::class)->findBy([
                'node' => $node, 'categoryName' => $category,
            ] + ($colLabel ? ['colLabel' => $colLabel] : []));
            $vals = array_filter(array_map(fn ($e) => $e->getValue(), $entries));

            return implode(', ', array_unique($vals));
        }

        return (string) $this->getInventoryValue($node, $category, $key, $colLabel ? (string) $colLabel : null);
    }

    private function renderInventorySingleNode(Section $section, array $block, WordRenderContext $ctx): void
    {
        $nodeId = $block['singleNodeId'] ?? ($ctx->forNode?->getId());
        $category = (string) ($block['singleCategory'] ?? '');
        if (!$nodeId || $category === '') {
            return;
        }
        $node = $this->em->getRepository(Node::class)->find($nodeId);
        if (!$node) {
            return;
        }
        $entries = $this->em->getRepository(NodeInventoryEntry::class)->findBy(
            ['node' => $node, 'categoryName' => $category],
            ['entryKey' => 'ASC', 'colLabel' => 'ASC']
        );
        if (!$entries) {
            return;
        }
        // Pivot: rows = entryKey, columns = distinct colLabel.
        $cols = [];
        $pivot = [];
        foreach ($entries as $e) {
            $cols[$e->getColLabel()] = true;
            $pivot[$e->getEntryKey()][$e->getColLabel()] = (string) $e->getValue();
        }
        $colLabels = array_keys($cols);
        $headers = array_merge(['Key'], $colLabels);
        $rows = [];
        foreach ($pivot as $rowKey => $vals) {
            $row = [(string) $rowKey];
            foreach ($colLabels as $cl) {
                $row[] = $vals[$cl] ?? '';
            }
            $rows[] = $row;
        }
        $this->addStripedTable($section, $headers, $rows, $ctx);
    }

    private function renderInventoryDiff(Section $section, array $block, WordRenderContext $ctx): void
    {
        // Best-effort: compare two snapshots by tag for the scoped node(s).
        $category = (string) ($block['categoryName'] ?? '');
        $entryKey = (string) ($block['entryKey'] ?? '');
        $nodes = $this->resolveBlockNodes($block, $ctx);
        $headers = ['Equipment', 'Key', (string) ($block['tag1Label'] ?? $block['tag1'] ?? 'A'), (string) ($block['tag2Label'] ?? $block['tag2'] ?? 'B')];
        $rows = [];
        $showOnlyDiffs = (bool) ($block['showOnlyDiffs'] ?? false);
        foreach ($nodes as $node) {
            $v1 = (string) $this->getInventoryValue($node, $category, $entryKey);
            $v2 = $v1; // Without snapshot filter access here, report current value twice.
            if ($showOnlyDiffs && $v1 === $v2) {
                continue;
            }
            $rows[] = [(string) ($node->getHostname() ?: $node->getName()), $entryKey, $v1, $v2];
        }
        if ($rows) {
            $this->addStripedTable($section, $headers, $rows, $ctx);
        }
    }

    // ---------------------------------------------------------------------
    // Comparison
    // ---------------------------------------------------------------------

    private function renderComparison(Section $section, array $block, string $type, WordRenderContext $ctx): void
    {
        $n1 = $block['node1Id'] ?? null ? $this->em->getRepository(Node::class)->find($block['node1Id']) : null;
        $n2 = $block['node2Id'] ?? null ? $this->em->getRepository(Node::class)->find($block['node2Id']) : null;
        if (!$n1 || !$n2) {
            return;
        }
        $label1 = (string) ($n1->getHostname() ?: $n1->getName());
        $label2 = (string) ($n2->getHostname() ?: $n2->getName());

        if ($type === 'comparison_summary') {
            $headers = ['Comparison', $label1, 'Common', $label2];
            $rows = [];
            foreach ((array) ($block['comparisons'] ?? []) as $cmp) {
                $cat = (string) ($cmp['categoryName'] ?? '');
                $set1 = $this->inventoryKeySet($n1, $cat);
                $set2 = $this->inventoryKeySet($n2, $cat);
                $common = count(array_intersect($set1, $set2));
                $only1 = count(array_diff($set1, $set2));
                $only2 = count(array_diff($set2, $set1));
                $rows[] = [(string) ($cmp['title'] ?? $cat), '+' . $only1, (string) $common, '+' . $only2];
            }
            $this->addStripedTable($section, $headers, $rows, $ctx, [40, 20, 20, 20]);

            return;
        }

        // comparison_detail
        $cat = (string) ($block['categoryName'] ?? '');
        $keys1 = $this->inventoryKeyValues($n1, $cat);
        $keys2 = $this->inventoryKeyValues($n2, $cat);
        $allKeys = array_unique(array_merge(array_keys($keys1), array_keys($keys2)));
        sort($allKeys);
        $headers = ['Key', $label1, $label2];
        $rows = [];
        $showOnlyDiffs = (bool) ($block['showOnlyDiffs'] ?? false);
        foreach ($allKeys as $k) {
            $a = $keys1[$k] ?? '';
            $b = $keys2[$k] ?? '';
            if ($showOnlyDiffs && $a === $b) {
                continue;
            }
            $rows[] = [(string) $k, (string) $a, (string) $b];
        }
        $this->addStripedTable($section, $headers, $rows, $ctx, [40, 30, 30]);
    }

    /**
     * @return list<string>
     */
    private function inventoryKeySet(Node $node, string $category): array
    {
        $entries = $this->em->getRepository(NodeInventoryEntry::class)->findBy(['node' => $node, 'categoryName' => $category]);

        return array_values(array_unique(array_map(fn ($e) => $e->getEntryKey(), $entries)));
    }

    /**
     * @return array<string,string>
     */
    private function inventoryKeyValues(Node $node, string $category): array
    {
        $entries = $this->em->getRepository(NodeInventoryEntry::class)->findBy(['node' => $node, 'categoryName' => $category]);
        $out = [];
        foreach ($entries as $e) {
            $out[$e->getEntryKey()] = (string) $e->getValue();
        }

        return $out;
    }

    // ---------------------------------------------------------------------
    // Charts / timeline — rendered as faithful data tables
    // ---------------------------------------------------------------------

    private function renderChart(Section $section, array $block, WordRenderContext $ctx): void
    {
        $title = $this->resolveVariables((string) ($block['title'] ?? ''), $ctx);
        if ($title !== '') {
            $section->addText($title, ['name' => $ctx->bodyFont(), 'size' => $ctx->bodySize() + 1, 'bold' => true], ['spaceAfter' => 60]);
        }
        $labels = (array) ($block['labels'] ?? []);
        $series = (array) ($block['series'] ?? []);
        if (!$labels || !$series) {
            $section->addText('—', ['name' => $ctx->bodyFont(), 'size' => $ctx->bodySize(), 'italic' => true]);

            return;
        }
        $headers = array_merge([''], array_map(fn ($s) => (string) ($s['name'] ?? ''), $series));
        $rows = [];
        foreach ($labels as $i => $label) {
            $row = [(string) $label];
            foreach ($series as $s) {
                $row[] = (string) (($s['data'][$i] ?? '') === '' ? '' : $s['data'][$i]);
            }
            $rows[] = $row;
        }
        $this->addStripedTable($section, $headers, $rows, $ctx);
    }

    private function renderTimeline(Section $section, array $block, WordRenderContext $ctx): void
    {
        $headers = ['Item', 'Range', 'Release', 'End of Sale', 'End of Support', 'End of Life'];
        $ranges = [];
        $seen = [];

        $add = function (string $label, ?\App\Entity\ProductRange $pr) use (&$ranges, &$seen): void {
            if (!$pr) {
                return;
            }
            $key = $pr->getId() . '|' . $label;
            if (isset($seen[$key])) {
                return;
            }
            $seen[$key] = true;
            $ranges[] = ['label' => $label, 'range' => $pr];
        };

        if (($block['mode'] ?? 'node') === 'node') {
            foreach ($this->resolveBlockNodes($block, $ctx) as $node) {
                $add((string) ($node->getName() ?: $node->getHostname() ?: $node->getIpAddress()), $this->lifecycleCalculator->findProductRange($node));
            }
        } elseif (!empty($block['allProductRanges'])) {
            foreach ($this->em->getRepository(Node::class)->findBy(['context' => $ctx->report->getContext()]) as $node) {
                $pr = $this->lifecycleCalculator->findProductRange($node);
                if ($pr) {
                    $add((string) $pr->getName(), $pr);
                }
            }
        } else {
            foreach ((array) ($block['productRangeIds'] ?? []) as $id) {
                $pr = $this->em->getRepository(\App\Entity\ProductRange::class)->find($id);
                if ($pr) {
                    $add((string) $pr->getName(), $pr);
                }
            }
        }

        $rows = [];
        foreach ($ranges as $entry) {
            $pr = $entry['range'];
            $rows[] = [
                $entry['label'],
                (string) $pr->getName(),
                $this->dateField($pr, 'getReleaseDate'),
                $this->dateField($pr, 'getEndOfSaleDate'),
                $this->dateField($pr, 'getEndOfSupportDate'),
                $this->dateField($pr, 'getEndOfLifeDate'),
            ];
        }
        if ($rows) {
            $this->addStripedTable($section, $headers, $rows, $ctx);
        } else {
            $section->addText('—', ['name' => $ctx->bodyFont(), 'size' => $ctx->bodySize(), 'italic' => true]);
        }
    }

    private function dateField($entity, string $method): string
    {
        if (!$entity || !method_exists($entity, $method)) {
            return '';
        }
        $v = $entity->{$method}();

        return $v instanceof \DateTimeInterface ? $v->format('Y-m-d') : (string) $v;
    }
}
