<?php

namespace App\Command;

use App\Service\NginxConfigService;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;

#[AsCommand(
    name: 'app:nginx:hsts-cleanup',
    description: 'Generate a self-signed certificate and reapply nginx so an HTTPS cleanup listener is active to clear stale HSTS / 301 caches in browsers',
)]
class NginxHstsCleanupCommand extends Command
{
    public function __construct(
        private readonly NginxConfigService $nginx,
    ) {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this
            ->addOption('cn', null, InputOption::VALUE_REQUIRED, 'Common Name for the self-signed certificate', 'localhost')
            ->addOption('days', null, InputOption::VALUE_REQUIRED, 'Validity in days', '30');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $cn = (string) $input->getOption('cn');
        $days = max(1, (int) $input->getOption('days'));

        $output->writeln(sprintf('Generating self-signed certificate (CN=%s, %d days)...', $cn, $days));

        [$cert, $key] = $this->generateSelfSigned($cn, $days);
        if ($cert === null || $key === null) {
            $output->writeln('<error>Failed to generate certificate.</error>');
            return Command::FAILURE;
        }

        $config = $this->nginx->get();
        $previousMode = $config->getMode();
        $hadCert = $config->hasCertificate();

        $this->nginx->setCertificate($config, $cert, $key, null);

        // Force HTTP mode so the cleanup listener is rendered (with our cert) on 443.
        // Existing user-uploaded cert is overwritten by the self-signed one — they can
        // re-upload theirs from the admin UI afterwards.
        $config->setMode(\App\Entity\NginxConfig::MODE_HTTP);
        $this->nginx->saveSettings($config);

        $output->writeln('Applying nginx configuration...');
        $result = $this->nginx->apply($config);
        if (!$result['reloaded']) {
            $output->writeln(sprintf('<comment>Config written but nginx reload failed: %s</comment>', $result['message'] ?? 'unknown'));
            return Command::FAILURE;
        }

        $output->writeln('<info>Done.</info>');
        $output->writeln('');
        $output->writeln('Now visit your site over HTTPS once (e.g. https://' . $cn . '/) and accept the certificate warning.');
        $output->writeln('The browser will receive Strict-Transport-Security: max-age=0 and a 301 redirect to HTTP,');
        $output->writeln('clearing any cached HSTS / 301 entry. Subsequent visits will work over plain HTTP.');
        $output->writeln('');
        if ($hadCert) {
            $output->writeln('Note: the previously uploaded certificate was replaced. Re-upload it from /admin/server/nginx if needed.');
        }
        if ($previousMode !== \App\Entity\NginxConfig::MODE_HTTP) {
            $output->writeln(sprintf('Note: mode was switched from "%s" to "http". Change it back from the admin UI when ready.', $previousMode));
        }

        return Command::SUCCESS;
    }

    /**
     * @return array{0: ?string, 1: ?string}
     */
    private function generateSelfSigned(string $cn, int $days): array
    {
        $dn = ['commonName' => $cn];
        $privkey = openssl_pkey_new([
            'private_key_bits' => 2048,
            'private_key_type' => OPENSSL_KEYTYPE_RSA,
        ]);
        if (!$privkey) {
            return [null, null];
        }
        $csr = openssl_csr_new($dn, $privkey, ['digest_alg' => 'sha256']);
        if (!$csr) {
            return [null, null];
        }
        $x509 = openssl_csr_sign($csr, null, $privkey, $days, ['digest_alg' => 'sha256']);
        if (!$x509) {
            return [null, null];
        }

        $certPem = '';
        if (!openssl_x509_export($x509, $certPem)) {
            return [null, null];
        }
        $keyPem = '';
        if (!openssl_pkey_export($privkey, $keyPem)) {
            return [null, null];
        }

        return [$certPem, $keyPem];
    }
}
