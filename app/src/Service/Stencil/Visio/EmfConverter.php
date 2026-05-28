<?php

namespace App\Service\Stencil\Visio;

use Psr\Log\LoggerInterface;

/**
 * Converts EMF/WMF metafiles to SVG using a headless LibreOffice (soffice).
 * Several files are converted in a single soffice invocation to amortise its
 * (slow) startup. A per-call UserInstallation profile avoids lock contention
 * between concurrent imports.
 *
 * Degrades gracefully: if soffice is not installed, conversion returns null for
 * every input and the importer falls back to geometry.
 */
class EmfConverter
{
    private ?bool $available = null;

    public function __construct(
        private readonly LoggerInterface $logger,
        private readonly string $soffice = 'soffice',
    ) {}

    public function isAvailable(): bool
    {
        if ($this->available === null) {
            $out = [];
            $code = 1;
            @exec('command -v ' . escapeshellarg($this->soffice) . ' 2>/dev/null', $out, $code);
            $this->available = $code === 0;
        }
        return $this->available;
    }

    /**
     * @param array<string, string> $blobsByKey key => raw EMF/WMF bytes
     * @return array<string, string|null> key => SVG markup (or null on failure)
     */
    public function convertMany(array $blobsByKey): array
    {
        if ($blobsByKey === []) {
            return [];
        }
        if (!$this->isAvailable()) {
            $this->logger->warning('LibreOffice (soffice) unavailable — EMF/WMF masters cannot be converted to SVG.');
            return array_fill_keys(array_keys($blobsByKey), null);
        }

        $dir = sys_get_temp_dir() . '/emf_' . bin2hex(random_bytes(6));
        if (!@mkdir($dir, 0700, true) && !is_dir($dir)) {
            $this->logger->error('Could not create temp dir for EMF conversion', ['dir' => $dir]);
            return array_fill_keys(array_keys($blobsByKey), null);
        }

        $keys = array_keys($blobsByKey);
        $cmd = 'env HOME=' . escapeshellarg($dir)
            . ' timeout 180 ' . escapeshellarg($this->soffice)
            . ' --headless --norestore --nolockcheck --nodefault'
            . ' -env:UserInstallation=' . escapeshellarg('file://' . $dir . '/profile')
            . ' --convert-to svg --outdir ' . escapeshellarg($dir);
        foreach ($keys as $i => $key) {
            file_put_contents($dir . '/' . $i . '.emf', $blobsByKey[$key]);
            $cmd .= ' ' . escapeshellarg($dir . '/' . $i . '.emf');
        }
        $cmd .= ' 2>&1';

        $out = [];
        $code = 0;
        @exec($cmd, $out, $code);

        $result = [];
        foreach ($keys as $i => $key) {
            $svgFile = $dir . '/' . $i . '.svg';
            $svg = is_file($svgFile) ? @file_get_contents($svgFile) : false;
            if ($svg !== false && trim((string) $svg) !== '') {
                $result[$key] = $this->cropToContent((string) $svg);
            } else {
                $result[$key] = null;
                $this->logger->warning('EMF→SVG conversion produced no output', ['key' => $key, 'soffice_exit' => $code]);
            }
        }

        $this->rrmdir($dir);
        return $result;
    }

    /**
     * LibreOffice exports the EMF onto a full A4 page, leaving the icon tiny in a
     * corner. We crop the SVG to its real content: drop the page rectangles,
     * rasterise once (rsvg-convert) to locate the drawing's bounding box, then
     * rewrite the viewBox. Stays vector. Best-effort — returns the input on any
     * failure.
     */
    private function cropToContent(string $svg): string
    {
        if (!preg_match('/viewBox\s*=\s*"\s*([-\d.]+)\s+([-\d.]+)\s+([\d.]+)\s+([\d.]+)\s*"/', $svg, $m)) {
            return $svg;
        }
        $vx = (float) $m[1]; $vy = (float) $m[2]; $vw = (float) $m[3]; $vh = (float) $m[4];
        if ($vw <= 0 || $vh <= 0) {
            return $svg;
        }

        // Drop the page background / border rectangles (direct children ~full size).
        $dom = new \DOMDocument();
        if (!@$dom->loadXML($svg)) {
            return $svg;
        }
        $root = $dom->documentElement;
        if ($root === null) {
            return $svg;
        }
        foreach (iterator_to_array($root->childNodes) as $child) {
            if ($child instanceof \DOMElement && $child->localName === 'rect'
                && (float) $child->getAttribute('width') >= $vw * 0.95) {
                $root->removeChild($child);
            }
        }
        $clean = $dom->saveXML();
        if ($clean === false) {
            return $svg;
        }

        $dir = sys_get_temp_dir() . '/crop_' . bin2hex(random_bytes(5));
        if (!@mkdir($dir, 0700, true) && !is_dir($dir)) {
            return $svg;
        }
        try {
            $svgFile = $dir . '/in.svg';
            $pngFile = $dir . '/out.png';
            file_put_contents($svgFile, $clean);
            $targetW = 1000;
            @exec('rsvg-convert --background-color=none --width=' . $targetW . ' -o ' . escapeshellarg($pngFile) . ' ' . escapeshellarg($svgFile) . ' 2>/dev/null');
            if (!is_file($pngFile) || !extension_loaded('gd')) {
                return $svg;
            }
            $img = @imagecreatefrompng($pngFile);
            if ($img === false) {
                return $svg;
            }
            $pw = imagesx($img); $ph = imagesy($img);
            imagealphablending($img, false);
            $minx = $pw; $miny = $ph; $maxx = -1; $maxy = -1;
            for ($y = 0; $y < $ph; $y++) {
                for ($x = 0; $x < $pw; $x++) {
                    $alpha = (imagecolorat($img, $x, $y) >> 24) & 0x7F; // 0 opaque .. 127 transparent
                    if ($alpha < 100) {
                        if ($x < $minx) $minx = $x;
                        if ($x > $maxx) $maxx = $x;
                        if ($y < $miny) $miny = $y;
                        if ($y > $maxy) $maxy = $y;
                    }
                }
            }
            imagedestroy($img);
            if ($maxx < $minx || $maxy < $miny) {
                return $svg;
            }

            $k = $vw / $pw; // user units per pixel (aspect preserved by rsvg)
            $pad = 2;
            $minx = max(0, $minx - $pad); $miny = max(0, $miny - $pad);
            $maxx = min($pw - 1, $maxx + $pad); $maxy = min($ph - 1, $maxy + $pad);
            $nx = $vx + $minx * $k;
            $ny = $vy + $miny * $k;
            $nw = ($maxx - $minx + 1) * $k;
            $nh = ($maxy - $miny + 1) * $k;

            $out = preg_replace('/viewBox\s*=\s*"[^"]*"/', 'viewBox="' . $this->n($nx) . ' ' . $this->n($ny) . ' ' . $this->n($nw) . ' ' . $this->n($nh) . '"', $clean, 1);
            $out = preg_replace('/\swidth="[^"]*"/', ' width="' . $this->n($nw) . '"', (string) $out, 1);
            $out = preg_replace('/\sheight="[^"]*"/', ' height="' . $this->n($nh) . '"', (string) $out, 1);
            return (string) $out;
        } finally {
            $this->rrmdir($dir);
        }
    }

    private function n(float $v): string
    {
        return rtrim(rtrim(number_format($v, 3, '.', ''), '0'), '.');
    }

    private function rrmdir(string $dir): void
    {
        if (!is_dir($dir)) {
            return;
        }
        $items = scandir($dir) ?: [];
        foreach ($items as $item) {
            if ($item === '.' || $item === '..') {
                continue;
            }
            $path = $dir . '/' . $item;
            is_dir($path) ? $this->rrmdir($path) : @unlink($path);
        }
        @rmdir($dir);
    }
}
