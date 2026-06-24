<?php

namespace App\Message;

class GenerateReportWordMessage
{
    public function __construct(
        private readonly int $reportId,
        private readonly ?string $createdBy = null,
    ) {}

    public function getReportId(): int
    {
        return $this->reportId;
    }

    public function getCreatedBy(): ?string
    {
        return $this->createdBy;
    }
}
