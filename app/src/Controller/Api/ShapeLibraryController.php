<?php

namespace App\Controller\Api;

use App\Entity\Context;
use App\Entity\ShapeLibrary;
use App\Entity\ShapeLibraryItem;
use App\Security\Voter\ContextAccessVoter;
use App\Service\ShapeLibraryItemFactory;
use App\Service\Stencil\StencilImporter;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/api/shape-libraries')]
class ShapeLibraryController extends AbstractController
{
    private function serializeItem(ShapeLibraryItem $i): array
    {
        return [
            'id' => $i->getId(),
            'name' => $i->getName(),
            'keywords' => $i->getKeywords(),
            'payload' => $i->getPayload(),
            'width' => $i->getWidth(),
            'height' => $i->getHeight(),
            'previewSvg' => $i->getPreviewSvg(),
            'position' => $i->getPosition(),
        ];
    }

    private function serialize(ShapeLibrary $l): array
    {
        return [
            'id' => $l->getId(),
            'name' => $l->getName(),
            'description' => $l->getDescription(),
            'managedByPlugin' => $l->getManagedByPlugin(),
            'position' => $l->getPosition(),
            'items' => array_map($this->serializeItem(...), $l->getItems()->toArray()),
            'createdAt' => $l->getCreatedAt()->format(\DateTimeInterface::ATOM),
            'updatedAt' => $l->getUpdatedAt()->format(\DateTimeInterface::ATOM),
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

    private function denyIfManaged(ShapeLibrary $library): ?JsonResponse
    {
        if ($library->isManagedByPlugin()) {
            return $this->json([
                'error' => sprintf('This library is managed by the "%s" plugin. Disable the plugin to modify it.', $library->getManagedByPlugin()),
            ], Response::HTTP_FORBIDDEN);
        }
        return null;
    }

    #[Route('', methods: ['GET'])]
    public function index(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $context = $this->resolveContext($request, $em);
        if (!$context) {
            return $this->json(['error' => 'Context is required'], Response::HTTP_BAD_REQUEST);
        }
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $context);

        $libraries = $em->getRepository(ShapeLibrary::class)->findBy(
            ['context' => $context],
            ['position' => 'ASC', 'name' => 'ASC']
        );

        return $this->json(array_map($this->serialize(...), $libraries));
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

        $library = new ShapeLibrary();
        $library->setContext($context);
        $library->setName($name);
        if (array_key_exists('description', $data)) {
            $library->setDescription($data['description'] !== null ? (string)$data['description'] : null);
        }

        $em->persist($library);
        $em->flush();

        return $this->json($this->serialize($library), Response::HTTP_CREATED);
    }

    #[Route('/{id}', methods: ['PUT'], requirements: ['id' => '\d+'])]
    public function update(int $id, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $library = $em->getRepository(ShapeLibrary::class)->find($id);
        if (!$library) {
            return $this->json(['error' => 'Shape library not found'], Response::HTTP_NOT_FOUND);
        }
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $library);
        if ($resp = $this->denyIfManaged($library)) {
            return $resp;
        }

        $data = json_decode($request->getContent(), true) ?? [];
        if (array_key_exists('name', $data)) {
            $name = trim((string)$data['name']);
            if ($name === '') {
                return $this->json(['error' => 'Name cannot be empty'], Response::HTTP_BAD_REQUEST);
            }
            $library->setName($name);
        }
        if (array_key_exists('description', $data)) {
            $library->setDescription($data['description'] !== null ? (string)$data['description'] : null);
        }
        if (array_key_exists('position', $data) && is_numeric($data['position'])) {
            $library->setPosition((int)$data['position']);
        }

        $em->flush();
        return $this->json($this->serialize($library));
    }

    #[Route('/{id}', methods: ['DELETE'], requirements: ['id' => '\d+'])]
    public function delete(int $id, EntityManagerInterface $em): JsonResponse
    {
        $library = $em->getRepository(ShapeLibrary::class)->find($id);
        if (!$library) {
            return $this->json(['error' => 'Shape library not found'], Response::HTTP_NOT_FOUND);
        }
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $library);
        if ($resp = $this->denyIfManaged($library)) {
            return $resp;
        }

        $em->remove($library);
        $em->flush();
        return $this->json(null, Response::HTTP_NO_CONTENT);
    }

    #[Route('/{id}/items', methods: ['POST'], requirements: ['id' => '\d+'])]
    public function createItem(int $id, Request $request, EntityManagerInterface $em, ShapeLibraryItemFactory $factory): JsonResponse
    {
        $library = $em->getRepository(ShapeLibrary::class)->find($id);
        if (!$library) {
            return $this->json(['error' => 'Shape library not found'], Response::HTTP_NOT_FOUND);
        }
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $library);
        if ($resp = $this->denyIfManaged($library)) {
            return $resp;
        }

        $data = json_decode($request->getContent(), true) ?? [];
        $payload = $data['payload'] ?? null;
        if (!is_array($payload) || $payload === []) {
            return $this->json(['error' => 'A non-empty payload (array of elements) is required'], Response::HTTP_BAD_REQUEST);
        }
        $name = trim((string)($data['name'] ?? ''));
        $width = isset($data['width']) && is_numeric($data['width']) ? (float)$data['width'] : 0.0;
        $height = isset($data['height']) && is_numeric($data['height']) ? (float)$data['height'] : 0.0;
        $keywords = isset($data['keywords']) ? trim((string)$data['keywords']) : null;

        $item = $factory->build($name, $keywords, array_values($payload), $width, $height);
        $item->setPosition($library->getItems()->count());
        $library->addItem($item);

        $em->persist($item);
        $em->flush();

        return $this->json($this->serializeItem($item), Response::HTTP_CREATED);
    }

    #[Route('/{id}/items/upload', methods: ['POST'], requirements: ['id' => '\d+'])]
    public function uploadItem(int $id, Request $request, EntityManagerInterface $em, ShapeLibraryItemFactory $factory): JsonResponse
    {
        $library = $em->getRepository(ShapeLibrary::class)->find($id);
        if (!$library) {
            return $this->json(['error' => 'Shape library not found'], Response::HTTP_NOT_FOUND);
        }
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $library);
        if ($resp = $this->denyIfManaged($library)) {
            return $resp;
        }

        $file = $request->files->get('image');
        if (!$file) {
            return $this->json(['error' => 'No file uploaded'], Response::HTTP_BAD_REQUEST);
        }
        $allowed = ['image/jpeg', 'image/jpg', 'image/pjpeg', 'image/png', 'image/webp', 'image/svg+xml'];
        $mime = $file->getMimeType() ?? '';
        if (!in_array($mime, $allowed, true)) {
            return $this->json(['error' => 'Invalid file type. Allowed: JPEG, PNG, WebP, SVG'], Response::HTTP_BAD_REQUEST);
        }
        if ($file->getSize() > 5 * 1024 * 1024) {
            return $this->json(['error' => 'File too large. Max 5MB'], Response::HTTP_BAD_REQUEST);
        }

        $bytes = file_get_contents($file->getPathname());
        if ($bytes === false) {
            return $this->json(['error' => 'Could not read uploaded file'], Response::HTTP_BAD_REQUEST);
        }
        [$w, $h] = $this->imageDimensions($bytes, $mime);
        $dataUrl = 'data:' . $mime . ';base64,' . base64_encode($bytes);

        $name = trim((string)$request->request->get('name', ''));
        if ($name === '') {
            $name = pathinfo($file->getClientOriginalName(), PATHINFO_FILENAME) ?: 'Forme';
        }

        $payload = $factory->imagePayload($dataUrl, $w, $h);
        $item = $factory->build($name, null, $payload, $w, $h);
        $item->setPosition($library->getItems()->count());
        $library->addItem($item);

        $em->persist($item);
        $em->flush();

        return $this->json($this->serializeItem($item), Response::HTTP_CREATED);
    }

    #[Route('/import', methods: ['POST'])]
    public function import(Request $request, EntityManagerInterface $em, StencilImporter $importer, ShapeLibraryItemFactory $factory): JsonResponse
    {
        $context = $this->resolveContext($request, $em);
        if (!$context) {
            return $this->json(['error' => 'Context is required'], Response::HTTP_BAD_REQUEST);
        }
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $context);

        $file = $request->files->get('file');
        if (!$file) {
            return $this->json(['error' => 'No file uploaded'], Response::HTTP_BAD_REQUEST);
        }
        if ($file->getSize() > 20 * 1024 * 1024) {
            return $this->json(['error' => 'File too large. Max 20MB'], Response::HTTP_BAD_REQUEST);
        }

        $originalName = $file->getClientOriginalName();
        try {
            $specs = $importer->import($file->getPathname(), $originalName, $file->getMimeType() ?? '');
        } catch (\Throwable $e) {
            return $this->json(['error' => $e->getMessage()], Response::HTTP_BAD_REQUEST);
        }
        if ($specs === []) {
            return $this->json(['error' => 'No shapes found in the file'], Response::HTTP_BAD_REQUEST);
        }

        $library = new ShapeLibrary();
        $library->setContext($context);
        $library->setName($importer->libraryNameFor($originalName));
        $em->persist($library);

        $position = 0;
        foreach ($specs as $spec) {
            $payload = $factory->imagePayload($spec->dataUrl, $spec->width, $spec->height);
            $item = new ShapeLibraryItem();
            $item->setName($spec->name !== '' ? $spec->name : 'Forme');
            $item->setKeywords($spec->keywords);
            $item->setPayload($payload);
            $item->setWidth($spec->width);
            $item->setHeight($spec->height);
            $item->setPreviewSvg($spec->previewSvg);
            $item->setPosition($position++);
            $library->addItem($item);
            $em->persist($item);
        }

        $em->flush();
        return $this->json($this->serialize($library), Response::HTTP_CREATED);
    }

    #[Route('/{id}/items/{itemId}', methods: ['PUT'], requirements: ['id' => '\d+', 'itemId' => '\d+'])]
    public function updateItem(int $id, int $itemId, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $item = $this->findItem($id, $itemId, $em);
        if (!$item) {
            return $this->json(['error' => 'Shape not found'], Response::HTTP_NOT_FOUND);
        }
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $item->getLibrary());
        if ($resp = $this->denyIfManaged($item->getLibrary())) {
            return $resp;
        }

        $data = json_decode($request->getContent(), true) ?? [];
        if (array_key_exists('name', $data)) {
            $name = trim((string)$data['name']);
            if ($name === '') {
                return $this->json(['error' => 'Name cannot be empty'], Response::HTTP_BAD_REQUEST);
            }
            $item->setName($name);
        }
        if (array_key_exists('keywords', $data)) {
            $kw = trim((string)$data['keywords']);
            $item->setKeywords($kw !== '' ? $kw : null);
        }

        $em->flush();
        return $this->json($this->serializeItem($item));
    }

    #[Route('/{id}/items/{itemId}', methods: ['DELETE'], requirements: ['id' => '\d+', 'itemId' => '\d+'])]
    public function deleteItem(int $id, int $itemId, EntityManagerInterface $em): JsonResponse
    {
        $item = $this->findItem($id, $itemId, $em);
        if (!$item) {
            return $this->json(['error' => 'Shape not found'], Response::HTTP_NOT_FOUND);
        }
        $this->denyAccessUnlessGranted(ContextAccessVoter::ACCESS, $item->getLibrary());
        if ($resp = $this->denyIfManaged($item->getLibrary())) {
            return $resp;
        }

        $em->remove($item);
        $em->flush();
        return $this->json(null, Response::HTTP_NO_CONTENT);
    }

    private function findItem(int $libraryId, int $itemId, EntityManagerInterface $em): ?ShapeLibraryItem
    {
        $item = $em->getRepository(ShapeLibraryItem::class)->find($itemId);
        if (!$item || $item->getLibrary()->getId() !== $libraryId) {
            return null;
        }
        return $item;
    }

    /**
     * @return array{0: float, 1: float} natural dimensions in px
     */
    private function imageDimensions(string $bytes, string $mime): array
    {
        if ($mime === 'image/svg+xml') {
            if (preg_match('/viewBox\s*=\s*"[\d.\-]+\s+[\d.\-]+\s+([\d.]+)\s+([\d.]+)"/i', $bytes, $m)) {
                return [max(1.0, (float)$m[1]), max(1.0, (float)$m[2])];
            }
            $w = preg_match('/\bwidth\s*=\s*"([\d.]+)/i', $bytes, $mw) ? (float)$mw[1] : 0.0;
            $h = preg_match('/\bheight\s*=\s*"([\d.]+)/i', $bytes, $mh) ? (float)$mh[1] : 0.0;
            if ($w > 0 && $h > 0) {
                return [$w, $h];
            }
            return [120.0, 120.0];
        }
        $info = @getimagesizefromstring($bytes);
        if ($info && $info[0] > 0 && $info[1] > 0) {
            return [(float)$info[0], (float)$info[1]];
        }
        return [120.0, 120.0];
    }
}
