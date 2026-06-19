<?php

namespace App\Controller\Api;

use App\Entity\Context;
use App\Entity\TopologyFolder;
use App\Security\Voter\ContextAccessVoter;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/api/topology-folders')]
class TopologyFolderController extends AbstractController
{
    #[Route('', methods: ['POST'])]
    public function create(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $data = json_decode($request->getContent(), true) ?? [];
        $contextId = $request->query->getInt('context');
        $context = $contextId ? $em->getRepository(Context::class)->find($contextId) : null;
        if (!$context) {
            return $this->json(['error' => 'Context is required'], Response::HTTP_BAD_REQUEST);
        }
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $context);

        $name = trim((string)($data['name'] ?? ''));
        if ($name === '') {
            return $this->json(['error' => 'Name is required'], Response::HTTP_BAD_REQUEST);
        }

        $parent = null;
        if (!empty($data['parentId'])) {
            $parent = $em->getRepository(TopologyFolder::class)->find($data['parentId']);
            if ($parent && $parent->getContext()->getId() !== $context->getId()) {
                $parent = null;
            }
        }

        $folder = new TopologyFolder();
        $folder->setName($name);
        $folder->setParent($parent);
        $folder->setContext($context);

        $em->persist($folder);
        $em->flush();

        return $this->json([
            'id' => $folder->getId(),
            'name' => $folder->getName(),
            'parentId' => $parent?->getId(),
        ], Response::HTTP_CREATED);
    }

    #[Route('/{id}', methods: ['PUT'], requirements: ['id' => '\d+'])]
    public function update(TopologyFolder $folder, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $folder->getContext());
        $data = json_decode($request->getContent(), true) ?? [];

        if (isset($data['name'])) {
            $name = trim((string)$data['name']);
            if ($name === '') {
                return $this->json(['error' => 'Name cannot be empty'], Response::HTTP_BAD_REQUEST);
            }
            $folder->setName($name);
        }

        // Reparent (move) — guard against cycles and cross-context moves.
        if (array_key_exists('parentId', $data)) {
            $parent = null;
            if (!empty($data['parentId'])) {
                $parent = $em->getRepository(TopologyFolder::class)->find($data['parentId']);
                if (!$parent || $parent->getContext()->getId() !== $folder->getContext()->getId()) {
                    return $this->json(['error' => 'Invalid parent folder'], Response::HTTP_BAD_REQUEST);
                }
                if ($this->wouldCreateCycle($folder, $parent)) {
                    return $this->json(['error' => 'Cannot move a folder into itself or one of its descendants'], Response::HTTP_BAD_REQUEST);
                }
            }
            $folder->setParent($parent);
        }

        $em->flush();

        return $this->json([
            'id' => $folder->getId(),
            'name' => $folder->getName(),
            'parentId' => $folder->getParent()?->getId(),
        ]);
    }

    #[Route('/{id}', methods: ['DELETE'], requirements: ['id' => '\d+'])]
    public function delete(TopologyFolder $folder, EntityManagerInterface $em): JsonResponse
    {
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $folder->getContext());

        // Subfolders cascade (DB onDelete CASCADE); topologies are detached to
        // root (Topology.folder onDelete SET NULL), so no schema is lost.
        $em->remove($folder);
        $em->flush();

        return $this->json(null, Response::HTTP_NO_CONTENT);
    }

    /** True if making $parent the parent of $folder would create a cycle. */
    private function wouldCreateCycle(TopologyFolder $folder, TopologyFolder $parent): bool
    {
        $cursor = $parent;
        while ($cursor !== null) {
            if ($cursor->getId() === $folder->getId()) {
                return true;
            }
            $cursor = $cursor->getParent();
        }
        return false;
    }
}
