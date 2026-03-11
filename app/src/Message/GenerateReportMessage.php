<?php

namespace App\Message;

class GenerateReportMessage
{
    public function __construct(
        private readonly int $reportId,
    ) {}

    public function getReportId(): int
    {
        return $this->reportId;
    }
}
