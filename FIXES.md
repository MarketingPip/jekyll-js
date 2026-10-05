# Fixes applied

All 36 tests pass (`npm test`). Each fix below is marked `// FIX (#n)` in
`engine.js` so you can search for it directly.

| # | Issue | Fix | Proven by |
|---|---|---|---|
| 1 | `{% include navigation.html %}` and `{% include {{ var }} %}` were parsed as variable lookups, not literal filenames, under LiquidJS's default `dynamicPartials: true` — every include in the original templates was broken. | Added `dynamicPartials: false` to the `Liquid` constructor. This is the exact option LiquidJS's own maintainers added for Jekyll-style include syntax. | `test/integration.test.js` — 4 tests asserting `build()` doesn't throw and that both the literal and the `{{ }}`-interpolated includes actually rendered their content/params. |
| 2 | `excerpt: p._body?.split("\n\n").slice(0, 200)` returned an **array** of up to 200 paragraphs (not a truncated string) — wrong type fed into `strip_html`/`truncate`. | Changed to `.split("\n\n")[0]` (first paragraph = Jekyll's actual default excerpt rule), and additionally run it through `parseMarkdown()` (found while visually checking output — excerpt was rendering literal `# Heading` instead of HTML). | `test/integration.test.js` — asserts the rendered excerpt is real text, not `[object Object]` or a literal `# Heading`. |
| 3 | Custom `slugify`/`date_to_string`/`date_to_xmlschema`/`truncate`/`upcase`/`downcase`/`strip_html`/`date` filters **overrode** LiquidJS's own (already Jekyll-ported / spec-correct) built-ins with less-correct versions (US date format instead of Jekyll's UK format, `toISOString()` instead of Jekyll's offset format, truncate not counting the ellipsis in the budget, slugify keeping underscores). | Deleted all of these overrides. LiquidJS's built-ins handle them correctly. | `test/integration.test.js` — asserts `date_to_string` produces `"20 Jun 2026"` (not `"Jun 20, 2026"`), `truncate: 45` never exceeds 45 chars total, `"now" \| date` still resolves, `upcase` still works. |
| 4 | The `:title` permalink placeholder preferred front-matter `title:` over the filename-derived slug. Jekyll's docs define `:title` as coming from the **filename**, not front matter. | Swapped precedence to `frontMatter.slug \|\| slug \|\| frontMatter.title`. | `test/helpers.test.js` + `test/integration.test.js` — the post permalinks to `/blog/getting-started/`, not `/blog/getting-started-with-the-compiler/`. |
| 5–7 | `relative_url` was a naive `baseurl + url` concat (no leading-slash normalization, no baseurl trailing-slash chomp, **no passthrough for already-absolute URLs**). `absolute_url` and `strip_index` didn't exist at all. | Added `computeRelativeUrl`/`computeAbsoluteUrl`/`stripIndex` helpers (same oracle-verified algorithm as the `jekyll-filters-js` work earlier in this thread) and registered them as filters. Also registered `markdownify` as an inline filter (previously only the page-level `.md`→HTML step existed; `{{ x \| markdownify }}` inside a template body did nothing). | `test/helpers.test.js` (unit) + `test/integration.test.js`'s "newly-registered filters" test (renders all four in a real template). |
| 9 | `site.pages` didn't exist — root pages (`index.md`, `about.md`, `blog.md`) were parsed but never exposed to templates. | Added `_buildRootPagesSummary()`, merged into `site.pages` in `_buildSiteContext()`. | `test/integration.test.js` — asserts `site.pages` contains all 3 root pages with correct `url`s. |

(Numbering matches the original review; #6 and #8 there were noted as
lower-priority/known-limitation items — the `marked`-vs-kramdown gap is
unchanged/out of scope here, same reasoning as the `markdownify` filter
discussion earlier in this thread.)

## Found after the original review: two more real gaps

You asked "does `sort: 'listing-order'` work, and is anything missing?" —
testing that directly surfaced two more genuine bugs, now also fixed:

| Issue | Before | After |
|---|---|---|
| **`site.posts` silently dropped all custom front-matter fields.** `_buildSiteContext()` mapped posts through a hardcoded whitelist (`title, url, date, author, excerpt, content, tags, categories`). Anything else — `listing-order`, `image`, `subtitle`, any custom field — was discarded before templates ever saw it. `{{ post.image }}` and `{% assign s = site.posts \| sort: "listing-order" %}` both silently did nothing (sorted by `undefined` for every item). | `sort: "listing-order"` produced unchanged/undefined order; `post.image` was always blank. | All front matter is now preserved (`...rest` spread instead of a whitelist); only the handful of *computed* fields (`url`, `date`, `excerpt`, `content`) are still overridden on top. Verified: `test/collections.test.js`. |
| **Generic Jekyll "collections" (anything besides `_posts/`) were never implemented at all.** Declaring `collections: { projects: {...} }` in `_config.yml` and adding `_projects/*.md` files did nothing — `site.projects` was just `undefined`. Only the special-cased `_posts/` directory ever worked. | `site.projects` → `undefined`, no matter what was in `_config.yml`. | Added a `_config.yml`-pre-pass (so collection declarations are known before scanning files, regardless of VFS key order) and generic collection scanning: any directory declared under `collections:` (array or hash form) is parsed into `site.<name>`, with a Jekyll-style default `/:collection/:path/` permalink (respecting nested subdirectories, a custom `collections.<name>.permalink` pattern, and front-matter `permalink:` overrides, in that priority order). Verified: `test/collections.test.js` (10 tests). |

A smaller thing fixed alongside the first one: the original excerpt code
checked `p._excerpt`, a field that was **never actually set anywhere** —
dead code. A real front-matter `excerpt:` override now works correctly
(it lives in the preserved front-matter spread).

### Still not implemented (known, explicitly out of scope unless you want it)
- Static files (`site.static_files`) — non-Markdown/HTML assets (images, CSS, JS dropped straight into the VFS) aren't tracked as a Jekyll-style collection of file objects.
- `site.related_posts`, `site.html_pages`, pagination (`paginate:`), and Jekyll's `<!--more-->` excerpt separator override (only the blank-line rule is implemented).
- Collection `output: false` (Jekyll's switch for "include in `site.<name>` but don't render a standalone file for each item") isn't respected — every collection item currently gets rendered to a result the same way posts do.

## Implemented on request: 4 more real Jekyll variables/behaviors

Grounded directly in Jekyll's own source (`static_file.rb`, `related_posts.rb`,
`excerpt.rb`, `site.rb`/`SiteDrop`, `collection.rb`, plus the classic
`jekyll-paginate` gem's `Pager` class — all read from the actual installed
gems, not from memory) rather than guessed at:

| Feature | What real Jekyll does | What's implemented |
|---|---|---|
| **`site.static_files`** | Every non-page file (images, CSS, JS, ...) becomes a `StaticFile` exposing `name`, `extname`, `basename`, `path`, `modified_time` (confirmed via Jekyll's `StaticFileDrop`). | Any VFS entry not matched as config/layout/include/data/post/collection/root-page is tracked with that exact field set. **Limitation**: no real filesystem, so `modified_time` is "when the VFS was scanned," not a tracked per-file mtime. Nested page-like files (`docs/intro.md`) are deliberately excluded from this bucket rather than miscategorized — that's a separate, pre-existing gap (nested pages aren't discovered as pages at all yet). |
| **`site.related_posts`** | `Jekyll::RelatedPosts#most_recent_posts`: `(11 most recent posts, newest-first) minus the current post, first 10`. Genuinely **not** content-based by default (LSI/`classifier-reborn` is a separate, opt-in gem with no JS equivalent). Scoped to *whichever post is currently rendering* — `nil` everywhere else. | Implemented exactly (verified against a 15-post fixture matching the real algorithm digit-for-digit), computed contextually per-post during `build()`/`_renderPage`. **Pass `relatedPostsFn(post, allPosts)` to the `JekyllEngine` constructor to fully replace the algorithm** — e.g. a real TF-IDF/embedding-based ranker — with zero other code changes needed. |
| **`site.html_pages`** | `SiteDrop#html_pages`: `site.pages.select { page.html? || page.url.end_with?("/") }`. | Same predicate, adapted: a page counts if its resolved `url` ends in `.html` or `/`. |
| **Configurable excerpt separator** | `Document#excerpt_separator`: `data["excerpt_separator"] || site.config["excerpt_separator"]`, defaulting to **`"\n\n"`** (confirmed from `Jekyll::Configuration::DEFAULTS` — **not** `<!--more-->`, that's a common misconception). Extraction is literally Ruby's `String#partition`: everything before the first occurrence, or the whole content if the separator never appears. | Implemented with the same front-matter > site-config > `"\n\n"` precedence and the same partition-or-fallback behavior. **Not replicated** (niche, documented): auto-closing a Liquid block tag cut off mid-excerpt, and preserving trailing Markdown link-reference definitions past the cut point. |
| **Pagination** | Classic `jekyll-paginate`'s `Pager`: `paginate: N` (posts per page) + `paginate_path` (default `"/page:num"`, confirmed from Jekyll's own config defaults) drive a `paginator` object (`page, per_page, posts, total_posts, total_pages, previous_page(_path), next_page(_path)`) attached to a template page, with extra pages synthesized for page 2+. | Implemented field-for-field identically. **Adaptation** (documented): real jekyll-paginate requires the template page to be a literally-named `index.html` and matches it to `paginate_path` by walking the on-disk directory hierarchy. Since this engine has VFS `.md` files with computed permalinks instead, the template page is simply "the root page whose resolved permalink is `/`." Page 1 keeps that page's own URL; pages 2+ always go to `paginate_path` with `:num` substituted — which matches real Jekyll exactly (it does this independently of the template page's location too). |
| **Collection `output: false`** | `Collection#write?` is `!!metadata.fetch("output", false)` — **the real default is `false`**, i.e. a declared collection's items are available via `site.<name>` but render **no** standalone output files unless you explicitly set `output: true`. (This is the opposite of what this engine did before today, and arguably the opposite of what most people assume.) | `build()` now only renders standalone results for `posts` (always, hardcoded, matching real Jekyll) or collections with `collections.<name>.output: true`. Data is always available via `site.<name>` either way. |

Verified by `test/jekyll-parity-2.test.js` (23 tests). Full suite: **76/76 passing.**

## What's still missing, if you want it next
- `paginate_path` hierarchy-aware template-page selection (multiple paginated sections on one site, e.g. both `/blog/` and `/news/` paginating independently) — currently only one site-wide pagination run against the homepage is supported.
- `jekyll-paginate-v2`'s extended config (per-collection pagination, category/tag-filtered pagination, custom sort) — only classic `jekyll-paginate`'s simpler model is implemented.
- LSI/content-based related posts as a *built-in* option (the hook for a custom one is there now via `relatedPostsFn`).
- Front-matter defaults (`_config.yml`'s `defaults:` scoped YAML overrides) — affects static files' `data` too, not implemented.
- Nested page discovery (`docs/intro.md` style pages outside the top level).



- `getPostCategories`/`getPostTags`/path-based category logic — already correct, untouched.
- Post sort order (newest-first) — already matched Jekyll's `site.posts`, untouched.
- The `marked` vs kramdown approximation — same documented limitation as before, not "fixed" since there's no JS kramdown.

## Running it yourself

```
npm install
npm test
```

Note on imports: the original code imported from `esm.sh` CDN URLs
(`https://esm.sh/liquidjs@10.18.0`, etc.), which only work in a browser
and aren't reachable from this sandbox's test environment. `engine.js`
here imports the same packages by bare name (`from 'liquidjs'`) via npm
instead. If you're dropping this back into a browser-only artifact, swap
just the 4 import lines at the top back to `esm.sh` URLs — nothing else
in the file depends on how those packages were loaded.

## Parity fixes round 2 (2026-10-05): timezone audit + 9 more issues

A timezone audit (suite run under `TZ=America/Toronto`) found 3 failures
with one root cause, and a follow-up code audit found 9 more genuine
parity issues. All fixed, all with tests in `test/parity-fixes-2.test.js`
(21 tests). Suite is now **135/135 in every timezone tested**
(America/Toronto, UTC, Pacific/Auckland).

| # | Issue | Fix | Proven by |
|---|---|---|---|
| TZ | Date-only values (`"2026-06-20"` parses to UTC midnight) were formatted with the **host's local timezone** in `generatePermalink` (`getFullYear()` etc.) and in every LiquidJS date filter. On any machine behind UTC, permalinks, `<time datetime>`, and `date_to_string` all rendered a day early. Several battle-test assertions used loose `2026-06-\d+` regexes, which is how this shipped green. | Pinned Liquid's `timezoneOffset: 0` (one line -- covers `date`, `date_to_string`, `date_to_xmlschema`, `date_to_rfc822`, `date_to_long_string`) and switched `generatePermalink` to UTC getters. Real Jekyll treats date-only values as timezone-naive, and the ground-truth site was built in UTC. Deliberate divergence, documented in code: datetimes *with* explicit offsets render in UTC rather than Ruby's system-local time -- deterministic beats host-dependent. | 3 previously-failing tests now pass under `TZ=America/Toronto`; full suite also run under `TZ=UTC` and `TZ=Pacific/Auckland`. Side benefit: `date_to_xmlschema` output is now byte-identical to ground truth (`2026-06-29T19:46:56+00:00`), not just regex-close. |
| 1 | Inline code spans didn't escape HTML: `` `<b>x</b>` `` rendered a real `<b>` element inside `<code>`. kramdown escapes it. (XSS vector for untrusted Markdown.) | `escapeHtmlForMarkdown()` applied in the custom `codespan` renderer. | `parity-fixes-2.test.js` -- asserts `&lt;b&gt;` present, raw `<b>` absent. |
| 2 | Front-matter `date:` was ignored for permalinks -- `generatePermalink` always got the filename date, so `site.posts[].date` (front-matter wins) disagreed with `site.posts[].url` (filename always won). | Pass `attributes.date \|\| parsed?.date` as the permalink date. | Post with `date: 2024-01-05` in front matter now permalinks to `/2024/01/05/hello.html`. |
| 3 | `page.date` / `page.excerpt` were empty on post pages without explicit front matter (filename date and computed excerpt never reached the single-page context, though `site.posts[]` had both). | Excerpt precomputed once at scan time (`_excerpt`); `_renderPage` merges `postMeta._date` / `_excerpt` into the page context (front-matter overrides still win). | Post page renders `D:2026-06-20` and the computed excerpt; explicit `excerpt:` still wins. |
| 4 | `{% include %}` could resolve to a `_layouts/` file: `_resolveVfsPath` checked `_layouts/` before `_includes/`. Jekyll's include searches only `_includes/`. | Reordered to `_includes/` first (`_layouts/` kept as a last-resort fallback). | `{% include dup.html %}` with both files present renders the include. |
| 5 | `{% link %}` / `{% post_url %}` with missing targets returned a plausible-but-wrong URL (or a literal `[post_url: ...]` string in the page). Jekyll raises and fails the build. | Both now throw Jekyll-style errors (`Could not find document 'x' in tag 'link'`). | `build()` rejects with the expected messages; valid targets still resolve. |
| 6 | Parse failures vanished silently: `catch (e) {}` on `_config.yml`, `_data/`, post/collection front matter; Sass errors hid inside a CSS comment. | All four now `logger(..., 'warn')`; Sass also returns an `error` field surfaced by `build()`. | Warning assertions for bad config, bad data file, bad post front matter, bad SCSS. |
| 7 | The custom marked renderer was installed via `marked.setOptions()`, mutating the **global** marked instance for the whole host process. | Engine now owns a scoped `new Marked({ renderer })`; the global is untouched. | Bare `marked.parse()` shows default output after importing the engine. |
| 8 | `{% highlight %}` parsed `linenos` but ignored it; end-tag detection used `token.constructor.name === 'TagToken'`, which breaks under minified LiquidJS builds (the documented browser path). | Rouge-style linenos table markup implemented; detection switched to minification-safe `token.kind === TokenKind.Tag`. | `linenos` output contains `rouge-table`/`lineno`; plain output unchanged. |
| 9 | Only `assets/*.scss` was compiled. Real Jekyll compiles **any** `.scss`/`.sass` file carrying front matter. | `isSassAsset` generalized: any path except `_sass/` contents and leading-underscore partials. | `css/main.scss` compiles to `/css/main.css` with `_sass/` partial imports; `_sass/` files never emitted. |
