<?php

namespace App\Command;

use App\Entity\Context;
use App\Entity\VendorPlugin;
use App\Plugin\PluginAssetsImporter;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputArgument;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;

#[AsCommand(
    name: 'app:plugin:deactivate',
    description: 'Disable a Vendor Plugin in a given context (removes its commands/rules).',
)]
class PluginDeactivateCommand extends Command
{
    public function __construct(
        private readonly EntityManagerInterface $em,
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

        $context = $this->em->getRepository(Context::class)->find($contextId);
        if (!$context) {
            $output->writeln(sprintf('<error>Context #%d not found.</error>', $contextId));
            return Command::FAILURE;
        }

        $vp = $this->em->getRepository(VendorPlugin::class)->findOneBy([
            'pluginIdentifier' => $identifier,
            'context' => $context,
        ]);
        if (!$vp || !$vp->isEnabled()) {
            $output->writeln(sprintf('<comment>Not active</comment> %s in context #%d', $identifier, $contextId));
            return Command::SUCCESS;
        }

        $vp->setEnabled(false);
        $this->em->flush();

        $stats = $this->importer->remove($identifier, $context);
        $parts = [];
        foreach (['manufacturers', 'models', 'commands', 'rules', 'ranges', 'shapeLibraries', 'reports', 'schemas', 'themes', 'policies', 'complianceRules', 'folders'] as $k) {
            if (($stats[$k] ?? 0) > 0) $parts[] = sprintf('%d %s', $stats[$k], $k);
        }
        $output->writeln(sprintf(
            '<info>Deactivated</info> %s in context "%s" (#%d) — removed: %s',
            $identifier, $context->getName(), $context->getId(),
            $parts === [] ? '(no assets)' : implode(', ', $parts),
        ));

        return Command::SUCCESS;
    }
}
