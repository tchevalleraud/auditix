<?php

namespace App\MessageHandler;

use App\Entity\Node;
use App\Message\RecalculateNodeScoreMessage;
use App\Service\VulnerabilityScoreCalculator;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Mercure\HubInterface;
use Symfony\Component\Mercure\Update;
use Symfony\Component\Messenger\Attribute\AsMessageHandler;

#[AsMessageHandler]
class RecalculateNodeScoreMessageHandler
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly VulnerabilityScoreCalculator $calculator,
        private readonly HubInterface $hub,
    ) {}

    public function __invoke(RecalculateNodeScoreMessage $message): void
    {
        $node = $this->em->getRepository(Node::class)->find($message->getNodeId());
        if (!$node) return;

        $grade = $this->calculator->recalculateNodeScore($node);
        $this->em->flush();

        $payload = json_encode([
            'event' => 'vulnerability.score',
            'nodeId' => $node->getId(),
            'score' => $grade,
            'complianceScore' => $node->getComplianceScore(),
            'vulnerabilityScore' => $node->getVulnerabilityScore(),
            'systemUpdateScore' => $node->getSystemUpdateScore(),
        ]);

        $this->hub->publish(new Update('vulnerability/node/' . $node->getId(), $payload));
        $ctxId = $node->getContext()?->getId();
        if ($ctxId) {
            $this->hub->publish(new Update('nodes/context/' . $ctxId, $payload));
        }
    }
}
