# AGENTS.md — working on jekyll-js

This file is for any agent (including a future session with no context)
picking up this project. Read this first, then `docs/parity.md`, then the
code. The user-facing docs live in `README.md` and `docs/`.

## What this is

A JavaScript port of Jekyll's static site engine (target: Jekyll 4.3.4
parity). It renders sites entirely in-process from a virtual filesystem
(a plain `{ "path": "content" }` object) — no Ruby, no real filesystem.
Consumers: the browser playground (`playground/index.html`), Node scripts, and
AI agents that need to render Jekyll anywhere.

## Layout

```text
src/
  engine.js            JekyllEngine — build(), VFS ingestion, site context
  plugins.js           Plugin interfaces: MarkdownRenderer, Highlighter, SassCompiler, SitePlugin
  jekyllCompat.js      Jekyll _config.yml compatibility layer (auto-detects markdown/highlighter)
  core.js              Tree-shakeable entry: build only (~300KB)
  liquid-only.js       Tree-shakeable entry: just templates (~100KB)
  full.js              Tree-shakeable entry: everything, lazy adapters (~500KB)
  worker.js            Tree-shakeable entry: Web Worker wrapper
  adapters/
    markdown-marked.js    Default marked adapter
    markdown-kramdown.js  kramdown-js adapter (172/177 oracle parity)
    highlight-hljs.js     highlight.js with lazy language loading
    highlight-rouge.js    Rouge 4.7.0 compat (70/70 byte-exact)
  jekyllTags.js        LiquidJS tag registrations (highlight, link, post_url, seo, feed_meta)
  jekyllFeed.js        Native jekyll-feed 0.17.0 (byte-identical to gem)
  jekyllSitemap.js     Native jekyll-sitemap 1.4.0 (byte-identical to gem)
  jekyllRedirectFrom.js  JS port of jekyll-redirect-from 0.16.0
  assetsPipeline.js    Sass helpers (compiler itself is a plugin, not imported here)
  browser.js           Browser entry → dist/jekyll-engine.js (window.JekyllEngine)
  ...
test/
  unit/                Unit tests (VFS API, etc.)
  parity/              Parity tests vs real Jekyll (official suite conversions + oracle fixtures)
  integration/         Full engine builds (incl. battletest.test.js vs real theme output)
  battletest/          Battle-test fixtures: real minima theme + scaffolded site + Jekyll ground truth
  ...
docs/
  parity.md            Honest parity scoreboard (update every PR!)
playground/
  index.html           Demo + reference browser integration
```

## Oracle testing

We have TWO oracles for true parity verification:

1. **Native Ruby** (`~/workspace/jekyll-oracle/jekyll-native.sh`):
   Real `jekyll` 4.3.4 binary with real gems. Authoritative. Use for
   all parity claims. Requires Ruby 3.2+ with jekyll gem installed.

2. **WASM** (`~/workspace/jekyll-oracle/jekyll-wasm.sh`):
   Ruby 4.0 WASM via wasmtime. Slower, has shims (BigDecimal is fake,
   Sass throws). Useful when native Ruby isn't available, but native
   is authoritative.

**Rule**: Never claim parity without running the oracle. The WASM oracle
uses UTC; native uses local timezone — native caught a real timezone bug
that WASM masked.

## Commands

```sh
npm install   # deps (esbuild is a devDependency)
npm test      # full suite — 270 tests, must stay green
npm run build # rebuild dist/ bundles (esbuild: core + 2 plugin chunks)
node examples/build-site.js  # smoke-test the programmatic API
```

Timezones matter: date handling is timezone-sensitive. Verify under
`America/Toronto`, `UTC`, and `Pacific/Auckland` (`TZ=... npm test`)
before calling date-related work done. CI runs Node 20 + 22.

## Working conventions (non-negotiable)

- **TDD.** Write the test first, watch it fail, then implement. No post-hoc tests.
- **Ponytail.** Understand the flow before implementing. Reuse existing code.
  Minimal root-cause fixes. No new abstractions or dependencies without a
  demonstrated need. It never permits skipping validation or tests.
- **No fake green.** A genuine bug is fixed or tracked — never normalized as
  an expected failure. `test.failing` is a temporary placeholder only, and it
  must invert (fail) the day the gap closes.
- **Branches.** Feature work on branches; checkpoint commits; never
  rebase/reset/amend pushed history — follow-up commits instead.
- **Verify, don't assert.** Run the code. Browser changes get verified in a
  real browser (headless Firefox here), not by reading the diff.

## Parity methodology

- Ground every behavioral claim in **Jekyll 4.3.4 source** (cite file + line
  in test comments), jekyllrb.com docs, or recorded real-Jekyll output.
- Evidence hierarchy: battletest differential (real theme + real output) >
  source-grounded unit tests > our own assumptions.
- The battletest is the most important test file. When adding features,
  check whether it covers them; if not, add a case.
- Jekyll source reference: `https://github.com/jekyll/jekyll/tree/v4.3.4/lib/jekyll/`
  (also useful: `related_posts.rb`, `document.rb`, `publisher.rb`,
  `frontmatter_defaults.rb`, `drops/url_drop.rb`).

## Key decisions (do not re-litigate without new evidence)

- **Plugin architecture over hardcoded deps:** Markdown renderers, highlighters,
  and Sass compilers are plugins (see `src/plugins.js`). Engine accepts
  `options.markdown` (a `MarkdownRenderer` adapter). Defaults to built-in
  marked adapter; kramdown-js available as `src/adapters/markdown-kramdown.js`.
  Never hardcode a specific renderer/highlighter in core.
- **LiquidJS config is frozen:** `dynamicPartials: false`,
  `jekyllInclude: true`, `jekyllWhere: true`. Required for parity.
- **Layouts resolve without extension** (`layout: post`), order: exact →
  `.html` → `.htm`.
- **Posts accept `.md` and `.markdown`.**
- **Collection `output:` defaults to `false`** (`collection.rb:188`). Only
  `posts` always renders.
- **Sass/highlight are plugins**, not core deps. Core dist must stay ~219KB.
  New heavy optional deps follow the same pattern (option + browser chunk +
  clear error when missing). See `docs/api/plugins.md`.
- **Fatal beats silent:** malformed `_config.yml` / `_data` throw (Jekyll
  parity). Bad front matter warns and keeps the document (Jekyll parity).
  The one deliberate exception: Sass syntax errors emit a CSS comment +
  warn (playground-friendly) — documented in `docs/parity.md`.
- **`dist/` is committed.** The playground loads it directly; CI rebuilds
  it to prove the build works.
- **Two escape helpers stay separate** (`engine.js` vs `jekyllTags.js`) —
  they escape different character sets for different contexts.

## Docs conventions

- API changes: update JSDoc comments in `src/` **and** run `npm run gen:api` to regenerate `website/docs/api/`. Also add a `docs/api/CHANGELOG.md` entry (version, what changed, migration). Old behavior stays recorded — never delete, only supersede.
- New user-facing behavior: update `README.md` if it belongs in the overview.
- New tests: update `test/README.md` index.
- Fixed a parity gap? Update `docs/parity.md` (move it from gaps to covered).
- Type declarations: `npm run build:types` generates `.d.ts` from JSDoc via `tsc --emitDeclarationOnly`. Run before publishing.

### Docs workflow (for AI agents)

1. **JSDoc is the API source**: Write JSDoc comments in `src/*.js` with `@param`, `@returns`, `@example`. Be thorough — this generates both the `.d.ts` types AND the website API docs.
2. **Guides are markdown**: Edit `website/docs/*.md` directly for tutorials, how-tos, explanations.
3. **Regenerate API docs**: After changing JSDoc, run `npm run gen:api` (uses `jsdoc-to-markdown`).
4. **Build types**: Run `npm run build:types` to update `dist/types/*.d.ts`.
5. **Verify**: `cd website && npm run build` must succeed with no broken links.

### Versioning policy

**Do NOT version docs for every release.** Docusaurus versioning duplicates every page — only use it for breaking API changes.

- Patch/minor with no API changes: DON'T version. Update the current docs.
- Breaking API changes: `cd website && npm run docusaurus docs:version <x.y.z>` to snapshot.
- The `v0.2.0` snapshot was premature and should be removed once the API stabilizes.

See: https://docusaurus.io/docs/versioning#when-to-version

## Known gaps

`docs/parity.md` — the honest scoreboard. Check it before claiming
something "isn't implemented."

## kramdown-js integration

The `markdown-kramdown` adapter (`src/adapters/markdown-kramdown.js`) wraps
the [kramdown-js](../kramdown-js/) repo (172/177 oracle parity). Usage:

```js
import { JekyllEngine } from 'jekyll-js/core';
import kramdownAdapter from 'jekyll-js/adapters/markdown-kramdown';

const engine = new JekyllEngine({
  vfs,
  markdown: kramdownAdapter,
});
```

**Do NOT** import kramdown-js directly in core. It lives in a separate repo
(`~/workspace/kramdown-js/`) and is a plugin, not a dependency.

See [kramdown-js AGENTS.md](../kramdown-js/AGENTS.md) for the parser details.

## Theme parity testing

Five real Jekyll themes are byte-compared in `~/workspace/theme-verify/`:
hyde, beautiful-jekyll, just-the-docs, minimal-mistakes, chirpy.

Each has `REPORT.md` with before/after scores and difference classification.
The remaining gaps are structural (not markdown) — see the reports.

To re-run: build each theme with real Jekyll 4.3.4 and with jekyll-js,
then byte-compare outputs. Use the kramdown adapter for markdown parity.
