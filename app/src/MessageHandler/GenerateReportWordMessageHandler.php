<?php

namespace App\MessageHandler;

use App\Entity\Node;
use App\Entity\Report;
use App\Entity\ReportWordVersion;
use App\Message\GenerateReportWordMessage;
use App\Repository\ReportWordVersionRepository;
use App\Service\Report\WordReportRenderer;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Log\LoggerInterface;
use Symfony\Component\Mercure\HubInterface;
use Symfony\Component\Mercure\Update;
use Symfony\Component\Messenger\Attribute\AsMessageHandler;

#[AsMessageHandler]
class GenerateReportWordMessageHandler
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly HubInterface $hub,
        private readonly WordReportRenderer $renderer,
        private readonly ReportWordVersionRepository $versions,
        private readonly LoggerInterface $logger,
    ) {}

    public function __invoke(GenerateReportWordMessage $message): void
    {
        $report = $this->em->getRepository(Report::class)->find($message->getReportId());
        if (!$report) {
            return;
        }

        $this->publish($report, 'running');
        $this->logger->info('[word-generator] start', [
            'reportId' => $report->getId(),
            'type' => $report->getType(),
        ]);
        $t0 = microtime(true);

        try {
            $baseDir = sprintf('/var/www/var/reports/%d/word', $report->getId());

            if ($report->getType() === Report::TYPE_NODE) {
                foreach ($report->getNodes() as $node) {
                    $this->generateOne($report, $node, $message->getCreatedBy());
                }
            } else {
                $this->generateOne($report, null, $message->getCreatedBy());
            }

            $this->logger->info('[word-generator] done', [
                'reportId' => $report->getId(),
                'durationMs' => (int) ((microtime(true) - $t0) * 1000),
            ]);
            $this->publish($report, 'completed');
        } catch (\Throwable $e) {
            $this->logger->error('[word-generator] failed', [
                'reportId' => $report->getId(),
                'error' => $e->getMessage(),
            ]);
            $this->publish($report, 'failed');
            throw $e;
        }
    }

    /**
     * Generate one Word version (a whole report, or a single node for node reports).
     * Each version is isolated: a failure is recorded on its row without aborting
     * the other nodes.
     */
    private function generateOne(Report $report, ?Node $node, ?string $createdBy): void
    {
        $version = new ReportWordVersion();
        $version->setReport($report);
        $version->setNode($node);
        $version->setNodeLabel($node ? ($node->getName() ?: $node->getHostname() ?: $node->getIpAddress()) : null);
        $version->setVersionNumber($this->versions->nextVersionNumber($report, $node));
        $version->setStatus(ReportWordVersion::STATUS_RUNNING);
        $version->setCreatedBy($createdBy);
        $this->em->persist($version);
        $this->em->flush();

        try {
            $dir = sprintf('/var/www/var/reports/%d/word', $report->getId());
            if ($node) {
                $dir .= '/node_' . $node->getId();
            }
            if (!is_dir($dir)) {
                mkdir($dir, 0775, true);
            }

            $absolute = sprintf('%s/v%d.docx', $dir, $version->getVersionNumber());
            $this->renderer->render($report, $node, $absolute);

            $relative = sprintf('reports/%d/word/%sv%d.docx',
                $report->getId(),
                $node ? 'node_' . $node->getId() . '/' : '',
                $version->getVersionNumber(),
            );

            $version->setFilePath($relative);
            $version->setFileSize(@filesize($absolute) ?: null);
            $version->setStatus(null);
            $version->setError(null);

            // The freshly generated version becomes the current one for its scope.
            $this->versions->clearCurrent($report, $node);
            $version->setIsCurrent(true);
            $this->em->flush();
        } catch (\Throwable $e) {
            $version->setStatus(ReportWordVersion::STATUS_FAILED);
            $version->setError(mb_substr($e->getMessage(), 0, 2000));
            $version->setIsCurrent(false);
            $this->em->flush();
            $this->logger->error('[word-generator] version failed', [
                'reportId' => $report->getId(),
                'nodeId' => $node?->getId(),
                'versionId' => $version->getId(),
                'error' => $e->getMessage(),
            ]);
        }
    }

    private function publish(Report $report, string $status): void
    {
        $this->hub->publish(new Update(
            sprintf('reports/%d', $report->getId()),
            json_encode([
                'event' => 'word-generation',
                'status' => $status,
                'reportId' => $report->getId(),
            ])
        ));
    }
}
