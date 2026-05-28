# Template — Compliance

Educational **template plugin**. It shows how to provide a **compliance policy**
and its **rules**.

| Resource | Auditix entity | Capability (interface) |
|----------|----------------|------------------------|
| Policy | `CompliancePolicy` | `ProvidesCompliancePolicies` |
| Rule | `ComplianceRule` | (via the policy) |
| Organizing folder | `ComplianceRuleFolder` | (auto, attached to the policy) |

## Anatomy of a rule

1. **`dataSources`** — where to read the information:
   - `type: collection` reads the output of an already-collected command;
   - `type: ssh` reads live.
   - The raw text is exposed as `<name>.$value`. With a `regex` + `resultMode`
     (`match` / `count` / `capture`) you derive `$match`, `$count`, or named fields.
2. **`conditionTree`** — an `IF / ELSEIF / ELSE` tree (key `blocks`). The first
   block whose conditions match returns its `result`:
   - `status`: `compliant | non_compliant | error | not_applicable | skipped`
   - `severity`: `info | low | medium | high | critical`
   - `message`, `messageLong`, `recommendation`, `recommendationType` (`cli` / `text`)

The sample rule checks that `service password-encryption` is present in
`show running-config`; otherwise it marks the node non-compliant (high severity).

## Purge

On deactivation, the policy is removed; its folders (attached to the policy) and
its rules are purged in cascade.

## Install / activate (dev CLI)

```bash
php bin/console app:plugin:install /path/to/template-compliance.zip
php bin/console app:plugin:activate template-compliance <context_id>
```
