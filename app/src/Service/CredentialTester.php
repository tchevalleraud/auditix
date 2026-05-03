<?php

namespace App\Service;

use App\Entity\CliCredential;
use App\Entity\SnmpCredential;
use phpseclib3\Net\SSH2;
use Symfony\Component\Process\Process;

class CredentialTester
{
    public const DEFAULT_OID = '1.3.6.1.2.1.1.5.0';

    /**
     * Standard SNMPv2-MIB OIDs that nearly every device exposes.
     * Returned to the frontend so users can pick a known-safe target.
     *
     * @return array<int, array{oid: string, label: string, description: string}>
     */
    public static function standardOids(): array
    {
        return [
            ['oid' => '1.3.6.1.2.1.1.5.0', 'label' => 'sysName',     'description' => 'Hostname'],
            ['oid' => '1.3.6.1.2.1.1.1.0', 'label' => 'sysDescr',    'description' => 'System description'],
            ['oid' => '1.3.6.1.2.1.1.4.0', 'label' => 'sysContact',  'description' => 'Administrative contact'],
            ['oid' => '1.3.6.1.2.1.1.6.0', 'label' => 'sysLocation', 'description' => 'Physical location'],
            ['oid' => '1.3.6.1.2.1.1.3.0', 'label' => 'sysUpTime',   'description' => 'Time since last reinitialization'],
            ['oid' => '1.3.6.1.2.1.1.2.0', 'label' => 'sysObjectID', 'description' => 'Vendor object identifier'],
        ];
    }

    /**
     * Run an snmpget against $ipAddress for $oid using $cred.
     *
     * @return array{success: bool, output: string, command: string, durationMs: int}
     */
    public function testSnmp(SnmpCredential $cred, string $ipAddress, ?string $oid = null): array
    {
        $oid = $oid !== null && $oid !== '' ? $oid : self::DEFAULT_OID;
        $cmd = $this->buildSnmpCommand($cred, $ipAddress, $oid);

        $start = microtime(true);
        $process = new Process($cmd);
        $process->setTimeout(5);
        try {
            $process->run();
        } catch (\Throwable $e) {
            return [
                'success' => false,
                'output' => $e->getMessage(),
                'command' => $this->safeCommandString($cmd),
                'durationMs' => (int) ((microtime(true) - $start) * 1000),
            ];
        }
        $durationMs = (int) ((microtime(true) - $start) * 1000);

        $stdout = trim($process->getOutput());
        $stderr = trim($process->getErrorOutput());

        return [
            'success' => $process->isSuccessful() && $stdout !== '',
            'output' => $stdout !== '' ? $stdout : $stderr,
            'command' => $this->safeCommandString($cmd),
            'durationMs' => $durationMs,
        ];
    }

    /**
     * Open a CLI connection (SSH or Telnet) and return the initial banner / prompt.
     *
     * @return array{success: bool, output: string, durationMs: int}
     */
    public function testCli(CliCredential $cred, string $ipAddress): array
    {
        $protocol = strtolower((string) $cred->getProtocol());
        $port = $cred->getPort();

        if ($protocol === 'ssh') {
            return $this->testSsh($cred, $ipAddress, $port ?: 22);
        }

        if ($protocol === 'telnet') {
            return $this->testTelnet($ipAddress, $port ?: 23);
        }

        return [
            'success' => false,
            'output' => sprintf('Unsupported protocol "%s"', $cred->getProtocol() ?? ''),
            'durationMs' => 0,
        ];
    }

    private function testSsh(CliCredential $cred, string $ipAddress, int $port): array
    {
        $start = microtime(true);
        try {
            $ssh = new SSH2($ipAddress, $port, 5);
            $ssh->enablePTY();

            $username = (string) ($cred->getUsername() ?? '');
            $password = (string) ($cred->getPassword() ?? '');

            if ($username === '') {
                return [
                    'success' => false,
                    'output' => 'No username configured on the CLI credential',
                    'durationMs' => (int) ((microtime(true) - $start) * 1000),
                ];
            }

            if (!$ssh->login($username, $password)) {
                return [
                    'success' => false,
                    'output' => sprintf('SSH authentication failed for %s@%s:%d', $username, $ipAddress, $port),
                    'durationMs' => (int) ((microtime(true) - $start) * 1000),
                ];
            }

            $ssh->setTimeout(3);
            $banner = (string) $ssh->read();
            $ssh->disconnect();

            $banner = $this->stripAnsi($banner);

            return [
                'success' => true,
                'output' => trim($banner) !== '' ? $banner : '(connected, no banner returned)',
                'durationMs' => (int) ((microtime(true) - $start) * 1000),
            ];
        } catch (\Throwable $e) {
            return [
                'success' => false,
                'output' => $e->getMessage(),
                'durationMs' => (int) ((microtime(true) - $start) * 1000),
            ];
        }
    }

    private function testTelnet(string $ipAddress, int $port): array
    {
        $start = microtime(true);
        $errno = 0;
        $errstr = '';
        $sock = @fsockopen($ipAddress, $port, $errno, $errstr, 5);
        if (!$sock) {
            return [
                'success' => false,
                'output' => sprintf('Connection failed: %s (%d)', $errstr ?: 'unknown error', $errno),
                'durationMs' => (int) ((microtime(true) - $start) * 1000),
            ];
        }

        stream_set_timeout($sock, 3);
        $banner = '';
        $deadline = microtime(true) + 3;
        while (microtime(true) < $deadline) {
            $chunk = fread($sock, 4096);
            if ($chunk === false || $chunk === '') break;
            $banner .= $chunk;
            if (strlen($banner) > 8192) break;
        }
        fclose($sock);

        $clean = $this->stripTelnetIac($banner);
        $clean = $this->stripAnsi($clean);

        return [
            'success' => true,
            'output' => trim($clean) !== '' ? $clean : '(connected, no banner returned)',
            'durationMs' => (int) ((microtime(true) - $start) * 1000),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function buildSnmpCommand(SnmpCredential $cred, string $ip, string $oid): array
    {
        $version = $cred->getVersion();

        if ($version === 'v1' || $version === 'v2c') {
            return ['snmpget', '-v', str_replace('v', '', $version), '-c', $cred->getCommunity() ?? 'public', '-t', '3', '-r', '1', $ip, $oid];
        }

        $cmd = ['snmpget', '-v', '3', '-u', $cred->getUsername() ?? '', '-t', '3', '-r', '1'];

        $secLevel = $cred->getSecurityLevel() ?? 'noAuthNoPriv';
        $cmd[] = '-l';
        $cmd[] = $secLevel;

        if ($secLevel === 'authNoPriv' || $secLevel === 'authPriv') {
            $cmd[] = '-a';
            $cmd[] = $cred->getAuthProtocol() ?? 'SHA';
            $cmd[] = '-A';
            $cmd[] = $cred->getAuthPassword() ?? '';
        }

        if ($secLevel === 'authPriv') {
            $cmd[] = '-x';
            $cmd[] = $cred->getPrivProtocol() ?? 'AES';
            $cmd[] = '-X';
            $cmd[] = $cred->getPrivPassword() ?? '';
        }

        $cmd[] = $ip;
        $cmd[] = $oid;

        return $cmd;
    }

    /**
     * Build a printable command string with secrets redacted.
     */
    private function safeCommandString(array $cmd): string
    {
        $redactNext = false;
        $redacted = [];
        foreach ($cmd as $part) {
            if ($redactNext) {
                $redacted[] = '***';
                $redactNext = false;
                continue;
            }
            if (in_array($part, ['-c', '-A', '-X'], true)) {
                $redactNext = true;
            }
            $redacted[] = $part;
        }
        return implode(' ', array_map(fn($p) => preg_match('/\s/', (string) $p) ? escapeshellarg((string) $p) : (string) $p, $redacted));
    }

    private function stripAnsi(string $text): string
    {
        return preg_replace('/\x1b\[[0-9;?]*[A-Za-z]/', '', $text) ?? $text;
    }

    private function stripTelnetIac(string $text): string
    {
        // Strip Telnet IAC negotiation sequences (RFC 854): IAC (255) + cmd + opt
        $out = '';
        $len = strlen($text);
        for ($i = 0; $i < $len; $i++) {
            $c = ord($text[$i]);
            if ($c === 255 && $i + 2 < $len) {
                $i += 2;
                continue;
            }
            if ($c >= 32 || $c === 9 || $c === 10 || $c === 13) {
                $out .= $text[$i];
            }
        }
        return $out;
    }
}
