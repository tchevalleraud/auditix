<?php

namespace App\Controller\Api;

use App\Entity\CollectionFolder;
use App\Entity\CollectionRuleFolder;
use App\Entity\Context;
use App\Entity\Editor;

use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\String\Slugger\SluggerInterface;

#[Route('/api/manufacturers')]
class EditorController extends AbstractController
{
    private function serialize(Editor $e): array
    {
        return [
            'id' => $e->getId(),
            'name' => $e->getName(),
            'description' => $e->getDescription(),
            'logo' => $e->getLogo() ? '/api/logos/' . $e->getLogo() : null,
            'createdAt' => $e->getCreatedAt()->format('c'),
        ];
    }

    #[Route('', methods: ['GET'])]
    public function index(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $contextId = $request->query->getInt('context');
        if (!$contextId) {
            return $this->json([]);
        }

        $editors = $em->getRepository(Editor::class)->findBy(
            ['context' => $contextId],
            ['name' => 'ASC']
        );

        return $this->json(array_map($this->serialize(...), $editors));
    }

    #[Route('', methods: ['POST'])]
    public function create(
        Request $request,
        EntityManagerInterface $em,
        SluggerInterface $slugger,
    ): JsonResponse {
        $contextId = $request->query->getInt('context');
        $context = $contextId ? $em->getRepository(Context::class)->find($contextId) : null;
        if (!$context) {
            return $this->json(['error' => 'Context is required'], Response::HTTP_BAD_REQUEST);
        }

        $name = $request->request->get('name');

        if (empty($name)) {
            return $this->json(['error' => 'Name is required'], Response::HTTP_BAD_REQUEST);
        }

        $editor = new Editor();
        $editor->setName($name);
        $editor->setDescription($request->request->get('description') ?: null);
        $editor->setContext($context);

        $file = $request->files->get('logo');
        if ($file) {
            $filename = $this->handleLogoUpload($file, $slugger);
            if ($filename === null) {
                return $this->json(['error' => 'Invalid file type. Allowed: JPEG, PNG, WebP, SVG'], Response::HTTP_BAD_REQUEST);
            }
            $editor->setLogo($filename);
        }

        $em->persist($editor);

        // Auto-create collection folder for this manufacturer
        $folder = new CollectionFolder();
        $folder->setName($name);
        $folder->setType(CollectionFolder::TYPE_MANUFACTURER);
        $folder->setManufacturer($editor);
        $folder->setContext($context);
        $em->persist($folder);

        // Auto-create collection rule folder for this manufacturer
        $ruleFolder = new CollectionRuleFolder();
        $ruleFolder->setName($name);
        $ruleFolder->setType(CollectionRuleFolder::TYPE_MANUFACTURER);
        $ruleFolder->setManufacturer($editor);
        $ruleFolder->setContext($context);
        $em->persist($ruleFolder);

        $em->flush();

        return $this->json($this->serialize($editor), Response::HTTP_CREATED);
    }

    #[Route('/{id}', methods: ['POST'])]
    public function update(
        Editor $editor,
        Request $request,
        EntityManagerInterface $em,
        SluggerInterface $slugger,
    ): JsonResponse {
        $name = $request->request->get('name');

        if (empty($name)) {
            return $this->json(['error' => 'Name is required'], Response::HTTP_BAD_REQUEST);
        }

        $editor->setName($name);
        $editor->setDescription($request->request->get('description') ?: null);

        $file = $request->files->get('logo');
        if ($file) {
            $this->deleteLogoFile($editor);
            $filename = $this->handleLogoUpload($file, $slugger);
            if ($filename === null) {
                return $this->json(['error' => 'Invalid file type. Allowed: JPEG, PNG, WebP, SVG'], Response::HTTP_BAD_REQUEST);
            }
            $editor->setLogo($filename);
        }

        if ($request->request->get('removeLogo') === '1' && !$file) {
            $this->deleteLogoFile($editor);
            $editor->setLogo(null);
        }

        // Sync collection folder name
        $folder = $em->getRepository(CollectionFolder::class)->findOneBy([
            'manufacturer' => $editor,
            'type' => CollectionFolder::TYPE_MANUFACTURER,
        ]);
        if ($folder) {
            $folder->setName($name);
        }

        // Sync collection rule folder name
        $ruleFolder = $em->getRepository(CollectionRuleFolder::class)->findOneBy([
            'manufacturer' => $editor,
            'type' => CollectionRuleFolder::TYPE_MANUFACTURER,
        ]);
        if ($ruleFolder) {
            $ruleFolder->setName($name);
        }

        $em->flush();

        return $this->json($this->serialize($editor));
    }

    #[Route('/{id}', methods: ['DELETE'])]
    public function delete(Editor $editor, EntityManagerInterface $em): JsonResponse
    {
        $this->deleteLogoFile($editor);

        $em->remove($editor);
        $em->flush();

        return $this->json(null, Response::HTTP_NO_CONTENT);
    }

    private function handleLogoUpload($file, SluggerInterface $slugger): ?string
    {
        $allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];
        if (!in_array($file->getMimeType(), $allowedMimes, true)) {
            return null;
        }

        $uploadDir = $this->getParameter('kernel.project_dir') . '/var/uploads/logos';
        $extension = $file->guessExtension() ?? 'png';
        $filename = $slugger->slug(pathinfo($file->getClientOriginalName(), PATHINFO_FILENAME)) . '-' . uniqid() . '.' . $extension;

        $file->move($uploadDir, $filename);

        return $filename;
    }

    private function deleteLogoFile(Editor $editor): void
    {
        if ($editor->getLogo()) {
            $path = $this->getParameter('kernel.project_dir') . '/var/uploads/logos/' . $editor->getLogo();
            if (file_exists($path)) {
                unlink($path);
            }
        }
    }
}
