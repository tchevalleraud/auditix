<?php

namespace Auditix\Plugin\TemplateCompliance;

use App\Plugin\Capability\CompliancePolicyTemplate;
use App\Plugin\Capability\ComplianceRuleTemplate;
use App\Plugin\Capability\ProvidesCompliancePolicies;
use App\Plugin\VendorPluginInterface;

/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  PLUGIN TEMPLATE #3 — COMPLIANCE                                          ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * LEARNING GOAL
 * -------------
 * Provide a compliance POLICY and its RULES. On activation, PluginAssetsImporter
 * creates a CompliancePolicy + ComplianceRule entities
 * (managed_by_plugin = "template-compliance"), purged on deactivation.
 *
 * ANATOMY OF A RULE
 * -----------------
 *   1. dataSources: where to read the information.
 *      - type "collection": reads the output of an already-collected command.
 *      - type "ssh"       : reads live over SSH.
 *      The raw field is exposed as "<name>.$value". With a regex + resultMode
 *      ('match' | 'count' | 'capture') you derive "<name>.$match" / "$count" / fields.
 *   2. conditionTree: an IF / ELSEIF / ELSE tree (key 'blocks').
 *      The first block whose conditions match returns its 'result'
 *      (status, severity, message, recommendation...). Possible statuses:
 *      compliant | non_compliant | error | not_applicable | skipped.
 *
 * The rule below checks that a security directive is present in the current
 * configuration. Fake data/command — adapt as needed.
 */
final class TemplateCompliancePlugin implements
    VendorPluginInterface,
    ProvidesCompliancePolicies
{
    public function getIdentifier(): string  { return 'template-compliance'; }
    public function getVersion(): string      { return '1.0.0'; }
    public function getDisplayName(): string  { return 'Template — Compliance'; }
    public function getDescription(): string  { return 'Educational example: one compliance policy and rule.'; }
    public function getSupportedManufacturers(): array { return []; }

    /**
     * @return CompliancePolicyTemplate[]
     */
    public function provideCompliancePolicies(): array
    {
        // Rule: the configuration must contain "service password-encryption".
        $passwordEncryptionRule = new ComplianceRuleTemplate(
            name: 'Password encryption enabled',
            description: 'Checks for the presence of "service password-encryption" in the configuration.',
            identifier: 'tpl-password-encryption',
            enabled: true,
            folderName: 'Baseline security',
            // 1) Data source: output of an already-collected "show running-config".
            dataSources: [
                [
                    'name'    => 'cfg',
                    'type'    => 'collection',
                    'command' => 'show running-config',
                    'tag'     => null,
                    // No regex: we work on the raw text (cfg.$value).
                ],
            ],
            // 2) Condition tree: IF the config contains the directive → compliant,
            //    ELSE → non-compliant (high severity, CLI recommendation).
            conditionTree: [
                'blocks' => [
                    [
                        'type'  => 'if',
                        'logic' => 'and',
                        'conditions' => [
                            [
                                'type'     => 'source',
                                'source'   => 'cfg',
                                'field'    => '$value',
                                'operator' => 'contains',
                                'value'    => 'service password-encryption',
                            ],
                        ],
                        'result' => [
                            'status'   => 'compliant',
                            'severity' => null,
                            'message'  => 'Password encryption is enabled.',
                        ],
                    ],
                    [
                        'type'   => 'else',
                        'result' => [
                            'status'             => 'non_compliant',
                            'severity'           => 'high',
                            'message'            => 'Password encryption is missing.',
                            'messageLong'        => 'The "service password-encryption" directive was not found in the configuration of {{node.name}}.',
                            'recommendation'     => 'service password-encryption',
                            'recommendationType' => 'cli',
                        ],
                    ],
                ],
            ],
        );

        return [
            new CompliancePolicyTemplate(
                name: 'Template — Baseline security policy',
                description: 'Demonstration policy grouping elementary security checks.',
                enabled: true,
                // matchRules: criteria for automatic assignment to nodes
                // (e.g. by tag / manufacturer / model). null = assign manually.
                matchRules: null,
                rules: [
                    $passwordEncryptionRule,
                ],
            ),
        ];
    }
}
