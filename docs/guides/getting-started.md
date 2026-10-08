# Getting Started

Render a complete Jekyll site in JavaScript — no Ruby, no filesystem, no
shell. `jekyll-js` builds sites from a virtual filesystem: a plain JS
object mapping file paths to contents.

## Installation

```sh
npm install github:MarketingPip/jekyll-js
```

Then import the engine:

```js
import { JekyllEngine } from 'jekyll-js';
```

## Hello world (20 lines)

```js
import { JekyllEngine } from 'jekyll-js';

const pages = await JekyllEngine.render({
  '_config.yml': 'title: My Site\n',
  '_layouts/default.html':
    '<html><head><title>{{ page.title }}</title></head>' +
    '<body>{{ content }}</body></html>',
  'index.md': '---\nlayout: default\ntitle: Home\n---\n# Hello world\n',
  '_posts/2026-01-01-first.md':
    '---\nlayout: default\ntitle: First\n---\nPost body.\n',
});

for (const p of pages) console.log(p.permalink);
// /  → the home page
// /2026/01/01/first.html  → the post
```

That's it: two pages out, with the layout applied, Markdown rendered,
and the post URL computed in Jekyll's `date` permalink style.

## Building up with the fluent API

Prefer function calls over one big object? The builder is chainable:

```js
import { JekyllEngine } from 'jekyll-js';

const pages = await new JekyllEngine()
  .setConfig({ title: 'My Site' })
  .addLayout('default.html', '<html><body>{{ content }}</body></html>')
  .addPage('index.md', '---\nlayout: default\n---\n# Hello')
  .build();
```

There are also `addInclude(name, content)`, `addData(name, obj)`,
`addCollection(name, pages)`, plus `writeFile(path, content)` /
`readFile(path)` / `removeFile(path)` / `listFiles()` for direct VFS
edits. `useVFS(obj)` replaces the whole site and re-ingests it.

## From a directory on disk

The engine never touches the filesystem itself; `fs-vfs.js` bridges a
real directory into a VFS object:

```js
import fs from 'node:fs';
import { readDirToVFS } from 'jekyll-js/fs-vfs';
import { JekyllEngine } from 'jekyll-js';

const vfs = readDirToVFS('./my-jekyll-site', { fs });
const pages = await new JekyllEngine({ vfs }).build();
```

## The command line

A CLI is bundled as `jekyll-js`:

```sh
npx jekyll-js build --source ./my-site --destination ./_site
npx jekyll-js serve --source ./my-site --port 4000
```

## What each result looks like

`build()` (and `render()`) resolve to an array of page objects:

```js
{
  path: '_posts/2026-01-01-first.md', // source path in the VFS
  permalink: '/2026/01/01/first.html', // final URL
  data: { title: 'First', date: ... }, // front matter + computed fields
  content: '<html>...</html>',         // rendered HTML
}
```

Where next: [configuration](configuration), [templates](templates),
[plugins](plugins), [migration](migration).
