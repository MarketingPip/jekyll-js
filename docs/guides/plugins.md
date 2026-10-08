# Plugins

jekyll-js has two plugin layers: **native plugin ports** (official
Jekyll plugins re-implemented in JS) and the **JS Plugin API** for
writing your own. Ruby gems can't run here — there's no Ruby — but the
most common ones are built in.

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

**Sass** — pass dart-sass as an engine option:

```js
import * as sass from 'sass';

const engine = new JekyllEngine({ vfs, sass });
```

`.scss`/`.sass` files with front matter compile to CSS at the mirrored
path, with `@import` resolved from `_sass/` exactly like
`jekyll-sass-converter`. Tune with `sass.style` in `_config.yml`
(`compressed` default, or `expanded`). If the site has Sass files and
you forgot the compiler, `build()` throws an error naming the fix.

**Syntax highlighting** — pass highlight.js:

```js
import hljs from 'highlight.js';

const engine = new JekyllEngine({ vfs, highlighter: hljs });
```

This powers the `{% highlight %}` tag. Using the tag without the
option throws a clear error; unknown languages degrade to escaped
plain text.

> In the browser, load the prebuilt chunks `dist/sass-plugin.js`
> (`window.JekyllSass`) and `dist/highlight-plugin.js`
> (`window.JekyllHighlight`) and pass those instead.

## Step 3: Write your own plugin

A plugin is a function that receives the engine. It mirrors Jekyll's
Ruby plugin surface — hooks, generators, tags, filters — so a Ruby
plugin ports naturally:

```js
export default function myPlugin(engine) {
  // Hook: runs after all files are read, before rendering.
  engine.registerHook('site', 'post_read', (site) => {
    for (const doc of site.collections.articles.docs) {
      doc.data.reading_time = Math.ceil(
        doc.content.split(/\s+/).length / 200
      );
    }
  });

  // Generator: creates pages out of thin air.
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
  `'pages'/'post_init'`. Fire manually with `triggerHook(owner, event, ...args)`.
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
with Ruby-like `.data` / `.date`), `site.pages` (mutable array —
push here), `site.posts` (shortcut for the posts collection),
`site.data`, `site.source`.

## Plugin conventions

Plugins must keep the engine usable when they're absent (sites that
don't need the capability), and when a capability is required but
missing, the error must name the option and the remedy — never degrade
silently.

See the runnable port in `examples/plugin.js`.
