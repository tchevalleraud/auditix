<?php

namespace App\Plugin\Capability;

interface ProvidesReportThemes
{
    /**
     * Read-only report themes created in the context at activation.
     * Each theme is tagged managed_by_plugin = identifier and is purged when the
     * plugin is disabled. Idempotent.
     *
     * @return ReportThemeTemplate[]
     */
    public function provideReportThemes(): array;
}
