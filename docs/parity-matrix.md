# Jekyll parity matrix

Feature-by-feature classification of `jekyll-js` against real **Jekyll 4.3.4**.
No percentages — every feature gets a verdict with its grounding.

**Status legend**

| Mark | Meaning |
|---|---|
| ✅ | **Oracle-verified** — byte-identical or behavior-verified against real Jekyll (native Ruby or WASM oracle) |
| 🔬 | **Source-grounded** — verified against the Jekyll gem source (file + line cited in the test) |
| 🧪 | **Suite-grounded** — matches Jekyll's official test-suite expectations |
| ✓ | **Implemented** — present with Jekyll-compatible semantics (LiquidJS native or engine); parity-tested unless the Notes say otherwise |
| ⚠️ | **Partial** — implemented with known differences (documented) |
| ❌ | **Gap** — not implemented (documented) |

Every ✅/🔬/🧪/✓ row has at least one test in `test/parity/` (or `test/unit/`,
`test/integration/`, `test/battletest/`). Nothing is claimed without a test.

**Summary (86 features cataloged):** 42 oracle-verified ✅ · 10 source-grounded 🔬 ·
4 suite-grounded 🧪 · 16 implemented ✓ · 8 partial ⚠️ · 6 gaps ❌

---

## 1. Liquid tags (Jekyll-specific)

Standard Liquid tags (`if`, `for`, `assign`, `capture`, `case`, `comment`,
`raw`, `tablerow`, `break`, `continue`, `cycle`, `increment`, `decrement`)
come from LiquidJS and are not listed here.

| Tag | Status | Grounding | Notes |
|---|---|---|---|
| `{% include %}` | ✅ | WASM oracle (`include-params.test.js`) | Params, `_includes/` before `_layouts/` resolution |
| `{% include_cached %}` | ✓ | jekyll-include-cache gem docs (`include-cached.test.js`) | Implemented as alias to `include`; caching is a perf detail, not behavioral |
| `{% link %}` | ✅ | Byte-matched error messages (`parity-fixes-2.test.js`) | Raises on missing targets like Jekyll |
| `{% post_url %}` | ✅ | Byte-matched error messages (`parity-fixes-2.test.js`) | Raises on missing targets like Jekyll |
| `{% highlight %}` | ⚠️ | `jekyll-parity-2` / theme battle tests | highlight.js vs Rouge markup differs; theme testing found stray `</figure></p>` from markdown re-processing |
| `{% seo %}` | ✅ | Byte-identical vs jekyll-seo-tag 2.8.0 (`seo-tag.test.js`, `seo-tag-fixes.test.js`) | Full port incl. JSON-LD, Twitter cards, og:image |
| `{% feed_meta %}` | ✅ | Byte-identical vs jekyll-feed 0.17.0 (`jekyll-feed.test.js`) | |
| `{% gist %}` | ⚠️ | — | No-op stub (renders `''`); real jekyll-gist not ported |
| Parenthesized `{% if %}` / `{% elsif %}` / `{% unless %}` | ✅ | Byte-verified vs Ruby oracle (`paren-conditions.test.js`) | `src/liquidPreprocess.js` strips grouping parens before LiquidJS parses; fixes beautiful-jekyll fatal abort |

## 2. Liquid filters (Jekyll's `filters.rb`)

Filters marked "LiquidJS native" are inherited from LiquidJS (spec-compatible
with Jekyll/Liquid); Jekyll-specific semantics are overridden or added where
tested.

| Filter | Status | Grounding | Notes |
|---|---|---|---|
| `date_to_xmlschema` | ✅ | Native Ruby oracle (`filter-semantics.test.js`) | Local timezone offset (`-05:00`), not UTC — engine override of LiquidJS |
| `date_to_rfc822` | ✅ | Native Ruby oracle (`filter-semantics.test.js`) | |
| `date_to_string` | ✅ | Native Ruby oracle | Jekyll's UK format (`20 Jun 2026`); LiquidJS built-in, no override |
| `date_to_long_string` | ✓ | LiquidJS native | |
| `xml_escape` | ✅ | Native Ruby oracle (`filter-semantics.test.js`) | Jekyll emits `&apos;`/`&quot;` |
| `cgi_escape` | ✅ | Native Ruby oracle (`filter-semantics.test.js`) | |
| `uri_escape` | ✅ | Native Ruby oracle (`filter-semantics.test.js`) | |
| `number_of_words` | ✅ | Native Ruby oracle (`filter-semantics.test.js`) | |
| `array_to_sentence_string` | 🧪 | Official Jekyll suite (`official-filters.test.js`) | |
| `markdownify` | ⚠️ | Implemented (`engine.js`) | marked-based, so kramdown divergences apply |
| `smartify` | ✅ | Native Ruby oracle (`filter-semantics.test.js`) | Engine override |
| `slugify` | ✅ | Native Ruby oracle | LiquidJS built-in; mode arg supported |
| `where` | ✅ | Native Ruby oracle (`filter-semantics.test.js`) | Jekyll `compare_property_vs_target`: `0` matches `0`/`"0"`, nil matches only nil |
| `where_exp` | ✅ | Native Ruby oracle (`filter-semantics.test.js`, `where-exp.test.js`) | |
| `group_by` | ✅ | Native Ruby oracle (`filter-semantics.test.js`) | Nil keys stringify to `""`; groups carry `name`/`items`/`size` |
| `group_by_exp` | 🧪 | Official Jekyll suite (`official-filters.test.js`) | |
| `find` | ✓ | LiquidJS native | Not parity-tested against Jekyll |
| `find_exp` | 🧪 | Official Jekyll suite (`official-filters.test.js`) | |
| `has_key` | ❌ | — | Not implemented |
| `sort` / `sort_natural` | ✓ | LiquidJS native | Standard Liquid; Jekyll doesn't override |
| `sample` | ✓ | LiquidJS native | Not parity-tested against Jekyll |
| `shuffle` | ❌ | — | Not implemented |
| `to_integer` | ✅ | Native Ruby oracle (`filter-semantics.test.js`) | Float truncation semantics |
| `inspect` | ✓ | LiquidJS native | Not parity-tested against Jekyll |
| `jsonify` | ✓ | LiquidJS native | Not parity-tested against Jekyll |
| `normalize_whitespace` | ✅ | Native Ruby oracle (`filter-semantics.test.js`) | Engine override |
| `relative_url` | 🔬 | Jekyll source (`site-variables`/URL drop tests) | baseurl-aware |
| `absolute_url` | 🔬 | Jekyll source | |
| `strip_index` | ✓ | Implemented (`engine.js`) | |
| `push` / `pop` / `shift` / `unshift` | ✓ | LiquidJS native | |
| `default` | ✓ | LiquidJS native | |
| `split` | ✅ | Native Ruby oracle (`filter-semantics.test.js`) | `" "` splits on whitespace runs (Ruby semantics) |
| `uniq` | ✅ | Native Ruby oracle (`filter-semantics.test.js`) | Nested arrays flattened first (Ruby Liquid 5.x) |
| `escape` | ✅ | Native Ruby oracle (`filter-semantics.test.js`) | `escape(nil)` stays nil (falsy), not `""` |
| `divided_by` | ⚠️ | Theme battle tests | Float behavior differs in edge cases |
| Standard Liquid filters (`date`, `truncate`, `strip_html`, `join`, `map`, `first`, `last`, `size`, math, string ops…) | ✓ | LiquidJS native | |

## 3. Core features

| Feature | Status | Grounding | Notes |
|---|---|---|---|
| Posts (`_posts/`) | ✅ | Engine + theme battle tests | Date parsing, filename matcher, sorting |
| Abbreviated post dates (`2017-2-5`) | 🧪 | Official Jekyll suite (`abbreviated-dates.test.js`) | `DATE_FILENAME_MATCHER` |
| Drafts (`_drafts/`) | ✅ | minimal-mistakes battle test (`pipeline-fixes.test.js`) | Excluded unless `show_drafts: true` |
| Pages | ✅ | Engine tests | |
| Nested pages | ✓ | `nested-pages.test.js` | Any `.md`/`.html` at any depth renders |
| `.xml` / `.json` with front matter as pages | ✅ | Theme battle tests (`xml-json-pages.test.js`) | `atom.xml`, `feed.xml`, `search.json` render through Liquid |
| Files without front matter → static | 🔬 | `reader.rb` / `entry_filter.rb` (`no-frontmatter.test.js`) | `.md` without front matter is copied as-is |
| Collections (output, sorting, access) | 🔬 | Jekyll 4.3.2 source (`parity-collections-*.test.js`) | `output: true/false`, `site.documents`, sort order per `document.rb` |
| Collection `sort_by` / `order` metadata | ❌ | — | Not implemented |
| Excerpts (`excerpt_separator`) | ✅ | Real Jekyll defaults (`jekyll-parity-2.test.js`) | Default `"\n\n"`; site config and front-matter overrides honored |
| Excerpt edge cases | ⚠️ | `docs/parity.md` | Empty separator, link-ref appending differ |
| Permalinks (`:year/:month/:day/:categories/:slug/:title`) | ✅ | Engine + battle tests | `:categories` kept raw (`post formats/`, not slugified); front-matter `date:` drives `:year/:month/:day` |
| `permalink_style` (date/pretty/none/ordinal) | ✓ | `permalink-style.test.js` | |
| Page URLs | ✅ | Minima battle test | `/about.html` (not `/about/`) matches Jekyll default |
| Front-matter `defaults:` | 🔬 | `frontmatter_defaults.rb` (`frontmatter-defaults.test.js`) | Path prefix + type scoping |
| Layouts (incl. nested chains) | ✅ | WASM oracle (`nested-layouts.test.js`) | Layout-with-layout renders inside-out |
| Theme-dir `_layouts/` merge | ✅ | Theme battle tests (`layout-injection.test.js`) | `<theme>/_layouts/` registered; site wins on conflicts |
| Layout `{% include %}` resolution order | ✅ | `parity-fixes-2.test.js` | `_includes/` before `_layouts/` |
| Static files tracked + emitted | ✅ | `site.rb` / battle tests (`static-files-emitted.test.js`) | Copied verbatim by `build()`; `_sass/` excluded |
| StaticFileDrop fields | 🔬 | Jekyll source (`jekyll-parity-2.test.js`) | `name`, `extname`, `basename`, `path`, `modified_time` |
| Sass pipeline | ✅ / 🔬 | `renderer.rb` + jekyll-sass-converter (`scss-liquid.test.js`, `scss-imports.test.js`) | Liquid renders **before** Sass; expanded output by default; `@import` of `_sass/` partials |
| Sass source maps | ❌ | — | Real Jekyll emits `/*# sourceMappingURL=… */`; we don't |
| `site.data` (+ subdirectories, YAML merge keys) | ✅ | Battle tests (`pipeline-fixes.test.js`) | `<<: *anchor` resolved (explicit js-yaml schema); subdirs nest |
| `exclude:` / `include:` | 🔬 | `configuration.rb` / `entry_filter.rb` (`excludes.test.js`) | Defaults (Gemfile, node_modules, …) match |
| `site.time` / timezones | ✅ | Native Ruby oracle | `date_to_xmlschema` emits local offset |
| `site.posts` / `site.pages` / `site.documents` / `site.static_files` / `site.html_pages` / `site.collections` | ✅ / 🔬 | `site-variables.test.js`, `jekyll-parity-2.test.js` | `html_pages` predicate matches `SiteDrop#html_pages` exactly |
| `site.tags` / `site.categories` | ✓ | `site-variables.test.js` | |
| `page.content` / `page.id` / `page.next` / `page.previous` / `page.collection` | ✅ | Theme battle tests (`page-context.test.js`) | `page.id` is nil on pages (not path) — oracle-grounded |
| `related_posts` | 🔬 | `related_posts.rb:49` (`jekyll-parity-2.test.js`) | Most-recent-posts algorithm, incl. the 11-post quirk |
| Title fallback (titleized filename) | ✅ | Minima battle test (`title-fallback.test.js`) | |
| Pagination (jekyll-paginate semantics) | 🔬 | Paginator shape (`jekyll-parity-2.test.js`) | Disabled by default; `paginate_path` honored |
| Circular include/layout safety | ✓ | `circular.test.js` | No infinite loops (robustness, not Jekyll behavior) |
| Markdown (kramdown) | ⚠️ | `docs/parity.md` | marked.js, not kramdown: no smart quotes, IALs leak, no footnotes — tracked in `kramdown-js` project |
| BigDecimal precision | ⚠️ | `docs/parity.md` | Float-backed shim; native oracle authoritative for numeric edges |

## 4. Plugins (ported)

| Plugin | Version ported | Status | Grounding | Notes |
|---|---|---|---|---|
| jekyll-feed | 0.17.0 | ✅ | Byte-identical (`jekyll-feed.test.js`) | MINIFY_REGEX, rendered content, `post.id` |
| jekyll-sitemap | 1.4.0 | ✅ | Byte-identical (`sitemap.test.js`, `sitemap-robots.test.js`) | Real template; collection-first, posts-last, date-ascending ordering |
| jekyll-seo-tag | 2.8.0 | ✅ | Byte-identical (`seo-tag.test.js`, `seo-tag-fixes.test.js`) | JSON-LD, Twitter cards, og:image, `@type` precedence |
| jekyll-redirect-from | 0.16.0 | ✅ | Byte-identical (`jekyll-redirect-from.test.js`) | Native JS port; `redirects.json` |
| jekyll-paginate | — | 🔬 | Paginator shape (`jekyll-parity-2.test.js`) | Classic pagination semantics |
| jekyll-include-cache | — | ✓ | Gem docs (`include-cached.test.js`) | `{% include_cached %}` as alias |
| jekyll-archives | — | ❌ | — | Documented gap |
| jemoji | — | ❌ | — | Documented gap |
| jekyll-gist | — | ⚠️ | — | Tag stubbed as no-op |

## 5. Intentional deviations

These differ from Jekyll on purpose — documented here so they're never
mistaken for bugs.

| Area | Jekyll behavior | Our behavior | Rationale |
|---|---|---|---|
| `{{ str[0] }}` | Ruby Liquid returns `""` | Returns first character | Lookup lives in LiquidJS `Context#readProperty` with no override hook; unfixable without patching LiquidJS (skipped test documents it) |
| Single-argument `where:` | Raises `ArgumentError` | Missing value treated as nil (matches only nil) | Fail-soft instead of aborting the build |
| Sass errors | Fatal build abort | CSS comment + `warn` log, build continues | Live-preview friendliness |
| `build()` | Synchronous | Async | LiquidJS rendering is async |

## 6. Verification method

- **Native Ruby oracle**: real `jekyll` 4.3.4 binary + kramdown 2.5.1 + Liquid 4.0.4 (`~/workspace/ruby/with-ruby.sh`)
- **WASM oracle**: Jekyll compiled to WASM for in-repo differential tests
- **Minima battle test**: real Minima 2.5.1 theme built with real Jekyll vs engine (`test/battletest/`)
- **Theme battle tests**: hyde, minimal-mistakes, just-the-docs, chirpy, beautiful-jekyll full-site byte comparisons (`/tmp/theme-test-*/` reports)
- **Official suites**: Jekyll's `test_filters.rb`, `DATE_FILENAME_MATCHER`
- **Source grounding**: assertions cite the gem file + line

See `docs/parity.md` for the narrative version, methodology, and the
grounding breakdown.
