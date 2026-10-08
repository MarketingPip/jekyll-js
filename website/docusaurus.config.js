// @ts-check
// `@type` JSDoc annotations allow editor autocompletion and type checking
// (when paired with `@ts-check`).

import {createRequire} from 'node:module';
import {themes as prismThemes} from 'prism-react-renderer';

const require = createRequire(import.meta.url);

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'Jekyll-JS',
  tagline: 'Jekyll, in JavaScript — static sites without Ruby',
  favicon: 'img/favicon.ico',

  // Set the production url of your site here
  url: 'https://marketingpip.github.io',
  // Set the /<baseUrl>/ pathname under which your site is served
  // For GitHub pages deployment, it is often '/<projectName>/'
  baseUrl: '/jekyll-js/',

  // GitHub pages deployment config.
  organizationName: 'MarketingPip', // Usually your GitHub org/user name.
  projectName: 'jekyll-js', // Usually your repo name.

  onBrokenLinks: 'throw',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          sidebarPath: './sidebars.js',
          // "Edit this page" links point at the website/ dir of the repo.
          editUrl: 'https://github.com/MarketingPip/jekyll-js/tree/main/website/',
        },
        // No blog: the changelog lives in docs/. Disable the plugin entirely.
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      }),
    ],
  ],

  themes: [
    [
      // Fully static, offline full-text search — no Algolia account needed.
      // `hashed: true` is required for correct routing on GitHub Pages.
      require.resolve('@easyops-cn/docusaurus-search-local'),
      /** @type {import('@easyops-cn/docusaurus-search-local').Options} */
      ({
        hashed: true,
        indexDocs: true,
        indexBlog: false,
        indexPages: false,
        language: ['en'],
        highlightSearchTermsOnTargetPage: true,
        searchResultLimits: 8,
        searchResultContextMaxLength: 50,
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      // Replace with your project's social card
      image: 'img/docusaurus-social-card.jpg',
      colorMode: {
        respectPrefersColorScheme: true,
      },
      navbar: {
        title: 'Jekyll-JS',
        logo: {
          alt: 'Jekyll-JS Logo',
          src: 'img/logo.svg',
        },
        items: [
          {
            type: 'docSidebar',
            sidebarId: 'tutorialSidebar',
            position: 'left',
            label: 'Docs',
          },
          {
            // Top-level, unversioned playground (deployed separately).
            href: 'https://marketingpip.github.io/jekyll-js/playground/',
            label: 'Playground',
            position: 'left',
          },
          {
            type: 'docsVersionDropdown',
            position: 'right',
            // Populated by `npm run docusaurus docs:version <x.y.z>` (Worker 2).
          },
          {
            href: 'https://github.com/MarketingPip/jekyll-js',
            label: 'GitHub',
            position: 'right',
          },
        ],
      },
      footer: {
        style: 'dark',
        links: [
          {
            title: 'Docs',
            items: [
              {
                label: 'Getting Started',
                to: '/docs/intro',
              },
            ],
          },
          {
            title: 'Project',
            items: [
              {
                label: 'Playground',
                href: 'https://marketingpip.github.io/jekyll-js/playground/',
              },
              {
                label: 'GitHub',
                href: 'https://github.com/MarketingPip/jekyll-js',
              },
            ],
          },
        ],
        copyright: `Copyright © ${new Date().getFullYear()} MarketingPip. Built with Docusaurus.`,
      },
      prism: {
        theme: prismThemes.github,
        darkTheme: prismThemes.dracula,
        additionalLanguages: ['ruby', 'bash', 'diff', 'json'],
      },
    }),
};

export default config;
