<?php

namespace App\Controller\Api\Admin;

use App\Entity\OidcContextMapping;
use App\Entity\OidcProvider;
use App\Entity\OidcRoleMapping;
use App\Repository\ContextRepository;
use App\Repository\OidcContextMappingRepository;
use App\Repository\OidcProviderRepository;
use App\Repository\OidcRoleMappingRepository;
use App\Service\OidcDiscoveryService;
use App\Service\OidcProviderService;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

#[Route('/api/admin/oidc')]
#[IsGranted('ROLE_ADMIN')]
class OidcConfigurationController extends AbstractController
{
    private const SECRET_PLACEHOLDER = '••••••••';

    public function __construct(
        private readonly OidcProviderService $providerService,
        private readonly OidcProviderRepository $providers,
        private readonly OidcRoleMappingRepository $roleMappings,
        private readonly OidcContextMappingRepository $contextMappings,
        private readonly ContextRepository $contexts,
        private readonly OidcDiscoveryService $discovery,
        private readonly EntityManagerInterface $em,
    ) {
    }

    #[Route('/providers', methods: ['GET'])]
    public function listProviders(): JsonResponse
    {
        return $this->json(array_map($this->serialize(...), $this->providers->findAllOrdered()));
    }

    #[Route('/providers', methods: ['POST'])]
    public function createProvider(Request $request): JsonResponse
    {
        $data = json_decode($request->getContent(), true);
        if (!is_array($data)) {
            return $this->json(['error' => 'Invalid JSON body'], Response::HTTP_BAD_REQUEST);
        }
        $name = trim((string) ($data['name'] ?? ''));
        if ($name === '') {
            return $this->json(['error' => 'name is required'], Response::HTTP_BAD_REQUEST);
        }
        $slug = trim((string) ($data['slug'] ?? ''));
        if ($slug === '') {
            $slug = $this->slugify($name);
        }
        $slug = $this->ensureUniqueSlug($slug);

        $provider = new OidcProvider();
        $provider->setName($name);
        $provider->setSlug($slug);
        $this->applyConfigData($provider, $data);
        $this->providerService->save($provider);

        if (array_key_exists('clientSecret', $data)) {
            $secret = $data['clientSecret'];
            if (is_string($secret) && $secret !== '' && $secret !== self::SECRET_PLACEHOLDER) {
                $this->providerService->setClientSecret($provider, $secret);
            }
        }

        return $this->json($this->serialize($provider), Response::HTTP_CREATED);
    }

    #[Route('/providers/{id}', methods: ['GET'], requirements: ['id' => '\d+'])]
    public function getProvider(int $id): JsonResponse
    {
        $provider = $this->providerService->findById($id);
        if ($provider === null) {
            return $this->json(['error' => 'Not found'], Response::HTTP_NOT_FOUND);
        }
        return $this->json($this->serialize($provider));
    }

    #[Route('/providers/{id}', methods: ['PUT'], requirements: ['id' => '\d+'])]
    public function updateProvider(int $id, Request $request): JsonResponse
    {
        $provider = $this->providerService->findById($id);
        if ($provider === null) {
            return $this->json(['error' => 'Not found'], Response::HTTP_NOT_FOUND);
        }
        $data = json_decode($request->getContent(), true);
        if (!is_array($data)) {
            return $this->json(['error' => 'Invalid JSON body'], Response::HTTP_BAD_REQUEST);
        }

        if (array_key_exists('name', $data)) {
            $name = trim((string) $data['name']);
            if ($name !== '') {
                $provider->setName($name);
            }
        }
        if (array_key_exists('slug', $data)) {
            $newSlug = trim((string) $data['slug']);
            if ($newSlug !== '' && $newSlug !== $provider->getSlug()) {
                $existing = $this->providers->findBySlug($newSlug);
                if ($existing !== null && $existing->getId() !== $provider->getId()) {
                    return $this->json(['error' => 'slug already in use'], Response::HTTP_CONFLICT);
                }
                $provider->setSlug($newSlug);
            }
        }

        $this->applyConfigData($provider, $data);
        $this->providerService->save($provider);

        if (array_key_exists('clientSecret', $data)) {
            $secret = $data['clientSecret'];
            if ($secret === null || $secret === '') {
                $this->providerService->setClientSecret($provider, null);
            } elseif ($secret !== self::SECRET_PLACEHOLDER) {
                $this->providerService->setClientSecret($provider, (string) $secret);
            }
        }

        if ($provider->getDiscoveryUrl() !== null) {
            $this->discovery->invalidate($provider->getDiscoveryUrl());
        }

        return $this->json($this->serialize($provider));
    }

    #[Route('/providers/{id}', methods: ['DELETE'], requirements: ['id' => '\d+'])]
    public function deleteProvider(int $id): JsonResponse
    {
        $provider = $this->providerService->findById($id);
        if ($provider === null) {
            return $this->json(['error' => 'Not found'], Response::HTTP_NOT_FOUND);
        }
        $this->providerService->delete($provider);
        return $this->json(null, Response::HTTP_NO_CONTENT);
    }

    #[Route('/providers/{id}/test', methods: ['POST'], requirements: ['id' => '\d+'])]
    public function test(int $id, Request $request): JsonResponse
    {
        $provider = $this->providerService->findById($id);
        $data = json_decode($request->getContent(), true);
        $url = is_array($data) ? trim((string) ($data['discoveryUrl'] ?? '')) : '';
        if ($url === '' && $provider !== null) {
            $url = (string) $provider->getDiscoveryUrl();
        }
        if ($url === '') {
            return $this->json(['error' => 'discoveryUrl required'], Response::HTTP_BAD_REQUEST);
        }
        try {
            $doc = $this->discovery->discover($url);
            return $this->json([
                'ok' => true,
                'issuer' => $doc['issuer'] ?? null,
                'authorizationEndpoint' => $doc['authorization_endpoint'] ?? null,
                'tokenEndpoint' => $doc['token_endpoint'] ?? null,
                'jwksUri' => $doc['jwks_uri'] ?? null,
                'userinfoEndpoint' => $doc['userinfo_endpoint'] ?? null,
            ]);
        } catch (\Throwable $e) {
            return $this->json(['ok' => false, 'error' => $e->getMessage()], Response::HTTP_BAD_GATEWAY);
        }
    }

    #[Route('/providers/{id}/role-mappings', methods: ['GET'], requirements: ['id' => '\d+'])]
    public function listRoleMappings(int $id): JsonResponse
    {
        return $this->json(array_map(
            fn (OidcRoleMapping $m) => [
                'id' => $m->getId(),
                'claimValue' => $m->getClaimValue(),
                'grantedRole' => $m->getGrantedRole(),
                'priority' => $m->getPriority(),
            ],
            $this->roleMappings->findByProvider($id),
        ));
    }

    #[Route('/providers/{id}/role-mappings', methods: ['POST'], requirements: ['id' => '\d+'])]
    public function createRoleMapping(int $id, Request $request): JsonResponse
    {
        $provider = $this->providerService->findById($id);
        if ($provider === null) {
            return $this->json(['error' => 'Provider not found'], Response::HTTP_NOT_FOUND);
        }
        $data = json_decode($request->getContent(), true);
        if (!is_array($data)) {
            return $this->json(['error' => 'Invalid JSON body'], Response::HTTP_BAD_REQUEST);
        }
        $claim = trim((string) ($data['claimValue'] ?? ''));
        $role = trim((string) ($data['grantedRole'] ?? ''));
        if ($claim === '' || $role === '') {
            return $this->json(['error' => 'claimValue and grantedRole required'], Response::HTTP_BAD_REQUEST);
        }
        if (!preg_match('/^ROLE_[A-Z0-9_]+$/', $role)) {
            return $this->json(['error' => 'grantedRole must match ROLE_* pattern'], Response::HTTP_BAD_REQUEST);
        }
        $mapping = new OidcRoleMapping();
        $mapping->setProvider($provider);
        $mapping->setClaimValue($claim);
        $mapping->setGrantedRole($role);
        $mapping->setPriority((int) ($data['priority'] ?? 0));
        $this->em->persist($mapping);
        $this->em->flush();
        return $this->json([
            'id' => $mapping->getId(),
            'claimValue' => $mapping->getClaimValue(),
            'grantedRole' => $mapping->getGrantedRole(),
            'priority' => $mapping->getPriority(),
        ], Response::HTTP_CREATED);
    }

    #[Route('/role-mappings/{id}', methods: ['DELETE'], requirements: ['id' => '\d+'])]
    public function deleteRoleMapping(int $id): JsonResponse
    {
        $mapping = $this->roleMappings->find($id);
        if ($mapping === null) {
            return $this->json(['error' => 'Not found'], Response::HTTP_NOT_FOUND);
        }
        $this->em->remove($mapping);
        $this->em->flush();
        return $this->json(null, Response::HTTP_NO_CONTENT);
    }

    #[Route('/providers/{id}/context-mappings', methods: ['GET'], requirements: ['id' => '\d+'])]
    public function listContextMappings(int $id): JsonResponse
    {
        return $this->json(array_map(
            fn (OidcContextMapping $m) => [
                'id' => $m->getId(),
                'claimValue' => $m->getClaimValue(),
                'contextId' => $m->getContext()?->getId(),
                'contextName' => $m->getContext()?->getName(),
            ],
            $this->contextMappings->findByProvider($id),
        ));
    }

    #[Route('/providers/{id}/context-mappings', methods: ['POST'], requirements: ['id' => '\d+'])]
    public function createContextMapping(int $id, Request $request): JsonResponse
    {
        $provider = $this->providerService->findById($id);
        if ($provider === null) {
            return $this->json(['error' => 'Provider not found'], Response::HTTP_NOT_FOUND);
        }
        $data = json_decode($request->getContent(), true);
        if (!is_array($data)) {
            return $this->json(['error' => 'Invalid JSON body'], Response::HTTP_BAD_REQUEST);
        }
        $claim = trim((string) ($data['claimValue'] ?? ''));
        $contextId = (int) ($data['contextId'] ?? 0);
        if ($claim === '' || $contextId <= 0) {
            return $this->json(['error' => 'claimValue and contextId required'], Response::HTTP_BAD_REQUEST);
        }
        $context = $this->contexts->find($contextId);
        if ($context === null) {
            return $this->json(['error' => 'Context not found'], Response::HTTP_NOT_FOUND);
        }
        $mapping = new OidcContextMapping();
        $mapping->setProvider($provider);
        $mapping->setClaimValue($claim);
        $mapping->setContext($context);
        $this->em->persist($mapping);
        $this->em->flush();
        return $this->json([
            'id' => $mapping->getId(),
            'claimValue' => $mapping->getClaimValue(),
            'contextId' => $context->getId(),
            'contextName' => $context->getName(),
        ], Response::HTTP_CREATED);
    }

    #[Route('/context-mappings/{id}', methods: ['DELETE'], requirements: ['id' => '\d+'])]
    public function deleteContextMapping(int $id): JsonResponse
    {
        $mapping = $this->contextMappings->find($id);
        if ($mapping === null) {
            return $this->json(['error' => 'Not found'], Response::HTTP_NOT_FOUND);
        }
        $this->em->remove($mapping);
        $this->em->flush();
        return $this->json(null, Response::HTTP_NO_CONTENT);
    }

    private function serialize(OidcProvider $p): array
    {
        return [
            'id' => $p->getId(),
            'slug' => $p->getSlug(),
            'name' => $p->getName(),
            'enabled' => $p->isEnabled(),
            'discoveryUrl' => $p->getDiscoveryUrl(),
            'clientId' => $p->getClientId(),
            'clientSecret' => $p->getClientSecretEncrypted() !== null ? self::SECRET_PLACEHOLDER : null,
            'scopes' => $p->getScopes(),
            'buttonLabel' => $p->getButtonLabel(),
            'buttonColor' => $p->getButtonColor(),
            'buttonIconUrl' => $p->getButtonIconUrl(),
            'claimUsername' => $p->getClaimUsername(),
            'claimEmail' => $p->getClaimEmail(),
            'claimFirstname' => $p->getClaimFirstname(),
            'claimLastname' => $p->getClaimLastname(),
            'claimRoles' => $p->getClaimRoles(),
            'claimGroups' => $p->getClaimGroups(),
            'requiredRole' => $p->getRequiredRole(),
            'autoProvisioning' => $p->isAutoProvisioning(),
            'defaultContextId' => $p->getDefaultContext()?->getId(),
            'sortOrder' => $p->getSortOrder(),
            'isReady' => $p->isReady(),
            'updatedAt' => $p->getUpdatedAt()->format(\DateTimeInterface::ATOM),
        ];
    }

    private function applyConfigData(OidcProvider $provider, array $data): void
    {
        if (array_key_exists('enabled', $data)) {
            $provider->setEnabled((bool) $data['enabled']);
        }
        if (array_key_exists('discoveryUrl', $data)) {
            $provider->setDiscoveryUrl($this->nullable((string) ($data['discoveryUrl'] ?? '')));
        }
        if (array_key_exists('clientId', $data)) {
            $provider->setClientId($this->nullable((string) ($data['clientId'] ?? '')));
        }
        if (array_key_exists('scopes', $data)) {
            $provider->setScopes(trim((string) $data['scopes']) ?: 'openid profile email');
        }
        if (array_key_exists('buttonLabel', $data)) {
            $v = trim((string) ($data['buttonLabel'] ?? ''));
            $provider->setButtonLabel($v === '' ? null : $v);
        }
        if (array_key_exists('buttonColor', $data)) {
            $v = trim((string) ($data['buttonColor'] ?? ''));
            $provider->setButtonColor($v === '' ? null : $v);
        }
        if (array_key_exists('buttonIconUrl', $data)) {
            $v = trim((string) ($data['buttonIconUrl'] ?? ''));
            $provider->setButtonIconUrl($v === '' ? null : $v);
        }
        if (array_key_exists('claimUsername', $data)) {
            $provider->setClaimUsername(trim((string) $data['claimUsername']) ?: 'preferred_username');
        }
        if (array_key_exists('claimEmail', $data)) {
            $provider->setClaimEmail(trim((string) $data['claimEmail']) ?: 'email');
        }
        if (array_key_exists('claimFirstname', $data)) {
            $provider->setClaimFirstname(trim((string) $data['claimFirstname']) ?: 'given_name');
        }
        if (array_key_exists('claimLastname', $data)) {
            $provider->setClaimLastname(trim((string) $data['claimLastname']) ?: 'family_name');
        }
        if (array_key_exists('claimRoles', $data)) {
            $provider->setClaimRoles(trim((string) $data['claimRoles']) ?: 'realm_access.roles');
        }
        if (array_key_exists('claimGroups', $data)) {
            $provider->setClaimGroups($this->nullable((string) ($data['claimGroups'] ?? '')));
        }
        if (array_key_exists('requiredRole', $data)) {
            $provider->setRequiredRole($this->nullable((string) ($data['requiredRole'] ?? '')));
        }
        if (array_key_exists('autoProvisioning', $data)) {
            $provider->setAutoProvisioning((bool) $data['autoProvisioning']);
        }
        if (array_key_exists('sortOrder', $data)) {
            $provider->setSortOrder((int) $data['sortOrder']);
        }
        if (array_key_exists('defaultContextId', $data)) {
            $cid = $data['defaultContextId'];
            if ($cid === null || $cid === '' || (int) $cid <= 0) {
                $provider->setDefaultContext(null);
            } else {
                $context = $this->contexts->find((int) $cid);
                if ($context !== null) {
                    $provider->setDefaultContext($context);
                }
            }
        }
    }

    private function nullable(string $value): ?string
    {
        $v = trim($value);
        return $v === '' ? null : $v;
    }

    private function slugify(string $value): string
    {
        $slug = strtolower(trim($value));
        $slug = preg_replace('/[^a-z0-9]+/', '-', $slug);
        $slug = trim((string) $slug, '-');
        return $slug !== '' ? $slug : 'provider';
    }

    private function ensureUniqueSlug(string $slug): string
    {
        $candidate = $slug;
        $i = 2;
        while ($this->providers->findBySlug($candidate) !== null) {
            $candidate = $slug . '-' . $i;
            $i++;
        }
        return $candidate;
    }
}
