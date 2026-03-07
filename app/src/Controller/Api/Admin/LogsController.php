<?php

namespace App\Controller\Api\Admin;

use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/api/admin/logs')]
class LogsController extends AbstractController
{
    #[Route('/nginx', methods: ['GET'])]
    public function nginx(Request $request): JsonResponse
    {
        $logFile = '/var/log/nginx/access.real.log';
        $page = max(1, $request->query->getInt('page', 1));
        $limit = min(100, max(1, $request->query->getInt('limit', 30)));
        $statusFilter = $request->query->get('status');

        if (!file_exists($logFile)) {
            return $this->json(['items' => [], 'total' => 0, 'page' => $page, 'limit' => $limit, 'pages' => 1]);
        }

        $content = file($logFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if (!$content) {
            return $this->json(['items' => [], 'total' => 0, 'page' => $page, 'limit' => $limit, 'pages' => 1]);
        }

        $pattern = '/^(\S+) \S+ \S+ \[([^\]]+)\] "(\S+) (\S+) \S+" (\d{3}) (\d+|-) "([^"]*)" "([^"]*)"/';

        $entries = [];
        foreach (array_reverse($content) as $line) {
            if (!preg_match($pattern, $line, $m)) {
                continue;
            }

            $status = (int) $m[5];

            if ($statusFilter) {
                $filterGroup = $statusFilter[0];
                if ((string) intdiv($status, 100) !== $filterGroup) {
                    continue;
                }
            }

            $entries[] = [
                'ip' => $m[1],
                'datetime' => $m[2],
                'method' => $m[3],
                'url' => $m[4],
                'status' => $status,
                'size' => $m[6] === '-' ? 0 : (int) $m[6],
                'referer' => $m[7] === '-' ? null : $m[7],
                'userAgent' => $m[8],
            ];
        }

        $total = count($entries);
        $pages = max(1, (int) ceil($total / $limit));
        $offset = ($page - 1) * $limit;
        $items = array_slice($entries, $offset, $limit);

        return $this->json([
            'items' => $items,
            'total' => $total,
            'page' => $page,
            'limit' => $limit,
            'pages' => $pages,
        ]);
    }

    #[Route('/symfony', methods: ['GET'])]
    public function symfony(Request $request): JsonResponse
    {
        $logFile = $this->getParameter('kernel.logs_dir') . '/' . $this->getParameter('kernel.environment') . '.log';
        $page = max(1, $request->query->getInt('page', 1));
        $limit = min(100, max(1, $request->query->getInt('limit', 30)));
        $levelFilter = $request->query->get('level');

        if (!file_exists($logFile)) {
            return $this->json(['items' => [], 'total' => 0, 'page' => $page, 'limit' => $limit, 'pages' => 1]);
        }

        // Read file from the end to avoid loading everything into memory
        $maxLines = 5000;
        $lines = [];
        $fp = fopen($logFile, 'r');
        if (!$fp) {
            return $this->json(['items' => [], 'total' => 0, 'page' => $page, 'limit' => $limit, 'pages' => 1]);
        }

        // Seek from end and read last N lines
        $pos = -1;
        $lineCount = 0;
        $buffer = '';
        fseek($fp, 0, SEEK_END);
        $fileSize = ftell($fp);

        while ($lineCount < $maxLines && abs($pos) <= $fileSize) {
            fseek($fp, $pos, SEEK_END);
            $char = fgetc($fp);
            if ($char === "\n" && $buffer !== '') {
                $lines[] = $buffer;
                $buffer = '';
                $lineCount++;
            } else {
                $buffer = $char . $buffer;
            }
            $pos--;
        }
        if ($buffer !== '') {
            $lines[] = $buffer;
        }
        fclose($fp);

        $entries = [];
        foreach ($lines as $line) {
            $line = trim($line);
            if ($line === '') {
                continue;
            }

            $entry = ['level' => 'info', 'channel' => '', 'message' => $line, 'datetime' => ''];

            if (preg_match('/^\[(\d{4}-\d{2}-\d{2}T[\d:.+]+)\]\s+(\w+)\.(\w+):\s+(.*)$/', $line, $m)) {
                $entry['datetime'] = $m[1];
                $entry['channel'] = $m[2];
                $entry['level'] = strtolower($m[3]);
                $entry['message'] = $m[4];
            }

            if ($levelFilter && $entry['level'] !== $levelFilter) {
                continue;
            }

            $entries[] = $entry;
        }

        $total = count($entries);
        $pages = max(1, (int) ceil($total / $limit));
        $offset = ($page - 1) * $limit;
        $items = array_slice($entries, $offset, $limit);

        return $this->json([
            'items' => $items,
            'total' => $total,
            'page' => $page,
            'limit' => $limit,
            'pages' => $pages,
        ]);
    }
}
