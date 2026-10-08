---
title: Documentation
---

# Documentation

jekyll-js renders Jekyll sites entirely in JavaScript — no Ruby, no
filesystem, no shell. Learn it step by step, from first build to plugin
authoring.

## Tutorials

- [Getting Started](getting-started) — install the package and build a
  tiny site from a virtual filesystem in 20 lines.
- [Configuration](configuration) — engine options and every
  `_config.yml` key the engine honors.
- [Templates](templates) — Liquid variables, filters, and Jekyll tags
  (`{% link %}`, `{% post_url %}`, `{% highlight %}`, `{% seo %}`).
- [Plugins](plugins) — enable the built-in ports (feed, sitemap,
  redirects), add Sass and syntax highlighting, and write your own
  plugins with the JS Plugin API.
- [Migration](migration) — moving a site from Ruby Jekyll: what works,
  known gaps, and the intentional differences.

## API Reference

- [JekyllEngine API](api/engine) — constructor options, methods, the
  VFS format, and the site context.
- [Browser usage](api/browser) — prebuilt `dist/` bundles, lazy-loading
  plugins, and rebuilding.
- [API Changelog](changelog) — versioned API history: what changed, and
  how to migrate.

## Project

- [Parity Scoreboard](project/parity) — how faithfully the engine
  matches real Jekyll 4.3.4: what's verified, how, and what's missing.
- [Opal Plugin Compatibility](project/opal-boundaries) — what Ruby
  plugins can run under Opal, and the hard limits.
- [WASM Oracle Status](project/wasm-oracle-status) — running real Jekyll
  under ruby.wasm via wasmtime as a parity oracle.
- [Announcement](project/announcement) — the jekyll-js launch
  announcement.
