<?php

namespace App\Command;

use App\Plugin\PluginSignatureVerifier;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputArgument;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Filesystem\Filesystem;
use Symfony\Component\Yaml\Yaml;

#[AsCommand(
    name: 'app:plugin:sign',
    description: 'Sign a Vendor Plugin ZIP with an Ed25519 private key.',
)]
class PluginSignCommand extends Command
{
    protected function configure(): void
    {
        $this->addArgument('archive', InputArgument::REQUIRED, 'Path to the input plugin ZIP');
        $this->addArgument('private-key', InputArgument::REQUIRED, 'Path to the base64-encoded Ed25519 private key file');
        $this->addArgument('key-id', InputArgument::REQUIRED, 'Identifier of the signing key (must match an entry in config/plugin_keys.yaml on the install target)');
        $this->addArgument('output', InputArgument::OPTIONAL, 'Output ZIP path (default: <input>.signed.zip)');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $archivePath = (string) $input->getArgument('archive');
        $keyPath = (string) $input->getArgument('private-key');
        $keyId = (string) $input->getArgument('key-id');
        $outPath = $input->getArgument('output');
        if (!is_string($outPath) || $outPath === '') {
            $outPath = preg_replace('/\.zip$/i', '', $archivePath) . '.signed.zip';
        }

        if (!is_file($archivePath)) {
            $output->writeln(sprintf('<error>Archive not found: %s</error>', $archivePath));
            return Command::FAILURE;
        }
        if (!is_file($keyPath)) {
            $output->writeln(sprintf('<error>Private key file not found: %s</error>', $keyPath));
            return Command::FAILURE;
        }

        $privB64 = trim((string) file_get_contents($keyPath));
        $priv = base64_decode($privB64, true);
        if ($priv === false || strlen($priv) !== SODIUM_CRYPTO_SIGN_SECRETKEYBYTES) {
            $output->writeln('<error>Invalid Ed25519 private key (expected base64 of 64 bytes).</error>');
            return Command::FAILURE;
        }

        $fs = new Filesystem();
        $tempDir = sys_get_temp_dir() . '/auditix-plugin-sign-' . bin2hex(random_bytes(8));
        $fs->mkdir($tempDir, 0700);

        try {
            // 1. Extract input ZIP
            $zip = new \ZipArchive();
            if ($zip->open($archivePath) !== true) {
                $output->writeln('<error>Cannot open input ZIP.</error>');
                return Command::FAILURE;
            }
            $zip->extractTo($tempDir);
            $zip->close();

            // 2. Update plugin.yaml to embed signature section (key_id + algorithm)
            $manifestPath = $tempDir . '/plugin.yaml';
            if (!is_file($manifestPath)) {
                $output->writeln('<error>plugin.yaml missing in archive.</error>');
                return Command::FAILURE;
            }
            $manifest = Yaml::parseFile($manifestPath);
            if (!is_array($manifest)) {
                $output->writeln('<error>plugin.yaml is not a YAML mapping.</error>');
                return Command::FAILURE;
            }
            $manifest['signature'] = ['key_id' => $keyId, 'algorithm' => 'ed25519'];
            // Drop any existing signature.sig left from a previous signing pass — we recompute.
            if (is_file($tempDir . '/signature.sig')) {
                unlink($tempDir . '/signature.sig');
            }
            file_put_contents($manifestPath, Yaml::dump($manifest, 4, 2));

            // 3. Compute digest and sign
            $digest = PluginSignatureVerifier::computeDigest($tempDir);
            $signature = sodium_crypto_sign_detached($digest, $priv);

            file_put_contents($tempDir . '/signature.sig', $signature);

            // 4. Rebuild the ZIP
            if (is_file($outPath)) unlink($outPath);
            $out = new \ZipArchive();
            if ($out->open($outPath, \ZipArchive::CREATE) !== true) {
                $output->writeln(sprintf('<error>Cannot create output ZIP: %s</error>', $outPath));
                return Command::FAILURE;
            }
            $iterator = new \RecursiveIteratorIterator(
                new \RecursiveDirectoryIterator($tempDir, \FilesystemIterator::SKIP_DOTS),
                \RecursiveIteratorIterator::SELF_FIRST,
            );
            foreach ($iterator as $file) {
                /** @var \SplFileInfo $file */
                $rel = substr($file->getPathname(), strlen($tempDir) + 1);
                $rel = str_replace('\\', '/', $rel);
                if ($file->isDir()) {
                    $out->addEmptyDir($rel);
                } else {
                    $out->addFile($file->getPathname(), $rel);
                }
            }
            $out->close();

            $output->writeln('<info>Signed</info>');
            $output->writeln('  Input    : ' . $archivePath);
            $output->writeln('  Output   : ' . $outPath);
            $output->writeln('  Key ID   : ' . $keyId);
            $output->writeln('  Sig bytes: ' . strlen($signature));

            return Command::SUCCESS;
        } finally {
            $fs->remove($tempDir);
        }
    }
}
