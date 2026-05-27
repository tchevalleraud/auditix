<?php

namespace App\Command;

use App\Entity\Context;
use App\Entity\VendorPlugin;
use App\Plugin\PluginAssetsImporter;
use App\Plugin\VendorPluginRegistry;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputArgument;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;

#[AsCommand(
    name: 'app:plugin:activate',
    description: 'Enable a Vendor Plugin in a given context (imports its commands/rules).',
)]
class PluginActivateCommand extends Command
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly VendorPluginRegistry $registry,
        private readonly PluginAssetsImporter $importer,
    ) {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this->addArgument('identifier', InputArgument::REQUIRED, 'Plugin identifier');
        $this->addArgument('context', InputArgument::REQUIRED, 'Context ID');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $identifier = (string) $input->getArgument('identifier');
        $contextId = (int) $input->getArgument('context');

        $plugin = $this->registry->get($identifier);
        if (!$plugin) {
            $output->writeln(sprintf('<error>Plugin "%s" not loaded.</error>', $identifier));
            return Command::FAILURE;
        }

        $context = $this->em->getRepository(Context::class)->find($contextId);
        if (!$context) {
            $output->writeln(sprintf('<error>Context #%d not found.</error>', $contextId));
            return Command::FAILURE;
        }

        $vp = $this->em->getRepository(VendorPlugin::class)->findOneBy([
            'pluginIdentifier' => $identifier,
            'context' => $context,
        ]) ?? new VendorPlugin();

        $wasEnabled = $vp->isEnabled();
        if ($vp->getId() === null) {
            $vp->setContext($context);
            $vp->setPluginIdentifier($identifier);
            $this->em->persist($vp);
        }
        $vp->setEnabled(true);
        $this->em->flush();

        if (!$wasEnabled) {
            $stats = $this->importer->import($plugin, $context);
            $parts = [];
            foreach (['manufacturers', 'models', 'commands', 'rules', 'extracts', 'folders', 'logos'] as $k) {
                if (($stats[$k] ?? 0) > 0) $parts[] = sprintf('%d %s', $stats[$k], $k);
            }
            $output->writeln(sprintf(
                '<info>Activated</info> %s in context "%s" (#%d) — imported: %s',
                $identifier, $context->getName(), $context->getId(),
                $parts === [] ? '(no assets)' : implode(', ', $parts),
            ));
        } else {
            $output->writeln(sprintf('<comment>Already active</comment> %s in context #%d', $identifier, $contextId));
        }

        return Command::SUCCESS;
    }
}
