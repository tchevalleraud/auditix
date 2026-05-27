<?php

namespace App\Command;

use App\Plugin\PluginPackager;
use App\Repository\InstalledPluginRepository;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputArgument;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;

#[AsCommand(
    name: 'app:plugin:export',
    description: 'Export an installed Vendor Plugin as a ZIP archive (for sharing or marketplace publication).',
)]
class PluginExportCommand extends Command
{
    public function __construct(
        private readonly InstalledPluginRepository $repo,
        private readonly PluginPackager $packager,
    ) {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this->addArgument('identifier', InputArgument::REQUIRED, 'Plugin identifier');
        $this->addArgument('output', InputArgument::OPTIONAL, 'Output ZIP path (default: <identifier>-<version>.zip in current directory)');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $identifier = (string) $input->getArgument('identifier');
        $outPath = $input->getArgument('output');

        $plugin = $this->repo->findByIdentifier($identifier);
        if (!$plugin) {
            $output->writeln(sprintf('<error>Plugin "%s" is not installed.</error>', $identifier));
            return Command::FAILURE;
        }

        if (!is_string($outPath) || $outPath === '') {
            $outPath = sprintf('%s-%s.zip', $plugin->getIdentifier(), $plugin->getVersion());
        }

        $sourceDir = $plugin->getArchivePath();
        if (!is_dir($sourceDir)) {
            $output->writeln(sprintf('<error>Plugin source directory is missing on disk: %s</error>', $sourceDir));
            return Command::FAILURE;
        }

        try {
            $this->packager->packageDirectory($sourceDir, $outPath);
        } catch (\Throwable $e) {
            $output->writeln('<error>' . $e->getMessage() . '</error>');
            return Command::FAILURE;
        }

        $size = filesize($outPath);
        $output->writeln(sprintf(
            '<info>Exported</info> %s v%s [%s] → %s (%d bytes)',
            $plugin->getIdentifier(),
            $plugin->getVersion(),
            $plugin->getSignatureStatus(),
            $outPath,
            $size === false ? 0 : $size,
        ));

        return Command::SUCCESS;
    }
}
