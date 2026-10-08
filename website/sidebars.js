// @ts-check

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

/**
 * Sidebar for the jekyll-js docs. Hand-written so the reading order is
 * deliberate: tutorials first, then the API reference, then project docs.
 * The docs sources live in ../../docs/ and are copied into website/docs/
 * by the docs/content worker — keep this file in sync with website/docs/.
 *
 * @type {import('@docusaurus/plugin-content-docs').SidebarsConfig}
 */
const sidebars = {
  // NOTE: the id must stay `tutorialSidebar` — docusaurus.config.js's
  // navbar has a `docSidebar` item pointing at it (do not touch config).
  tutorialSidebar: [
    {
      type: 'category',
      label: 'Getting Started',
      items: [
        'intro',
        'getting-started',
        'configuration',
        'templates',
        'plugins',
        'migration',
      ],
    },
    {
      type: 'category',
      label: 'API Reference',
      items: [
        'api/engine',
        'api/browser',
        'changelog',
      ],
    },
    {
      type: 'category',
      label: 'Project',
      items: [
        'project/parity',
        'project/opal-boundaries',
        'project/wasm-oracle-status',
        'project/announcement',
      ],
    },
  ],
};

export default sidebars;
