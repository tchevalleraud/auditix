<?php

namespace App\Controller\Api;

use Doctrine\DBAL\Connection;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Attribute\Route;

class ReadyzController extends AbstractController
{
    public function __construct(
        private readonly Connection $connection,
    ) {}

    #[Route('/api/public/readyz', name: 'api_public_readyz', methods: ['GET'])]
    public function __invoke(): JsonResponse
    {
        try {
            $this->connection->executeQuery('SELECT 1');
        } catch (\Throwable) {
            return new JsonResponse(['ready' => false, 'reason' => 'database_unavailable'], 503);
        }

        try {
            $appliedRows = $this->connection->fetchFirstColumn('SELECT version FROM doctrine_migration_versions');
        } catch (\Throwable) {
            return new JsonResponse(['ready' => false, 'reason' => 'migrations_table_missing'], 503);
        }
        $applied = array_flip($appliedRows);

        $migrationsDir = $this->getParameter('kernel.project_dir') . '/migrations';
        if (!is_dir($migrationsDir)) {
            return new JsonResponse(['ready' => true]);
        }

        $files = glob($migrationsDir . '/Version*.php') ?: [];
        $pending = 0;
        foreach ($files as $file) {
            $basename = pathinfo($file, PATHINFO_FILENAME);
            $fqcn = 'DoctrineMigrations\\' . $basename;
            if (!isset($applied[$fqcn])) {
                $pending++;
            }
        }

        if ($pending > 0) {
            return new JsonResponse(['ready' => false, 'reason' => 'migrations_pending', 'pending' => $pending], 503);
        }

        return new JsonResponse(['ready' => true]);
    }
}
