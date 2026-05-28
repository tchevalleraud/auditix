<?php

namespace App\Plugin\Capability;

interface ProvidesReportSchemas
{
    /**
     * Read-only report schemas (canvas / diagrams) created in the context at
     * activation. Each schema is tagged managed_by_plugin = identifier and is
     * purged when the plugin is disabled. Idempotent.
     *
     * @return ReportSchemaTemplate[]
     */
    public function provideReportSchemas(): array;
}
