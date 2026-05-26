<?php

namespace App\Service;

use App\Entity\Context;
use App\Entity\Node;
use App\Entity\NodeDynamicTag;
use App\Entity\NodeTag;
use Doctrine\ORM\EntityManagerInterface;

/**
 * Resolves the effective tag set for a Node by combining manual tags
 * (Node ↔ NodeTag) and dynamic tags applied by collection rules
 * (NodeDynamicTag). Centralizes the logic so every consumer (report blocks,
 * auto-selection rules, scope filters, chart dimensions, ...) sees both
 * sources, mirroring Schedule::resolveNodeIds.
 */
class NodeTagResolver
{
    public function __construct(
        private readonly EntityManagerInterface $em,
    ) {}

    /**
     * Return manual + dynamic tag ids carried by $node, deduplicated.
     *
     * @return int[]
     */
    public function getTagIdsForNode(Node $node): array
    {
        $ids = [];
        foreach ($node->getTags() as $tag) {
            $ids[(int) $tag->getId()] = true;
        }
        $dynamic = $this->em->getRepository(NodeDynamicTag::class)->findBy(['node' => $node]);
        foreach ($dynamic as $d) {
            $ids[(int) $d->getTag()->getId()] = true;
        }
        return array_keys($ids);
    }

    /**
     * Return NodeTag entities carried by $node (manual + dynamic), deduplicated by id.
     *
     * @return NodeTag[]
     */
    public function getTagsForNode(Node $node): array
    {
        $byId = [];
        foreach ($node->getTags() as $tag) {
            $byId[(int) $tag->getId()] = $tag;
        }
        $dynamic = $this->em->getRepository(NodeDynamicTag::class)->findBy(['node' => $node]);
        foreach ($dynamic as $d) {
            $tag = $d->getTag();
            $byId[(int) $tag->getId()] = $tag;
        }
        return array_values($byId);
    }

    /**
     * Does $node carry any of $tagIds (manual or dynamic)?
     *
     * @param int[] $tagIds
     */
    public function nodeHasAnyTag(Node $node, array $tagIds): bool
    {
        if (empty($tagIds)) return false;
        $tagIds = array_map('intval', $tagIds);
        foreach ($node->getTags() as $tag) {
            if (in_array((int) $tag->getId(), $tagIds, true)) return true;
        }
        $count = (int) $this->em->createQueryBuilder()
            ->select('COUNT(d.id)')
            ->from(NodeDynamicTag::class, 'd')
            ->where('d.node = :n')
            ->andWhere('d.tag IN (:tagIds)')
            ->setParameter('n', $node)
            ->setParameter('tagIds', $tagIds)
            ->getQuery()
            ->getSingleScalarResult();
        return $count > 0;
    }

    /**
     * Return the ids of nodes in $context carrying any of $tagIds (manual or dynamic).
     *
     * @param int[] $tagIds
     * @return int[]
     */
    public function getNodeIdsWithAnyTag(Context $context, array $tagIds): array
    {
        if (empty($tagIds)) return [];
        $tagIds = array_values(array_unique(array_map('intval', $tagIds)));

        $manual = $this->em->createQuery(
            'SELECT DISTINCT n.id FROM App\Entity\Node n JOIN n.tags t WHERE n.context = :ctx AND t.id IN (:tagIds)'
        )->setParameters(['ctx' => $context, 'tagIds' => $tagIds])->getArrayResult();

        $dynamic = $this->em->createQuery(
            'SELECT DISTINCT IDENTITY(d.node) AS id FROM App\Entity\NodeDynamicTag d JOIN d.node n WHERE n.context = :ctx AND d.tag IN (:tagIds)'
        )->setParameters(['ctx' => $context, 'tagIds' => $tagIds])->getArrayResult();

        $ids = [];
        foreach ($manual as $r) $ids[(int) $r['id']] = true;
        foreach ($dynamic as $r) $ids[(int) $r['id']] = true;
        return array_keys($ids);
    }

    /**
     * Return Node entities in $context carrying any of $tagIds (manual or dynamic).
     *
     * @param int[] $tagIds
     * @return Node[]
     */
    public function getNodesWithAnyTag(Context $context, array $tagIds): array
    {
        $ids = $this->getNodeIdsWithAnyTag($context, $tagIds);
        if (empty($ids)) return [];
        return $this->em->getRepository(Node::class)->findBy(['context' => $context, 'id' => $ids]);
    }
}
