import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docsSidebar: [
    'intro',
    {
      type: 'category',
      label: 'Getting Started',
      collapsed: false,
      items: [
        'getting-started/requirements',
        'getting-started/installation',
        'getting-started/first-steps',
      ],
    },
    {
      type: 'category',
      label: 'User Guide',
      items: [
        'guide/dashboard',
        {
          type: 'category',
          label: 'Node Management',
          items: [
            'guide/nodes/manufacturers',
            'guide/nodes/models',
            'guide/nodes/profiles',
            'guide/nodes/nodes',
            'guide/nodes/tags',
          ],
        },
        {
          type: 'category',
          label: 'Topology',
          items: [
            'guide/topology/overview',
            'guide/topology/link-rules',
          ],
        },
        {
          type: 'category',
          label: 'Collections',
          items: [
            'guide/collections/commands',
            'guide/collections/rules',
            'guide/collections/running',
          ],
        },
        {
          type: 'category',
          label: 'Compliance',
          items: [
            'guide/compliance/rules',
            'guide/compliance/policies',
            'guide/compliance/evaluation',
          ],
        },
        {
          type: 'category',
          label: 'Inventory',
          items: [
            'guide/inventory/categories',
            'guide/inventory/lifecycle',
          ],
        },
        {
          type: 'category',
          label: 'Reports',
          items: [
            'guide/reports/creating',
            'guide/reports/themes',
            'guide/reports/mail-reports',
            'guide/reports/blocks',
          ],
        },
        'guide/schedules',
        'guide/monitoring',
      ],
    },
    {
      type: 'category',
      label: 'API',
      items: [
        'api/overview',
        'api/authentication',
        'api/endpoints',
      ],
    },
    {
      type: 'category',
      label: 'Administration',
      items: [
        'admin/contexts',
        'admin/users',
        {
          type: 'category',
          label: 'Authentication',
          items: [
            'admin/authentication/oidc',
            'admin/authentication/2fa',
            'admin/authentication/password-policy',
          ],
        },
        {
          type: 'category',
          label: 'Mail',
          items: [
            'admin/mail/servers',
          ],
        },
        {
          type: 'category',
          label: 'Server',
          items: [
            'admin/server/nginx',
            'admin/server/ssl',
            'admin/server/workers',
          ],
        },
        {
          type: 'category',
          label: 'Audit',
          items: [
            'admin/audit/audit-log',
            'admin/audit/syslog',
          ],
        },
        'admin/health',
        'admin/environment-variables',
      ],
    },
  ],
};

export default sidebars;
