---
title: FS / VFS API
---

## Constants


- [DEFAULT_IGNORE](#DEFAULT_IGNORE)


## Functions




<a name="DEFAULT_IGNORE"></a>

## DEFAULT\_IGNORE
fs-vfs.js — universal adapter: read a directory into a VFS object.

Works in Node AND the browser. It needs an `fs` implementation passed
via the `fs` option — anything with `readdirSync`/`readFileSync`:

  // Node (real filesystem)
  import fs from 'node:fs';
  import &#123; readDirToVFS &#125; from './fs-vfs.js';
  const vfs = readDirToVFS('./my-jekyll-site', &#123; fs &#125;);

  // Browser (or Node) via memfs — e.g. a site assembled from a zip,
  // file uploads, or fixtures, entirely client-side
  import &#123; fs as memfs &#125; from 'memfs';
  const vfs = readDirToVFS('/site', &#123; fs: memfs &#125;);

  import &#123; JekyllEngine &#125; from './engine.js';
  const pages = await new JekyllEngine(&#123; vfs &#125;).build();

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
