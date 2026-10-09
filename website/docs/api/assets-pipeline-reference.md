---
title: Assets Pipeline API
---

## Functions


- [isSassAsset()](#isSassAsset)


<a name="isSassAsset"></a>

## isSassAsset()
Determine if a VFS file should be processed by the Sass pipeline.
Jekyll's rule: files in `assets/` with `.scss` or `.sass` extension that
contain front-matter (start with `---`). Partial files (starting with `_`)
are compiled only when imported, not directly.

**Kind**: global function  
<a name="compileSassAsset"></a>

## compileSassAsset(path, content, vfs, config, sass) ⇒ <code>Object</code>
Compile a single SCSS/Sass asset file using the VFS as the import resolver.

**Kind**: global function  
**Import**: are NOT Liquid-rendered -- same as real Jekyll.  

| Param | Type | Description |
| --- | --- | --- |
| path | <code>string</code> | the VFS key (e.g. "assets/main.scss") |
| content | <code>string</code> | raw file content (may have front matter) |
| vfs | <code>Object</code> | full VFS map (used to resolve @import partials) |
| config | <code>Object</code> | site config (reads `sass.style` for compressed/expanded) |
| sass | <code>Object</code> | the Sass compiler implementation (dart-sass). Required:   pass `import * as sass from 'sass'` (Node) or load `dist/sass-plugin.js`   (browser, sets `window.JekyllSass`). NOTE (liquid ordering): real Jekyll renders Liquid in .scss/.sass files BEFORE Sass compilation (lib/jekyll/renderer.rb: Renderer#run renders Liquid first, then runs converters). The caller (engine.js build()) Liquid-renders the stripped body before calling this; `content` here should therefore already be Liquid-rendered. Partials pulled in via |
