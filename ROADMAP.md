# Roadmap

Current state: **135/135 tests passing** (verified under `TZ=America/Toronto`, `TZ=UTC`, and `TZ=Pacific/Auckland`). Battle-tested against the real `minima` theme. Every page-title is byte-for-byte identical to real Jekyll. The only structural HTML gap vs real Jekyll is the JSON-LD `<script>` block.

Items are in rough priority order — highest value / lowest effort first.

---

## Tier 1 — Close the remaining gaps vs real Jekyll

These are missing features that real themes and sites commonly depend on.

### 1.1 JSON-LD structured data from `{% seo %}`

**What:** The one remaining structural HTML gap. jekyll-seo-tag emits a `<script type="application/ld+json">` block with WebSite/Article/Organization schema markup.

**Why:** Technically not required for a site to work correctly, but it's part of what `{% seo %}` is supposed to produce, and it matters for search engine structured data.

**How:** The real template is at `/usr/share/rubygems-integration/all/gems/jekyll-seo-tag-2.8.0/lib/template.html`. It's a Liquid template. Read it, render it with the same drop values already computed in the `{% seo %}` implementation in `jekyllTags.js`. The JSON-LD context switches between `WebSite` (no `page.date`) and `BlogPosting` (has `page.date`).

**Effort:** Medium. The template logic is straightforward once you've read it.

---

### 1.2 Front matter defaults (`_config.yml` → `defaults:`)

**What:** Lets you set front matter for all pages/posts/collections matching a scope without repeating it in every file:

```yaml
defaults:
  - scope:
      path: ""
      type: "posts"
    values:
      layout: "post"
      author: "Default Author"
  - scope:
      path: "docs/"
    values:
      layout: "doc"
```

**Why:** Many real-world themes and sites use this. Without it, every post in a theme that sets `layout` via defaults rather than per-file front matter will render layoutless.

**How:** Real Jekyll source: `lib/jekyll/defaults.rb`. In `useVFS()`, after parsing `_config.yml`, build a defaults-resolver function. In `_renderPage()`, merge defaults into `attributes` before using them — same precedence Jekyll uses: per-file front matter wins over defaults, defaults win over nothing.

**Effort:** Medium. The scope-matching logic (path glob, type matching) needs care to get right.

---

### 1.3 Nested pages (pages outside root, not in a named collection)

**What:** `docs/intro.md`, `products/widget.md` — multi-level pages that live in plain subdirectories, not in `_{collection}/`. Real Jekyll serves these and exposes them in `site.pages`.

**Why:** Common pattern for documentation sites, product sites, multi-section blogs. Currently these files are silently ignored.

**How:** In `useVFS()`, the final fallback branch currently only catches root-level page files (`!path.includes('/')`). Extend it to also discover `.md`/`.markdown`/`.html` files in subdirectories that aren't matched by any earlier branch (config/layout/include/data/post/collection/static). Permalink: `page.permalink` front matter wins; fallback is `/${path_without_extension}/`.

**Effort:** Low. The VFS scanning change is small; the tricky part is making sure the discovery order doesn't accidentally grab theme `_layouts/` or `_includes/` files.

---

### 1.4 `og:image` and Twitter card meta from `{% seo %}`

**What:** Complete the `{% seo %}` implementation with social-sharing image meta:
- `<meta property="og:image">` from `page.image` or `site.image`
- `<meta name="twitter:card">`, `<meta name="twitter:site">`, etc.

**How:** Read jekyll-seo-tag's `drop.rb` for the exact computation of `image` (there's a normalization step that handles relative URLs, explicit `path`/`alt`/`height`/`width` sub-keys, and site vs page precedence).

**Effort:** Low-medium. Straightforward once drop.rb is read carefully.

---

### 1.5 `feed.xml` Atom feed generation

**What:** Generate an actual `feed.xml` file as part of `build()`. `{% feed_meta %}` currently emits the discovery `<link>` but the file itself doesn't exist.

**How:** jekyll-feed's source is at the installed gem path. It renders a Liquid template (`feed.xml`) with the posts collection. The simplest approach: hardcode the Atom feed template (it's ~40 lines of Liquid) rather than making the VFS resolver find the gem's template. Add the result to `build()`'s returned array with permalink `/feed.xml`.

**Effort:** Low-medium. The Atom XML format is well-defined and small.

---

## Tier 2 — Extend theme compatibility

These unlock more real-world themes beyond minima.

### 2.1 `{% include_relative %}` tag

**What:** Like `{% include %}` but resolves the path relative to the including file rather than `_includes/`. Used by some themes for modular layout decomposition.

**How:** Add to `jekyllTags.js`. The include path is `path.resolve(dirname(current_file), target)`. Need to track the current file's path in the render context.

**Effort:** Low.

---

### 2.2 `site.time` variable

**What:** The build time, as a Date object. Used in some themes' footer (`Built {{ site.time | date_to_xmlschema }}`).

**How:** Set `this._buildTime = new Date()` at the start of `build()` and expose it as `site.time` in `_buildSiteContext()`.

**Effort:** Trivial (15 minutes).

---

### 2.3 Jekyll data file formats: JSON and CSV/TSV

**What:** `_data/` currently only parses YAML. Real Jekyll also supports JSON (`.json`) and CSV/TSV (`.csv`, `.tsv`). Some themes and data-heavy sites use JSON data files.

**How:** In `useVFS()`, detect the extension and parse accordingly. JSON: `JSON.parse()`. CSV: a small RFC 4180 parser or the `papaparse` npm package.

**Effort:** Low.

---

### 2.4 `site.posts` `hidden: true` filtering

**What:** Jekyll by default excludes posts with `published: false` from `site.posts`. Related: `_drafts/` support (posts without a date prefix, served only in draft mode).

**How:** In `_buildSiteContext()`, filter the posts array to exclude items where `attributes.published === false`. Draft posts: scan `_drafts/` the same way `_posts/` is scanned but only when `options.showDrafts` is set.

**Effort:** Low.

---

### 2.5 Multiple paginated sections (paginate-v2 style)

**What:** A site with both a `/blog/` and a `/news/` section, each paginated independently. Classic `jekyll-paginate` only supports one site-wide pagination; `jekyll-paginate-v2` supports multiple.

**How:** `jekyll-paginate-v2` is already installed in the sandbox (v3.0.0). Its API is more complex: pagination is declared per-collection with `pagination:` in the page's front matter rather than in `_config.yml`. Read its source at the installed gem path.

**Effort:** High. This is a substantially different algorithm.

---

## Tier 3 — Developer experience

These make the engine easier and safer to use.

### 3.1 TypeScript types / JSDoc

**What:** Add `@typedef` JSDoc comments (or a proper `.d.ts` file) for:
- `JekyllEngine` constructor options
- The result object shape `{ path, permalink, data, content, paginator? }`
- The VFS object format
- The paginator shape

**Why:** IDEs currently show no autocompletion for any of the engine's API. This is fixable without a TypeScript migration.

**Effort:** Low-medium.

---

### 3.2 Streaming build (`build()` progress events)

**What:** The `stdout` option already gives per-result callbacks. Make the logger emit structured events (not just strings) so callers can show a real progress bar:

```js
engine.on('page', (result) => progressBar.tick());
engine.on('error', (err, path) => errorList.push({ path, err }));
```

**How:** Use an EventEmitter pattern or a simple callback set on the constructor. The `options.stdout` hook is already the right place; structured it more cleanly.

**Effort:** Low.

---

### 3.3 Build error isolation (don't crash on one bad template)

**What:** Currently, if a single template throws (e.g. malformed Liquid), the whole `build()` rejects. Real Jekyll continues building other pages and just reports the error.

**How:** Wrap each `_renderPage()` call in a try/catch. Return an error result object `{ path, permalink, error: err.message }` instead of crashing. Let callers decide how to handle errors.

**Effort:** Low.

---

### 3.4 Incremental rebuild (`rebuild(changedPaths)`)

**What:** For use in a live-editing sandbox — only re-render pages affected by changed VFS entries rather than rebuilding the whole site.

**Why:** The current `build()` re-renders everything on every VFS change. For large sites this is slow in a live-preview context.

**How:** Track which layouts/includes each page depends on during rendering (LiquidJS emits dependency information). On `rebuild(changedPaths)`, only re-render pages whose dependency set intersects with `changedPaths`.

**Effort:** High. Requires hooking into LiquidJS's render pipeline.

---

## Tier 4 — Theme ecosystem expansion

After Tier 1–3 are done, battle-test against more real themes:

| Theme | Likely gaps it would exercise |
|---|---|
| **Chirpy** | front matter defaults, og:image, multiple layout inheritance levels |
| **Just the Docs** | nested pages (docs), search index JSON generation, `include_relative` |
| **Minimal Mistakes** | og:image, Twitter card, author bios from `_data/`, teaser images |
| **Hyde** | `site.related_posts` in sidebar, multiple collections |
| **Hacker Blog** | Sass variables via `_sass/` partials, pagination |
| **Cayman** | Simple — good confidence check |

For each: `gem contents <theme-name>` to get files, build VFS, run engine, diff vs `jekyll build`. Add a test file `battletest-{theme}.test.js` following the same pattern as `test/battletest.test.js`.

---

## Open questions / design decisions not yet made

**Q: Should the engine expose an event API or keep the current callback approach?**
The `logger`/`stdout` options work but are not idiomatic Node.js. An EventEmitter would be more composable but adds API surface.

**Q: Should `feed.xml` be opt-in or always generated?**
Real jekyll-feed is a plugin you must explicitly add to your Gemfile. The engine
currently only generates it if a `jekyll-feed` entry appears in `_config.yml`'s
`plugins:` list — this is probably the right default.

**Q: Rouge CSS class compatibility mode?**
We could ship a map of `highlight.js` class names → Rouge class names and apply
it as a post-process step on `{% highlight %}` output. This would make minima's
`_syntax-highlighting.scss` actually color code correctly without requiring a
highlight.js-specific stylesheet. Worth implementing once the Tier 1 gaps are closed.

**Q: Browser bundle / package distribution?**
The engine is designed to work in a browser (ESM imports, no Node-only APIs) but
is only tested in Node so far. Before distributing via npm, run the engine in a
real browser and verify — particularly `highlight.js` (which has browser builds),
`sass` (Dart Sass has a WASM browser build), and `marked`/`liquidjs`/`js-yaml`
(all have browser builds). The main file import swap (npm → esm.sh CDN) is
documented in CLAUDE.md.

---

## What to work on next (recommended order)

1. **2.2 `site.time`** — 15 minutes, closes a trivial but observable gap.
2. **1.2 Front matter defaults** — high real-world value, enables more themes.
3. **1.3 Nested pages** — common pattern, straightforward change.
4. **1.1 JSON-LD** — closes the last structural HTML gap vs real Jekyll.
5. **1.5 `feed.xml`** — makes `{% feed_meta %}`'s link actually resolvable.
6. **Battle-test a second theme** (Just the Docs or Chirpy).
7. **3.3 Build error isolation** — makes the engine production-safe.
8. **3.1 TypeScript types** — developer experience uplift.
