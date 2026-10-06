# Announcing jekyll-js: Jekyll Without Ruby

**Render Jekyll sites entirely in JavaScript — in the browser, in Node, anywhere.**

I'm excited to announce **jekyll-js**, a faithful JavaScript port of Jekyll's static site engine. No Ruby. No gems. No toolchain. Just JavaScript.

## Why?

Jekyll is one of the most popular static site generators, powering millions of GitHub Pages sites. But it requires Ruby — a barrier for:
- **Browser-based site builders** (can't run Ruby in the browser)
- **AI agents** (spinning up Ruby to render a site is heavy)
- **Edge/serverless** (Ruby cold starts are slow)
- **Developers** who just want `npm install` and go

jekyll-js solves this: hand it files, get back rendered HTML. It runs on a plain JS object (a virtual filesystem), so it works in the browser, in Node, in edge functions — anywhere JavaScript runs.

## What It Does

```js
import { JekyllEngine } from 'jekyll-js';

const pages = await JekyllEngine.render({
  '_config.yml': 'title: My Site\n',
  '_layouts/default.html': '<html><body>{{ content }}</body></html>',
  'index.md': '---\nlayout: default\n---\n# Hello world',
});
```

**Jekyll parity:**
- Posts, drafts, pages, collections, pagination
- Front matter, Liquid templates, includes, layouts
- `site.data`, static files, excerpts, permalinks
- Timezone-correct dates
- **247 tests**, battle-tested against the real Minima theme

**Native plugins (no Ruby):**
- `jekyll-feed` — Atom feeds (uses the real gem's template)
- `jekyll-seo-tag` — `{% seo %}` meta tags
- `jekyll-sitemap` — XML sitemaps
- Sass (via dart-sass) and syntax highlighting (via highlight.js) as opt-in plugins

**JS Plugin API:**
Write Jekyll plugins in JavaScript — hooks, generators, custom tags and filters. No Opal, no Ruby shims.

```js
engine.use((engine) => {
  engine.registerGenerator((site) => {
    // Create pages programmatically
  });
  engine.registerHook('site', 'post_read', (site) => {
    // Modify the site after reading
  });
});
```

**Developer experience:**
- Fluent builder API
- TypeScript definitions
- CLI (`jekyll-js build`, `jekyll-js serve`)
- 244KB browser bundle, works from `file://`
- Interactive [playground](https://marketingpip.github.io/jekyll-js/)

## What's Next

- More native plugins (redirect-from, archives, etc.)
- More theme compatibility testing
- npm publication

## Try It

- **Playground:** https://marketingpip.github.io/jekyll-js/
- **GitHub:** https://github.com/MarketingPip/jekyll-js
- **Docs:** https://marketingpip.github.io/jekyll-js/api/

Built with TDD. Tested against real Jekyll. No Ruby required.
