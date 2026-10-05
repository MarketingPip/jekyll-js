# CLAUDE.md — Agent Handoff File

This file exists so another AI (or a future Claude session) can pick up
this project without context loss. Read this first, then README.md, then
ROADMAP.md. Skip the other docs until you need them.

---

## What this project is

A JavaScript port of Jekyll's static site engine, running entirely in-process
on a plain JS object (called a VFS — virtual file system). No Ruby, no shell,
no file system access needed. Pass in a map of `{ "path": "content" }`, get
back rendered HTML pages.

This is designed for use in browser-based or server-side JavaScript applications
that need to render real Jekyll sites — the original use case was an in-browser
Jekyll playground/sandbox (see the Claude artifact code that was reviewed at
the start of this conversation).

---

## Project layout

```
engine.js           Main file. ~990 lines. Single class: JekyllEngine.
jekyllTags.js       LiquidJS tag registrations (highlight, link, post_url, seo, feed_meta).
assetsPipeline.js   Dart Sass SCSS pipeline with VFS-based @import resolution.
test/               7 test files, 135 tests total, Jest + ESM.
battletest/         Real minima 2.5.1 theme, real jekyll new scaffold, real jekyll build
                    ground-truth HTML. Portable (no system Ruby needed to run tests).
FIXES.md            Every bug fixed, before/after, evidence.
BATTLETEST.md       Battle-test methodology + full HTML diff results vs real Jekyll.
ROADMAP.md          What's next (see that file).
README.md           User-facing docs.
```

**Run tests:** `npm install && npm test` — no Ruby needed, all 135 tests self-contained.

---

## Key decisions made (do not re-litigate without good reason)

### LiquidJS configuration
Three options are non-negotiable for Jekyll parity. Do not change them:
- `dynamicPartials: false` — Jekyll uses unquoted/`{{ }}`-interpolated include filenames. LiquidJS defaults to `true` which parses them as variable lookups.
- `jekyllInclude: true` — enables Jekyll-style `key=value` include params.
- `jekyllWhere: true` — enables Jekyll's array-membership `where` semantics.

### Layout resolution
Layout names in front matter must work WITHOUT `.html` extension (`layout: post`
not `layout: post.html`). This is the real Jekyll convention. Every theme in the
wild uses it. The resolution order in `_resolveLayout()` is: exact match, `.html`,
`.htm`. Do not change this.

### Post file extension
Both `.md` and `.markdown` are valid Jekyll post extensions. `jekyll new` uses
`.markdown` by default. All four places in the code that check file extension must
handle both. Currently correct — do not regress this.

### Collection `output: false` is the REAL Jekyll default
This surprised us during implementation. `Collection#write?` in real Jekyll is
`!!metadata.fetch("output", false)` — `false` by default. Only `posts` always
renders. This is intentional and correct. Don't "fix" it.

### `{% seo %}` is NOT a no-op
We initially stubbed it. Testing against the real minima theme showed that minima's
`head.html` has **no other `<title>` tag fallback** — a pure no-op produces
titleless pages on every single page of the site. The current implementation
computes the title using the exact same 3-way algorithm as jekyll-seo-tag's
`Drop#title` (read from the installed gem source, not guessed). The `<title>` output
is byte-for-byte identical to real Jekyll. Don't regress this to a no-op.

### VFS URL scheme for Sass importer
The Dart Sass custom importer uses `vfs:///key` (triple-slash, hierarchical URL
scheme) not `vfs:key` (opaque). The difference matters: `new URL('vfs:foo').pathname`
is `"foo"`, but `new URL('vfs:///foo').pathname` is `"/foo"`. The `.replace(/^\//, '')`
strip-leading-slash in the `load()` function is intentional and correct. This bug
(opaque vs hierarchical scheme) was non-obvious and cost a debugging session.

### `escapeHtmlForMarkdown` vs `xmlEscape` / `escapeHtml`
There are two separate escape helpers: one in `engine.js` (for Markdown code blocks),
one in `jekyllTags.js` (for the SEO tag and highlight tag). They are intentionally
separate because they escape slightly different character sets for their contexts.
Do not consolidate them into a shared utility without verifying the exact character
sets needed for each use case.

---

## Testing approach

**TDD throughout:** every test was written before the implementation, run to confirm
RED, then implementation written to make it GREEN. This is not a post-hoc test suite.

**The battle test is the most important test file.** It builds the entire real minima
theme through the engine and diffs the output against real Jekyll's actual `_site/`
output. When adding new features, consider whether the battle test covers them; if
not, add a case.

**Oracle-grounded:** the real Jekyll 4.3.2 gem was installed in the sandbox (via
`apt-get install jekyll ruby`) and used as ground truth for all behavior questions.
The jekyll-filters-js project (separate, earlier in this conversation) has a Ruby
oracle harness at `oracle/oracle.rb`. For questions about exact Jekyll behavior,
always check the real gem source (accessible at
`/usr/share/rubygems-integration/all/gems/jekyll-4.3.2/lib/jekyll/`) or run the
oracle rather than guessing.

**Gem source locations in this sandbox:**
- Jekyll: `/usr/share/rubygems-integration/all/gems/jekyll-4.3.2/lib/jekyll/`
- minima: `/usr/share/rubygems-integration/all/gems/minima-2.5.1/`
- jekyll-seo-tag: `/usr/share/rubygems-integration/all/gems/jekyll-seo-tag-2.8.0/`
- jekyll-paginate: `/usr/lib/ruby/vendor_ruby/jekyll-paginate/`

---

## Known gaps (current state, in priority order)

See ROADMAP.md for the full list with implementation guidance. Top 5 to tackle first:

1. **JSON-LD structured data** — the only remaining structural HTML gap vs real Jekyll.
   jekyll-seo-tag's template.html is at
   `/usr/share/rubygems-integration/all/gems/jekyll-seo-tag-2.8.0/lib/template.html`.
   Just render it as a Liquid template with the SEO drop's computed values.

2. **Front matter defaults** — `_config.yml`'s `defaults:` key. Real Jekyll source:
   `lib/jekyll/defaults.rb`. High value — many themes use it.

3. **Nested pages** — pages outside the root directory that aren't in a named
   collection (e.g. `docs/intro.md`). Currently ignored entirely.

4. **og:image / Twitter card meta** — extend the `{% seo %}` implementation.

5. **`feed.xml` generation** — implement as a post-build step in `build()`, not as
   a Liquid template. The Atom feed format is simple; jekyll-feed's source is at
   `/usr/share/rubygems-integration/all/gems/jekyll-feed-0.17.0/` (installed in
   sandbox).

---

## How to add a new Jekyll tag

Add to `jekyllTags.js` and register in `registerJekyllExtensions()`:

```js
function registerMyTag(engine) {
  engine.registerTag('my_tag', {
    parse(tagToken) {
      this.arg = tagToken.args.trim();
    },
    async render(ctx) {
      const site = ctx.get(['site']);
      // ... do stuff with site context ...
      return '<div>output</div>';
    },
  });
}

// Then in registerJekyllExtensions():
export function registerJekyllExtensions(liquidEngine) {
  // ... existing ...
  registerMyTag(liquidEngine);
}
```

Write the test first. Check real Jekyll's source for the exact output format.

---

## How to add a new Jekyll filter

Add to `_setupDefaultFilters()` in `engine.js`:

```js
_setupDefaultFilters() {
  const filters = {
    relative_url: (input) => computeRelativeUrl(input, this._config),
    absolute_url: (input) => computeAbsoluteUrl(input, this._config),
    // ... add here ...
    my_filter: (input, arg1) => {
      // ... implementation ...
    },
  };
  for (const [name, fn] of Object.entries(filters)) {
    this.liquidEngine.registerFilter(name, fn);
  }
}
```

Check if LiquidJS already has the filter before adding — many standard
Jekyll filters are already ported: `slugify`, `date_to_string`,
`date_to_xmlschema`, `date_to_rfc822`, `xml_escape`, `where`, `where_exp`,
`find`, `find_exp`, `group_by`, `group_by_exp`, `sort`, `inspect`,
`number_of_words`, `array_to_sentence_string`, `normalize_whitespace`,
`pop`, `push`, `shift`, `unshift`, `sample`, `jsonify`.

---

## Dependencies

```json
{
  "liquidjs": "^10.27.1",    // Liquid template engine with Jekyll compatibility options
  "marked": "^18.0.5",       // Markdown parser (approximates kramdown)
  "js-yaml": "^5.2.0",       // YAML parsing for _config.yml and _data/
  "front-matter": "^4.0.2",  // Front matter parsing (--- delimited YAML at top of files)
  "highlight.js": "^11.11.1", // Syntax highlighting for {% highlight %} tag
  "sass": "^1.101.0"         // Dart Sass for SCSS/Sass asset pipeline
}
```

**Dev:** `jest` only. Tests use `--experimental-vm-modules` for ESM support.
The `type: "module"` in `package.json` is intentional — all source files use ESM.

---

## Import note for browser use

The engine was developed for Node testing but is designed for browser use.
The 6 imports at the top of `engine.js` all use bare module names (npm).
For a browser/ESM artifact, replace them with CDN URLs:

```js
// Node (current, for testing):
import { Liquid } from 'liquidjs';
import { marked } from 'marked';

// Browser (swap these lines only):
import { Liquid } from 'https://esm.sh/liquidjs@10.27.1';
import { marked } from 'https://esm.sh/marked@18.0.5';
// etc.
```

Nothing else in the codebase cares how the packages were loaded.

---

## Context from the conversation that produced this code

This was built across a long conversation that also produced:

1. **`jekyll-filters-js`** (separate package, earlier in conversation) — a standalone
   library of all 33 Jekyll Liquid filters as pure JS functions, oracle-tested against
   real Jekyll. 29/33 exact parity, 4/33 approximate (markdownify/smartify/sassify/
   scssify — converter-dependent). That work informed the filter implementations here.

2. **The initial code review** — the original engine had 9 real bugs including the
   `dynamicPartials` omission (breaking every include), a hardcoded field whitelist
   on `site.posts` (silently dropping all custom front matter), and the layout
   name resolution bug (silently never applying any layout on normally-written sites).
   All documented in FIXES.md.

3. **Jekyll parity round 2** — implemented `site.static_files`, `site.related_posts`,
   `site.html_pages`, configurable `excerpt_separator`, pagination, collection
   `output: false`.

4. **Battle test against minima** — found and fixed the `.markdown` extension gap,
   SCSS pipeline, `{% highlight %}` crash, `{% seo %}` no-op producing titleless pages,
   `to_integer` float bug, layout-name-without-extension never resolving.

If you need to understand *why* something was done a particular way, the conversation
history has the full debugging sessions. Ask Claude to summarize any specific decision
if this file doesn't explain it.
