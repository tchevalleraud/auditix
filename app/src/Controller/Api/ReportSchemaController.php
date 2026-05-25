<?php

namespace App\Controller\Api;

use App\Entity\Context;
use App\Entity\Node;
use App\Entity\ReportSchema;
use App\Security\Voter\ContextAccessVoter;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/api/report-schemas')]
class ReportSchemaController extends AbstractController
{
    private function serialize(ReportSchema $s): array
    {
        return [
            'id' => $s->getId(),
            'name' => $s->getName(),
            'description' => $s->getDescription(),
            'viewport' => $s->getViewport(),
            'canvasSize' => $s->getCanvasSize(),
            'gridSize' => $s->getGridSize(),
            'snapToGrid' => $s->getSnapToGrid(),
            'elements' => $s->getElements(),
            'createdAt' => $s->getCreatedAt()->format(\DateTimeInterface::ATOM),
            'updatedAt' => $s->getUpdatedAt()->format(\DateTimeInterface::ATOM),
        ];
    }

    private function resolveContext(Request $request, EntityManagerInterface $em): ?Context
    {
        $contextId = $request->query->getInt('context');
        if (!$contextId) {
            return null;
        }
        return $em->getRepository(Context::class)->find($contextId);
    }

    #[Route('', methods: ['GET'])]
    public function index(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $context = $this->resolveContext($request, $em);
        if (!$context) {
            return $this->json(['error' => 'Context is required'], Response::HTTP_BAD_REQUEST);
        }
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $context);

        $schemas = $em->getRepository(ReportSchema::class)->findBy(
            ['context' => $context],
            ['name' => 'ASC']
        );

        return $this->json(array_map($this->serialize(...), $schemas));
    }

    /**
     * Returns every node of the context together with its latest inventory.
     * Used by the schema editor to render node-cards with real values.
     */
    #[Route('/nodes', methods: ['GET'])]
    public function nodesWithInventory(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $context = $this->resolveContext($request, $em);
        if (!$context) {
            return $this->json(['error' => 'Context is required'], Response::HTTP_BAD_REQUEST);
        }
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $context);

        $nodes = $em->getRepository(Node::class)->findBy(['context' => $context], ['ipAddress' => 'ASC']);
        $nodeIds = array_map(fn(Node $n) => $n->getId(), $nodes);

        $inventoryByNode = [];
        if (!empty($nodeIds)) {
            $rows = $em->createQuery(
                'SELECT IDENTITY(e.node) AS nodeId, e.categoryName, e.entryKey, e.colLabel, e.value
                 FROM App\Entity\NodeInventoryEntry e
                 WHERE e.node IN (:nodes)'
            )->setParameter('nodes', $nodeIds)->getArrayResult();
            foreach ($rows as $row) {
                $inventoryByNode[(int)$row['nodeId']][$row['categoryName']][$row['entryKey']][$row['colLabel']] = $row['value'];
            }
        }

        $out = [];
        foreach ($nodes as $n) {
            $out[] = [
                'id' => $n->getId(),
                'name' => $n->getName(),
                'hostname' => $n->getHostname(),
                'ipAddress' => $n->getIpAddress(),
                'manufacturer' => $n->getManufacturer()?->getName(),
                'model' => $n->getModel()?->getName(),
                'inventory' => $inventoryByNode[$n->getId()] ?? (object) [],
            ];
        }
        return $this->json($out);
    }

    #[Route('', methods: ['POST'])]
    public function create(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $context = $this->resolveContext($request, $em);
        if (!$context) {
            return $this->json(['error' => 'Context is required'], Response::HTTP_BAD_REQUEST);
        }
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $context);

        $data = json_decode($request->getContent(), true) ?? [];
        $name = trim((string)($data['name'] ?? ''));
        if ($name === '') {
            return $this->json(['error' => 'Name is required'], Response::HTTP_BAD_REQUEST);
        }

        $schema = new ReportSchema();
        $schema->setContext($context);
        $schema->setName($name);
        if (array_key_exists('description', $data)) {
            $schema->setDescription($data['description']);
        }
        if (isset($data['elements']) && is_array($data['elements'])) {
            $schema->setElements($data['elements']);
        }
        if (isset($data['viewport']) && is_array($data['viewport'])) {
            $schema->setViewport($data['viewport']);
        }
        if (isset($data['canvasSize']) && is_array($data['canvasSize'])) {
            $schema->setCanvasSize($data['canvasSize']);
        }
        if (isset($data['gridSize']) && is_numeric($data['gridSize'])) {
            $schema->setGridSize((int) $data['gridSize']);
        }
        if (array_key_exists('snapToGrid', $data)) {
            $schema->setSnapToGrid((bool) $data['snapToGrid']);
        }

        $em->persist($schema);
        $em->flush();

        return $this->json($this->serialize($schema), Response::HTTP_CREATED);
    }

    #[Route('/{id}', methods: ['GET'], requirements: ['id' => '\d+'])]
    public function show(int $id, EntityManagerInterface $em): JsonResponse
    {
        $schema = $em->getRepository(ReportSchema::class)->find($id);
        if (!$schema) {
            return $this->json(['error' => 'Report schema not found'], Response::HTTP_NOT_FOUND);
        }
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $schema);

        return $this->json($this->serialize($schema));
    }

    #[Route('/{id}', methods: ['PUT'], requirements: ['id' => '\d+'])]
    public function update(int $id, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $schema = $em->getRepository(ReportSchema::class)->find($id);
        if (!$schema) {
            return $this->json(['error' => 'Report schema not found'], Response::HTTP_NOT_FOUND);
        }
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $schema);

        $data = json_decode($request->getContent(), true) ?? [];

        if (array_key_exists('name', $data)) {
            $name = trim((string)$data['name']);
            if ($name === '') {
                return $this->json(['error' => 'Name cannot be empty'], Response::HTTP_BAD_REQUEST);
            }
            $schema->setName($name);
        }
        if (array_key_exists('description', $data)) {
            $schema->setDescription($data['description']);
        }
        if (array_key_exists('elements', $data)) {
            $schema->setElements(is_array($data['elements']) ? $data['elements'] : []);
        }
        if (array_key_exists('viewport', $data)) {
            $schema->setViewport(is_array($data['viewport']) ? $data['viewport'] : null);
        }
        if (array_key_exists('canvasSize', $data)) {
            $schema->setCanvasSize(is_array($data['canvasSize']) ? $data['canvasSize'] : null);
        }
        if (array_key_exists('gridSize', $data) && is_numeric($data['gridSize'])) {
            $schema->setGridSize((int) $data['gridSize']);
        }
        if (array_key_exists('snapToGrid', $data)) {
            $schema->setSnapToGrid((bool) $data['snapToGrid']);
        }

        $em->flush();
        return $this->json($this->serialize($schema));
    }

    #[Route('/{id}', methods: ['DELETE'], requirements: ['id' => '\d+'])]
    public function delete(int $id, EntityManagerInterface $em): JsonResponse
    {
        $schema = $em->getRepository(ReportSchema::class)->find($id);
        if (!$schema) {
            return $this->json(['error' => 'Report schema not found'], Response::HTTP_NOT_FOUND);
        }
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $schema);

        $em->remove($schema);
        $em->flush();

        return $this->json(null, Response::HTTP_NO_CONTENT);
    }

    /**
     * Export a schema to a self-contained JSON document. Node bindings inside
     * elements are kept as-is — when importing into a different context, the
     * user will need to reassign them.
     */
    #[Route('/{id}/export', methods: ['GET'], requirements: ['id' => '\d+'])]
    public function export(int $id, EntityManagerInterface $em): Response
    {
        $schema = $em->getRepository(ReportSchema::class)->find($id);
        if (!$schema) {
            return $this->json(['error' => 'Report schema not found'], Response::HTTP_NOT_FOUND);
        }
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $schema);

        $payload = [
            'auditixSchema' => true,
            'version' => 1,
            'name' => $schema->getName(),
            'description' => $schema->getDescription(),
            'viewport' => $schema->getViewport(),
            'canvasSize' => $schema->getCanvasSize(),
            'gridSize' => $schema->getGridSize(),
            'snapToGrid' => $schema->getSnapToGrid(),
            'elements' => $schema->getElements(),
            'exportedAt' => (new \DateTimeImmutable())->format(\DateTimeInterface::ATOM),
        ];

        $json = json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $slug = preg_replace('/[^A-Za-z0-9._-]+/', '-', $schema->getName()) ?: 'schema';
        $filename = sprintf('schema-%s.json', trim($slug, '-'));

        $response = new Response($json);
        $response->headers->set('Content-Type', 'application/json; charset=utf-8');
        $response->headers->set('Content-Disposition', 'attachment; filename="' . $filename . '"');
        return $response;
    }

    /**
     * Import a previously-exported schema. Creates a NEW schema record in the
     * target context — never overwrites.
     */
    #[Route('/import', methods: ['POST'])]
    public function import(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $context = $this->resolveContext($request, $em);
        if (!$context) {
            return $this->json(['error' => 'Context is required'], Response::HTTP_BAD_REQUEST);
        }
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $context);

        $data = json_decode($request->getContent(), true);
        if (!is_array($data) || empty($data['auditixSchema'])) {
            return $this->json(['error' => 'Invalid schema export file'], Response::HTTP_BAD_REQUEST);
        }
        $name = trim((string)($data['name'] ?? ''));
        if ($name === '') $name = 'Schema importé';

        $schema = new ReportSchema();
        $schema->setContext($context);
        $schema->setName($name);
        if (array_key_exists('description', $data)) {
            $schema->setDescription($data['description'] !== null ? (string)$data['description'] : null);
        }
        if (isset($data['viewport']) && is_array($data['viewport'])) $schema->setViewport($data['viewport']);
        if (isset($data['canvasSize']) && is_array($data['canvasSize'])) $schema->setCanvasSize($data['canvasSize']);
        if (isset($data['gridSize']) && is_numeric($data['gridSize'])) $schema->setGridSize((int)$data['gridSize']);
        if (array_key_exists('snapToGrid', $data)) $schema->setSnapToGrid((bool)$data['snapToGrid']);
        if (isset($data['elements']) && is_array($data['elements'])) $schema->setElements($data['elements']);

        $em->persist($schema);
        $em->flush();

        return $this->json($this->serialize($schema), Response::HTTP_CREATED);
    }

    #[Route('/{id}/svg', methods: ['GET'], requirements: ['id' => '\d+'])]
    public function svg(int $id, Request $request, EntityManagerInterface $em, \App\Service\ReportSchemaSvgRenderer $renderer): Response
    {
        $schema = $em->getRepository(ReportSchema::class)->find($id);
        if (!$schema) {
            return $this->json(['error' => 'Report schema not found'], Response::HTTP_NOT_FOUND);
        }
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $schema);

        $opts = [
            'canvasWidth' => (int) $request->query->get('width', 1200),
        ];
        $vf = $request->query->get('viewportFrame');
        if (is_string($vf) && $vf !== '') {
            $parts = array_map('floatval', explode(',', $vf));
            if (count($parts) === 4) {
                $opts['viewportFrame'] = ['x' => $parts[0], 'y' => $parts[1], 'width' => $parts[2], 'height' => $parts[3]];
            }
        }
        $svg = $renderer->render($schema, $opts);
        $response = new Response($svg);
        $response->headers->set('Content-Type', 'image/svg+xml');
        return $response;
    }
}
