<?php

namespace App\Service;

use Psr\Log\LoggerInterface;

/**
 * Rasterizes an SVG string to a PNG file with rsvg-convert (librsvg).
 *
 * Used by the PDF report generator: TCPDF's built-in SVG parser cannot render an
 * SVG referenced inside an <image> element (data:image/svg+xml), which is how
 * imported Visio / SVG shapes are embedded in a schema. librsvg renders the whole
 * schema — nested SVG icons included — faithfully, so we rasterize the schema and
 * embed the resulting PNG instead.
 */
class SvgRasterizer
{
    private ?bool $available = null;

    public function __construct(
        private readonly LoggerInterface $logger,
        private readonly string $rsvg = 'rsvg-convert',
    ) {}

    public function isAvailable(): bool
    {
        if ($this->available === null) {
            $code = 1;
            @exec('command -v ' . escapeshellarg($this->rsvg) . ' 2>/dev/null', $o, $code);
            $this->available = $code === 0;
        }
        return $this->available;
    }

    /**
     * Renders the SVG to a temporary PNG file. The caller is responsible for
     * deleting the returned path. Returns null on failure.
     */
    public function toPngFile(string $svg, int $targetWidthPx): ?string
    {
        if ($svg === '' || !$this->isAvailable()) {
            return null;
        }
        $targetWidthPx = max(64, min(4000, $targetWidthPx));

        $svgFile = tempnam(sys_get_temp_dir(), 'rsvg_') . '.svg';
        $pngFile = $svgFile . '.png';
        file_put_contents($svgFile, $svg);

        @exec(
            'rsvg-convert --background-color=white --width=' . $targetWidthPx
            . ' -o ' . escapeshellarg($pngFile) . ' ' . escapeshellarg($svgFile) . ' 2>/dev/null',
            $out,
            $code,
        );
        @unlink($svgFile);

        if (is_file($pngFile) && filesize($pngFile) > 0) {
            return $pngFile;
        }
        @unlink($pngFile);
        $this->logger->warning('SVG rasterization failed', ['rsvg_exit' => $code]);
        return null;
    }
}
