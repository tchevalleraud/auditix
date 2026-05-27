<?php

namespace App\Command;

use App\Plugin\PluginInstallException;
use App\Plugin\PluginInstaller;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputArgument;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\HttpFoundation\File\UploadedFile;

#[AsCommand(
    name: 'app:plugin:install',
    description: 'Install (or update) a Vendor Plugin from a local ZIP archive.',
)]
class PluginInstallCommand extends Command
{
    public function __construct(private readonly PluginInstaller $installer)
    {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this->addArgument('archive', InputArgument::REQUIRED, 'Path to the plugin ZIP archive');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $path = (string) $input->getArgument('archive');
        if (!is_file($path)) {
            $output->writeln(sprintf('<error>Archive not found: %s</error>', $path));
            return Command::FAILURE;
        }

        // Construct a synthetic UploadedFile (test=true bypasses is_uploaded_file()).
        $upload = new UploadedFile(
            path: $path,
            originalName: basename($path),
            mimeType: 'application/zip',
            error: null,
            test: true,
        );

        try {
            $result = $this->installer->install($upload, null, '127.0.0.1');
        } catch (PluginInstallException $e) {
            $output->writeln('<error>' . $e->getMessage() . '</error>');
            return Command::FAILURE;
        }

        $p = $result['plugin'];
        $output->writeln(sprintf(
            '<info>%s</info> %s v%s [%s]',
            $result['replaced'] ? 'Updated' : 'Installed',
            $p->getIdentifier(),
            $p->getVersion(),
            $p->getSignatureStatus(),
        ));
        $output->writeln('  Archive path : ' . $p->getArchivePath());
        $output->writeln('  SHA-256      : ' . $p->getSha256());

        return Command::SUCCESS;
    }
}
