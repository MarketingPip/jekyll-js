# Battle test: real Jekyll + real `minima` theme

## Methodology

Rather than guessing at parity, this used a real, working Jekyll 4.3.2
install (`jekyll new testsite`, completely offline, no network needed --
all gems were already present in the sandbox) to scaffold a genuine site
using **minima**, Jekyll's own default theme and the most widely-used
Jekyll theme in the wild. `jekyll build` produced real ground-truth HTML
in `testsite/_site/`.

The exact same source files (minima's `_layouts/`, `_includes/`, `_sass/`,
plus the scaffolded `_posts/`, `index.markdown`, `about.markdown`,
`_config.yml`) were then loaded into our `JekyllEngine` as a VFS and built
with `engine.build()`. Every gap below was found by actually running this
combination and inspecting (a) crashes, (b) missing HTML structure via a
tag-by-tag diff against the real output, and (c) Jekyll's own source code
for the exact algorithm where one was needed (`jekyll-seo-tag`'s
`drop.rb`, Jekyll's own `RelatedPosts`, etc. -- all read directly from the
installed gems, not from memory).

`test/battletest.test.js` (38 tests) encodes this whole investigation as a
permanent regression suite. Full project suite: **114/114 passing.**

## Result: structural HTML diff vs real Jekyll

A tag-by-tag diff (`<title>`, `<nav>`, `<article>`, etc. -- every distinct
HTML element name used on the page) between our output and real Jekyll's
`_site/*.html`, across all 3 generated pages (`/`, `/about/`, `/404.html`):

| Page | Tags missing vs real Jekyll | Tags we have that real Jekyll doesn't |
|---|---|---|
| `/` (index) | `<script>` | none |
| `/about/` | `<script>` | none |
| `/404.html` | `<script>` | none |

The **only** structural gap, on every page, is the `<script
type="application/ld+json">` block (JSON-LD structured data) that
jekyll-seo-tag also emits. Everything else -- `<title>`, `<nav>`,
`<header>`, `<footer>`, `<article>`, `<figure>` (code highlighting),
`<svg>` icons, `<link rel="stylesheet">`, `<link rel="canonical">`, the
RSS `<link rel="alternate">` -- matches exactly.

The `<title>` tag specifically is **byte-for-byte identical** to real
Jekyll's output on every page, including the full multi-clause algorithm
(`page_title | site_title` vs `site_title | description` fallback).

## Gaps found and fixed

### 1. `{% highlight lang %}...{% endhighlight %}` crashed the entire build
LiquidJS has no `highlight` tag at all -- real Jekyll's comes from a
custom `Jekyll::Tags::HighlightBlock` (confirmed via `Liquid::Template.tags`
on the live gem). Every minima post uses this tag for code samples, so the
build was **fatally crashing**, not just rendering wrong, before this fix.

Implemented a real `{% highlight %}` tag (`jekyllTags.js`) using
`highlight.js` for tokenization, producing the same structural wrapper
real Jekyll/Rouge does: `<figure class="highlight"><pre><code
class="language-{lang}" data-lang="{lang}">...</code></pre></figure>`.

**Documented limitation**: highlight.js's per-token `<span>` classes
(`hljs-keyword`, `hljs-string`, ...) differ from Rouge's
(`<span class="k">`, `<span class="s2">`, ...) -- both produce visually
correct syntax-highlighted code, but the specific CSS class names aren't
interchangeable. If your stylesheet's syntax-highlighting colors are keyed
to Rouge's class names specifically (minima's own `_syntax-highlighting.scss`
is), the highlighting will render as **uncolored** code with the correct
HTML structure, not as broken HTML. A drop-in fix would be swapping in a
Rouge-compatible class mapping or a Rouge WASM port if exact color-parity
matters to you.

### 2. Layout names without a file extension never resolved -- **every** normally-written Jekyll site was affected
This is the highest-impact fix in this round. Real Jekyll front matter
conventionally writes `layout: post` (no extension) and resolves it
against `_layouts/post.html` automatically. The engine's layout lookup was
a literal `this._layouts[layoutName]` -- so `layout: post` looked up a key
called exactly `"post"`, which never existed (the key was `"post.html"`).
**Every layout, on every page, was silently never applied** -- pages
rendered as bare unwrapped content with no `<html>`, `<head>`, navigation,
or footer at all.

This had been masked in every prior round of testing because the
hand-written test fixture (`defaultVFS.js`) used `layout: default.html`
(WITH the extension) -- which isn't how real Jekyll sites are written, but
happened to work with the old literal lookup. Running a *real* theme,
written the normal way, is exactly what surfaced this.

Fixed: `_resolveLayout()` now tries the exact name, then `.html`, then
`.htm`, matching Jekyll's own resolution order.

### 3. `.markdown` file extension wasn't recognized anywhere
`jekyll new` scaffolds posts and pages as `.markdown`, not `.md` (both are
valid, equally common Jekyll conventions). The engine only checked for
`.md` in four separate places (post filename parsing, root page discovery,
the index-page special case, and the final Markdown-conversion step) --
so an entire real site (post, about page, and index page) was invisible
to the engine. Fixed all four.

### 4. No SCSS/Sass asset pipeline at all
minima's stylesheet is `assets/main.scss`, which does `@import "minima"` →
which itself imports three more partials from `_sass/minima/`. None of
this existed before. Implemented `assetsPipeline.js`: detects Jekyll's
asset-file convention (front-matter-delimited `.scss`/`.sass` files under
`assets/`), and compiles them with Dart Sass using a custom in-memory
importer that resolves `@import` paths against the VFS's `_sass/`
directory -- including resolving Sass's `_partial` underscore-prefix
convention and nested imports-within-imports, both of which needed
non-obvious URL-scheme handling to get working with Sass's modern
importer API.

Result: 7KB+ of correctly compiled, real CSS (color values, font stacks,
media queries, the works) -- not a stub.

**Documented limitation**: output is from Dart Sass, not libsass/sassc
(same caveat as the original `sassify`/`scssify` filter discussion) --
semantically equivalent CSS, not guaranteed byte-identical formatting.

### 5. `jekyll.environment` was never injected into the template context
minima's `head.html` gates Google Analytics behind `{% if jekyll.environment
== "production" %}`. Without this variable, real Jekyll's *development*
environment (what `jekyll serve`/`jekyll build` use by default, without
`JEKYLL_ENV=production`) also doesn't show GA -- so this happened to
produce the same visual result either way for this specific theme, but
`jekyll.environment` is a genuinely missing site variable that other theme
logic could easily depend on. Fixed: injected as `{ environment:
options.environment || 'development', version: '4.3.2' }` on every page
context, configurable via the constructor.

### 6. `{% seo %}` and `{% feed_meta %}` (plugin tags) crashed the parser
LiquidJS has no built-in concept of these (they're Ruby gem plugins:
`jekyll-seo-tag`, `jekyll-feed`). Initially stubbed as no-ops -- but
testing against the real theme showed this was a **real, meaningful
content gap**, not just cosmetic: minima's `head.html` relies *entirely*
on `{% seo %}` for the page's `<title>` tag, with no other fallback
anywhere in the layout chain. A no-op stub silently produced **titleless
pages** on every single page of the site.

Replaced with a real (partial) implementation of `jekyll-seo-tag`'s
`Drop` class, read directly from the installed gem's
`lib/jekyll-seo-tag/drop.rb`. The title-computation algorithm in
particular is non-trivial (three-way branch between `page_title |
site_title`, `site_title | tagline_or_description`, and a bare fallback)
and is now implemented exactly -- verified **byte-for-byte identical** to
real Jekyll's actual title output on both the homepage and the about page.

Also implemented: meta description, `og:title`, `og:description`,
`og:url`, `og:site_name`, `og:type`, `<link rel="canonical">`, and the
`generator` meta tag.

`{% feed_meta %}` now renders the real `<link rel="alternate"
type="application/atom+xml">` feed-discovery tag (jekyll-feed's actual
output shape), though no `feed.xml` file is generated -- that's a
separate, larger piece of work (a full Atom XML generator) noted below as
not yet implemented.

**Documented limitation**: Twitter card meta, Facebook meta, JSON-LD
structured data (`<script type="application/ld+json">` -- the one
remaining tag gap in the structural diff above), image meta
(`og:image`+friends), webmaster-verification meta, and author meta are
**not** implemented. None of these affect page `<title>` or core SEO
description fidelity, which is what every page actually needs; they
matter specifically if you depend on rich social-card link previews.

### 7. `{% link %}` and `{% post_url %}` tags didn't exist
Both are real Jekyll tags (`Jekyll::Tags::Link`, `Jekyll::Tags::PostUrl`)
used for internal cross-linking that survives file moves/renames.
Implemented both: `{% link about.markdown %}` and `{% post_url
2026-06-29-welcome-to-jekyll %}` now resolve against the actual built
site's pages/posts and return the correct URL.

### 8. `to_integer` on a float returned the float unchanged
LiquidJS's built-in `to_integer` filter is a pass-through for numbers --
`1.9 | to_integer` returns `1.9`, not `1`. Real Jekyll's (`input.to_i`)
truncates toward zero. Verified the correct behavior against the real
Jekyll oracle from earlier in this thread (`to_integer(1.9) == 1`,
`to_integer(1.42857) == 1`) and overrode LiquidJS's filter with a
corrected implementation.

### 9. kramdown's `highlighter-rouge` class on inline/fenced code
Not a crash or missing-tag issue, but a real visual/structural diff:
kramdown (Jekyll's default Markdown converter) wraps inline backtick code
in `<code class="language-plaintext highlighter-rouge">`, and `marked`
(this engine's Markdown converter) produces a bare `<code>` by default.
Configured a custom `marked` renderer for both inline code spans and
fenced code blocks to match kramdown's class conventions.

## Confirmed already correct (no changes needed)
- `.markdown` front matter with `categories: jekyll update` (a
  space-separated **string**, not a YAML array -- a very common real-world
  pattern) was already correctly split into `['jekyll', 'update']` and
  used to build the `/jekyll/update/...` permalink path, and to populate
  `site.categories`.
- minima's header navigation logic -- `site.pages | map: "path"` chained
  with manual lookups, filtering out pages with no `title` -- worked
  correctly using LiquidJS's built-in `map` filter and our `site.pages`
  fix from the previous round, no changes needed.
- The full layout chain (`post` → `default`, each rendering through their
  own includes) composes correctly once issue #2 above was fixed.
- `date: "%b %-d, %Y"` (Ruby's no-zero-pad day format) was already
  correctly handled by LiquidJS's built-in `date` filter.

## Still not implemented (explicitly out of scope, not silently dropped)
- Real `feed.xml` Atom feed generation (jekyll-feed's actual job, beyond
  just the `<link>` discovery tag).
- JSON-LD structured data, Twitter/Facebook meta, image meta from
  jekyll-seo-tag.
- Rouge-compatible syntax-highlighting CSS class names (highlight.js's
  classes are used instead -- functionally highlighted, differently
  styled without a custom stylesheet).
- `{% include_relative %}` (a Jekyll tag variant of `{% include %}` using
  paths relative to the *including* file rather than `_includes/`) --
  minima doesn't use it, so it wasn't exercised by this battle test, and
  isn't implemented.
- `{% gist %}` remains a true no-op (would require a live network call to
  GitHub's gist embed service).

## Running the battle test yourself
```
npm install
npm test                                  # full suite, 114 tests
node battletest/build-vfs.mjs             # regenerate battletest/vfs.json from the live theme+site
node battletest/run-engine.mjs            # regenerate battletest/engine-out.json
```
`testsite/_site/*.html` (built by the real `jekyll build` command) is the
ground truth these were diffed against.
