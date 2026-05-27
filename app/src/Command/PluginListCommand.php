<?php

namespace App\Command;

use App\Plugin\Capability\ProvidesCommands;
use App\Plugin\Capability\ProvidesConfigurationSchema;
use App\Plugin\Capability\ProvidesDeviceModels;
use App\Plugin\Capability\ProvidesExtractionRules;
use App\Plugin\Capability\ProvidesLifecycleData;
use App\Plugin\Capability\ProvidesManufacturers;
use App\Plugin\VendorPluginInterface;
use App\Plugin\VendorPluginRegistry;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Helper\Table;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;

#[AsCommand(
    name: 'app:plugin:list',
    description: 'List all Vendor Plugins currently loaded (static + dynamic).',
)]
class PluginListCommand extends Command
{
    public function __construct(private readonly VendorPluginRegistry $registry)
    {
        parent::__construct();
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $plugins = $this->registry->all();
        if ($plugins === []) {
            $output->writeln('<comment>No plugin loaded.</comment>');
            return Command::SUCCESS;
        }

        $table = new Table($output);
        $table->setHeaders(['Identifier', 'Version', 'Name', 'Capabilities', 'Class']);
        foreach ($plugins as $plugin) {
            $table->addRow([
                $plugin->getIdentifier(),
                $plugin->getVersion(),
                $plugin->getDisplayName(),
                implode(', ', $this->capabilities($plugin)),
                $plugin::class,
            ]);
        }
        $table->render();

        return Command::SUCCESS;
    }

    /**
     * @return string[]
     */
    private function capabilities(VendorPluginInterface $plugin): array
    {
        $caps = [];
        if ($plugin instanceof ProvidesManufacturers)       $caps[] = 'manufacturers';
        if ($plugin instanceof ProvidesDeviceModels)        $caps[] = 'models';
        if ($plugin instanceof ProvidesLifecycleData)       $caps[] = 'lifecycle';
        if ($plugin instanceof ProvidesCommands)            $caps[] = 'commands';
        if ($plugin instanceof ProvidesExtractionRules)     $caps[] = 'rules';
        if ($plugin instanceof ProvidesConfigurationSchema) $caps[] = 'configuration';
        return $caps;
    }
}
