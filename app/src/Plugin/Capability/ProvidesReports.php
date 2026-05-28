<?php

namespace App\Plugin\Capability;

interface ProvidesReports
{
    /**
     * Read-only reports (document templates) created in the context at activation.
     * Each report is tagged managed_by_plugin = identifier and is purged when the
     * plugin is disabled. Idempotent.
     *
     * @return ReportTemplate[]
     */
    public function provideReports(): array;
}
