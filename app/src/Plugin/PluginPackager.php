<?php

namespace App\Plugin;

/**
 * Re-packages an extracted plugin directory back into a ZIP archive.
 *
 * Used by:
 *  - PluginSignCommand (to wrap the modified manifest + signature.sig)
 *  - PluginExportCommand / VendorPluginController export endpoint
 *
 * The output ZIP is NOT byte-identical to the original (entry ordering and
 * compression metadata differ), but the detached signature still validates
 * because PluginSignatureVerifier computes a deterministic digest over the
 * file contents in sorted order — independent of the ZIP structure.
 */
class PluginPackager
{
    /**
     * @throws \RuntimeException on I/O failure
     */
    public function packageDirectory(string $sourceDir, string $outputZipPath): void
    {
        if (!class_exists(\ZipArchive::class)) {
            throw new \RuntimeException('PHP ZipArchive extension is not available.');
        }
        if (!is_dir($sourceDir)) {
            throw new \RuntimeException(sprintf('Source directory does not exist: %s', $sourceDir));
        }

        if (is_file($outputZipPath)) {
            unlink($outputZipPath);
        }

        $zip = new \ZipArchive();
        if ($zip->open($outputZipPath, \ZipArchive::CREATE) !== true) {
            throw new \RuntimeException(sprintf('Cannot create output ZIP: %s', $outputZipPath));
        }

        try {
            $sourceDir = rtrim($sourceDir, '/\\');
            $iterator = new \RecursiveIteratorIterator(
                new \RecursiveDirectoryIterator($sourceDir, \FilesystemIterator::SKIP_DOTS),
                \RecursiveIteratorIterator::SELF_FIRST,
            );
            foreach ($iterator as $file) {
                /** @var \SplFileInfo $file */
                $rel = substr($file->getPathname(), strlen($sourceDir) + 1);
                $rel = str_replace('\\', '/', $rel);
                if ($file->isDir()) {
                    $zip->addEmptyDir($rel);
                } else {
                    $zip->addFile($file->getPathname(), $rel);
                }
            }
        } finally {
            $zip->close();
        }
    }
}
