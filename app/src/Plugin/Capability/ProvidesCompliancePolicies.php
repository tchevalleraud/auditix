<?php

namespace App\Plugin\Capability;

interface ProvidesCompliancePolicies
{
    /**
     * Read-only compliance policies (and their rules) created in the context at
     * activation. Policies, rules and their folders are tagged
     * managed_by_plugin = identifier and purged when the plugin is disabled.
     * Idempotent.
     *
     * @return CompliancePolicyTemplate[]
     */
    public function provideCompliancePolicies(): array;
}
