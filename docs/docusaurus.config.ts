import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

/**
 * Auditix documentation site.
 *
 * Deployed at https://tchevalleraud.github.io/auditix/ via GitHub Actions.
 * - In CI, BASE_URL is set to /auditix/ by .github/workflows/deploy-docs.yml.
 * - Locally, `npm run start` sets BASE_URL=/ so the dev server runs at http://localhost:3000/.
 * - If you want to mirror prod URLs locally, run `npm run start:prod-url`.
 */
const config: Config = {
  title: 'Auditix',
  tagline: 'AI-powered network compliance auditing platform',
  favicon: 'img/favicon.ico',

  url: 'https://tchevalleraud.github.io',
  baseUrl: process.env.BASE_URL || '/auditix/',

  organizationName: 'tchevalleraud',
  projectName: 'auditix',
  deploymentBranch: 'gh-pages',
  trailingSlash: false,

  onBrokenLinks: 'throw',
  onBrokenAnchors: 'warn',

  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },

  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'fr'],
    localeConfigs: {
      en: { label: 'English', direction: 'ltr' },
      fr: { label: 'Francais', direction: 'ltr' },
    },
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          routeBasePath: '/',
          lastVersion: 'current',
          versions: {
            current: {
              label: '5.0.0',
              badge: true,
            },
          },
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    colorMode: {
      defaultMode: 'light',
      respectPrefersColorScheme: true,
    },
    image: 'img/banner.svg',
    navbar: {
      title: 'Auditix',
      logo: {
        alt: 'Auditix Logo',
        src: 'img/logo.svg',
        srcDark: 'img/logo-dark.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docsSidebar',
          position: 'left',
          label: 'Documentation',
        },
        {
          to: '/usecase/intro',
          label: 'Use cases',
          position: 'left',
        },
        {
          to: '/whats-new-5.0',
          label: "What's new",
          position: 'left',
        },
        {
          type: 'docsVersionDropdown',
          position: 'right',
        },
        {
          type: 'localeDropdown',
          position: 'right',
        },
        {
          href: 'https://github.com/tchevalleraud/auditix',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Documentation',
          items: [
            { label: 'Getting Started', to: '/getting-started/installation' },
            { label: 'User Guide', to: '/guide/dashboard' },
            { label: 'Use cases', to: '/usecase/intro' },
            { label: 'API reference', to: '/api/overview' },
          ],
        },
        {
          title: 'AI Edition',
          items: [
            { label: 'AI overview', to: '/guide/ai/overview' },
            { label: 'LLM providers', to: '/admin/ai/llm-providers' },
            { label: 'Assistants', to: '/guide/ai/assistants' },
          ],
        },
        {
          title: 'Community',
          items: [
            { label: 'GitHub', href: 'https://github.com/tchevalleraud/auditix' },
            { label: 'Issues', href: 'https://github.com/tchevalleraud/auditix/issues' },
          ],
        },
      ],
      copyright: `Copyright ${new Date().getFullYear()} Auditix. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.oneLight,
      darkTheme: prismThemes.oneDark,
      additionalLanguages: ['bash', 'yaml', 'json', 'php'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
