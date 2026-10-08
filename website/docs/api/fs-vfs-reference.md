---
title: FS / VFS API
---

## Constants

<dl>
<dt><a href="#DEFAULT_IGNORE">DEFAULT_IGNORE</a></dt>
<dd><p>fs-vfs.js — universal adapter: read a directory into a VFS object.</p>
<p>Works in Node AND the browser. It needs an <code>fs</code> implementation passed
via the <code>fs</code> option — anything with <code>readdirSync</code>/<code>readFileSync</code>:</p>
<p>  // Node (real filesystem)
  import fs from &#39;node:fs&#39;;
  import { readDirToVFS } from &#39;./fs-vfs.js&#39;;
  const vfs = readDirToVFS(&#39;./my-jekyll-site&#39;, { fs });</p>
<p>  // Browser (or Node) via memfs — e.g. a site assembled from a zip,
  // file uploads, or fixtures, entirely client-side
  import { fs as memfs } from &#39;memfs&#39;;
  const vfs = readDirToVFS(&#39;/site&#39;, { fs: memfs });</p>
<p>  import { JekyllEngine } from &#39;./engine.js&#39;;
  const pages = await new JekyllEngine({ vfs }).build();</p>
<p>The engine itself stays VFS-pure (a plain <code>{ path: content }</code> object).
This module is the bridge. It has NO <code>node:</code> imports, so it bundles
cleanly for the browser — the <code>fs</code> is always injected, never imported.</p>
<p>Paths: <code>dir</code> is posix-style (<code>/site</code>, <code>./site</code>). VFS keys always use
forward slashes, even on Windows.</p>
</dd>
</dl>

## Functions

<dl>
<dt><a href="#readDirToVFS">readDirToVFS(dir, options)</a> ⇒ <code>Object</code></dt>
<dd><p>Read a directory recursively into a VFS object.</p>
</dd>
</dl>

<a name="DEFAULT_IGNORE"></a>

## DEFAULT\_IGNORE
fs-vfs.js — universal adapter: read a directory into a VFS object.

Works in Node AND the browser. It needs an `fs` implementation passed
via the `fs` option — anything with `readdirSync`/`readFileSync`:

  // Node (real filesystem)
  import fs from 'node:fs';
  import { readDirToVFS } from './fs-vfs.js';
  const vfs = readDirToVFS('./my-jekyll-site', { fs });

  // Browser (or Node) via memfs — e.g. a site assembled from a zip,
  // file uploads, or fixtures, entirely client-side
  import { fs as memfs } from 'memfs';
  const vfs = readDirToVFS('/site', { fs: memfs });

  import { JekyllEngine } from './engine.js';
  const pages = await new JekyllEngine({ vfs }).build();

The engine itself stays VFS-pure (a plain `{ path: content }` object).
This module is the bridge. It has NO `node:` imports, so it bundles
cleanly for the browser — the `fs` is always injected, never imported.

Paths: `dir` is posix-style (`/site`, `./site`). VFS keys always use
forward slashes, even on Windows.

**Kind**: global constant  
<a name="readDirToVFS"></a>

## readDirToVFS(dir, options) ⇒ <code>Object</code>
Read a directory recursively into a VFS object.

**Kind**: global function  
**Returns**: <code>Object</code> - VFS: `{ "relative/path": "content" }`  

| Param | Type | Description |
| --- | --- | --- |
| dir | <code>string</code> | directory to read (posix-style, e.g. './site' or '/site') |
| options | <code>Object</code> |  |
| options.fs | <code>Object</code> | REQUIRED. fs-compatible implementation   (`readdirSync` with `withFileTypes`, `readFileSync`). `node:fs` in   Node, memfs in the browser. |
| [options.ignore] | <code>Array.&lt;string&gt;</code> | names to skip. Any path *segment*   matching an entry is skipped, at any depth (`node_modules` nested in   a theme dir is skipped too). |
