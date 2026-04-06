<?php

namespace App\Controller\Api;

use App\Entity\CollectionFolder;
use App\Entity\CollectionRuleFolder;
use App\Entity\Context;
use App\Entity\DeviceModel;
use App\Entity\Editor;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/api/models')]
class DeviceModelController extends AbstractController
{
    private function serialize(DeviceModel $m): array
    {
        return [
            'id' => $m->getId(),
            'name' => $m->getName(),
            'description' => $m->getDescription(),
            'manufacturer' => [
                'id' => $m->getManufacturer()?->getId(),
                'name' => $m->getManufacturer()?->getName(),
                'logo' => $m->getManufacturer()?->getLogo() ? '/api/logos/' . $m->getManufacturer()->getLogo() : null,
            ],
            'connectionScript' => $m->getConnectionScript(),
            'sendCtrlChar' => $m->getSendCtrlChar(),
            'createdAt' => $m->getCreatedAt()->format('c'),
        ];
    }

    #[Route('', methods: ['GET'])]
    public function index(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $contextId = $request->query->getInt('context');
        if (!$contextId) {
            return $this->json([]);
        }

        $models = $em->getRepository(DeviceModel::class)->findBy(
            ['context' => $contextId],
            ['name' => 'ASC']
        );

        return $this->json(array_map($this->serialize(...), $models));
    }

    #[Route('', methods: ['POST'])]
    public function create(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $data = json_decode($request->getContent(), true);

        $contextId = $request->query->getInt('context');
        $context = $contextId ? $em->getRepository(Context::class)->find($contextId) : null;
        if (!$context) {
            return $this->json(['error' => 'Context is required'], Response::HTTP_BAD_REQUEST);
        }

        $name = $data['name'] ?? '';
        if (empty($name)) {
            return $this->json(['error' => 'Name is required'], Response::HTTP_BAD_REQUEST);
        }

        $manufacturerId = $data['manufacturerId'] ?? null;
        if (!$manufacturerId) {
            return $this->json(['error' => 'Manufacturer is required'], Response::HTTP_BAD_REQUEST);
        }

        $manufacturer = $em->getRepository(Editor::class)->find($manufacturerId);
        if (!$manufacturer) {
            return $this->json(['error' => 'Manufacturer not found'], Response::HTTP_NOT_FOUND);
        }

        $model = new DeviceModel();
        $model->setName($name);
        $model->setDescription($data['description'] ?? null);
        $model->setConnectionScript($data['connectionScript'] ?? null);
        $model->setSendCtrlChar($data['sendCtrlChar'] ?? null);
        $model->setManufacturer($manufacturer);
        $model->setContext($context);

        $em->persist($model);

        // Auto-create collection folder for this model under manufacturer folder
        $manFolder = $em->getRepository(CollectionFolder::class)->findOneBy([
            'manufacturer' => $manufacturer,
            'type' => CollectionFolder::TYPE_MANUFACTURER,
        ]);

        $modelFolder = new CollectionFolder();
        $modelFolder->setName($name);
        $modelFolder->setType(CollectionFolder::TYPE_MODEL);
        $modelFolder->setModel($model);
        $modelFolder->setManufacturer($manufacturer);
        $modelFolder->setParent($manFolder);
        $modelFolder->setContext($context);
        $em->persist($modelFolder);

        // Auto-create collection rule folder for this model under manufacturer rule folder
        $manRuleFolder = $em->getRepository(CollectionRuleFolder::class)->findOneBy([
            'manufacturer' => $manufacturer,
            'type' => CollectionRuleFolder::TYPE_MANUFACTURER,
        ]);

        $modelRuleFolder = new CollectionRuleFolder();
        $modelRuleFolder->setName($name);
        $modelRuleFolder->setType(CollectionRuleFolder::TYPE_MODEL);
        $modelRuleFolder->setModel($model);
        $modelRuleFolder->setManufacturer($manufacturer);
        $modelRuleFolder->setParent($manRuleFolder);
        $modelRuleFolder->setContext($context);
        $em->persist($modelRuleFolder);

        $em->flush();

        return $this->json($this->serialize($model), Response::HTTP_CREATED);
    }

    #[Route('/{id}', methods: ['GET'])]
    public function show(DeviceModel $model): JsonResponse
    {
        return $this->json($this->serialize($model));
    }

    #[Route('/{id}', methods: ['PUT'])]
    public function update(DeviceModel $model, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $data = json_decode($request->getContent(), true);

        $name = $data['name'] ?? '';
        if (empty($name)) {
            return $this->json(['error' => 'Name is required'], Response::HTTP_BAD_REQUEST);
        }

        $manufacturerId = $data['manufacturerId'] ?? null;
        if (!$manufacturerId) {
            return $this->json(['error' => 'Manufacturer is required'], Response::HTTP_BAD_REQUEST);
        }

        $manufacturer = $em->getRepository(Editor::class)->find($manufacturerId);
        if (!$manufacturer) {
            return $this->json(['error' => 'Manufacturer not found'], Response::HTTP_NOT_FOUND);
        }

        $model->setName($name);
        $model->setDescription($data['description'] ?? null);
        $model->setConnectionScript($data['connectionScript'] ?? null);
        if (array_key_exists('sendCtrlChar', $data)) {
            $model->setSendCtrlChar($data['sendCtrlChar'] ?: null);
        }
        $model->setManufacturer($manufacturer);

        // Sync collection folder name
        $modelFolder = $em->getRepository(CollectionFolder::class)->findOneBy([
            'model' => $model,
            'type' => CollectionFolder::TYPE_MODEL,
        ]);
        if ($modelFolder) {
            $modelFolder->setName($name);
        }

        // Sync collection rule folder name
        $modelRuleFolder = $em->getRepository(CollectionRuleFolder::class)->findOneBy([
            'model' => $model,
            'type' => CollectionRuleFolder::TYPE_MODEL,
        ]);
        if ($modelRuleFolder) {
            $modelRuleFolder->setName($name);
        }

        $em->flush();

        return $this->json($this->serialize($model));
    }

    #[Route('/{id}', methods: ['DELETE'])]
    public function delete(DeviceModel $model, EntityManagerInterface $em): JsonResponse
    {
        $em->remove($model);
        $em->flush();

        return $this->json(null, Response::HTTP_NO_CONTENT);
    }
}
