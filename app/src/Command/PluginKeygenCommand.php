<?php

namespace App\Command;

use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputArgument;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;

#[AsCommand(
    name: 'app:plugin:keygen',
    description: 'Generate a fresh Ed25519 keypair for signing Vendor Plugins.',
)]
class PluginKeygenCommand extends Command
{
    protected function configure(): void
    {
        $this->addArgument('output-dir', InputArgument::OPTIONAL, 'Directory to write keys into (default: current directory)', '.');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $dir = rtrim((string) $input->getArgument('output-dir'), '/');
        if (!is_dir($dir)) {
            $output->writeln(sprintf('<error>Output directory does not exist: %s</error>', $dir));
            return Command::FAILURE;
        }

        $keypair = sodium_crypto_sign_keypair();
        $publicKey = sodium_crypto_sign_publickey($keypair);
        $secretKey = sodium_crypto_sign_secretkey($keypair);

        $pubB64 = base64_encode($publicKey);
        $privB64 = base64_encode($secretKey);

        $pubPath = $dir . '/plugin-signing.pub';
        $privPath = $dir . '/plugin-signing.priv';

        file_put_contents($pubPath, $pubB64 . "\n");
        file_put_contents($privPath, $privB64 . "\n");
        chmod($privPath, 0600);

        $output->writeln('<info>Generated Ed25519 keypair.</info>');
        $output->writeln('  Public key  : ' . $pubPath);
        $output->writeln('  Private key : ' . $privPath . ' (0600)');
        $output->writeln('');
        $output->writeln('To trust this key for official plugins, add it to <comment>config/plugin_keys.yaml</comment>:');
        $output->writeln('');
        $output->writeln('  keys:');
        $output->writeln('    - key_id: my-org-2026');
        $output->writeln('      algorithm: ed25519');
        $output->writeln('      public_key: "' . $pubB64 . '"');

        return Command::SUCCESS;
    }
}
