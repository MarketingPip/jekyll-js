---
title: Browser Usage
---

# Browser usage

> [API Changelog](../changelog.md) records every API change — start
> there if you're looking for how an older version behaved.

The engine runs anywhere JavaScript runs. For browsers, prebuilt bundles
live in `dist/` (built with esbuild — `npm run build`):

| File | Size | Contents |
|---|---|---|
| `dist/jekyll-engine.js` | ~219KB | Core engine. Sets `window.JekyllEngine`. |
| `dist/sass-plugin.js` | ~3.2MB | dart-sass. Sets `window.JekyllSass`. Load only if the site has `.scss`/`.sass`. |
| `dist/highlight-plugin.js` | ~1.0MB | highlight.js. Sets `window.JekyllHighlight`. Load only if the site uses `{% highlight %}`. |

All three are IIFE bundles, so they work from `file://` as well as HTTP —
no bundler or dev server required.

## Basic usage

```html
<script src="./dist/jekyll-engine.js"></script>
<script>
  const engine = new JekyllEngine({
    vfs: {
      '_config.yml': 'title: My Site\n',
      'index.md': '---\ntitle: Home\n---\n# Hello\n',
    },
  });
  const pages = await engine.build();
  document.body.innerHTML = pages[0].content;
</script>
```

## Lazy-loading plugins

Load a plugin chunk only when the site needs it (this is what
`playground.html` does):

```js
async function loadScript(src) {
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

const opts = { vfs };
if (Object.keys(vfs).some((k) => /\.(scss|sass)$/i.test(k))) {
  await loadScript('./dist/sass-plugin.js');
  opts.sass = window.JekyllSass;
}
if (Object.values(vfs).some((c) => /\{%\s*highlight[\s%]/.test(c))) {
  await loadScript('./dist/highlight-plugin.js');
  opts.highlighter = window.JekyllHighlight;
}
const engine = new JekyllEngine(opts);
```

The playground generalizes this as an `OPTIONAL_PLUGINS` table
(label/src/global/option/`needs` predicate) — add a row per plugin.

## Rebuilding the bundles

```sh
npm run build
```

`browser.js` is the core entry (`window.JekyllEngine = JekyllEngine`);
`browser-sass.js` / `browser-highlight.js` are the plugin entries.
esbuild is a devDependency, so CI builds them too (`.github/workflows/ci.yml`
runs `npm run build` after the tests). Commit the rebuilt `dist/` files —
the playground loads them directly.

## The playground

`playground.html` is a working demo and reference integration: Ace editor,
file tree, live preview iframe, compiled-HTML and JSON panes, console log.
It loads `./dist/jekyll-engine.js` plus plugins on demand — open it in a
browser (or serve the repo root over HTTP) and press **Build Pages**.
