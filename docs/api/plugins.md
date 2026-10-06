# Plugins

Heavy, optional capabilities ship as **plugins**, not core dependencies.
The core bundle stays lean (~219KB); you bring a plugin only when your
site needs it. In Node, a plugin is just the npm package passed as an
engine option. In the browser, it's a separate `dist/` chunk lazy-loaded
on demand.

> Version: 0.1.0 · [Changelog](CHANGELOG.md)

---

## Sass (`sass` option)

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

If the site contains Sass files and no compiler was provided, `build()`
throws:

> Site contains Sass files (assets/main.scss) but no Sass compiler was
> provided. Pass one via `new JekyllEngine({ sass })` …

Config knobs (from `_config.yml`): `sass.style` (`compressed` | `expanded`,
default `compressed`). A Sass syntax error does **not** abort the build:
the page is emitted as a CSS comment plus a loud `warn` log. (Intentional
deviation from Jekyll, which is fatal — friendlier for live previews.)

---

## Syntax highlighting (`highlighter` option)

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

---

## Writing a plugin

A plugin is anything the engine accepts through its options. Conventions:

1. **No core changes.** The engine must build and pass its suite with the
   option unset (sites that don't need the capability).
2. **Clear error, not silent degradation.** If the capability is required
   but missing, `build()` throws an error that names the option and both
   remedies (Node import / browser chunk).
3. **Browser chunk.** Add `browser-<name>.js` (3 lines: import + set
   `window.Jekyll<Name>`), wire it into the `build` script in
   `package.json`, and register it in the playground's `OPTIONAL_PLUGINS`
   table (`playground.html`).
4. **Tests.** Plugin behavior gets its own tests passing the option
   explicitly, plus a test asserting the clear error when it's missing.
5. **Docs.** Document here and add a `CHANGELOG.md` entry.

See [browser.md](browser.md) for the dist build and lazy-loading pattern.
