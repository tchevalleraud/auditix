<?php

namespace App\Controller\Api;

use App\Entity\DeviceModel;
use App\Entity\MonitoringOid;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/api/monitoring-oids')]
class MonitoringOidController extends AbstractController
{
    private function serialize(MonitoringOid $o): array
    {
        return [
            'id' => $o->getId(),
            'category' => $o->getCategory(),
            'oid' => $o->getOid(),
            'enabled' => $o->isEnabled(),
            'createdAt' => $o->getCreatedAt()->format('c'),
        ];
    }

    #[Route('/by-model/{id}', methods: ['GET'])]
    public function byModel(DeviceModel $model, EntityManagerInterface $em): JsonResponse
    {
        $oids = $em->getRepository(MonitoringOid::class)->findBy(
            ['deviceModel' => $model],
            ['category' => 'ASC']
        );

        return $this->json(array_map($this->serialize(...), $oids));
    }

    #[Route('/by-model/{id}', methods: ['PUT'])]
    public function save(DeviceModel $model, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $data = json_decode($request->getContent(), true);
        $items = $data['items'] ?? [];

        // Remove existing OIDs for this model
        $existing = $em->getRepository(MonitoringOid::class)->findBy(['deviceModel' => $model]);
        foreach ($existing as $e) {
            $em->remove($e);
        }
        $em->flush();

        // Create new OIDs
        foreach ($items as $item) {
            $category = $item['category'] ?? '';
            $oid = trim($item['oid'] ?? '');
            $enabled = $item['enabled'] ?? false;

            if (!in_array($category, MonitoringOid::CATEGORIES, true)) {
                continue;
            }

            if (empty($oid)) {
                continue;
            }

            $entity = new MonitoringOid();
            $entity->setDeviceModel($model);
            $entity->setCategory($category);
            $entity->setOid($oid);
            $entity->setEnabled($enabled);
            $em->persist($entity);
        }

        $em->flush();

        // Return updated list
        $oids = $em->getRepository(MonitoringOid::class)->findBy(
            ['deviceModel' => $model],
            ['category' => 'ASC']
        );

        return $this->json(array_map($this->serialize(...), $oids));
    }
}
