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
          label: 'Reports',
          items: [
            'guide/reports/creating',
            'guide/reports/themes',
          ],
        },
        'guide/schedules',
        'guide/monitoring',
      ],
    },
    {
      type: 'category',
      label: 'Administration',
      items: [
        'admin/contexts',
        'admin/users',
        'admin/health',
        'admin/environment-variables',
      ],
    },
  ],
};

export default sidebars;
