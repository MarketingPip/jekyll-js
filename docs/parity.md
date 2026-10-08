# Parity status

How faithfully does this engine match real Jekyll (4.3.4)? This file is
the honest scoreboard: what's verified, how it was verified, what's
missing, and where we deliberately differ.

**Target version: Jekyll 4.3.4** (updated 2026-10-06; was 4.3.2).
Verified via native Ruby oracle (real `jekyll` binary) and WASM oracle.

## Grounding (2026-10-06, 270 tests)

| Grounding | Tests | What it means |
|---|---|---|
| Jekyll 4.3.4 source | ~40% | Assertions checked against the actual gem source (file + line cited in test comments) |
| Native Ruby oracle | ~30% | Byte-identical output vs real `jekyll build` (feed, sitemap, Minima theme, filters, redirects) |
| Jekyll docs / web standards | ~10% | kramdown behavior, jekyll-sass-converter rules, post filename conventions |
| Own design | ~20% | Our APIs (programmatic VFS, plugin system) — no parity claim made |

Verified-against-oracle (byte-identical to real Jekyll 4.3.4):
- **jekyll-feed 0.17.0**: feed.xml byte-identical (MINIFY_REGEX, rendered content, post.id)
- **jekyll-sitemap 1.4.0**: sitemap.xml byte-identical (real template, MINIFY_REGEX)
- **jekyll-seo-tag 2.8.0**: SEO tags byte-identical (JSON-LD, meta tags)
- **jekyll-redirect-from 0.16.0**: redirect pages byte-identical (JS port)
- **Minima 2.5.1 theme**: index.html, about.html byte-identical
- **Liquid filters**: date_to_xmlschema, date_to_rfc822, xml_escape, cgi_escape,
  uri_escape, number_of_words, array_to_sentence_string, smartify, slugify,
  where_exp, group_by (nil keys stringify to `""`, groups carry
  name/items/size), uniq (nested arrays flattened first), split (`" "` splits
  on whitespace runs), escape (nil stays nil), where (Jekyll's
  compare_property_vs_target: `0` matches `0`/`"0"`, `false` matches
  `false`/`"false"`, nil matches only nil) — all match
- **Page URLs**: /about.html (not /about/) matches Jekyll default
- **Timezones**: date_to_xmlschema outputs local offset (-05:00), not UTC
- **Sass**: expanded output by default (matches jekyll-sass-converter)

Verified-against-source examples: `related_posts` algorithm
(`related_posts.rb:49`), publisher semantics (`publisher.rb`), collection
sort order (`document.rb`), URL drops (`drops/url_drop.rb`),
`{% link %}`/`{% post_url %}` error messages (byte-matched),
`relative_url`/`absolute_url`, `date_to_string`, excerpt handling,
paginator shape (`jekyll-paginate`), front-matter defaults
(`frontmatter_defaults.rb`).

## What's covered

Posts, drafts, pages, collections (output true/false, sorting, permalinks,
`site.documents`), pagination, excerpts, `site.data`, static files,
front-matter `defaults:`, Sass pipeline (incl. Liquid rendered before Sass,
per Renderer#run), `{% highlight %}`,
`{% link %}`/`{% post_url %}`, `{% include_cached %}` (jekyll-include-cache),
SEO/feed/sitemap/redirect plugins,
timezone-correct dates, `permalink_style` (pretty/date/none/ordinal),
`exclude`/`include` config, nested pages, front-matter-less files as static,
parenthesized `{% if %}`/`{% elsif %}`/`{% unless %}` conditions (e.g.
beautiful-jekyll's `(site.title != pagetitle)` — grouping parens stripped
before LiquidJS parses; Ruby Liquid parity).

## Known gaps

1. **Markdown engine**: We use marked.js, not kramdown. Known divergences:
   whitespace between block elements, some edge cases in footnote/IAL
   syntax. The `kramdown-js` project aims for full parity.
2. **Sass source maps**: Real Jekyll emits `/*# sourceMappingURL=... */`;
   we don't generate source maps yet.
3. **Collection `sort_by` / `order` metadata** — not implemented.
4. **Excerpt edge cases** (empty `excerpt_separator`, link-ref appending).
5. **BigDecimal precision**: WASM oracle uses float-backed shim; native
   oracle is authoritative for numeric edge cases.

## Intentional deviations

These differ from Jekyll on purpose, documented here so they're never
mistaken for bugs:

- **Sass errors** emit a CSS comment + `warn` log instead of aborting the
  build (Jekyll is fatal). Rationale: live-preview friendliness — one
  broken stylesheet shouldn't kill the whole preview.
- **`build()` is async** (Jekyll's is sync) — LiquidJS rendering is async.
- **`{{ str[0] }}`**: Ruby Liquid returns `""` for integer index into a
  string; LiquidJS returns the first character. The lookup lives deep in
  LiquidJS's `Context#readProperty` with no override hook — unfixable without
  patching LiquidJS, so it stays divergent (documented in
  `test/parity/filter-semantics.test.js` as a skipped test).
- **Single-argument `where:`**: Ruby Jekyll raises ArgumentError
  ("Liquid error: wrong number of arguments"); we treat a missing value like
  an explicit nil (matches only nil properties) instead of failing the build.

## Methodology

- **TDD throughout.** Tests are written first, confirmed red, then made green.
- **No fake green.** A genuine bug is fixed or tracked — never normalized
  as an expected failure. (`test.failing` is only ever a temporary
  placeholder with a linked issue/gap, and it inverts the day the gap closes.)
- **Cite the source.** Parity tests cite the Jekyll file + line they verify.
  Guessing from memory is not grounding.
- **Differential evidence wins.** The battletest (real theme, real Jekyll
  output) outranks unit tests; unit tests outrank assertions about our own code.
