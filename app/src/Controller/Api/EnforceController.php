<?php

namespace App\Controller\Api;

use App\Entity\EnforceResult;
use App\Entity\Node;
use App\Message\EnforceNodeMessage;
use App\Security\Voter\ContextAccessVoter;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Messenger\MessageBusInterface;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/api/enforce')]
class EnforceController extends AbstractController
{
    public function __construct(
        private readonly MessageBusInterface $bus,
    ) {}

    #[Route('/run', methods: ['POST'])]
    public function run(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $data = json_decode($request->getContent(), true);
        $nodeIds = $data['nodeIds'] ?? [];

        if (empty($nodeIds)) {
            return $this->json(['error' => 'No nodes specified'], Response::HTTP_BAD_REQUEST);
        }

        $nodes = $em->getRepository(Node::class)->findBy(['id' => $nodeIds]);
        $dispatched = 0;
        $skipped = 0;

        foreach ($nodes as $node) {
            $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $node);

            if ($node->getPolicy() !== 'enforce') {
                $skipped++;
                continue;
            }
            if ($node->getEnforcing() !== null) {
                $skipped++;
                continue;
            }

            $node->setEnforcing('pending');
            $em->flush();

            $this->bus->dispatch(new EnforceNodeMessage($node->getId()));
            $dispatched++;
        }

        return $this->json([
            'dispatched' => $dispatched,
            'skipped' => $skipped,
        ]);
    }
}
