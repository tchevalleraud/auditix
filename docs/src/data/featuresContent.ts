/**
 * English defaults for the individual feature pages. The matching FR strings
 * live in i18n/fr/code.json under the `featurePage.<slug>.*` namespace.
 * Translate IDs follow the convention:
 *   featurePage.<slug>.title  | .lead | .body | .cta | .bullet.<n>
 *   featurePage.<slug>.example.<id>.title | .description
 *   featurePage.<slug>.example.<id>.barTitle | .image.alt
 */
export interface FeatureExample {
  /** Stable slug used to build i18n keys (e.g. "mstp", "isis-multi-area"). */
  id: string;
  /** Browser-frame title shown above the media. */
  barTitle: string;
  /** Short headline rendered next to the media. */
  title: string;
  /** One- or two-sentence description. */
  description: string;
  /** Single image / GIF / video path — works for both themes. */
  media?: string;
  /** Themed pair (light + dark variants of a static screenshot). */
  mediaSources?: {light: string; dark: string};
}

export interface FeatureContent {
  title: string;
  lead: string;
  body: string;
  bullets: string[];
  cta: string;
  /** Optional "Examples" gallery — alternating media/text rows under the bullets. */
  examplesHeading?: string;
  examples?: FeatureExample[];
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
    examplesHeading: 'See it in action',
    examples: [
      {
        id: 'q-and-a',
        barTitle: 'AI Assistant · Q&A',
        title: 'Q&A grounded in your data',
        description:
          'Ask in plain language and get answers tied to your real collections. The assistant calls read-only tools to gather context, then cites which devices and rows it relied on so you can double-check the source.',
      },
      {
        id: 'payload-review',
        barTitle: 'AI Assistant · payload review',
        title: 'Human-reviewed payloads',
        description:
          'Every LLM call surfaces the exact payload about to be sent — fields, values, redactions. Approve, reject or trim it; nothing leaves your environment without an explicit go-ahead.',
      },
      {
        id: 'drafting',
        barTitle: 'AI Assistant · drafting',
        title: 'Drafting policies & paragraphs',
        description:
          'Generates policy descriptions, audit rule structures and PDF paragraphs from a one-line prompt. Refine in place, accept the diff and the draft lands directly inside the form you were filling.',
      },
    ],
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
    examplesHeading: 'See it in action',
    examples: [
      {
        id: 'mstp',
        barTitle: 'Topology · MSTP overlay',
        title: 'MSTP — one tree per instance',
        description:
          'Pick an MSTI in the instance picker and the map rebuilds the spanning-tree it elects: root bridge highlighted, blocked ports clearly marked, alternate paths greyed out. Switch instance to compare load-balancing.',
        media: '/img/screenshots/topology/example-mstp.svg',
      },
      {
        id: 'isis-multi-area',
        barTitle: 'Topology · ISIS multi-area',
        title: 'ISIS multi-area — areas you can see',
        description:
          'Each ISIS area becomes a soft hull around its routers. L1L2 adjacencies that cross an area boundary are drawn with a zebra pattern in the two area colours, making boundaries obvious without cluttering the map.',
        media: '/img/screenshots/topology/example-isis-multi-area.svg',
      },
      {
        id: 'layouts',
        barTitle: 'Topology · Layouts',
        title: 'Switch layout, save the one you like',
        description:
          'Try cose for a generic mesh, dagre for a clean core-to-access hierarchy, concentric for star topologies — or arrange devices by hand and save the layout per context. Auditix remembers it for everyone in the tenant.',
        media: '/img/screenshots/topology/example-layouts.svg',
      },
    ],
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
    examplesHeading: 'See it in action',
    examples: [
      {
        id: 'ssh-jobs',
        barTitle: 'Collection · SSH jobs',
        title: 'SSH collection on a schedule',
        description:
          'Schedule jobs, watch them complete and inspect the structured rows produced — per command, per device, per run. Retry and timeout policies keep flaky links from breaking the audit.',
      },
      {
        id: 'extraction-rules',
        barTitle: 'Collection · extraction rules',
        title: 'Reusable extraction rules',
        description:
          'Point at columns inside the raw output, normalise them into the same dataset across vendors. Reuse the rule on every device of the same model — write once, audit everywhere.',
      },
      {
        id: 'manual-import',
        barTitle: 'Collection · manual import',
        title: 'Manual import for off-site',
        description:
          'Drop a ZIP or CSV with command outputs from devices you cannot reach — air-gapped sites, third-party gear, lab snapshots. The same extraction pipeline takes over and the audit stays consistent.',
      },
    ],
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
    examplesHeading: 'See it in action',
    examples: [
      {
        id: 'visual-editor',
        barTitle: 'Compliance · rule editor',
        title: 'Visual rule editor',
        description:
          'Drag-and-drop blocks compose a rule — conditions, comparisons, nested groups. No DSL to memorise; the editor explains, in plain text, what each branch evaluates against.',
      },
      {
        id: 'policy-matrix',
        barTitle: 'Compliance · policy matrix',
        title: 'Per-node policy matrix',
        description:
          'Score every node against every policy in a single, drillable matrix. Click a red cell and you land directly on the failing rule with the device row that caused it.',
      },
      {
        id: 'exceptions',
        barTitle: 'Compliance · exceptions',
        title: 'First-class exception handling',
        description:
          'Mark a node as exempted from a rule with a reason and an expiry date. Auditix tracks who approved it, when it ends and surfaces the exception inside every report — fully audited.',
      },
    ],
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
    examplesHeading: 'See it in action',
    examples: [
      {
        id: 'block-editor',
        barTitle: 'Reports · block editor',
        title: 'Block-based editor',
        description:
          'Assemble charts, tables, lifecycle widgets, topology snapshots and custom schemas in a drag-and-drop canvas. Reorder freely; preview the rendered PDF on the right while you edit on the left.',
      },
      {
        id: 'themes-per-context',
        barTitle: 'Reports · themes',
        title: 'One report, every brand',
        description:
          'The same template renders in each tenant\'s theme — logos, colours, fonts, headers, footers. Run an MSP? Send the same audit to every client without rebuilding the report.',
      },
      {
        id: 'ai-paragraph',
        barTitle: 'Reports · AI Assist',
        title: 'AI Assist for paragraphs',
        description:
          'Highlight a block and ask the assistant to draft the prose around the findings — executive summary, recommendations, risk wording. Refine in place, accept the diff.',
      },
    ],
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
    examplesHeading: 'See it in action',
    examples: [
      {
        id: 'live-polling',
        barTitle: 'Monitoring · live polling',
        title: 'Live SNMP & SSH polling',
        description:
          'CPU, memory, interface counters and queue depths refresh continuously alongside your audit data. Per-device graphs let you correlate compliance drift with the underlying load.',
      },
      {
        id: 'thresholds',
        barTitle: 'Monitoring · thresholds',
        title: 'Threshold-based alerts',
        description:
          'Tag a metric with severity levels and Auditix raises an event the moment it crosses the line. Route alerts to mail, webhook or SIEM — no extra agent to install.',
      },
      {
        id: 'sensor-coverage',
        barTitle: 'Monitoring · sensors',
        title: 'Environmental sensors',
        description:
          'Temperature, fan speed and PSU status pulled from each device and stored as time-series. Spot a fan failure or a hot rack before it forces a hardware swap.',
      },
    ],
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
    examplesHeading: 'See it in action',
    examples: [
      {
        id: 'freshness-score',
        barTitle: 'Lifecycle · freshness',
        title: 'Freshness score per device',
        description:
          'Each device gets a score from green to red based on its distance to EoS, EoSM and EoL. Sort the inventory by score and you immediately see which models need a renewal plan.',
      },
      {
        id: 'vendor-coverage',
        barTitle: 'Lifecycle · vendor coverage',
        title: 'Vendor coverage at a glance',
        description:
          'Aggregated views per vendor, model and site let you spot the risky clusters early — three sites running the same EoL switch line, a fleet of phones losing firmware support next quarter.',
      },
      {
        id: 'renewal-timeline',
        barTitle: 'Lifecycle · renewals',
        title: 'Renewal months in advance',
        description:
          'A timeline view of upcoming retirements, grouped by quarter and site. Drop it into a PDF block and your budget conversation comes pre-loaded with the right numbers.',
      },
    ],
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
    examplesHeading: 'See it in action',
    examples: [
      {
        id: 'compose-up',
        barTitle: 'Scalable · compose',
        title: 'docker compose up',
        description:
          'One compose file brings up the entire stack — Postgres, Redis, API, UI, workers. From clone to first audit in under ten minutes; same image on a homelab and an MSP-scale rack.',
      },
      {
        id: 'worker-pool',
        barTitle: 'Scalable · worker pool',
        title: 'Horizontal worker scaling',
        description:
          'Add a worker replica and throughput follows — no shared state to wrangle. Burst-collect 5,000 devices on a Sunday, scale back to a steady rate on Monday.',
      },
      {
        id: 'behind-lb',
        barTitle: 'Scalable · load balancer',
        title: 'Stateless tiers behind a LB',
        description:
          'API and UI are stateless — replicate them, route by health, ride the spikes. Bring your own Postgres and Redis and the same release runs from a single VM to a multi-node deployment.',
      },
    ],
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
    examplesHeading: 'See it in action',
    examples: [
      {
        id: 'context-switcher',
        barTitle: 'Multi-tenant · switcher',
        title: 'One-click context switcher',
        description:
          'Switch tenant in one click and the whole UI follows — nodes, policies, themes, reports. No risk of editing client A while looking at client B; the navigation makes the active context obvious.',
      },
      {
        id: 'white-label',
        barTitle: 'Multi-tenant · themes',
        title: 'White-label PDF themes',
        description:
          'Each context owns its theme — logo, colour palette, fonts, footers. Same report template, brand-perfect output per client. Onboarding a new tenant is a theme upload, not a redesign.',
      },
      {
        id: 'scoped-tokens',
        barTitle: 'Multi-tenant · API tokens',
        title: 'Context-scoped API tokens',
        description:
          'API tokens are bound to a single context. An automation script can\'t accidentally read or write into the wrong tenant — token, audit log and data isolation all line up.',
      },
    ],
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
    examplesHeading: 'See it in action',
    examples: [
      {
        id: 'lab-targets',
        barTitle: 'Labs · targets',
        title: 'Lab targets as compliance rules',
        description:
          'Define what "correct" looks like using the same rule editor that drives audits. A working OSPF area, a clean ACL, a fully-meshed iBGP — express it once, validate every student against it.',
      },
      {
        id: 'live-validation',
        barTitle: 'Labs · validation',
        title: 'Per-student live validation',
        description:
          'Each student\'s device is evaluated continuously. Pass the rule, the indicator turns green; fail it, the failing condition is shown — students know exactly what to fix without waiting for the instructor.',
      },
      {
        id: 'progression-gating',
        barTitle: 'Labs · progression',
        title: 'Progression gated by passing',
        description:
          'Step 2 unlocks the moment step 1 passes. Students progress at their own pace, instructors stop chasing config screenshots, and the whole classroom finishes on time without the late-night grading.',
      },
    ],
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
    examplesHeading: 'See it in action',
    examples: [
      {
        id: 'json-export',
        barTitle: 'Backup · JSON export',
        title: 'Modular JSON export',
        description:
          'Pick the object families you want — nodes, policies, themes, tokens, schemas — and Auditix produces a clean tarball you can stash in object storage, git or your DR plan.',
      },
      {
        id: 'seed-instance',
        barTitle: 'Backup · re-import',
        title: 'Seed a fresh instance',
        description:
          'Re-import the JSON into any environment — lab, demo, disaster-recovery, a new region. Same workflow whether you\'re restoring one tenant or duplicating the whole platform.',
      },
      {
        id: 'version-safe',
        barTitle: 'Backup · version safety',
        title: 'Version-tagged for safety',
        description:
          'Every export carries a schema version. Re-import refuses an incompatible payload instead of silently corrupting it, and Auditix tells you which migration to apply first.',
      },
    ],
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
    examplesHeading: 'See it in action',
    examples: [
      {
        id: 'oidc-login',
        barTitle: 'Auth · OIDC',
        title: 'OIDC against your IdP',
        description:
          'Microsoft Entra ID, Google Workspace, Okta, Auth0, Keycloak — any compliant provider. Branded sign-in, group-to-role mapping, just-in-time provisioning. Wire it up once, your team logs in with their existing identity.',
      },
      {
        id: 'totp-enrollment',
        barTitle: 'Auth · TOTP 2FA',
        title: 'TOTP 2FA enrolment',
        description:
          'Local accounts can opt-in to TOTP — scan the QR with any authenticator app, you\'re covered. The same internal password policy enforces length, complexity and rotation for the credentials you keep on-prem.',
      },
      {
        id: 'token-scoping',
        barTitle: 'Auth · token scoping',
        title: 'Per-token context scoping',
        description:
          'Each API token is issued for one context. Your CI pipeline gets a token that can only touch its tenant — no spill-over, no accidental write to production from a staging workflow.',
      },
    ],
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
    examplesHeading: 'See it in action',
    examples: [
      {
        id: 'swagger-ui',
        barTitle: 'API · Swagger UI',
        title: 'Swagger UI bundled',
        description:
          'Every instance ships /api/docs out of the box — browse endpoints, schemas, parameters, try them live with your token. No external doc to keep in sync; the OpenAPI spec is generated from the running code.',
      },
      {
        id: 'token-auth',
        barTitle: 'API · authentication',
        title: 'Token authentication',
        description:
          'Send a bearer token, get JSON. Tokens are scoped per context, revocable in one click and audited on every call — automation that respects tenant boundaries by construction.',
      },
      {
        id: 'ui-mirror',
        barTitle: 'API · UI parity',
        title: 'UI ↔ API mirror',
        description:
          'Whatever the UI does, an API call exists for it. Zero hidden actions, zero "UI-only" buttons — drive Auditix from ITSM, CI or a Python script and get the exact same results.',
      },
    ],
  },
};
