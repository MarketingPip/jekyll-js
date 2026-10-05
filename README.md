# jekyll-engine-fix

A JavaScript Jekyll engine that renders real Jekyll sites in-process — no Ruby, no file system, no spawned processes. Pass it a virtual file system (VFS) of your site's source files as a plain JS object; get back an array of rendered pages.

Battle-tested against Jekyll 4.3.2 + the real `minima` theme. **135 tests, all passing** (in every timezone). Structural HTML diff vs real Jekyll ground truth: every tag matches on every page except `<script type="application/ld+json">` (documented).

```
npm install && npm test
```

---

## Quick start

```js
import { JekyllEngine } from './engine.js';

const engine = new JekyllEngine({
  vfs: {
    '_config.yml': 'title: My Site\nbaseurl: ""\n',
    '_layouts/default.html': `<!DOCTYPE html>
<html><head><title>{{ page.title }}</title></head>
<body>{{ content }}</body></html>`,
    'index.md': `---
layout: default
title: Home
---
# Hello world`,
  },
});

const results = await engine.build();
// results: [{ path, permalink, data, content }]
console.log(results[0].content); // rendered HTML
```

---

## Constructor

```js
new JekyllEngine(options)
```

| Option | Type | Default | Description |
|---|---|---|---|
| `vfs` | `Object` | `{}` | Virtual file system — keys are file paths, values are file contents as strings. Can be passed here or via `engine.useVFS(vfs)` later. |
| `logger` | `Function` | no-op | Called with `(message, level)` where `level` is `'info'`, `'warn'`, or `'success'`. |
| `stdout` | `Function` | `null` | Called with each `{ path, permalink, data, content }` result as it is produced by `build()`, before the final array is returned. |
| `cache` | `boolean` | `true` | Whether to enable LiquidJS template caching. |
| `environment` | `string` | `'development'` | Value of `jekyll.environment` in templates (e.g. minima gates Google Analytics behind `if jekyll.environment == "production"`). |
| `relatedPostsFn` | `Function` | See below | Override the default related-posts algorithm. Called with `(currentPost, allPosts)`, must return an array of posts. |

---

## VFS format

Every Jekyll file type is supported:

```
_config.yml            — site configuration
_layouts/*.html        — layout templates (layout: post, no extension needed)
_includes/*.html       — partials for {% include %}
_data/*.yml            — data files (available as site.data.filename)
_posts/YYYY-MM-DD-slug.md   — posts (.md or .markdown)
_posts/YYYY-MM-DD-slug.markdown
_{collection}/*.md     — custom collection items (declare in _config.yml)
assets/main.scss       — SCSS assets with front matter (compiled via Dart Sass)
*.md / *.markdown      — root-level pages
*.html                 — raw HTML pages
img/logo.png           — static files (tracked as site.static_files)
```

**Notes:**
- Layout names in front matter don't need the `.html` extension: `layout: post` resolves to `_layouts/post.html` automatically (this is the real Jekyll convention; `layout: post.html` also works for compatibility).
- Posts accept both `.md` and `.markdown` extensions — `jekyll new` uses `.markdown` by default.
- SCSS files in `assets/` that begin with `---` front matter are compiled through Dart Sass. `@import` paths resolve against your `_sass/` VFS entries.
- Files that don't match any of the above are tracked as `site.static_files`.

---

## build()

```js
const results = await engine.build();
```

Returns `Promise<Array<{ path, permalink, data, content, paginator? }>>` — one object per rendered page (root pages, posts, collection items with `output: true`, paginated synthetic pages, and compiled SCSS assets).

| Field | Description |
|---|---|
| `path` | Original VFS key (e.g. `_posts/2024-01-01-hello.md`) |
| `permalink` | Resolved URL (e.g. `/2024/01/01/hello.html`) |
| `data` | Front matter object |
| `content` | Rendered HTML (or compiled CSS for SCSS assets) |
| `paginator` | `Paginator` object (only present on paginated pages, see below) |

---

## Site context variables

Every template receives a context matching real Jekyll's site payload:

```liquid
{{ site.title }}
{{ site.author }}
{{ site.description }}
{{ site.url }}
{{ site.baseurl }}
{{ site.time }}                 -- not yet implemented, always undefined
{{ site.posts }}                -- array of all posts, newest-first
{{ site.pages }}                -- array of all root pages
{{ site.html_pages }}           -- site.pages where url ends in / or .html
{{ site.static_files }}         -- non-page files: { name, extname, basename, path, modified_time }
{{ site.tags }}                 -- { tagname: [post, ...] }
{{ site.categories }}           -- { categoryname: [post, ...] }
{{ site.data.authors }}         -- _data/authors.yml contents
{{ site.related_posts }}        -- (post context only) top 10 related posts
{{ site.<collection> }}         -- custom collection items
```

### Page variables

```liquid
{{ page.title }}
{{ page.date }}
{{ page.author }}
{{ page.url }}
{{ page.path }}
{{ page.tags }}
{{ page.categories }}
{{ page.excerpt }}
{{ page.content }}
{{ page.<any-front-matter-field> }}   -- ALL front matter is exposed, not just built-in fields
```

### Jekyll variables

```liquid
{{ jekyll.environment }}         -- 'development' | 'production' (configurable)
{{ jekyll.version }}             -- '4.3.2'
```

---

## Jekyll-specific Liquid tags

All standard Liquid tags (if/unless/for/case/capture/raw/tablerow/etc.) work via LiquidJS. These Jekyll-specific ones are also registered:

| Tag | Behaviour |
|---|---|
| `{% highlight ruby %}...{% endhighlight %}` | Syntax-highlighted `<figure class="highlight">` block via highlight.js. |
| `{% link about.md %}` | Resolves to the URL of the matching page/post. |
| `{% post_url 2024-01-01-hello %}` | Resolves to the matching post's URL. |
| `{% seo %}` | Renders `<title>`, `og:title`, `og:description`, `og:type`, canonical `<link>`, `<meta name="generator">` — exact jekyll-seo-tag algorithm. |
| `{% feed_meta %}` | Renders `<link rel="alternate" type="application/atom+xml">` feed discovery tag. |
| `{% gist user/id %}` | No-op stub (external network service, not implementable client-side). |
| `{% include_relative %}` | Not yet implemented. |

### Registering your own tags

```js
engine.liquidEngine.registerTag('myTag', {
  parse(tagToken) { this.arg = tagToken.args.trim(); },
  async render(ctx) { return `<!-- ${this.arg} -->`; },
});
```

---

## Jekyll-specific Liquid filters

LiquidJS's own filter set already includes most Jekyll filters. These are additionally registered or corrected:

| Filter | Notes |
|---|---|
| `relative_url` | `'/about/' \| relative_url` → `/base/about/` — respects `site.baseurl`, passes absolute URLs through unchanged. |
| `absolute_url` | `'/about/' \| absolute_url` → `https://example.com/base/about/` — IDNA-normalises the host. |
| `strip_index` | `/foo/index.html` → `/foo/` |
| `markdownify` | Converts a Markdown string to HTML (markdown-it, approximate parity with kramdown). |
| `to_integer` | Truncates floats to integers (fixes a LiquidJS bug where `1.9 \| to_integer` returned `1.9`). |

All other Jekyll filters (`slugify`, `date_to_string`, `date_to_xmlschema`, `date_to_rfc822`, `xml_escape`, `cgi_escape`, `uri_escape`, `jsonify`, `where`, `where_exp`, `find`, `find_exp`, `group_by`, `group_by_exp`, `sort`, `inspect`, `number_of_words`, `array_to_sentence_string`, `normalize_whitespace`, `pop`, `push`, `shift`, `unshift`, `sample`) come from LiquidJS's own Jekyll-ported filter set.

---

## Collections

Declare collections in `_config.yml` just like real Jekyll:

```yaml
collections:
  projects:
    output: true           # render standalone pages; default is false
    permalink: /work/:path/
  team:                    # output: false — data only, no standalone files
```

```js
// YAML array form also works:
// collections: [projects, team]
```

Items are available as `site.projects`, `site.team`, etc. in templates. Only collections with `output: true` render to result files — **the default is `output: false`**, matching real Jekyll exactly.

### Permalink variables for collections

`:collection`, `:path`, `:name`, `:title` — plus front-matter `permalink:` still wins over everything.

---

## Pagination

```yaml
# _config.yml
paginate: 10
paginate_path: /page:num    # default
```

Pagination runs automatically when `paginate` is set. The root-level page whose resolved URL is `/` becomes the template. Extra pages (`/page2`, `/page3`, ...) are synthesised with a `paginator` in context:

```liquid
{% for post in paginator.posts %}...{% endfor %}
{{ paginator.page }}            -- current page number
{{ paginator.per_page }}        -- posts per page
{{ paginator.total_posts }}
{{ paginator.total_pages }}
{{ paginator.previous_page }}   -- null on page 1
{{ paginator.previous_page_path }}
{{ paginator.next_page }}       -- null on last page
{{ paginator.next_page_path }}
```

---

## Excerpt separator

Jekyll's default excerpt separator is `\n\n` (blank line) — **not** `<!--more-->`. Configure it globally or per-post:

```yaml
# _config.yml
excerpt_separator: "<!--more-->"
```

```markdown
---
title: My Post
excerpt_separator: "==="  # overrides site config for this post
---
This is the excerpt.
===
Rest of the post.
```

If the separator never appears, the whole content becomes the excerpt (matching Ruby's `String#partition` fallback exactly).

---

## Related posts

By default `site.related_posts` uses the same algorithm as real Jekyll (with no LSI configured): the 10 most recent *other* posts. To replace it:

```js
import { JekyllEngine } from './engine.js';

const engine = new JekyllEngine({
  vfs: { /* ... */ },
  // Receives (currentPost, allPosts) — return any array of posts you like
  relatedPostsFn: (post, allPosts) => {
    return allPosts
      .filter(p => p.path !== post.path)
      .filter(p => p.tags?.some(t => post.tags?.includes(t)))
      .slice(0, 5);
  },
});
```

---

## SCSS / Sass pipeline

Any `.scss`/`.sass` file **outside `_sass/`** whose content starts with `---` front matter is compiled through Dart Sass (like real Jekyll -- not just `assets/`). `@import` paths resolve against your `_sass/` VFS entries including nested partials (`minima.scss` → `minima/_base.scss`, etc.). Output is added to `build()` results with a mirrored `.css` permalink (`css/main.scss` → `/css/main.css`).

```
// _config.yml
sass:
  style: compressed    # or: expanded (default: compressed)
```

---

## File structure

```
engine.js          Main engine class + all Jekyll-compatibility helpers
jekyllTags.js      Liquid tag registrations: highlight, link, post_url, seo, feed_meta
assetsPipeline.js  SCSS/Sass compiler with VFS-based @import resolution

test/
  smoke.test.js              LiquidJS sanity check
  helpers.test.js            Unit tests: slugify, URL helpers, permalink, excerpt, pagination
  collections.test.js        Generic collections, output:false/true, dot-path properties
  integration.test.js        Full build against the defaultVFS fixture
  jekyll-parity-2.test.js    site.static_files, related_posts, html_pages, excerpt_separator, pagination
  battletest.test.js         Real minima theme, diffed against jekyll build ground truth
  parity-fixes-2.test.js     Round-2 parity fixes: timezone audit + 9 more issues

battletest/
  minima-theme/              Real minima 2.5.1 gem files (portable, no system Ruby needed)
  testsite-source/           jekyll new scaffold (the source)
  ground-truth-site/         Real jekyll build output (the ground truth for diffs)
  build-vfs.mjs              Regenerates vfs.json from the bundled sources
  run-engine.mjs             Runs the engine and writes engine-out.json
  vfs.json                   Pre-built VFS (committed so tests run without regenerating)
  engine-out.json            Pre-built engine output (for manual diff inspection)

FIXES.md           History of every bug fixed, with the original code and evidence
BATTLETEST.md      Battle-test methodology, full gap analysis, and diff results
ROADMAP.md         Planned features and known gaps
```

---

## Known gaps and documented limitations

| Gap | Notes |
|---|---|
| **kramdown-exact HTML** | markdown-it is used instead. Code block/inline code class names match (`highlighter-rouge`), but Markdown extensions (kramdown IAL `{: .class}`, footnotes, definition lists) aren't supported. |
| **Rouge-exact syntax classes** | highlight.js uses `hljs-keyword` etc. instead of Rouge's `k`, `s2` etc. Structurally correct, visually different without a theme-specific stylesheet. |
| **JSON-LD `<script>` block** | `{% seo %}` doesn't emit `<script type="application/ld+json">` (the only remaining structural gap vs real Jekyll). All other seo-tag output is implemented. |
| **`feed.xml` generation** | `{% feed_meta %}` renders the discovery `<link>` but no actual Atom feed file is built. |
| **Twitter/Facebook meta** | `{% seo %}` doesn't emit `twitter:card` or `fb:app_id` meta. |
| **`og:image`** | Not yet computed or emitted by the `{% seo %}` implementation. |
| **`site.time`** | Not injected. |
| **Front matter defaults** | `_config.yml`'s `defaults:` key (scoped YAML overrides for front matter) isn't implemented. |
| **Nested pages** | `docs/intro.md` and other multi-level pages outside `_posts/`/named collections aren't discovered. Root-level pages only. |
| **`{% include_relative %}`** | Not implemented (Jekyll tag for includes relative to the current file). |
| **Multiple paginated sections** | Only one site-wide pagination run (against the `/` index) is supported. |
| **`output: false` + `include_relative`** | `output: false` on a collection means the items appear in `site.<name>` but don't render. This is the real Jekyll default and is correctly implemented. |
| **Static-file `modified_time`** | Set to the VFS scan time, not tracked per-file (no real filesystem). |
| **`site.related_posts` with LSI** | LSI (content-similarity) requires `classifier-reborn` gem. The default is "most recent" (implemented exactly), LSI is a bring-your-own via `relatedPostsFn`. |

---

## Running tests

```bash
npm install
npm test                          # all 135 tests
node battletest/build-vfs.mjs     # regenerate the minima VFS (after editing theme/site files)
node battletest/run-engine.mjs    # regenerate engine-out.json for manual diffing
```

No Ruby or Jekyll installation required for the test suite — the real minima theme files and real Jekyll ground-truth HTML are bundled in `battletest/`.
