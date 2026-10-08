---
title: JekyllEngine API
---

# JekyllEngine API

> [API Changelog](../changelog.md) records every API change — start
> there if you're looking for how an older version behaved.

`JekyllEngine` renders Jekyll sites entirely in-process. Give it files,
get back rendered pages. No Ruby, no filesystem, no network.

```js
import { JekyllEngine } from './engine.js';

const engine = new JekyllEngine({
  vfs: {
    '_config.yml': 'title: My Site\n',
    'index.md': '---\ntitle: Home\n---\n# Hello\n',
  },
});

const pages = await engine.build();
// pages: [{ path, permalink, data, content }]
```

---

## Constructor

```js
new JekyllEngine(options)
```

| Option | Type | Default | Description |
|---|---|---|---|
| `vfs` | `Object` | `{}` | Virtual filesystem: `{ "path/to/file": "content" }`. Optional — use `writeFile()` / `useVFS()` instead. |
| `logger` | `Function` | no-op | `(message, level)` — `level` is `'info'`, `'warn'`, or `'success'`. |
| `stdout` | `Function` | `null` | Called with each `{ path, permalink, data, content }` result as `build()` produces it. |
| `cache` | `boolean` | `true` | LiquidJS template caching. |
| `environment` | `string` | `'development'` | Value of `jekyll.environment` in templates. |
| `relatedPostsFn` | `Function` | built-in | Override the related-posts algorithm. Called as `(currentPost, allPosts)`; must return an array of posts. |
| `sass` | `Object` | `null` | Sass compiler (dart-sass). **Required only when the site contains `.scss`/`.sass` files.** Node: `import * as sass from 'sass'`. See [Plugins](../plugins.md). |
| `highlighter` | `Object` | `null` | Syntax highlighter (highlight.js). **Required only when the site uses `{% highlight %}`.** Node: `import hljs from 'highlight.js'`. See [Plugins](../plugins.md). |

---

## Methods

### `build()`

```js
const pages = await engine.build();
```

Renders the whole site. Returns an array of page objects:

```js
{
  path: '_posts/2026-01-01-hello.md', // source path in the VFS
  permalink: '/blog/hello/',           // final URL
  data: { title: 'Hello', date: ... }, // front matter + computed fields
  content: '<h1>Hello</h1>...',        // rendered HTML
}
```

**Throws** (does not warn-and-continue — this matches Jekyll):
- malformed `_config.yml` → `Error: _config.yml: YAML parse error (...)`
- malformed `_data/*` file → `Error: _data/<name>: YAML parse error (...)`
- site contains `.scss`/`.sass` but no `sass` option → clear error naming the remedy
- `{% highlight %}` used but no `highlighter` option → clear error naming the remedy

Bad front matter on a page/post is **not** fatal: Jekyll warns and keeps the
document with empty front matter (`convertible.rb`), and so do we.

### `useVFS(vfs)`

```js
engine.useVFS({ 'index.md': '...' }); // replaces the whole site, re-ingests
```

Replaces the entire virtual filesystem and re-runs ingestion (config,
layouts, includes, data, collections). Returns `this` (chainable).

### `writeFile(path, content)` · `readFile(path)` · `removeFile(path)` · `listFiles()`

Build a site with JS calls instead of a pre-built object:

```js
const engine = new JekyllEngine();
engine.writeFile('_config.yml', 'title: My Site\n');
engine.writeFile('index.md', '---\ntitle: Home\n---\n# Hi\n');
engine.removeFile('draft.md');

engine.readFile('index.md'); // "..." | undefined
engine.listFiles();          // ['_config.yml', 'index.md']

const pages = await engine.build();
```

Each mutation re-ingests the site (O(n) in file count). For bulk loads,
pass the whole object to the constructor or `useVFS()` once. `writeFile`
and `removeFile` return `this` (chainable).

Runnable example: `examples/build-site.js`.

### Reading from disk (and memfs)

The engine never touches the filesystem — `fs-vfs.js` bridges directories
into a VFS object. It is universal (no `node:` imports, bundles for the
browser); the `fs` implementation is always injected:

```js
import { readDirToVFS } from './fs-vfs.js';
import { JekyllEngine } from './engine.js';

// Node: real directory on disk
import fs from 'node:fs';
const vfs = readDirToVFS('./my-jekyll-site', { fs });

// Browser (or Node): memfs — a site assembled from a zip, file uploads,
// or fixtures, entirely client-side
import { fs as memfs } from 'memfs';
const vfs2 = readDirToVFS('/site', { fs: memfs });

const pages = await new JekyllEngine({ vfs }).build();
```

`readDirToVFS(dir, { fs, ignore })` — `fs` is required (clear error naming
both remedies otherwise). `ignore` defaults to `_site`, `.git`,
`.sass-cache`, `.jekyll-cache`, `node_modules`; any path *segment*
matching an entry is skipped, at any depth. Binary files get a placeholder
(the engine only needs static files to exist).

---

## VFS format

Keys are POSIX-style relative paths, values are file contents as strings:

| Path pattern | Meaning |
|---|---|
| `_config.yml` | Site config (YAML). `title`, `baseurl`, `url`, `permalink`, `collections`, `defaults`, `paginate`, `sass`, … |
| `_layouts/*.html` | Layouts. Referenced without extension: `layout: default`. |
| `_includes/*.html` | `{% include %}` partials (searched before `_layouts/`). |
| `_data/*.{yml,yaml,json}` | `site.data.<name>`. |
| `_posts/YYYY-MM-DD-slug.md` | Posts (`.md` and `.markdown`). |
| `_drafts/*.md` | Drafts — only read when `show_drafts: true`. |
| `_<collection>/*.md` | Collection documents (requires `collections:` config). |
| `_sass/**/*` | Sass partials for `@import` (never emitted). |
| `assets/*.scss` + any `*.scss`/`*.sass` with front matter | Compiled to `.css` (needs the `sass` plugin). |
| everything else | Pages (`*.md`/`*.html`) or static files. |

---

## Site context (Liquid variables)

The engine exposes Jekyll's `site` / `page` variables:

- `site.title`, `site.baseurl`, `site.url`, `site.author`, `site.time`, …
- `site.posts` (newest first), `site.pages`, `site.documents`, `site.static_files`
- `site.data.*`, `site.<collection>`, `site.related_posts`, `site.html_pages`
- `page.title`, `page.url`, `page.date`, `page.excerpt`, `page.content`, custom front matter
- `paginator.*` when `paginate:` is configured
- `jekyll.environment`, `jekyll.version`

Jekyll tags: `{% highlight %}` (needs plugin), `{% link %}`, `{% post_url %}`,
`{% include %}`, `{% include_cached %}`, `{% seo %}`, `{% feed_meta %}`.
Filters: the full Jekyll filter set as implemented by LiquidJS plus engine
fixes (`where_exp`, `group_by`, date filters, `relative_url`/`absolute_url`, …).

Front-matter `defaults:` from `_config.yml` are honored per
`frontmatter_defaults.rb` (scope path/type matching, precedence, deep merge).

Parity status, grounding, and known gaps: [Parity Scoreboard](../project/parity.md).
