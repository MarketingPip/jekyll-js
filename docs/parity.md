# Parity status

How faithfully does this engine match real Jekyll (4.3.2)? This file is
the honest scoreboard: what's verified, how it was verified, what's
missing, and where we deliberately differ.

## Grounding (2026-10-05 audit, 189 tests)

| Grounding | Tests | What it means |
|---|---|---|
| Jekyll 4.3.2 source | ~50% | Assertions checked against the actual gem source (file + line cited in test comments) |
| Jekyll docs / web standards | ~10% | kramdown behavior, jekyll-sass-converter rules, post filename conventions |
| Recorded real-Jekyll output | ~20% | The battletest builds the real minima theme and diffs against actual `jekyll build` output |
| Own design | ~20% | Our APIs (programmatic VFS, plugin system) — no parity claim made |

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
front-matter `defaults:`, Sass pipeline, `{% highlight %}`,
`{% link %}`/`{% post_url %}`, SEO/feed meta tags, timezone-correct dates.

## Known gaps

1. `permalink_style` (`pretty`/`date`/`none`/`ordinal`) — not implemented.
2. Collection `sort_by` / `order` metadata — not implemented.
3. `exclude` / `include` config — files are still processed.
4. Nested pages (`docs/intro.md`) — not discovered as pages yet.
5. Excerpt edge cases (empty `excerpt_separator`, link-ref appending).
6. Timezone matrix runs in CI (currently verified manually).

## Intentional deviations

These differ from Jekyll on purpose, documented here so they're never
mistaken for bugs:

- **Sass errors** emit a CSS comment + `warn` log instead of aborting the
  build (Jekyll is fatal). Rationale: live-preview friendliness — one
  broken stylesheet shouldn't kill the whole preview.
- **`build()` is async** (Jekyll's is sync) — LiquidJS rendering is async.

## Methodology

- **TDD throughout.** Tests are written first, confirmed red, then made green.
- **No fake green.** A genuine bug is fixed or tracked — never normalized
  as an expected failure. (`test.failing` is only ever a temporary
  placeholder with a linked issue/gap, and it inverts the day the gap closes.)
- **Cite the source.** Parity tests cite the Jekyll file + line they verify.
  Guessing from memory is not grounding.
- **Differential evidence wins.** The battletest (real theme, real Jekyll
  output) outranks unit tests; unit tests outrank assertions about our own code.
