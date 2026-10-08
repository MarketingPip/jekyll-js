---
title: Configuration
---

# Configuration

Two places accept configuration: the engine **constructor options** (how
the build behaves) and **`_config.yml`** (the Jekyll site config — same
keys Ruby Jekyll reads).

## Engine options (`new JekyllEngine(options)`)

| Option | Type | Default | Description |
|---|---|---|---|
| `vfs` | `Object` | `{}` | Virtual filesystem: `{ "path": "content" }`. Optional — build one with `writeFile()` / `useVFS()` instead. |
| `logger` | `Function` | no-op | `(message, level)` where `level` is `'info'`, `'warn'`, or `'success'`. |
| `stdout` | `Function` | `null` | Called with each `{ path, permalink, data, content }` result as `build()` produces it. |
| `cache` | `boolean` | `true` | LiquidJS template caching. Set `false` for live-reload style flows. |
| `environment` | `string` | `'development'` | Value of `jekyll.environment` in templates. |
| `relatedPostsFn` | `Function` | built-in | Override the related-posts algorithm: `(currentPost, allPosts)` must return an array of posts. |
| `sass` | `Object` | `null` | Sass compiler (dart-sass). Only needed when the site has `.scss`/`.sass` files. See [plugins](plugins). |
| `highlighter` | `Object` | `null` | Syntax highlighter (highlight.js). Only needed when the site uses `{% highlight %}`. See [plugins](plugins). |

## `_config.yml` keys

Everything under `_config.yml` is also exposed to templates as
`site.<key>` (e.g. `{{ site.title }}`).

**Identity & URLs**

- `title`, `description`, `author`, `lang`, `logo` — site metadata.
- `url` — the canonical site URL (`https://example.com`). Used by
  `absolute_url`, `{% seo %}` canonical tags, and the feed.
- `baseurl` — path prefix when served from a subdirectory
  (`/my-project`). Used by `relative_url`.

**Posts & pages**

- `permalink` — post URL pattern (`date` (default), `pretty`, `none`,
  `ordinal`, or a custom pattern like `/:title/`). Also per-document via
  front-matter `permalink:`.
- `permalink_style` — deprecated alias of `permalink`.
- `paginate` — number of posts per page (enables `paginator.*` on the
  index page).
- `paginate_path` — pagination URL pattern (default `/page:num`).
- `excerpt_separator` — overrides the default `\n\n` excerpt split.
- `show_drafts` — render `_drafts/` like posts (`true` to enable).
- `future` — publish posts dated in the future (`true` to enable).
- `unpublished` — render documents with `published: false`.
- `time` — override `site.time` (useful for reproducible builds).
- `defaults` — front-matter defaults: scoped `path:` / `type:` matching
  with precedence and deep merge, mirroring Jekyll's
  `frontmatter_defaults.rb`.

**Collections**

- `collections` — e.g. `collections: { recipes: { output: true,
  permalink: '/recipes/:name/' } }`. Only `posts` renders by default;
  a collection with `output: true` gets pages.

**Files**

- `exclude` — extra paths to skip, merged with Jekyll's defaults
  (`Gemfile`, `node_modules/`, `.sass-cache/`, …). Infrastructure
  (`_layouts/`, `_includes/`, `_data/`, `_sass/`, `_config.yml`) is never
  excluded.
- `include` — forces inclusion, overriding `exclude:`.

**Plugins**

- `plugins` (alias `gems`) — enables built-in ports:
  `jekyll-feed` (generates `/feed.xml`), `jekyll-sitemap`
  (generates `/sitemap.xml`), `jekyll-redirect-from` (redirect pages).
  See [plugins](plugins).
- `sass.style` — `expanded` (default, matches real Jekyll) or
  `compressed` output for Sass.

**Feeds & SEO extras**

- `feed.categories` — per-category Atom feeds via jekyll-feed.
- `twitter`, `facebook`, `social.links`, `webmaster_verifications`,
  `google_site_verification` — consumed by the `{% seo %}` tag.

## Errors vs warnings

A malformed `_config.yml` (or `_data/*` file) **throws** — same as Ruby
Jekyll. Bad front matter on an individual page/post only **warns** and
the document is kept with empty front matter (Jekyll parity).

See also: [migration](migration) for how config keys differ from Ruby
Jekyll.
