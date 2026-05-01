<?php

namespace App\Service;

use App\Entity\Context;
use App\Entity\OidcProvider;
use App\Entity\User;
use App\Repository\OidcContextMappingRepository;
use App\Repository\OidcRoleMappingRepository;
use App\Repository\UserRepository;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Log\LoggerInterface;

class UserProvisioningService
{
    public function __construct(
        private readonly UserRepository $users,
        private readonly OidcRoleMappingRepository $roleMappings,
        private readonly OidcContextMappingRepository $contextMappings,
        private readonly EntityManagerInterface $em,
        private readonly LoggerInterface $logger,
    ) {
    }

    /**
     * @param array<string, mixed> $claims
     * @throws OidcAuthorizationException
     */
    public function findOrProvision(OidcProvider $provider, array $claims): User
    {
        $sub = (string) $claims['sub'];
        $username = $this->extractClaim($claims, $provider->getClaimUsername());
        $firstName = $this->extractClaim($claims, $provider->getClaimFirstname());
        $lastName = $this->extractClaim($claims, $provider->getClaimLastname());

        $claimValues = $this->extractListClaim($claims, $provider->getClaimRoles());
        $groupsPath = $provider->getClaimGroups();
        if ($groupsPath !== null && $groupsPath !== '') {
            $claimValues = array_values(array_unique(array_merge(
                $claimValues,
                $this->extractListClaim($claims, $groupsPath),
            )));
        }

        $required = $provider->getRequiredRole();
        if ($required !== null && $required !== '' && !in_array($required, $claimValues, true)) {
            $this->logger->info('OIDC login refused: required role missing', [
                'provider' => $provider->getSlug(),
                'sub' => $sub,
                'required' => $required,
            ]);
            throw new OidcAuthorizationException('Access denied: missing required role.');
        }

        $user = $this->users->findOneBy(['oidcProvider' => $provider, 'oidcSubject' => $sub]);

        if ($user === null) {
            if (is_string($username) && $username !== '') {
                $existingByUsername = $this->users->findOneBy(['username' => $username]);
                if ($existingByUsername !== null && (
                    $existingByUsername->getOidcSubject() === null
                    || $existingByUsername->getOidcProvider()?->getId() !== $provider->getId()
                )) {
                    $this->logger->warning('OIDC login refused: local account collision', [
                        'provider' => $provider->getSlug(),
                        'sub' => $sub,
                        'username' => $username,
                    ]);
                    throw new OidcAuthorizationException(
                        'A local account with this username already exists. Contact an administrator to link it.'
                    );
                }
            }

            if (!$provider->isAutoProvisioning()) {
                throw new OidcAuthorizationException('Auto-provisioning disabled. Contact an administrator.');
            }

            $user = new User();
            $user->setUsername(is_string($username) && $username !== '' ? $username : $sub);
            $user->setOidcProvider($provider);
            $user->setOidcSubject($sub);
            $user->setOidcProvisioned(true);
            $user->setPassword(null);
            $this->em->persist($user);
        }

        if (is_string($firstName)) {
            $user->setFirstName($firstName);
        }
        if (is_string($lastName)) {
            $user->setLastName($lastName);
        }

        $user->setOidcClaims($claims);

        $this->applyRoleMappings($user, $provider, $claimValues);
        $this->applyContextMappings($user, $provider, $claimValues, $provider->getDefaultContext());

        $this->em->flush();

        return $user;
    }

    /**
     * @param list<string> $claimValues
     */
    private function applyRoleMappings(User $user, OidcProvider $provider, array $claimValues): void
    {
        $roles = ['ROLE_USER'];
        foreach ($this->roleMappings->findByProvider((int) $provider->getId()) as $mapping) {
            if (in_array($mapping->getClaimValue(), $claimValues, true)) {
                $roles[] = (string) $mapping->getGrantedRole();
            }
        }
        $user->setRoles(array_values(array_unique($roles)));
    }

    /**
     * @param list<string> $claimValues
     */
    private function applyContextMappings(User $user, OidcProvider $provider, array $claimValues, ?Context $defaultContext): void
    {
        $desired = [];
        if ($defaultContext !== null) {
            $desired[$defaultContext->getId()] = $defaultContext;
        }
        foreach ($this->contextMappings->findByProvider((int) $provider->getId()) as $mapping) {
            if (in_array($mapping->getClaimValue(), $claimValues, true)) {
                $context = $mapping->getContext();
                if ($context !== null) {
                    $desired[$context->getId()] = $context;
                }
            }
        }

        foreach ($user->getContexts() as $current) {
            if (!isset($desired[$current->getId()])) {
                $current->removeUser($user);
            }
        }
        foreach ($desired as $context) {
            $context->addUser($user);
        }
    }

    /**
     * @param array<string, mixed> $claims
     */
    private function extractClaim(array $claims, string $path): mixed
    {
        $segments = explode('.', $path);
        $cursor = $claims;
        foreach ($segments as $segment) {
            if (is_array($cursor) && array_key_exists($segment, $cursor)) {
                $cursor = $cursor[$segment];
            } else {
                return null;
            }
        }
        return $cursor;
    }

    /**
     * @param array<string, mixed> $claims
     * @return list<string>
     */
    private function extractListClaim(array $claims, string $path): array
    {
        $value = $this->extractClaim($claims, $path);
        if (!is_array($value)) {
            return [];
        }
        $out = [];
        foreach ($value as $v) {
            if (is_string($v) && $v !== '') {
                $out[] = $v;
            }
        }
        return $out;
    }
}
