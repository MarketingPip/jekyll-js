---
title: Jekyll Sitemap API
---

## Functions


- [isSitemapEnabled()](#isSitemapEnabled)


<a name="isSitemapEnabled"></a>

## isSitemapEnabled()
jekyllSitemap.js — native jekyll-sitemap generator (no Ruby/Opal required).

Implements the sitemap generation of the real jekyll-sitemap plugin (v1.4.0),
using its actual `sitemap.xml` template verbatim (vendored below with
attribution). Opt-in via `_config.yml`:

  plugins:
    - jekyll-sitemap

Template source: https://github.com/jekyll/jekyll-sitemap/blob/v1.4.0/lib/sitemap.xml
(MIT license, (c) Jekyll contributors)

**Kind**: global function  
<a name="generateSitemap"></a>

## generateSitemap(engine) ⇒ <code>Promise.&lt;&#123;path, permalink, data, content&#125;&gt;</code>
Generate /sitemap.xml using the real gem's template.

**Kind**: global function  

| Param | Type |
| --- | --- |
| engine | <code>JekyllEngine</code> |
