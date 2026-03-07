<?php

namespace App\Controller\Api;

use App\Entity\CliCredential;
use App\Entity\Context;
use App\Entity\Profile;
use App\Entity\SnmpCredential;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/api/profiles')]
class ProfileController extends AbstractController
{
    private function serialize(Profile $p): array
    {
        $snmp = $p->getSnmpCredential();
        $cli = $p->getCliCredential();

        return [
            'id' => $p->getId(),
            'name' => $p->getName(),
            'snmpCredential' => $snmp ? [
                'id' => $snmp->getId(),
                'name' => $snmp->getName(),
                'version' => $snmp->getVersion(),
            ] : null,
            'cliCredential' => $cli ? [
                'id' => $cli->getId(),
                'name' => $cli->getName(),
                'protocol' => $cli->getProtocol(),
                'port' => $cli->getPort(),
            ] : null,
            'createdAt' => $p->getCreatedAt()->format('c'),
        ];
    }

    #[Route('', methods: ['GET'])]
    public function index(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $contextId = $request->query->getInt('context');
        if (!$contextId) return $this->json([]);

        $profiles = $em->getRepository(Profile::class)->findBy(
            ['context' => $contextId],
            ['name' => 'ASC']
        );

        return $this->json(array_map($this->serialize(...), $profiles));
    }

    #[Route('', methods: ['POST'])]
    public function create(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $data = json_decode($request->getContent(), true);

        $contextId = $request->query->getInt('context');
        $context = $contextId ? $em->getRepository(Context::class)->find($contextId) : null;
        if (!$context) return $this->json(['error' => 'Context is required'], Response::HTTP_BAD_REQUEST);

        $name = $data['name'] ?? '';
        if (empty($name)) return $this->json(['error' => 'Name is required'], Response::HTTP_BAD_REQUEST);

        $profile = new Profile();
        $profile->setContext($context);
        $profile->setName($name);

        if (isset($data['snmpCredentialId'])) {
            $snmp = $em->getRepository(SnmpCredential::class)->find($data['snmpCredentialId']);
            $profile->setSnmpCredential($snmp);
        }
        if (isset($data['cliCredentialId'])) {
            $cli = $em->getRepository(CliCredential::class)->find($data['cliCredentialId']);
            $profile->setCliCredential($cli);
        }

        $em->persist($profile);
        $em->flush();

        return $this->json($this->serialize($profile), Response::HTTP_CREATED);
    }

    #[Route('/{id}', methods: ['PUT'])]
    public function update(Profile $profile, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $data = json_decode($request->getContent(), true);

        $name = $data['name'] ?? '';
        if (empty($name)) return $this->json(['error' => 'Name is required'], Response::HTTP_BAD_REQUEST);

        $profile->setName($name);

        if (array_key_exists('snmpCredentialId', $data)) {
            $snmp = $data['snmpCredentialId'] ? $em->getRepository(SnmpCredential::class)->find($data['snmpCredentialId']) : null;
            $profile->setSnmpCredential($snmp);
        }
        if (array_key_exists('cliCredentialId', $data)) {
            $cli = $data['cliCredentialId'] ? $em->getRepository(CliCredential::class)->find($data['cliCredentialId']) : null;
            $profile->setCliCredential($cli);
        }

        $em->flush();

        return $this->json($this->serialize($profile));
    }

    #[Route('/{id}', methods: ['DELETE'])]
    public function delete(Profile $profile, EntityManagerInterface $em): JsonResponse
    {
        $em->remove($profile);
        $em->flush();

        return $this->json(null, Response::HTTP_NO_CONTENT);
    }
}
