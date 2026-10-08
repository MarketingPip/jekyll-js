---
title: Jekyll Redirect-From API
---

<a name="REDIRECT_TEMPLATE"></a>

## REDIRECT\_TEMPLATE
jekyll-redirect-from.js — JS port of the jekyll-redirect-from Ruby plugin (v0.16.0).

Original: https://github.com/jekyll/jekyll-redirect-from
(MIT license, (c) Jekyll contributors)

Generates redirect pages for `redirect_from` front matter and handles
`redirect_to` front matter, matching the Ruby plugin's behavior.

Usage in _config.yml:
  plugins:
    - jekyll-redirect-from

Or programmatically:
  import &#123; redirectFromPlugin &#125; from './jekyllRedirectFrom.js';
  engine.use(redirectFromPlugin);

**Kind**: global constant
