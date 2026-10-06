# AGENTS.md — working on jekyll-js

This file is for any agent (including a future session with no context)
picking up this project. Read this first, then `docs/parity.md`, then the
code. The user-facing docs live in `README.md` and `docs/`.

## What this is

A JavaScript port of Jekyll's static site engine (target: Jekyll 4.3.2
parity). It renders sites entirely in-process from a virtual filesystem
(a plain `{ "path": "content" }` object) — no Ruby, no real filesystem.
Consumers: the browser playground (`playground.html`), Node scripts, and
AI agents that need to render Jekyll anywhere.

## Layout

```text
engine.js            JekyllEngine — build(), VFS ingestion, site context
jekyllTags.js        LiquidJS tag registrations (highlight, link, post_url, seo, feed_meta)
assetsPipeline.js    Sass helpers (compiler itself is a plugin, not imported here)
browser.js           Browser entry → dist/jekyll-engine.js (window.JekyllEngine)
browser-sass.js      Plugin entry → dist/sass-plugin.js (window.JekyllSass)
browser-highlight.js Plugin entry → dist/highlight-plugin.js (window.JekyllHighlight)
dist/                Committed build output (rebuilt via npm run build)
playground.html      Demo + reference browser integration
examples/            Runnable examples (build-site.js)
docs/                Developer docs: api/ (engine, plugins, browser, CHANGELOG), parity.md
test/                unit/ · parity/ · integration/ — see test/README.md
battletest/          Real minima theme + recorded real-Jekyll ground-truth output
```

## Commands

```sh
npm install   # deps (esbuild is a devDependency)
npm test      # full suite — 200 tests, must stay green
npm run build # rebuild dist/ bundles (esbuild: core + 2 plugin chunks)
node examples/build-site.js  # smoke-test the programmatic API
```

Timezones matter: date handling is timezone-sensitive. Verify under
`America/Toronto`, `UTC`, and `Pacific/Auckland` (`TZ=... npm test`)
before calling date-related work done. CI runs Node 20 + 22 x America/Toronto, UTC, Pacific/Auckland.

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

- Ground every behavioral claim in **Jekyll 4.3.2 source** (cite file + line
  in test comments), jekyllrb.com docs, or recorded real-Jekyll output.
- Evidence hierarchy: battletest differential (real theme + real output) >
  source-grounded unit tests > our own assumptions.
- The battletest is the most important test file. When adding features,
  check whether it covers them; if not, add a case.
- Jekyll source reference: `https://github.com/jekyll/jekyll/tree/v4.3.2/lib/jekyll/`
  (also useful: `related_posts.rb`, `document.rb`, `publisher.rb`,
  `frontmatter_defaults.rb`, `drops/url_drop.rb`).

## Key decisions (do not re-litigate without new evidence)

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

- API changes: update `docs/api/` **and** add a `docs/api/CHANGELOG.md`
  entry (version, what changed, migration). Old behavior stays recorded —
  never delete, only supersede.
- New user-facing behavior: update `README.md` if it belongs in the overview.
- New tests: update `test/README.md` index.
- Fixed a parity gap? Update `docs/parity.md` (move it from gaps to covered).

## Known gaps

`docs/parity.md` — the honest scoreboard. Check it before claiming
something "isn't implemented."
