/**
 * Single source of truth for the 13 individual feature pages and the
 * homepage "Features" dropdown order.
 *
 * Order matches the landing page : 5 spotlight (phares) first, then the
 * secondary cards (mineures) in the order they appear on the home grid.
 */
export interface FeatureMeta {
  slug: string;
  /** Emoji glyph used in the placeholder hero when no real screenshot exists. */
  icon: string;
  /** Real screenshot — when set, takes precedence over the placeholder. */
  imageSources?: {light: string; dark: string};
  /** Documentation deep-link, displayed as the page CTA. */
  docLink?: string;
  /** 'ai' renders the page hero with the gradient AI accent. */
  variant?: 'ai' | 'default';
  /** "Headline" group on the landing — drives section header on the page. */
  group: 'spotlight' | 'secondary';
}

export const FEATURES: FeatureMeta[] = [
  {
    slug: 'ai-assistant',
    icon: '🧠',
    imageSources: {
      light: '/img/screenshots/landing-ai-assistant-light.png',
      dark: '/img/screenshots/landing-ai-assistant-dark.png',
    },
    docLink: '/guide/ai/overview',
    variant: 'ai',
    group: 'spotlight',
  },
  {
    slug: 'topology',
    icon: '🗺',
    docLink: '/guide/topology/overview',
    group: 'spotlight',
  },
  {
    slug: 'collection',
    icon: '📡',
    docLink: '/guide/collections/commands',
    group: 'spotlight',
  },
  {
    slug: 'compliance',
    icon: '🛡',
    docLink: '/guide/compliance/rules',
    group: 'spotlight',
  },
  {
    slug: 'reports',
    icon: '📄',
    docLink: '/guide/reports/creating',
    group: 'spotlight',
  },
  {
    slug: 'monitoring',
    icon: '🔭',
    docLink: '/guide/monitoring',
    group: 'secondary',
  },
  {
    slug: 'lifecycle',
    icon: '⏳',
    docLink: '/guide/inventory/lifecycle',
    group: 'secondary',
  },
  {
    slug: 'scalable',
    icon: '🐳',
    docLink: '/getting-started/architecture',
    group: 'secondary',
  },
  {
    slug: 'multi-tenant',
    icon: '🏢',
    docLink: '/admin/contexts',
    group: 'secondary',
  },
  {
    slug: 'labs',
    icon: '🎓',
    group: 'secondary',
  },
  {
    slug: 'backup',
    icon: '💾',
    group: 'secondary',
  },
  {
    slug: 'auth-sso',
    icon: '🔐',
    docLink: '/admin/authentication/oidc',
    group: 'secondary',
  },
  {
    slug: 'api',
    icon: '🔌',
    docLink: '/api/overview',
    group: 'secondary',
  },
];

export function findFeature(slug: string): FeatureMeta | undefined {
  return FEATURES.find((f) => f.slug === slug);
}
