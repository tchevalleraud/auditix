<?php

namespace App\Service;

use App\Entity\LlmProvider;

class ExtractAssistService
{
    private const AI_SYSTEM_PROMPT_TABLE = <<<PROMPT
You are a regex expert helping to parse network device CLI command output that has a tabular structure (rows × columns). The user has selected one or more header lines and one or more sample data rows from the raw CLI output.

Return a JSON object with these fields, and nothing else:
- "regex": a PCRE-compatible regex (no delimiters, no /flags) that matches a single data row and captures one group per column
- "columns": array of {"label": string, "group": int} — one entry per capture group, with the human-readable column label and the 1-based group index
- "extractMode": either "line" (default — each line is independent) or "block" (data is grouped in repeating blocks)
- "blockSeparator": only when extractMode is "block" — a regex matching the block boundary header
- "blockKeyGroup": only when extractMode is "block" — which capture group from blockSeparator identifies the block

Constraints on the regex:
- The regex MUST NOT match any of the provided header lines. Use specific character classes rather than the catch-all \\S+ so the header row is naturally excluded.
- Use \\d+ for purely numeric columns (integers, MTU, counters, indexes).
- Use [0-9\\/]+ for port-like values such as "1/1", "1/2/24", VLAN ranges.
- Use [0-9:]+ for time-like or stacked IDs (e.g. "1:1").
- Use [0-9.]+ for IP addresses or version numbers.
- Use an alternation like (Enable|Disable), (up|down), (true|false), (yes|no), (connected|notconnect), (active|inactive) — case sensitive — when a column is clearly a known enum.
- Use \\S+ only as a last resort for free-form values without internal spaces.
- Use ([\\S ]+?) or similar non-greedy patterns when a column may legitimately contain spaces.
- If some example rows are shorter than others (trailing columns missing), wrap the trailing column captures in a non-capturing optional group like (?:\\s+(\\S+))? so short rows still match. Keep the column "group" indices aligned with the inner captures.
- Anchor with ^ so the regex starts at the beginning of the line. Do not add a leading \\s* unless the example data is actually indented.
- Anchor the end (\$) only when safe.
- Do not return markdown code fences, do not explain — JSON only.
- Always include all capture groups in the "columns" array.
PROMPT;

    private const AI_SYSTEM_PROMPT_KEYVALUE = <<<PROMPT
You are a regex expert helping to parse network device CLI command output where each line contains a key and a value (e.g. "hostname switch01", "Description : Cisco IOS Software"). The user has annotated a sample line, marking which portion is the key (label) and which portion is the value.

Return a JSON object with these fields, and nothing else:
- "regex": a PCRE-compatible regex (no delimiters, no /flags) that matches the sample line and captures one group per value (and optionally the key)
- "columns": array of {"label": string, "group": int} — one entry per value capture group
- "keyMode": "manual" if the key is fixed and should be hardcoded, "extract" if the key itself should be captured from the line
- "keyManual": when keyMode is "manual", the literal key text to use
- "keyGroup": when keyMode is "extract", the 1-based group index that captures the key

Constraints:
- Preserve the literal separator(s) between key and value (\\s+, " : ", " = ", etc.)
- Use \\S+ for short values, ([\\S ]+?)\$ when the value may contain spaces and ends the line
- Anchor with ^ when possible so the regex only matches lines of this exact shape
- Do not return markdown code fences, do not explain — JSON only
PROMPT;

    public function __construct(
        private readonly LlmProviderService $llm,
    ) {
    }

    /**
     * Build a deterministic regex by aligning example tokens with header tokens.
     *
     * @param list<string> $headers     selected header lines (1 or more, supports multi-row headers)
     * @param list<string> $examples    sample data rows (1 or more)
     *
     * @return array{regex: string, extractMode: string, columns: list<array{label: string, group: int}>}
     */
    public function buildDeterministic(array $headers, array $examples): array
    {
        $headerLines = array_values(array_filter(array_map('rtrim', $headers), fn($l) => $l !== ''));
        $exampleLines = array_values(array_filter(array_map('rtrim', $examples), fn($l) => $l !== ''));

        if (empty($headerLines)) {
            throw new \InvalidArgumentException('At least one header line is required');
        }
        if (empty($exampleLines)) {
            throw new \InvalidArgumentException('At least one example line is required');
        }

        // Tokenize each example line with offsets so we can both align with
        // headers and figure out which examples are "short" (trailing columns
        // missing — those columns become optional in the regex).
        $exampleRows = [];
        foreach ($exampleLines as $line) {
            preg_match_all('/\S+/', $line, $m, PREG_OFFSET_CAPTURE);
            $exampleRows[] = $m[0];
        }
        $tokenCounts = array_map('count', $exampleRows);
        $minCount = min($tokenCounts);
        $maxCount = max($tokenCounts);
        if ($maxCount === 0) {
            throw new \InvalidArgumentException('Example line is empty');
        }

        // Reference row = the first one with the most columns; its offsets
        // drive the header→column label alignment.
        $refIdx = 0;
        foreach ($exampleRows as $i => $row) {
            if (count($row) === $maxCount) { $refIdx = $i; break; }
        }
        $exTokens = $exampleRows[$refIdx];
        $n = $maxCount;

        // Tokenize each header line with byte offsets, so we can align with
        // the example column positions vertically.
        $headerTokensByLine = [];
        foreach ($headerLines as $hLine) {
            preg_match_all('/\S+/', $hLine, $hMatches, PREG_OFFSET_CAPTURE);
            $headerTokensByLine[] = $hMatches[0];
        }

        // Resolve a label for each column from the reference example.
        $columns = [];
        foreach ($exTokens as $i => $exTok) {
            $colStart = $exTok[1];
            $colEnd = $colStart + strlen($exTok[0]);
            $label = $this->labelForColumn($headerTokensByLine, $colStart, $colEnd);
            $columns[] = [
                'label' => $label !== '' ? $label : ('col' . ($i + 1)),
                'group' => $i + 1,
            ];
        }

        // Collect values per column across every example that reaches at
        // least that column. Short rows still contribute to the columns they
        // do have.
        $colValues = array_fill(0, $n, []);
        foreach ($exampleRows as $row) {
            foreach ($row as $i => $tok) {
                if ($i < $n) $colValues[$i][] = $tok[0];
            }
        }

        $patterns = [];
        for ($i = 0; $i < $n; $i++) {
            $patterns[] = $this->inferColumnPattern($colValues[$i]);
        }

        // Drop the leading \s* when every example actually starts at column 0
        // — the user pointed out this padding is misleading when the data is
        // flush-left.
        $allAtZero = true;
        foreach ($exampleRows as $row) {
            if (empty($row)) continue;
            if ($row[0][1] !== 0) { $allAtZero = false; break; }
        }
        $prefix = $allAtZero ? '^' : '^\s*';

        // Required groups for the columns every example has, then optional
        // groups for the trailing columns some examples are missing.
        $required = '';
        for ($i = 0; $i < $minCount; $i++) {
            $required .= $i === 0 ? $patterns[$i] : '\s+' . $patterns[$i];
        }
        $optional = '';
        for ($i = $minCount; $i < $maxCount; $i++) {
            $optional .= '(?:\s+' . $patterns[$i] . ')?';
        }
        $regex = $prefix . $required . $optional;

        // If the assembled regex still matches one of the header lines, wrap
        // it in a negative lookahead that excludes every offending header
        // literally.
        $matchingHeaders = [];
        foreach ($headerLines as $hLine) {
            if (@preg_match($this->wrapPattern($regex), $hLine)) {
                $matchingHeaders[] = trim($hLine);
            }
        }
        if (!empty($matchingHeaders)) {
            $alts = implode('|', array_map(fn($h) => preg_quote($h, '/'), array_unique($matchingHeaders)));
            $regex = '^(?!\s*(?:' . $alts . ')\s*$)' . ltrim($regex, '^');
        }

        return [
            'regex' => $regex,
            'extractMode' => 'line',
            'columns' => $columns,
        ];
    }

    /**
     * Look at every observed value of a column across examples and pick a
     * tighter regex pattern than (\S+) when we can. The goal is twofold:
     * generate readable patterns the user is happy to ship, and avoid
     * accidentally matching the header row because (\S+) is too permissive.
     *
     * @param list<string> $values
     */
    private function inferColumnPattern(array $values): string
    {
        if (empty($values)) return '(\S+)';

        // Known enum families. The match is case-sensitive on purpose — Cisco
        // and Juniper use distinct casings ("up" vs "Up") and lying about it
        // breaks the regex on the actual line.
        $enumGroups = [
            ['Enable', 'Disable'],
            ['enable', 'disable'],
            ['Enabled', 'Disabled'],
            ['enabled', 'disabled'],
            ['true', 'false'],
            ['True', 'False'],
            ['on', 'off'],
            ['On', 'Off'],
            ['up', 'down'],
            ['Up', 'Down'],
            ['UP', 'DOWN'],
            ['yes', 'no'],
            ['Yes', 'No'],
            ['active', 'inactive'],
            ['Active', 'Inactive'],
            ['connected', 'notconnect', 'disconnected', 'disabled'],
            ['allowed', 'denied'],
        ];
        foreach ($enumGroups as $group) {
            $allInGroup = true;
            foreach ($values as $v) {
                if (!in_array($v, $group, true)) { $allInGroup = false; break; }
            }
            if ($allInGroup) {
                return '(' . implode('|', $group) . ')';
            }
        }

        // Structural type detection. All values must agree for us to commit
        // to a narrower pattern.
        $allInt = true;
        $allSlash = true; $anyHasSlash = false;
        $allColon = true; $anyHasColon = false;
        $allDot = true;   $anyHasDot = false;
        $allHexish = true; // ports like 00:11:22:33:44:55 or 00-11-22

        foreach ($values as $v) {
            if (!preg_match('/^\d+$/', $v)) $allInt = false;
            if (preg_match('/^[0-9\/]+$/', $v)) {
                if (str_contains($v, '/')) $anyHasSlash = true;
            } else { $allSlash = false; }
            if (preg_match('/^[0-9:]+$/', $v)) {
                if (str_contains($v, ':')) $anyHasColon = true;
            } else { $allColon = false; }
            if (preg_match('/^[0-9.]+$/', $v)) {
                if (str_contains($v, '.')) $anyHasDot = true;
            } else { $allDot = false; }
            if (!preg_match('/^[0-9A-Fa-f:.\-]+$/', $v) || !preg_match('/[:.\-]/', $v)) {
                $allHexish = false;
            }
        }

        if ($allInt) return '(\d+)';
        if ($allSlash && $anyHasSlash) return '([0-9\/]+)';
        if ($allColon && $anyHasColon) return '([0-9:]+)';
        if ($allDot && $anyHasDot) return '([0-9.]+)';
        if ($allHexish) return '([0-9A-Fa-f:.\-]+)';

        return '(\S+)';
    }

    /**
     * Ask an LLM to derive the regex from the same inputs. We pass a trimmed
     * snippet of the full output for context, then enforce a JSON-only reply
     * via the system prompt.
     *
     * @param list<string> $headers
     * @param list<string> $examples
     *
     * @return array{regex: string, extractMode: string, blockSeparator: ?string, blockKeyGroup: ?int, columns: list<array{label: string, group: int}>}
     */
    public function buildWithAi(
        LlmProvider $provider,
        string $model,
        string $output,
        array $headers,
        array $examples,
    ): array {
        $userPayload = sprintf(
            "Headers (one per line):\n%s\n\nExample data rows (one per line):\n%s\n\nFull CLI output for context (truncated):\n%s",
            implode("\n", $headers),
            implode("\n", $examples),
            mb_substr($output, 0, 6000)
        );

        $response = $this->llm->chat(
            $provider,
            $model,
            [['role' => 'user', 'content' => $userPayload]],
            self::AI_SYSTEM_PROMPT_TABLE,
        );

        $content = trim((string) ($response['content'] ?? ''));
        if ($content === '') {
            throw new \RuntimeException('The model returned an empty response');
        }

        $data = $this->decodeJsonResponse($content);
        if (!isset($data['regex']) || !is_string($data['regex'])) {
            throw new \RuntimeException('The model response is missing a "regex" string');
        }

        $columns = [];
        foreach (($data['columns'] ?? []) as $c) {
            if (!is_array($c) || !isset($c['label'], $c['group'])) {
                continue;
            }
            $columns[] = [
                'label' => (string) $c['label'],
                'group' => (int) $c['group'],
            ];
        }

        $mode = ($data['extractMode'] ?? 'line') === 'block' ? 'block' : 'line';

        return [
            'regex' => (string) $data['regex'],
            'extractMode' => $mode,
            'blockSeparator' => isset($data['blockSeparator']) && is_string($data['blockSeparator']) ? $data['blockSeparator'] : null,
            'blockKeyGroup' => isset($data['blockKeyGroup']) ? (int) $data['blockKeyGroup'] : null,
            'columns' => $columns,
            'keyMode' => null,
            'keyManual' => null,
            'keyGroup' => null,
        ];
    }

    /**
     * Deterministic key-value parser. The caller has annotated each token of
     * the sample line as "literal", "key", or "value". We rebuild the regex
     * by preserving the literal text between tokens (mostly whitespace and
     * separators like ":" or "=") and substituting capture groups for the
     * annotated tokens.
     *
     * Consecutive tokens with the same role are merged into a single capture
     * to keep the result readable when values span multiple words.
     *
     * @param list<array{text: string, offset: int, role: string}> $tokens
     *
     * @return array{regex: string, extractMode: string, columns: list<array{label: string, group: int}>, keyMode: string, keyManual: ?string, keyGroup: ?int}
     */
    public function buildDeterministicKeyValue(string $line, array $tokens): array
    {
        if (empty($tokens)) {
            throw new \InvalidArgumentException('No tokens annotated');
        }
        usort($tokens, fn($a, $b) => ($a['offset'] ?? 0) <=> ($b['offset'] ?? 0));

        // Drop whitespace-only tokens. The frontend ships them so the rendered
        // line keeps its original layout, but the regex builder reconstructs
        // every gap from the source line via substr(), so keeping them here
        // would emit literal " " / "\t" characters in the regex.
        $tokens = array_values(array_filter(
            $tokens,
            fn($t) => preg_match('/^\s+$/', (string) ($t['text'] ?? '')) !== 1
        ));
        if (empty($tokens)) {
            throw new \InvalidArgumentException('No non-whitespace tokens to annotate');
        }

        // First pass: collapse runs of same-role tokens that are glued together
        // by punctuation (":", "-", "."). A MAC address tokenized as
        // "0c", ":", "2d", ":", "3d", ":", "ab", ":", "00", ":", "00" should
        // collapse to a single value covering the whole span — otherwise we'd
        // emit six capture groups for what is logically one address.
        $tokens = $this->collapsePunctuationRuns($line, $tokens);

        // Second pass: merge adjacent same-role tokens (key+key or value+value)
        // separated by whitespace OR by nothing at all. The "nothing at all"
        // case covers users marking the colon between MAC segments as VALUE
        // alongside the hex bytes — we still want one capture for the lot.
        $runs = [];
        foreach ($tokens as $tok) {
            $role = $tok['role'] ?? 'literal';
            if (!in_array($role, ['literal', 'key', 'value'], true)) {
                $role = 'literal';
            }
            $offset = (int) ($tok['offset'] ?? 0);
            $text = (string) ($tok['text'] ?? '');
            if (!empty($runs)) {
                $last = &$runs[count($runs) - 1];
                $lastEnd = $last['offset'] + strlen($last['text']);
                $gap = substr($line, $lastEnd, $offset - $lastEnd);
                if ($role === $last['role'] && $role !== 'literal' && preg_match('/^\s*$/', $gap)) {
                    $last['text'] = substr($line, $last['offset'], ($offset + strlen($text)) - $last['offset']);
                    unset($last);
                    continue;
                }
                unset($last);
            }
            $runs[] = ['role' => $role, 'text' => $text, 'offset' => $offset];
        }

        $pattern = '^';
        $columns = [];
        $groupIndex = 0;
        $keyGroup = null;
        $keyManualParts = [];
        $prevEnd = 0;

        foreach ($runs as $i => $run) {
            $offset = $run['offset'];
            $text = $run['text'];
            $role = $run['role'];

            // Gap between the previous run and this one. We default to a
            // tolerant \s* when the current OR previous run is a short
            // punctuation separator like ":" or "=", so the regex still
            // matches whether the source has "key:value" or "key : value".
            $gap = substr($line, $prevEnd, $offset - $prevEnd);
            $currIsSep = ($role === 'literal' && $this->isPunctSeparator($text));
            $prevIsSep = $i > 0 && $runs[$i - 1]['role'] === 'literal' && $this->isPunctSeparator($runs[$i - 1]['text']);
            $tolerant = $currIsSep || $prevIsSep;

            if ($i === 0 && $prevEnd === 0 && $offset > 0) {
                $pattern .= preg_match('/^\s+$/', $gap) ? '\s*' : preg_quote($gap, '/');
            } elseif ($i > 0) {
                if ($gap === '') {
                    if ($tolerant) $pattern .= '\s*';
                } elseif (preg_match('/^\s+$/', $gap)) {
                    $pattern .= $tolerant ? '\s*' : '\s+';
                } else {
                    $pattern .= preg_quote($gap, '/');
                }
            }

            if ($role === 'literal') {
                $pattern .= preg_quote($text, '/');
                // Punctuation separators stay literal in the regex but do not
                // belong in the manual key — we want "BaseMacAddr", not
                // "BaseMacAddr :".
                if (!$this->isPunctSeparator($text)) {
                    $keyManualParts[] = $text;
                }
            } elseif ($role === 'key') {
                // In one-line key/value mode, "KEY" means "this is the label
                // word(s)". We keep it literal in the regex so it acts as a
                // strict anchor (no risk of matching unrelated lines) AND we
                // promote it into the manual key.
                $pattern .= preg_quote($text, '/');
                $keyManualParts[] = $text;
            } elseif ($role === 'value') {
                $isLast = ($i === count($runs) - 1);
                $pattern .= $this->valuePatternFor($text, $isLast);
                $groupIndex++;
                // Match the convention used elsewhere in the UI for fallback
                // labels (saveExtract → "Value#1", "Value#2", ...). The user
                // can rename it in the preview step.
                $columns[] = ['label' => 'Value#' . (count($columns) + 1), 'group' => $groupIndex];
            }

            $prevEnd = $offset + strlen($text);
        }

        $pattern .= '\s*$';

        // In the one-line key/value flow we always end up with a literal key
        // (manual). Dynamic key extraction is reachable via the existing
        // controls in the Add Extract modal after the workflow finishes.
        $keyManual = !empty($keyManualParts) ? trim(implode(' ', $keyManualParts)) : null;

        return [
            'regex' => $pattern,
            'extractMode' => 'line',
            'columns' => $columns,
            'keyMode' => 'manual',
            'keyManual' => $keyManual,
            'keyGroup' => null,
        ];
    }

    /**
     * Collapse "value sep value sep value..." (and same for "key") into a
     * single token covering the entire span. The separator must be a short
     * punctuation character (":", "-", ".") sitting between two same-role
     * tokens with no whitespace in between — otherwise it's left alone.
     *
     * @param list<array{text: string, offset: int, role: string}> $tokens
     * @return list<array{text: string, offset: int, role: string}>
     */
    private function collapsePunctuationRuns(string $line, array $tokens): array
    {
        $result = [];
        $n = count($tokens);
        $i = 0;
        while ($i < $n) {
            $tok = $tokens[$i];
            $role = $tok['role'] ?? 'literal';
            if (!in_array($role, ['key', 'value'], true)) {
                $result[] = $tok;
                $i++;
                continue;
            }
            // Look ahead for sep + same-role pairs glued without spaces.
            $endIdx = $i;
            $j = $i + 1;
            while ($j + 1 < $n) {
                $sep = $tokens[$j];
                $next = $tokens[$j + 1];
                $sepText = (string) ($sep['text'] ?? '');
                $sepRole = $sep['role'] ?? 'literal';
                $nextRole = $next['role'] ?? 'literal';
                $prevEnd = ($tokens[$endIdx]['offset'] ?? 0) + strlen($tokens[$endIdx]['text'] ?? '');
                $glued = ($sep['offset'] ?? 0) === $prevEnd
                    && ($next['offset'] ?? 0) === ($sep['offset'] ?? 0) + strlen($sepText);
                if ($sepRole === 'literal' && in_array($sepText, [':', '-', '.'], true) && $nextRole === $role && $glued) {
                    $endIdx = $j + 1;
                    $j += 2;
                } else {
                    break;
                }
            }
            if ($endIdx > $i) {
                $firstOffset = $tokens[$i]['offset'] ?? 0;
                $lastEnd = ($tokens[$endIdx]['offset'] ?? 0) + strlen($tokens[$endIdx]['text'] ?? '');
                $combinedText = substr($line, $firstOffset, $lastEnd - $firstOffset);
                $result[] = ['role' => $role, 'text' => $combinedText, 'offset' => $firstOffset];
                $i = $endIdx + 1;
            } else {
                $result[] = $tok;
                $i++;
            }
        }
        return $result;
    }

    private function isPunctSeparator(string $text): bool
    {
        return strlen($text) <= 2 && preg_match('/^[:\=,\.\-;|]+$/', $text) === 1;
    }

    /**
     * Choose a capture pattern for a single value (already in its collapsed
     * form). Detect common composite formats (MAC, IP, port-like, integer)
     * so we don't fall back to the catch-all \S+ when we can do better.
     */
    private function valuePatternFor(string $text, bool $isLast): string
    {
        if (preg_match('/^\d+$/', $text)) return '(\d+)';
        if (preg_match('/^[0-9A-Fa-f]+(:[0-9A-Fa-f]+)+$/', $text)) return '([0-9A-Fa-f:]+)';
        if (preg_match('/^[0-9A-Fa-f]+(-[0-9A-Fa-f]+)+$/', $text)) return '([0-9A-Fa-f\-]+)';
        if (preg_match('/^[0-9A-Fa-f]+(\.[0-9A-Fa-f]+)+$/', $text)) return '([0-9A-Fa-f.]+)';
        if (preg_match('/^\d+(\/\d+)+$/', $text)) return '([0-9\/]+)';
        if (preg_match('/\s/', $text)) {
            return $isLast ? '(.+)' : '([\S ]+?)';
        }
        return '(\S+)';
    }

    /**
     * AI variant for key-value structure. Passes the sample line and the
     * annotated spans so the model knows exactly which substring is the key
     * and which is the value, then returns the same shape as
     * buildDeterministicKeyValue.
     *
     * @param list<array{text: string, offset: int, role: string}> $tokens
     *
     * @return array{regex: string, extractMode: string, columns: list<array{label: string, group: int}>, keyMode: ?string, keyManual: ?string, keyGroup: ?int}
     */
    public function buildWithAiKeyValue(
        LlmProvider $provider,
        string $model,
        string $output,
        string $line,
        array $tokens,
    ): array {
        $keyTokens = array_values(array_filter($tokens, fn($t) => ($t['role'] ?? '') === 'key'));
        $valueTokens = array_values(array_filter($tokens, fn($t) => ($t['role'] ?? '') === 'value'));
        $keyText = implode(' ', array_map(fn($t) => (string) $t['text'], $keyTokens));
        $valueText = implode(' ', array_map(fn($t) => (string) $t['text'], $valueTokens));

        $userPayload = sprintf(
            "Sample line:\n%s\n\nAnnotated key portion: %s\nAnnotated value portion: %s\n\nFull CLI output for context (truncated):\n%s",
            $line,
            $keyText !== '' ? $keyText : '(none — key should be the literal label before the value)',
            $valueText !== '' ? $valueText : '(none)',
            mb_substr($output, 0, 6000)
        );

        $response = $this->llm->chat(
            $provider,
            $model,
            [['role' => 'user', 'content' => $userPayload]],
            self::AI_SYSTEM_PROMPT_KEYVALUE,
        );

        $content = trim((string) ($response['content'] ?? ''));
        if ($content === '') {
            throw new \RuntimeException('The model returned an empty response');
        }
        $data = $this->decodeJsonResponse($content);
        if (!isset($data['regex']) || !is_string($data['regex'])) {
            throw new \RuntimeException('The model response is missing a "regex" string');
        }

        $columns = [];
        foreach (($data['columns'] ?? []) as $c) {
            if (!is_array($c) || !isset($c['label'], $c['group'])) {
                continue;
            }
            $columns[] = [
                'label' => (string) $c['label'],
                'group' => (int) $c['group'],
            ];
        }

        $keyMode = ($data['keyMode'] ?? 'manual') === 'extract' ? 'extract' : 'manual';

        return [
            'regex' => (string) $data['regex'],
            'extractMode' => 'line',
            'columns' => $columns,
            'keyMode' => $keyMode,
            'keyManual' => isset($data['keyManual']) && is_string($data['keyManual']) ? $data['keyManual'] : null,
            'keyGroup' => isset($data['keyGroup']) ? (int) $data['keyGroup'] : null,
        ];
    }

    /**
     * Apply the proposed regex against the raw output and count matches. The
     * UI uses this to give the user a quick sanity check before they confirm.
     *
     * @return array{matchedLines: int, totalLines: int, error: ?string}
     */
    public function evaluate(string $output, string $regex, string $extractMode = 'line', ?string $blockSeparator = null): array
    {
        $totalLines = substr_count($output, "\n") + 1;
        try {
            if ($extractMode === 'block' && $blockSeparator !== null && $blockSeparator !== '') {
                $blockPattern = $this->wrapPattern($blockSeparator, 'm');
                $matched = @preg_match_all($blockPattern, $output);
                if ($matched === false) {
                    return ['matchedLines' => 0, 'totalLines' => $totalLines, 'error' => 'Invalid block separator regex'];
                }
                return ['matchedLines' => (int) $matched, 'totalLines' => $totalLines, 'error' => null];
            }

            $pattern = $this->wrapPattern($regex, 'm');
            $matched = @preg_match_all($pattern, $output);
            if ($matched === false) {
                return ['matchedLines' => 0, 'totalLines' => $totalLines, 'error' => 'Invalid regex'];
            }
            return ['matchedLines' => (int) $matched, 'totalLines' => $totalLines, 'error' => null];
        } catch (\Throwable $e) {
            return ['matchedLines' => 0, 'totalLines' => $totalLines, 'error' => $e->getMessage()];
        }
    }

    /**
     * Wrap a user-authored regex in PCRE delimiters without re-escaping
     * already-escaped characters. We try a small set of safe delimiters and
     * pick the first one that does not appear unescaped in the pattern. This
     * avoids the classic "Unknown modifier" warning we used to emit when the
     * pattern contained a slash (escaped or not) inside a character class.
     */
    private function wrapPattern(string $regex, string $modifiers = ''): string
    {
        foreach (['#', '~', '|', '%', '@'] as $delim) {
            $appearsUnescaped = preg_match('/(?<!\\\\)' . preg_quote($delim, '/') . '/', $regex);
            if (!$appearsUnescaped) {
                return $delim . $regex . $delim . $modifiers;
            }
        }
        // Fallback: use {} as paired delimiters which never need escaping.
        return '{' . $regex . '}' . $modifiers;
    }

    /**
     * Concatenate header tokens that overlap the example column horizontally.
     * Handles multi-row headers like "Admin / State" where the label spans
     * two lines stacked above the data.
     */
    private function labelForColumn(array $headerTokensByLine, int $colStart, int $colEnd): string
    {
        $parts = [];
        foreach ($headerTokensByLine as $line) {
            foreach ($line as $tok) {
                $tokStart = $tok[1];
                $tokEnd = $tokStart + strlen($tok[0]);
                // Overlap test, allowing 1 char slack on each side for tight columns.
                if ($tokEnd >= $colStart - 1 && $tokStart <= $colEnd + 1) {
                    $parts[] = $tok[0];
                    break;
                }
            }
        }
        return implode(' ', $parts);
    }

    /**
     * Models sometimes wrap the JSON in ```json fences, prepend a sentence
     * before the object, or trail with explanatory text. Try to recover the
     * first valid JSON object we can find.
     */
    private function decodeJsonResponse(string $content): array
    {
        $direct = json_decode($content, true);
        if (is_array($direct)) {
            return $direct;
        }

        // Strip common code-fence wrapping.
        $stripped = preg_replace('/^```(?:json|JSON)?\s*\n?/', '', $content);
        $stripped = preg_replace('/\n?```\s*$/', '', $stripped ?? '');
        $parsed = json_decode($stripped ?? '', true);
        if (is_array($parsed)) {
            return $parsed;
        }

        // Fallback: locate the first `{...}` block in the response.
        if (preg_match('/\{(?:[^{}]|(?R))*\}/s', $content, $m)) {
            $parsed = json_decode($m[0], true);
            if (is_array($parsed)) {
                return $parsed;
            }
        }

        throw new \RuntimeException('Unable to parse JSON from model response');
    }
}
