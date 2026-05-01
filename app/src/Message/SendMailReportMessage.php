<?php

namespace App\Message;

class SendMailReportMessage
{
    public function __construct(
        private readonly int $mailReportId,
    ) {}

    public function getMailReportId(): int
    {
        return $this->mailReportId;
    }
}
