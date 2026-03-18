<?php

namespace App\Command;

use App\Entity\Context;
use App\Entity\MonitoringOid;
use App\Entity\Node;
use App\Message\PingNodeMessage;
use App\Message\SnmpPollNodeMessage;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Messenger\MessageBusInterface;

#[AsCommand(
    name: 'app:monitoring:scheduler',
    description: 'Dispatches ping and SNMP poll messages respecting per-context intervals',
)]
class MonitoringSchedulerCommand extends Command
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly MessageBusInterface $bus,
    ) {
        parent::__construct();
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $output->writeln('Monitoring scheduler started.');

        // Track last dispatch time per context: contextId => ['ping' => timestamp, 'snmp' => timestamp]
        $lastDispatch = [];

        while (true) {
            $this->em->clear();

            $now = time();
            $contexts = $this->em->getRepository(Context::class)->findBy(['monitoringEnabled' => true]);

            $dispatched = 0;
            $snmpDispatched = 0;

            foreach ($contexts as $context) {
                $ctxId = $context->getId();
                $snmpInterval = $context->getSnmpPollIntervalSeconds();
                $icmpInterval = $context->getIcmpPollIntervalSeconds();

                if (!isset($lastDispatch[$ctxId])) {
                    $lastDispatch[$ctxId] = ['ping' => 0, 'snmp' => 0];
                }

                $nodes = $this->em->getRepository(Node::class)->findBy(['context' => $context]);

                // ICMP ping: per-context configurable interval
                $doPing = ($now - $lastDispatch[$ctxId]['ping']) >= $icmpInterval;
                // SNMP poll: per-context configurable interval
                $doSnmp = ($now - $lastDispatch[$ctxId]['snmp']) >= $snmpInterval;

                foreach ($nodes as $node) {
                    if ($doPing) {
                        $this->bus->dispatch(new PingNodeMessage($node->getId()));
                        $dispatched++;
                    }

                    if ($doSnmp) {
                        $model = $node->getModel();
                        if ($model && $node->getProfile()?->getSnmpCredential()) {
                            $hasOids = $this->em->getRepository(MonitoringOid::class)->count([
                                'deviceModel' => $model,
                                'enabled' => true,
                            ]);
                            if ($hasOids > 0) {
                                $this->bus->dispatch(new SnmpPollNodeMessage($node->getId()));
                                $snmpDispatched++;
                            }
                        }
                    }
                }

                if ($doPing) {
                    $lastDispatch[$ctxId]['ping'] = $now;
                }
                if ($doSnmp) {
                    $lastDispatch[$ctxId]['snmp'] = $now;
                }
            }

            // Clean up removed contexts
            $activeIds = array_map(fn(Context $c) => $c->getId(), $contexts);
            foreach (array_keys($lastDispatch) as $id) {
                if (!in_array($id, $activeIds, true)) {
                    unset($lastDispatch[$id]);
                }
            }

            if ($dispatched > 0 || $snmpDispatched > 0) {
                $output->writeln(sprintf('[%s] Dispatched %d ping(s), %d SNMP poll(s).', date('Y-m-d H:i:s'), $dispatched, $snmpDispatched));
            }

            sleep(5);
        }
    }
}
