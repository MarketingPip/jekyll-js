---
title: Plugins
---

# Plugins

jekyll-js has two plugin layers: **native plugin ports** (official
Jekyll plugins re-implemented in JS) and the **JS Plugin API** for
writing your own. Ruby gems can't run here — there's no Ruby — but the
most common ones are built in.

> The [API Changelog](changelog.md) records every plugin-surface
> change — start there if you're looking for how an older version
> behaved.

## Step 1: Enable the built-in ports

In `_config.yml`, list the plugins the way you would in Ruby Jekyll:

```yaml
plugins:
  - jekyll-feed
  - jekyll-sitemap
  - jekyll-redirect-from
```

Each is wired to a JS implementation verified byte-identical against
the real gem:

| Plugin | What it does |
|---|---|
| `jekyll-feed` | Generates `/feed.xml` (Atom), plus `/feed/<category>.xml` per `feed.categories` in config. Future posts and drafts are excluded. |
| `jekyll-sitemap` | Generates `/sitemap.xml`. |
| `jekyll-redirect-from` | For any page with `redirect_from:` front matter, generates the redirect pages. |

## Step 2: Add the heavy optional capabilities

Sass compilation and syntax highlighting stay out of the core bundle
(~219KB) — you bring them only when the site needs them.

### Sass (`sass` option)

Compiles `.scss`/`.sass` files (with front matter) to CSS, resolving
`@import` partials from `_sass/` exactly like `jekyll-sass-converter`.
Output lands at the mirrored `.css` path.

**Node:**

```js
import * as sass from 'sass';

const engine = new JekyllEngine({ vfs, sass });
```

**Browser** — load `dist/sass-plugin.js` (sets `window.JekyllSass`), then:

```js
const engine = new JekyllEngine({ vfs, sass: window.JekyllSass });
```

Tune with `sass.style` in `_config.yml` (`expanded` default — matches
real Jekyll — or `compressed`). If the site has Sass files and you forgot
the compiler, `build()` throws an error naming the fix.

A Sass syntax error does **not** abort the build: the page is emitted as
a CSS comment plus a loud `warn` log. (Intentional deviation from
Jekyll, which is fatal — friendlier for live previews.)

### Syntax highlighting (`highlighter` option)

Powers the `{% highlight %}` tag via highlight.js (full language build).

**Node:**

```js
import hljs from 'highlight.js';

const engine = new JekyllEngine({ vfs, highlighter: hljs });
```

**Browser** — load `dist/highlight-plugin.js` (sets `window.JekyllHighlight`), then:

```js
const engine = new JekyllEngine({ vfs, highlighter: window.JekyllHighlight });
```

Using `{% highlight %}` without a highlighter throws a clear error naming
both remedies. Unknown languages degrade to escaped plain text (same as
highlight.js itself).

## Step 3: Write your own plugin

A plugin is a function that receives the engine. It mirrors Jekyll's
Ruby plugin surface — hooks, generators, tags, filters — so a Ruby
plugin ports naturally:

```js
// _plugins/my-plugin.js (or any module)
export default function myPlugin(engine) {
  // Hook: runs after all files are read, before rendering.
  // (Mirrors Jekyll::Hooks.register.)
  engine.registerHook('site', 'post_read', (site) => {
    const docs = site.collections['articles']?.docs || [];
    for (const doc of docs) {
      // doc.data — front matter (Ruby: doc.data['title'])
      // doc.date — Date object
      doc.data.reading_time = Math.ceil(
        doc.content.split(/\s+/).length / 200
      );
    }
  });

  // Generator: creates pages out of thin air.
  // (Mirrors Jekyll::Generator.)
  engine.registerGenerator((site) => {
    const page = engine.createPage({
      dir: 'archive',
      name: 'index.html',
      layout: 'default',
      content: '# Archive',
    });
    page.data.title = 'Archive';
    site.pages.push(page);
  });

  // Custom Liquid tag and filter. Tag arguments are evaluated as
  // Liquid expressions — quote literal strings in templates:
  // {% shout "hello" %} → HELLO!
  engine.registerTag('shout', (text) => text.toUpperCase() + '!');
  engine.registerFilter('reverse', (s) => [...s].reverse().join(''));
}

const engine = new JekyllEngine({ vfs });
engine.use(myPlugin);
await engine.build();
```

The full API surface on `engine`:

- `use(pluginFn)` — register a plugin (chainable).
- `registerHook(owner, event, fn)` — e.g. `'site'/'post_read'`,
  `'pages'/'post_init'`. Fire manually with
  `triggerHook(owner, event, ...args)`.
- `registerGenerator(fn)` — `fn(site)` runs right after hooks; push
  pages into `site.pages`.
- `registerTag(name, fn)` / `registerFilter(name, fn)`.
- `createPage({ dir, name, layout, content })` — build a new page; set
  front matter on the returned `page.data`.
- `fileExists(path)` — VFS check (Ruby: `File.exist?`).
- `logger.warn/info/error` — mirrors `Jekyll.logger`.
- `utils.slugify(str)` — mirrors `Jekyll::Utils.slugify`.

The `site` object your hooks and generators receive: `site.config`
(the `_config.yml` values), `site.collections` (`{ name: { docs } }`
with Ruby-like `.data` / `.date`), `site.pages` (mutable array — push
here), `site.posts` (shortcut for the posts collection), `site.data`,
`site.source`.

Hook timing: `'site'/'post_read'` fires after all files are read, before
rendering — the same point as Jekyll's `:site, :post_read`. Generators
run immediately after hooks. Pages pushed to `site.pages` are rendered
with their `page.data` as front matter (layouts and Liquid work
normally).

## Plugin conventions

Plugins must keep the engine usable when they're absent (sites that
don't need the capability), and when a capability is required but
missing, the error must name the option and the remedy — never degrade
silently.

For engine-option plugins (Sass, highlight.js, and anything following
the same pattern):

1. **No core changes.** The engine must build and pass its suite with the
   option unset (sites that don't need the capability).
2. **Clear error, not silent degradation.** If the capability is required
   but missing, `build()` throws an error that names the option and both
   remedies (Node import / browser chunk).
3. **Browser chunk.** Add `browser-<name>.js` (3 lines: import + set
   `window.Jekyll<Name>`), wire it into the `build` script in
   `package.json`, and register it in the playground's `OPTIONAL_PLUGINS`
   table.
4. **Tests.** Plugin behavior gets its own tests passing the option
   explicitly, plus a test asserting the clear error when it's missing.
5. **Docs.** Document here and add a `CHANGELOG.md` entry.

See the runnable port in `examples/plugin.js`, and [Browser
usage](api/browser.md) for the dist build and lazy-loading pattern.
