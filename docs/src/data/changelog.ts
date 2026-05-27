/**
 * Changelog displayed on /changelog. Most recent first.
 *
 * Dates are ISO (YYYY-MM-DD). Major releases use kind = 'major' and get a
 * dedicated spotlight block with a screenshot (or placeholder). Minors and
 * patches render as compact entries grouped by version.
 *
 * Translatable strings carry an `i18nId` so we can override them per locale
 * via i18n/<locale>/code.json. When no override exists, the English fallback
 * baked into this file is used as-is.
 */

export type ReleaseKind = 'major' | 'minor' | 'patch';

export interface ReleaseFeature {
  /** Headline for the feature block (one line). */
  title: string;
  /** Optional emoji glyph rendered next to the title. */
  icon?: string;
  /** Detailed paragraph. */
  description: string;
  /** Optional sub-features (rendered as bullets under the feature block). */
  items?: string[];
}

export interface Release {
  version: string;
  /** ISO date or null for unreleased / TBA. */
  date: string | null;
  kind: ReleaseKind;
  /** Short tag line under the version (eg. "AI Edition"). */
  tagline?: string;
  /** Paragraph shown right under the title. */
  summary: string;
  /** Screenshot displayed only when kind === 'major'. Falls back to placeholder. */
  imageSources?: {light: string; dark: string};
  /** Placeholder glyph when no real screenshot is available. */
  icon?: string;
  /** Detailed features (only used on majors). */
  features?: ReleaseFeature[];
  /** Bullet list of fixes (mostly for minors / patches). */
  bullets?: string[];
}

export const RELEASES: Release[] = [
  {
    version: '5.0.0',
    date: null,
    kind: 'major',
    tagline: 'AI Edition',
    summary:
      'Auditix 5.0 is the first release with an AI layer baked in: a side-panel assistant, AI-drafted report paragraphs, four LLM provider types, plus a polished topology v2 (the legacy v1 stack is gone) and stronger collection rules.',
    imageSources: {
      light: '/img/screenshots/landing-ai-assistant-light.png',
      dark: '/img/screenshots/landing-ai-assistant-dark.png',
    },
    icon: '🧠',
    features: [
      {
        icon: '🧠',
        title: 'AI side-panel assistant',
        description:
          'Ask your network in plain English from anywhere in the app. Optional tool use stays strictly read-only and every payload is reviewed by the user before reaching a cloud LLM.',
        items: [
          'Natural-language Q&A grounded in your data',
          'Strictly read-only tools, no write paths',
          'Human-in-the-loop gate on every LLM call',
          'Per-context assistant configuration',
        ],
      },
      {
        icon: '✍️',
        title: 'AI Assist in report paragraphs',
        description:
          'One-click drafting of remediation, summary and introduction paragraphs in PDF and mail reports — the assistant respects your tone and inserts directly into the editor.',
        items: [
          'Available in every paragraph block',
          'Context-aware (knows the surrounding report data)',
          'Outputs stay editable before publishing',
        ],
      },
      {
        icon: '🔌',
        title: 'Four LLM provider types',
        description:
          'OpenRouter, OpenAI, Anthropic and Ollama (local). Provider credentials are encrypted at rest and scoped per context.',
        items: [
          'Cloud or on-prem — same UX',
          'Encrypted credentials, no secrets in the UI',
          'Per-context default provider',
        ],
      },
      {
        icon: '🗺',
        title: 'Custom schemas in reports',
        description:
          'A new Excalidraw-style canvas lets you draw schemas inside the app and drop them in any PDF or mail report block.',
      },
      {
        icon: '🛡',
        title: 'Improved collection rules',
        description:
          'Always-blocking match, keyMode=all, named captures and block key templates make extraction rules far more expressive — debugging output is also clearer.',
      },
      {
        icon: '🧹',
        title: 'Legacy topology v1 removed',
        description:
          'The v1 topology stack is gone. v2 is the only path forward — lighter, faster, cleaner, and the supported foundation for future protocol overlays.',
      },
    ],
  },
  {
    version: '4.1.1',
    date: '2026-05-04',
    kind: 'patch',
    summary: 'Maintenance release for 4.1.',
    bullets: [
      'Bug fixes and dependency bumps following the 4.1.0 rollout',
    ],
  },
  {
    version: '4.1.0',
    date: '2026-05-03',
    kind: 'minor',
    summary: 'Context portability and a built-in audit trail.',
    bullets: [
      'Export and import full contexts as ZIP archives',
      'Audit log viewer with syslog forwarding to SIEM collectors',
      'Strict context-scoped access enforcement on API endpoints',
      'New `make status` target with a synthetic instance status table',
    ],
  },
  {
    version: '4.0.0',
    date: '2026-05-03',
    kind: 'major',
    tagline: 'Identity, scale & graphical reports',
    summary:
      'Auditix 4.0 brings enterprise-grade authentication, horizontal scaling and a complete graphical mail-report editor — plus a long list of UX upgrades across nodes, schedules and the lifecycle timeline.',
    icon: '🏗',
    features: [
      {
        icon: '🔐',
        title: 'Multi-provider OIDC + internal IdP',
        description:
          'Plug Auditix into any OIDC-compliant provider (Entra ID, Google, Okta, Auth0, Keycloak) or stick with the internal IdP — now with a configurable password policy and GUI idle timeout.',
      },
      {
        icon: '🚀',
        title: 'Dynamic worker pool scaling',
        description:
          'Two-level container/process management lets the worker pool grow with the collection workload — no more manual sizing of the consumer count.',
      },
      {
        icon: '📨',
        title: 'Graphical mail reports',
        description:
          'A block editor for mail reports, SMTP servers admin (CRUD + test send), three addressing modes (TO, BCC, mail merge) and schedule automation.',
      },
      {
        icon: '🌐',
        title: 'Built-in NGINX server management',
        description:
          'Admin UI for HTTP/HTTPS modes and SSL certificates — one less ops tool to maintain.',
      },
      {
        icon: '📊',
        title: 'Richer report blocks',
        description:
          'Chart blocks, lifecycle timeline, block duplication and per-column sort on inventory_table.',
      },
      {
        icon: '🧰',
        title: 'Public API expansion',
        description:
          'CRUD endpoints for tags, profiles, credentials and collection imports — bringing the REST API in line with the UI.',
      },
    ],
  },
  {
    version: '3.5.0',
    date: '2026-04-29',
    kind: 'minor',
    summary: 'TOTP 2FA and a richer compliance reporting toolbox.',
    bullets: [
      'TOTP 2FA enrollment and login flow',
      'New compliance report blocks: matrix, non-compliant list, status table, recommendations',
      'Backend readiness gate and worker permissions fix (3.5.3)',
      'Inventory category column visibility, ordering and sorting (3.5.5)',
    ],
  },
  {
    version: '3.4.0',
    date: '2026-04-20',
    kind: 'minor',
    summary: 'Public REST API v1 and large-file imports.',
    bullets: [
      'Public REST API v1 with Swagger UI and API token authentication',
      'CSV import for nodes with sortable paginated table and persisted preferences',
      'ZIP import for collections and configurable prompt regex (3.4.5)',
      'Upload limits raised to 50 MB (3.4.7)',
    ],
  },
  {
    version: '3.3.0',
    date: '2026-04-16',
    kind: 'minor',
    summary: 'Topology manual links and a smarter match rule editor.',
    bullets: [
      'Topology manual links between nodes',
      'Context menu on the topology canvas',
      'Compliance score computation fix',
      'Match rule editor improvements',
    ],
  },
  {
    version: '3.2.0',
    date: '2026-04-12',
    kind: 'minor',
    summary: 'Compliance debug introspection and multi-source joins.',
    bullets: [
      'Debug introspection on nested compliance blocks',
      'Multi-source join in collection rules',
      'Source-fields display in the rule editor',
    ],
  },
  {
    version: '3.1.0',
    date: '2026-04-12',
    kind: 'minor',
    summary: 'Vendor plugins and system-updates scoring.',
    bullets: [
      'Vendor plugin system for hardware data ingestion',
      'System-updates scoring on the node summary',
      'Collection rule translations',
    ],
  },
  {
    version: '3.0.0',
    date: '2026-04-10',
    kind: 'major',
    tagline: 'Topology v1',
    summary:
      'Auditix 3.0 introduced the first topology visualization stack — auto-computed from your collections, with a WYSIWYG label editor and embeddable topology blocks in reports.',
    icon: '🗺',
    features: [
      {
        icon: '🗺',
        title: 'Topology visualization',
        description:
          'A first interactive map of your network, computed from your collected data — laid the groundwork for the v2 stack that supersedes it in 5.0.',
      },
      {
        icon: '✏️',
        title: 'WYSIWYG label editor',
        description:
          'Visual labelling on top of the topology canvas, ready for export to PDF.',
      },
      {
        icon: '📄',
        title: 'Topology blocks in reports',
        description:
          'Drop a live topology snapshot directly inside any PDF or mail report.',
      },
    ],
  },
  {
    version: '2.1.0',
    date: '2026-04-06',
    kind: 'minor',
    summary: 'Labs, compliance refactor and manual imports.',
    bullets: [
      'Labs — auto-validated configuration checks against the compliance engine',
      'Compliance engine refactoring',
      'Report blocks groundwork',
      'Manual import of command outputs',
    ],
  },
  {
    version: '2.0.0',
    date: '2026-04-03',
    kind: 'major',
    tagline: 'Reports & scheduling',
    summary:
      'Auditix 2.0 introduced per-node reports, template variables and automated scheduling — the foundation of every later reporting feature.',
    icon: '📄',
    features: [
      {
        icon: '📄',
        title: 'Per-node reports',
        description:
          'First-class per-node deliverables, ready for templating and themed output.',
      },
      {
        icon: '🧩',
        title: 'Template variables',
        description:
          'Dynamic placeholders in reports, evaluated against the latest collected data.',
      },
      {
        icon: '⏱',
        title: 'Automated scheduling',
        description:
          'Recurring collection + report schedules — the backbone for hands-off audits.',
      },
    ],
  },
  {
    version: '1.x',
    date: null,
    kind: 'major',
    tagline: 'Initial release line',
    summary:
      'The 1.x line laid the foundations — node inventory, base collection model, first compliance rules and the initial Docker compose deployment story.',
    icon: '🌱',
    features: [
      {
        icon: '📦',
        title: 'Node inventory',
        description: 'First inventory model with vendor / model / hostname metadata.',
      },
      {
        icon: '🛰',
        title: 'Base collection model',
        description: 'SSH command runner and the first collection rule format.',
      },
      {
        icon: '🛡',
        title: 'First compliance rules',
        description: 'Early compliance engine that became the basis for everything since.',
      },
    ],
  },
];
