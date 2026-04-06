import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'Auditix',
  tagline: 'Network compliance auditing platform',
  favicon: 'img/favicon.ico',

  url: 'https://tchevalleraud.github.io',
  baseUrl: process.env.BASE_URL || '/auditix/',

  organizationName: 'tchevalleraud',
  projectName: 'auditix',

  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',

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
              label: '2.1.x',
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
    navbar: {
      title: 'Auditix',
      logo: {
        alt: 'Auditix Logo',
        src: 'img/logo.png',
        srcDark: 'img/logo-dark.png',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docsSidebar',
          position: 'left',
          label: 'Documentation',
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
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['bash', 'yaml', 'json', 'php'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
