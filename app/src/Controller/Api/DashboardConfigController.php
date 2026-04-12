<?php

namespace App\Controller\Api;

use App\Entity\Context;
use App\Entity\UserDashboard;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/api/dashboard-config')]
class DashboardConfigController extends AbstractController
{
    #[Route('', methods: ['GET'])]
    public function index(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $user = $this->getUser();
        $contextId = $request->query->get('context');

        if (!$user || !$contextId) {
            return $this->json(['widgets' => null]);
        }

        $context = $em->getRepository(Context::class)->find($contextId);
        if (!$context) {
            return $this->json(['widgets' => null]);
        }

        $config = $em->getRepository(UserDashboard::class)->findOneBy([
            'user' => $user,
            'context' => $context,
        ]);

        return $this->json([
            'widgets' => $config?->getWidgets(),
        ]);
    }

    #[Route('', methods: ['PUT'])]
    public function save(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $user = $this->getUser();
        $contextId = $request->query->get('context');
        $data = json_decode($request->getContent(), true);

        if (!$user || !$contextId) {
            return $this->json(['error' => 'Missing user or context'], Response::HTTP_BAD_REQUEST);
        }

        $context = $em->getRepository(Context::class)->find($contextId);
        if (!$context) {
            return $this->json(['error' => 'Context not found'], Response::HTTP_NOT_FOUND);
        }

        $config = $em->getRepository(UserDashboard::class)->findOneBy([
            'user' => $user,
            'context' => $context,
        ]);

        if (!$config) {
            $config = new UserDashboard();
            $config->setUser($user);
            $config->setContext($context);
            $em->persist($config);
        }

        $config->setWidgets($data['widgets'] ?? []);
        $em->flush();

        return $this->json(['success' => true]);
    }
}
