---
title: Assets Pipeline API
---

## Functions

<dl>
<dt><a href="#isSassAsset">isSassAsset()</a></dt>
<dd><p>Determine if a VFS file should be processed by the Sass pipeline.
Jekyll&#39;s rule: files in <code>assets/</code> with <code>.scss</code> or <code>.sass</code> extension that
contain front-matter (start with <code>---</code>). Partial files (starting with <code>_</code>)
are compiled only when imported, not directly.</p>
</dd>
<dt><a href="#compileSassAsset">compileSassAsset(path, content, vfs, config, sass)</a> ⇒ <code>Object</code></dt>
<dd><p>Compile a single SCSS/Sass asset file using the VFS as the import resolver.</p>
</dd>
</dl>

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

| Param | Type | Description |
| --- | --- | --- |
| path | <code>string</code> | the VFS key (e.g. "assets/main.scss") |
| content | <code>string</code> | raw file content (may have front matter) |
| vfs | <code>Object</code> | full VFS map (used to resolve @import partials) |
| config | <code>Object</code> | site config (reads `sass.style` for compressed/expanded) |
| sass | <code>Object</code> | the Sass compiler implementation (dart-sass). Required:   pass `import * as sass from 'sass'` (Node) or load `dist/sass-plugin.js`   (browser, sets `window.JekyllSass`). |
