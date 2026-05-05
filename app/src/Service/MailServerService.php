<?php

namespace App\Service;

use App\Entity\MailServer;
use App\Repository\MailServerRepository;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\Mailer\Mailer;
use Symfony\Component\Mailer\Transport\Smtp\EsmtpTransport;
use Symfony\Component\Mime\Address;
use Symfony\Component\Mime\Email;

class MailServerService
{
    private readonly string $passwordKey;

    public function __construct(
        private readonly MailServerRepository $repository,
        private readonly EntityManagerInterface $em,
        #[Autowire('%kernel.secret%')]
        string $appSecret,
    ) {
        $this->passwordKey = sodium_crypto_generichash($appSecret . '|mail-server-password', '', SODIUM_CRYPTO_SECRETBOX_KEYBYTES);
    }

    /** @return list<MailServer> */
    public function listAll(): array
    {
        return $this->repository->findAllOrdered();
    }

    public function findById(int $id): ?MailServer
    {
        return $this->repository->find($id);
    }

    public function save(MailServer $server): void
    {
        $server->touch();
        if ($server->getId() === null) {
            $this->em->persist($server);
        }
        $this->em->flush();
    }

    public function delete(MailServer $server): void
    {
        $this->em->remove($server);
        $this->em->flush();
    }

    public function setPassword(MailServer $server, ?string $plaintext): void
    {
        if ($plaintext === null || $plaintext === '') {
            $server->setPasswordEncrypted(null);
        } else {
            $server->setPasswordEncrypted($this->encrypt($plaintext));
        }
        $server->touch();
        $this->em->flush();
    }

    public function getDecryptedPassword(MailServer $server): ?string
    {
        $encrypted = $server->getPasswordEncrypted();
        if ($encrypted === null || $encrypted === '') {
            return null;
        }
        return $this->decrypt($encrypted);
    }

    /**
     * Build a fully configured SMTP transport for the given server.
     *
     * Centralized so callers (test endpoint, report sender) never duplicate
     * the encryption/auth wiring.
     */
    public function createTransport(MailServer $server): EsmtpTransport
    {
        if ($server->getHost() === null) {
            throw new \RuntimeException('Server is missing required field (host)');
        }

        $tls = match ($server->getEncryption()) {
            MailServer::ENCRYPTION_SSL => true,
            MailServer::ENCRYPTION_NONE => false,
            default => null,
        };

        $transport = new EsmtpTransport($server->getHost(), $server->getPort(), $tls);

        // Symfony Mailer's autoTls flag defaults to true even when $tls is
        // false: a server advertising STARTTLS in EHLO still triggers an
        // opportunistic upgrade. Disable it explicitly when the operator
        // selected "no encryption" so the wire stays plain SMTP.
        if ($server->getEncryption() === MailServer::ENCRYPTION_NONE) {
            $transport->setAutoTls(false);
        }

        if ($server->getUsername() !== null && $server->getUsername() !== '') {
            $transport->setUsername($server->getUsername());
            $transport->setPassword($this->getDecryptedPassword($server) ?? '');
        }

        return $transport;
    }

    public function sendTest(MailServer $server, string $recipient): void
    {
        if ($server->getFromEmail() === null) {
            throw new \RuntimeException('Server is missing required field (fromEmail)');
        }
        if (!filter_var($recipient, FILTER_VALIDATE_EMAIL)) {
            throw new \RuntimeException('Invalid recipient email');
        }

        $transport = $this->createTransport($server);
        $mailer = new Mailer($transport);
        $from = $server->getFromName()
            ? new Address($server->getFromEmail(), $server->getFromName())
            : new Address($server->getFromEmail());

        $email = (new Email())
            ->from($from)
            ->to($recipient)
            ->subject('Auditix — SMTP test')
            ->text(sprintf(
                "This is a test message sent from Auditix to verify the SMTP server \"%s\".\n\nIf you received this email, the configuration is working.",
                $server->getName() ?? ''
            ));

        $mailer->send($email);
    }

    private function encrypt(string $plaintext): string
    {
        $nonce = random_bytes(SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
        $ciphertext = sodium_crypto_secretbox($plaintext, $nonce, $this->passwordKey);
        return base64_encode($nonce . $ciphertext);
    }

    private function decrypt(string $encrypted): ?string
    {
        $decoded = base64_decode($encrypted, true);
        if ($decoded === false || strlen($decoded) < SODIUM_CRYPTO_SECRETBOX_NONCEBYTES + SODIUM_CRYPTO_SECRETBOX_MACBYTES) {
            return null;
        }
        $nonce = substr($decoded, 0, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
        $ciphertext = substr($decoded, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
        $plaintext = sodium_crypto_secretbox_open($ciphertext, $nonce, $this->passwordKey);
        return $plaintext === false ? null : $plaintext;
    }
}
