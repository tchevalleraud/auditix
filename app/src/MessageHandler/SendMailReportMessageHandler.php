<?php

namespace App\MessageHandler;

use App\Entity\MailReport;
use App\Message\SendMailReportMessage;
use App\Service\MailReportService;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Log\LoggerInterface;
use Symfony\Component\Messenger\Attribute\AsMessageHandler;

#[AsMessageHandler]
class SendMailReportMessageHandler
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly MailReportService $service,
        private readonly LoggerInterface $logger,
    ) {}

    public function __invoke(SendMailReportMessage $message): void
    {
        $report = $this->em->getRepository(MailReport::class)->find($message->getMailReportId());
        if ($report === null) {
            return;
        }

        $report->setSendingStatus(MailReport::STATUS_SENDING);
        $this->em->flush();

        try {
            $this->service->send($report);
        } catch (\Throwable $e) {
            $this->logger->error('Mail report send failed', [
                'mailReportId' => $report->getId(),
                'error' => $e->getMessage(),
            ]);

            $now = new \DateTimeImmutable();
            $history = $report->getSendHistory() ?? [];
            $history[] = [
                'at' => $now->format(\DateTimeInterface::ATOM),
                'status' => 'failed',
                'error' => $e->getMessage(),
            ];
            if (count($history) > 50) {
                $history = array_slice($history, -50);
            }
            $report->setSendHistory($history);
            $report->setSendingStatus(MailReport::STATUS_FAILED);
            $report->setLastError($e->getMessage());
            $this->em->flush();
        }
    }
}
