---
title: Migrating from Ruby Jekyll
---

# Migrating from Ruby Jekyll

If you have a Ruby Jekyll site, jekyll-js can build it — usually with
no changes. This guide covers what carries over, what doesn't, and the
deliberate behavioral differences.

## What works as-is

- **Content**: Markdown/HTML pages, posts (`_posts/YYYY-MM-DD-slug.md`,
  `.md` and `.markdown`), drafts (`show_drafts: true`), collections
  (`output: true/false`, sorting, permalinks), `site.documents`.
- **Front matter**: layouts, permalinks, `published`, `date`,
  `categories`, `tags`, excerpts, and `defaults:` scoping from
  `_config.yml`.
- **Templates**: Liquid layouts/includes (`_layouts/`, `_includes/`),
  the full Jekyll filter set, `{% link %}`, `{% post_url %}`,
  `{% include_cached %}`, `{% highlight %}`, pagination (`paginator.*`),
  `site.data`, static files, `exclude:`/`include:`.
- **Config**: `title`, `url`, `baseurl`, `permalink` (date / pretty /
  none / ordinal / custom), `paginate`, `paginate_path`,
  `excerpt_separator`, `future`, `unpublished`, `collections`.
- **Theme plugins**: jekyll-feed, jekyll-sitemap, jekyll-seo-tag
  (`{% seo %}`, `{% feed_meta %}`), jekyll-redirect-from — all ported
  and verified byte-identical against the real gems and the Minima
  theme via the [parity scoreboard](project/parity).
- **Timezones**: `date_to_xmlschema` emits the local offset (e.g.
  `-05:00`) like Jekyll, not UTC.

## What doesn't (known gaps)

1. **Markdown engine**: marked.js, not kramdown. Known divergences:
   whitespace between block elements, some footnote/IAL edge cases.
2. **Sass source maps**: real Jekyll emits
   `/*# sourceMappingURL=… */`; we don't generate them yet.
3. **Collection `sort_by` / `order` metadata** — not implemented.
4. **Excerpt edge cases** — empty `excerpt_separator`, link-ref
   appending.
5. **`{% gist %}`** — renders nothing (it would need a live call to
   GitHub).

## Intentional differences

These diverge from Ruby Jekyll on purpose — they're documented, not bugs:

- **`build()` is async** — LiquidJS rendering is asynchronous, so
  `await engine.build()`. Jekyll's build is synchronous.
- **Sass errors don't abort the build** — a bad stylesheet emits a CSS
  comment plus a loud warning, instead of failing everything (Jekyll is
  fatal). Friendlier for live previews.
- **No Ruby plugins** — gems can't run in JS. The built-ins above are
  ported; everything else becomes a JS plugin via the
  [plugin API](plugins) (hooks, generators, tags, filters).

## Migration checklist

1. Feed the site's directory in via `readDirToVFS` ([getting
   started](getting-started)) and build.
2. If you use `{% highlight %}`, pass `highlighter`; for `.scss`,
   pass `sass` ([plugins](plugins)).
3. Replace any Ruby plugins in `_plugins/` with JS equivalents.
4. Diff a few pages against `jekyll build` output — start with the
   homepage and a post.
5. Watch for the [known gaps](project/parity) above, especially kramdown edge
   cases if your Markdown is exotic.
