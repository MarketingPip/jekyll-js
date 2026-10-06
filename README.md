# jekyll-js

**Render Jekyll sites entirely in JavaScript — in the browser, in Node, anywhere.**

`jekyll-js` is a faithful JavaScript port of Jekyll's static site engine. Hand it files, get back rendered HTML. No Ruby, no filesystem, no shell — it runs on a plain JS object (a virtual filesystem), which makes it perfect for browser playgrounds, in-app site builders, and AI agents that need to render Jekyll anywhere.

- ✅ **True Jekyll parity** — 247 tests, battle-tested against the real Minima theme ([scoreboard](docs/parity.md))
- ✅ **Browser-ready** — 244KB core bundle, works from `file://`, heavy features lazy-load as plugins
- ✅ **Programmatic API** — fluent builder, lifecycle events, JS plugin system
- ✅ **TypeScript** — full type definitions included
- ✅ **CLI** — `jekyll-js build` and `jekyll-js serve`

**[Live playground →](https://marketingpip.github.io/jekyll-js/)** · **[API docs →](https://marketingpip.github.io/jekyll-js/api/)**

---

## Quick start

```js
import { JekyllEngine } from 'jekyll-js';

const pages = await JekyllEngine.render({
  '_config.yml': 'title: My Site\n',
  '_layouts/default.html': '<html><body>{{ content }}</body></html>',
  'index.md': '---\nlayout: default\ntitle: Home\n---\n# Hello world',
});

console.log(pages[0].content); // rendered HTML
```

Or build it up with the fluent API:

```js
import { JekyllEngine } from 'jekyll-js';

const pages = await new JekyllEngine()
  .setConfig({ title: 'My Site' })
  .addLayout('default.html', '<html><body>{{ content }}</body></html>')
  .addPage('index.md', '---\nlayout: default\n---\n# Hello')
  .build();
```

Or from the command line:

```bash
npx jekyll-js build --source ./my-site --destination ./_site
npx jekyll-js serve --source ./my-site --port 4000
```

---

## Examples

| Example | Description |
|---|---|
| [`examples/build-site.js`](examples/build-site.js) | Basic site build from VFS |
| [`examples/plugin.js`](examples/plugin.js) | Custom plugin with hooks and generators |

See the **[live playground](https://marketingpip.github.io/jekyll-js/)** for an interactive demo.

---

## Plugins

Write Jekyll plugins in JavaScript — no Ruby required:

```js
engine.use((engine) => {
  engine.registerHook('site', 'post_read', (site) => {
    // site.collections, site.pages, site.config
  });
  engine.registerGenerator((site) => {
    const page = engine.createPage({ dir: 'generated', name: 'index.html' });
    site.pages.push(page);
  });
});
```

Heavy capabilities are opt-in:

| Plugin | Option | Browser chunk |
|---|---|---|
| Sass (dart-sass) | `sass` | `dist/sass-plugin.js` → `window.JekyllSass` |
| Syntax highlighting | `highlighter` | `dist/highlight-plugin.js` → `window.JekyllHighlight` |

[Writing plugins →](docs/api/plugins.md)

---

## Documentation

| | |
|---|---|
| **[API reference](docs/api/engine.md)** | `JekyllEngine` — every method, option, and Liquid variable |
| **[Plugins](docs/api/plugins.md)** | Writing and loading plugins |
| **[Browser](docs/api/browser.md)** | Dist bundles and lazy-loading |
| **[API changelog](docs/api/CHANGELOG.md)** | Versioned API history |
| **[Parity status](docs/parity.md)** | What's verified, known gaps |

---

## Project structure

```text
src/                 Source code
├── engine.js        JekyllEngine class
├── jekyllTags.js    Jekyll Liquid tags
├── jekyllFeed.js    jekyll-feed generator
├── assetsPipeline.js Sass pipeline
├── fs-vfs.js        Universal dir→VFS adapter
├── engine.d.ts      TypeScript definitions
└── browser/         Browser entry points
bin/                 CLI (jekyll-js build/serve)
test/                247 tests
docs/                Developer documentation
examples/            Runnable examples
playground/          Interactive demo (deployed to GitHub Pages)
```

---

## Developing

```sh
npm install          # install deps
npm test             # 247 tests
npm run build        # rebuild dist/ bundles
```

**Contributing:** read [AGENTS.md](AGENTS.md) first.

---

## Links

- [GitHub](https://github.com/MarketingPip/jekyll-js)
- [Live playground](https://marketingpip.github.io/jekyll-js/)
- [API docs](https://marketingpip.github.io/jekyll-js/api/)
- [Changelog](docs/api/CHANGELOG.md)
