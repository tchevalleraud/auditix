<?php

namespace App\Command;

use App\Plugin\PluginInstallException;
use App\Plugin\PluginInstaller;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputArgument;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;

#[AsCommand(
    name: 'app:plugin:uninstall',
    description: 'Uninstall a Vendor Plugin by identifier.',
)]
class PluginUninstallCommand extends Command
{
    public function __construct(private readonly PluginInstaller $installer)
    {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this->addArgument('identifier', InputArgument::REQUIRED, 'Plugin identifier to uninstall');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $identifier = (string) $input->getArgument('identifier');

        try {
            $this->installer->uninstall($identifier, null, '127.0.0.1');
        } catch (PluginInstallException $e) {
            $output->writeln('<error>' . $e->getMessage() . '</error>');
            return Command::FAILURE;
        }

        $output->writeln(sprintf('<info>Uninstalled</info> %s', $identifier));
        return Command::SUCCESS;
    }
}
