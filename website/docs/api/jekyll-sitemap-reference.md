---
title: Jekyll Sitemap API
---

## Functions

<dl>
<dt><a href="#isSitemapEnabled">isSitemapEnabled()</a></dt>
<dd><p>jekyllSitemap.js — native jekyll-sitemap generator (no Ruby/Opal required).</p>
<p>Implements the sitemap generation of the real jekyll-sitemap plugin (v1.4.0),
using its actual <code>sitemap.xml</code> template verbatim (vendored below with
attribution). Opt-in via <code>_config.yml</code>:</p>
<p>  plugins:
    - jekyll-sitemap</p>
<p>Template source: <a href="https://github.com/jekyll/jekyll-sitemap/blob/v1.4.0/lib/sitemap.xml">https://github.com/jekyll/jekyll-sitemap/blob/v1.4.0/lib/sitemap.xml</a>
(MIT license, (c) Jekyll contributors)</p>
</dd>
<dt><a href="#generateSitemap">generateSitemap(engine)</a> ⇒ <code>Promise.&lt;{path, permalink, data, content}&gt;</code></dt>
<dd><p>Generate /sitemap.xml using the real gem&#39;s template.</p>
</dd>
</dl>

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

## generateSitemap(engine) ⇒ <code>Promise.&lt;{path, permalink, data, content}&gt;</code>
Generate /sitemap.xml using the real gem's template.

**Kind**: global function  

| Param | Type |
| --- | --- |
| engine | <code>JekyllEngine</code> |
