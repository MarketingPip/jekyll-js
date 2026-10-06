# test/

Suite layout (run everything with `npm test` from the repo root):

- **unit/** — focused tests, mostly pure-function with no engine build:
  `smoke.test.js` (dependency sanity: liquidjs loads), `helpers.test.js` (permalink/URL
  helpers: `slugify`, `computeRelativeUrl`, `computeAbsoluteUrl`,
  `stripIndex`, `generatePermalink`, `parsePostFilename`,
  `getPostCategories`/`getPostTags`), `vfs-api.test.js` (the
  programmatic file API: `writeFile`/`readFile`/`removeFile`/`listFiles`),
  and `fs-vfs.test.js` (the universal directory→VFS adapter: real temp
  dirs, real memfs, fake-fs injection, binary placeholders, the
  no-`node:`-import browser-safety guard).
- **parity/** — behavioral parity against real Jekyll 4.3.2, exercised via
  `_buildSiteContext()` or small synthetic VFS builds:
  `jekyll-parity-2.test.js` (`site.static_files`, `site.related_posts`,
  `site.html_pages`, `excerpt_separator`, pagination, collection
  `output: false`), `collections.test.js` (custom front-matter fields,
  generic collections, collection permalink helpers), and
  `parity-fixes-2.test.js` (the 21 round-2 regression tests: codespan
  escaping, front-matter dates in permalinks, include precedence,
  `{% link %}`/`{% post_url %}` failures, warning behavior, marked
  isolation, highlight linenos, SCSS entry points), and
  `frontmatter-defaults.test.js` (front-matter `defaults:` — scope
  path/type matching, precedence, deep merge, invalid-set warnings), and
  `where-exp.test.js` (the `where_exp` filter — LiquidJS's native
  implementation locked in against regressions),
  `seo-tag.test.js` (the `{% seo %}` tag — faithful to jekyll-seo-tag 2.8.0:
  title, meta/og tags, canonical, Twitter cards, JSON-LD), and
  `jekyll-feed.test.js` (native Atom feed generator using the real
  jekyll-feed 0.17.0 template: `/feed.xml`, category feeds, `{% feed_meta %}`),
  `include-params.test.js` (`{% include %}` with parameters — string/number/variable
  args accessible as `{{ include.name }}`),
  `include-cached.test.js` (`{% include_cached %}` from jekyll-include-cache —
  renders identically to `{% include %}`),
  `no-frontmatter.test.js` (`.md` without front matter is a static file,
  not a page — matches Jekyll's reader.rb), and `nested-layouts.test.js`
  (layout chains — a layout with its own `layout:` front matter renders inside-out).
- **integration/** — full `JekyllEngine.build()` runs:
  `integration.test.js` (build against the `defaultVFS` fixture) and
  `battletest.test.js` (build of the real minima theme + scaffolded site,
  compared against the Jekyll 4.3.2 ground truth in `test/battletest/`).
