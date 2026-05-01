<?php

namespace App\Service;

use App\Entity\OidcProvider;
use App\Repository\OidcProviderRepository;
use Doctrine\ORM\EntityManagerInterface;

class OidcProviderService
{
    public function __construct(
        private readonly OidcProviderRepository $repository,
        private readonly EntityManagerInterface $em,
        private readonly SecretEncryptionService $encryption,
    ) {
    }

    /** @return list<OidcProvider> */
    public function listAll(): array
    {
        return $this->repository->findAllOrdered();
    }

    /** @return list<OidcProvider> */
    public function listEnabled(): array
    {
        return array_values(array_filter(
            $this->repository->findEnabled(),
            fn (OidcProvider $p) => $p->isReady(),
        ));
    }

    public function findBySlug(string $slug): ?OidcProvider
    {
        return $this->repository->findBySlug($slug);
    }

    public function findById(int $id): ?OidcProvider
    {
        return $this->repository->find($id);
    }

    public function getDecryptedClientSecret(OidcProvider $provider): ?string
    {
        $encrypted = $provider->getClientSecretEncrypted();
        if ($encrypted === null || $encrypted === '') {
            return null;
        }
        return $this->encryption->decrypt($encrypted);
    }

    public function setClientSecret(OidcProvider $provider, ?string $plaintext): void
    {
        if ($plaintext === null || $plaintext === '') {
            $provider->setClientSecretEncrypted(null);
        } else {
            $provider->setClientSecretEncrypted($this->encryption->encrypt($plaintext));
        }
        $provider->touch();
        $this->em->flush();
    }

    public function save(OidcProvider $provider): void
    {
        $provider->touch();
        if ($provider->getId() === null) {
            $this->em->persist($provider);
        }
        $this->em->flush();
    }

    public function delete(OidcProvider $provider): void
    {
        $this->em->remove($provider);
        $this->em->flush();
    }
}
