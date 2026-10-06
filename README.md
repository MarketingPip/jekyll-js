# jekyll-js

**Render Jekyll sites entirely in JavaScript — in the browser, in Node, anywhere.**

`jekyll-js` is a faithful JavaScript port of Jekyll's static site engine. Hand it files, get back rendered HTML. No Ruby, no filesystem, no shell — it runs on a plain JS object (a virtual filesystem), which makes it perfect for browser playgrounds, in-app site builders, and AI agents that need to render Jekyll anywhere.

- ✅ **True Jekyll parity** — ~80% of tests grounded in Jekyll 4.3.2 source, docs, or recorded real-Jekyll output ([scoreboard](docs/parity.md))
- ✅ **Browser-ready** — 219KB core bundle, works from `file://`, heavy features lazy-load as plugins
- ✅ **Programmatic API** — build sites with JS calls, not just file maps
- ✅ **Plugin system** — Sass and syntax highlighting are opt-in, tree-shakeable plugins

---

## Quick start

```js
import { JekyllEngine } from './engine.js';

const engine = new JekyllEngine({
  vfs: {
    '_config.yml': 'title: My Site\n',
    '_layouts/default.html': '<html><body>{{ content }}</body></html>',
    'index.md': '---\nlayout: default\ntitle: Home\n---\n# Hello world',
  },
});

const pages = await engine.build();
console.log(pages[0].content); // rendered HTML
```

Or build it up with JS calls — no file map needed:

```js
const engine = new JekyllEngine();
engine.writeFile('_config.yml', 'title: My Site\n');
engine.writeFile('index.md', '---\ntitle: Home\n---\n# Hello\n');
const pages = await engine.build();
```

See `examples/build-site.js` for a full runnable example.

---

## Try it in your browser

Open **`playground.html`** — a complete editing playground (Ace editor, file tree, live preview, compiled-HTML and JSON panes). It loads the prebuilt `dist/jekyll-engine.js` and lazy-loads plugins on demand.

Rebuild the bundles any time:

```sh
npm run build
```

---

## Plugins

Heavy capabilities are opt-in plugins, so you never pay for what you don't use:

| Plugin | Option | When you need it | Browser chunk |
|---|---|---|---|
| Sass (dart-sass) | `sass` | `.scss`/`.sass` files | `dist/sass-plugin.js` → `window.JekyllSass` |
| Syntax highlighting | `highlighter` | `{% highlight %}` tags | `dist/highlight-plugin.js` → `window.JekyllHighlight` |

```js
import * as sass from 'sass';
import hljs from 'highlight.js';

const engine = new JekyllEngine({ vfs, sass, highlighter: hljs });
```

Using Sass or `{% highlight %}` without the plugin throws a clear error telling you exactly how to provide it — never silent degradation. [Writing a plugin →](docs/api/plugins.md)

---

## Documentation

| | |
|---|---|
| **[API reference](docs/api/engine.md)** | `JekyllEngine` — constructor, options, every method, VFS format, Liquid variables |
| **[Plugins](docs/api/plugins.md)** | The plugin system — providing, writing, and browser-loading plugins |
| **[Browser](docs/api/browser.md)** | Dist bundles, lazy-loading, rebuilding |
| **[API changelog](docs/api/CHANGELOG.md)** | Every API change, versioned — start here for older behavior |
| **[Parity status](docs/parity.md)** | What's verified, known gaps, intentional deviations |

---

## What's inside

```text
engine.js            The engine — JekyllEngine class (build, VFS, site context)
jekyllTags.js        Jekyll Liquid tags ({% highlight %}, {% link %}, {% post_url %}, …)
assetsPipeline.js    Sass pipeline (needs the sass plugin at runtime)
fs-vfs.js            Universal dir→VFS adapter: node:fs on disk, memfs in browser
browser.js           Browser entry → dist/jekyll-engine.js
playground.html      Working demo / reference integration
examples/            Runnable examples (build-site.js)
docs/                Developer docs (api/, parity.md)
test/                200 tests: unit/ · parity/ · integration/  (see test/README.md)
battletest/          Real minima theme + real Jekyll ground-truth output
```

**Parity highlights:** posts, drafts, pages, collections, pagination, excerpts, `site.data`, static files, front-matter `defaults:`, timezone-correct dates — each verified against Jekyll 4.3.2 source or recorded output. [Full scoreboard →](docs/parity.md)

---

## Developing

```sh
npm install   # install deps
npm test      # 200 tests (also verified under Toronto / UTC / Auckland timezones)
npm run build # rebuild dist/ bundles
```

**Contributing agents and humans:** read [AGENTS.md](AGENTS.md) first — conventions, TDD discipline, parity methodology, and the decisions you shouldn't re-litigate.
