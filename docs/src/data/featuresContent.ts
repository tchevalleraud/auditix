/**
 * English defaults for the individual feature pages. The matching FR strings
 * live in i18n/fr/code.json under the `featurePage.<slug>.*` namespace.
 * Translate IDs follow the convention:
 *   featurePage.<slug>.title  | .lead | .body | .cta | .bullet.<n>
 */
export interface FeatureContent {
  title: string;
  lead: string;
  body: string;
  bullets: string[];
  cta: string;
}

export const FEATURE_CONTENT: Record<string, FeatureContent> = {
  'ai-assistant': {
    title: 'AI Assistant',
    lead: 'Your network co-pilot — natively integrated.',
    body:
      'Query your network in plain language and get answers grounded in your real data. Auditix exposes a strictly read-only toolset to the LLM, and a human-in-the-loop control lets you review every payload before it leaves your environment. Beyond Q&A, the assistant drafts policy descriptions, audit rules and report paragraphs — so your team stays fast without giving up control over what the model sees.',
    bullets: [
      'Natural-language Q&A grounded in your collected data',
      'Tools are strictly read-only — no write actions, ever',
      'Human reviews every LLM payload, no silent data leak',
      'Drafts policy descriptions, audit rules and report paragraphs',
      'Bring your own LLM: cloud (OpenAI, Anthropic, OpenRouter) or on-prem (Ollama, OpenAI-compatible endpoint)',
    ],
    cta: 'Read the AI guide',
  },
  topology: {
    title: 'Live topology',
    lead: 'Your network, mapped from the ground truth.',
    body:
      'Auditix builds a Cytoscape map directly from your collections — LLDP, STP, MSTP, OSPF, BGP or ISIS. Every layer is computed from what the devices actually report, so the map stays in sync with reality. Filter by protocol, switch overlays, toggle MSTI instances and add manual links where automatic discovery cannot reach.',
    bullets: [
      'Built from your real collections, not a static diagram',
      'Multi-protocol: LLDP, STP, MSTP, OSPF, ISIS, BGP',
      'MSTI multi-instance overlays for layer-2 visibility',
      'Manual links to bridge gaps in vendor coverage',
      'Export topology to PDF reports and embeddable schemas',
    ],
    cta: 'Open the topology guide',
  },
  collection: {
    title: 'Automated collection',
    lead: 'From your devices to a clean dataset.',
    body:
      'Auditix pulls what you need over SSH or vendor APIs and normalises the result into structured data your audits can actually use. Schedule recurring jobs, build reusable extraction rules and join multiple sources into a single dataset. Off-site or facing an unreachable device? Drop the command outputs in manually and the same pipeline takes over — the audit stays consistent.',
    bullets: [
      'SSH and vendor-API collectors out of the box',
      'Reusable extraction rules with multi-source joins',
      'Scheduled runs with retry and timeout policies',
      'Manual ZIP / CSV import for off-site or unreachable devices',
      'All sources end up in the same audit-ready dataset',
    ],
    cta: 'See collection rules',
  },
  compliance: {
    title: 'Compliance engine',
    lead: 'Your policies, applied automatically.',
    body:
      'Author rules visually — no DSL gymnastics — and group them into policies you apply on demand. Auditix evaluates each policy per node, surfaces failures with full context, and supports first-class exceptions when business reality differs from textbook compliance. Whether you are aligning with GDPR, HIPAA, SOC 2 or ISO 27001, the engine adapts to your requirements.',
    bullets: [
      'Visual rule editor — no custom DSL to learn',
      'Nested rule blocks with debug introspection',
      'Policy auto-assignment based on tags and collection rules',
      'First-class exception management with audit trail',
      'Per-node, per-policy compliance score in real time',
    ],
    cta: 'Open the compliance guide',
  },
  reports: {
    title: 'PDF & mail reports',
    lead: 'Audit deliverables that stay up to date.',
    body:
      'A block-based editor lets you assemble PDF and mail reports that respect your brand. Blocks pull data dynamically from your latest collections and policies, so the report you send next quarter shows next quarter’s reality without rewriting a thing. Add AI-drafted recommendations to close the loop between findings and remediation.',
    bullets: [
      'Block editor with charts, lifecycle, compliance, topology and custom schemas',
      'Theme per context to match each client’s brand',
      'Dynamic content — re-render against fresh data anytime',
      'Per-node repeat blocks for inventory-driven sections',
      'AI Assist for paragraph drafting in any block',
    ],
    cta: 'Read the reports guide',
  },
  monitoring: {
    title: 'Device monitoring',
    lead: 'Watch the gear while you audit it.',
    body:
      'Compliance is a moving target. Auditix keeps continuous SNMP and SSH monitoring on every device under contract — CPU, memory, interface status, environmental sensors — so drift surfaces immediately, not at the next quarterly review. Use it to catch silent regressions between audits and to feed your dashboards with fresh telemetry.',
    bullets: [
      'Continuous SNMP and SSH polling',
      'Interface, environmental and resource sensors',
      'Configurable thresholds with severity levels',
      'Time-series persisted alongside audit data',
      'Feeds dashboards and report blocks',
    ],
    cta: 'Read the monitoring guide',
  },
  lifecycle: {
    title: 'Lifecycle tracking',
    lead: 'Plan retirements before they bite.',
    body:
      'Auditix queries vendor lifecycle APIs to keep End-of-Sale, End-of-Software-Maintenance and End-of-Life dates fresh on every device. A configurable freshness score warns you when a model is about to fall off support, so renewal cycles and replacement budgets land on the right side of risk.',
    bullets: [
      'Dynamic EoS / EoSM / EoL fetched from vendor plugins',
      'Configurable freshness score per device',
      'Aggregated views per vendor, per model, per site',
      'Surfaces upcoming retirements months in advance',
      'Plugs into PDF report blocks for budget planning',
    ],
    cta: 'Explore lifecycle tracking',
  },
  scalable: {
    title: 'Docker-native & scalable',
    lead: 'Container-first, horizontally scalable.',
    body:
      'Auditix runs as a Docker compose stack out of the box and scales horizontally when the workload demands it. Workers spin up to absorb collection bursts; the API and UI tiers can be replicated behind a load balancer. Bring your own Postgres and Redis and the same release runs from a homelab to a large MSP.',
    bullets: [
      'Docker-compose deployment in under 10 minutes',
      'Horizontal worker pool — add containers, get throughput',
      'Stateless API and UI tiers behind a load balancer',
      'Bring your own Postgres and Redis',
      'Same image from homelab to MSP-scale',
    ],
    cta: 'Read the architecture guide',
  },
  'multi-tenant': {
    title: 'Multi-tenant',
    lead: 'One instance, every client.',
    body:
      'Auditix is multi-tenant by design via the "context" primitive. Each tenant has its own nodes, collections, policies, reports, themes and API tokens — and zero visibility on the others. Perfect if you run audits for several clients from a single instance, or if you separate production from lab inside the same company.',
    bullets: [
      'Strict context isolation across every data primitive',
      'Per-context users, roles and API tokens',
      'Per-context themes for white-label reports',
      'Cross-context overview reserved for super-admins',
      'Same workflow whether you have 2 or 200 tenants',
    ],
    cta: 'Read the contexts guide',
  },
  labs: {
    title: 'Labs for teaching',
    lead: 'Auto-validated network labs.',
    body:
      'Teaching networking, security or automation? Auditix doubles as a lab validator: define what a "correct" lab configuration looks like with the same compliance engine, and Auditix checks each student against it before letting them move to the next step. Instructors save hours of manual verification and students gain real autonomy.',
    bullets: [
      'Reuse the compliance engine to express lab targets',
      'Per-student validation, in real time',
      'Progression gated by passing each step',
      'Detailed failure feedback so students self-correct',
      'Frees instructors from manual config review',
    ],
    cta: 'Talk to us about labs',
  },
  backup: {
    title: 'Backup & import',
    lead: 'Your instance, portable as JSON.',
    body:
      'Every Auditix object — nodes, policies, themes, schemas, rules, API tokens — can be exported to modular JSON files. Back up a single tenant or the whole platform, replay it into a fresh environment, or seed a new instance from a template. The same JSON layer powers data migrations between versions.',
    bullets: [
      'Modular JSON export per object family',
      'Full-instance or per-tenant backup',
      'Re-import into any environment',
      'Version-tagged for migration safety',
      'Same format used to seed lab and demo instances',
    ],
    cta: 'See backup options',
  },
  'auth-sso': {
    title: 'Auth & SSO',
    lead: 'Plug Auditix into your IdP.',
    body:
      'Auditix supports OIDC against any compliant provider — Microsoft Entra ID, Google Workspace, Okta, Auth0, Keycloak and more. Combine SSO with TOTP-based 2FA and an internal password policy for accounts that still need local credentials. Per-token context scoping makes API access tidy on the integration side too.',
    bullets: [
      'OIDC with any compliant identity provider',
      'TOTP-based 2FA for local accounts',
      'Internal password policy (length, complexity, rotation)',
      'Per-token context scoping for API access',
      'Audit trail on every authentication event',
    ],
    cta: 'Read the OIDC guide',
  },
  api: {
    title: 'Open REST API',
    lead: 'Drive Auditix from your automation stack.',
    body:
      'Every action available in the UI is also exposed by a REST API v1, documented with OpenAPI and shipped with Swagger UI inside each instance. Token-based authentication scopes access to a specific context, so you can wire Auditix into ITSM workflows, CI pipelines or your own scripting without opening unrelated tenants.',
    bullets: [
      'Full REST API v1 with OpenAPI specification',
      'Swagger UI bundled inside every instance',
      'Token authentication, scoped per context',
      'Same endpoints that power the UI',
      'Stable contract across the 5.x line',
    ],
    cta: 'Read the API reference',
  },
};
