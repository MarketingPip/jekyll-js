# AGENTS.md — working on the jekyll-js website

This file is for any agent (including a future session with no context)
working on the documentation website. Read this first.

## What this is

Docusaurus 3.10.2 site in `website/`. Builds to static HTML, deployed to
GitHub Pages at https://marketingpip.github.io/jekyll-js/

## Layout

```text
website/
  docs/                User documentation (SINGLE SOURCE - edit here)
    getting-started.md
    configuration.md
    api/               API reference (hand-written + JSDoc-generated)
      engine.md                    Hand-written overview
      engine-reference.md          Generated from JSDoc (DO NOT EDIT)
      ...
    project/           Project docs (parity, changelog, etc.)
  src/
    pages/index.js     Homepage (React component)
    css/custom.css     Theme (dark #070a13, Inter + JetBrains Mono)
  static/
    playground/        Playground (copied at build time, gitignored)
  docusaurus.config.js Site config
  sidebars.js          Sidebar navigation
```

## Docs conventions

### Single source of truth

- **Guides**: Edit markdown in `website/docs/` directly. That's it. No other copies.
- **API reference**: JSDoc comments in `src/*.js` are the source. Run `npm run gen:api` to regenerate `website/docs/api/*-reference.md`. NEVER edit generated files by hand.
- **Project docs** (`docs/parity.md`, etc. at repo root): These are for GitHub browsing, NOT the website. Don't duplicate them in `website/docs/`.

### JSDoc → API docs workflow

1. Write JSDoc in `src/engine.js` (or other source files):
   ```js
   /**
    * Build a Jekyll site from a virtual filesystem.
    * @param {Object} files - Map of file paths to content
    * @param {Object} [options] - Build options
    * @returns {Promise<Object>} Built site files
    * @example
    * const site = await build({'index.md': '# Hello'});
    */
   ```
2. Run `npm run gen:api` (from `website/`) to regenerate markdown
3. Run `npm run build` (from `website/`) to verify no broken links
4. Commit both the source JSDoc AND the regenerated markdown

### Type declarations

`npm run build:types` (from repo root) generates `dist/types/*.d.ts` from
JSDoc via `tsc --emitDeclarationOnly`. Run before publishing to npm.

## How to cut a docs version

**Only version on breaking API changes.** Do NOT version for every release.

```bash
cd website
npm run docusaurus docs:version 0.3.0
```

This snapshots `website/docs/` → `website/versioned_docs/version-0.3.0/`.
The version dropdown appears automatically in the navbar.

**When to version:**
- ✅ Breaking API changes (removed/renamed functions, changed signatures)
- ✅ Major version bump with different usage patterns
- ❌ Patch releases (bug fixes, no API changes)
- ❌ Minor releases with only additive changes
- ❌ Documentation fixes/typos

**To remove a premature version:**
```bash
cd website
rm -rf versioned_docs/version-0.2.0 versioned_sidebars/version-0.2.0-sidebars.json
# Edit versions.json to remove the entry
```

## Building & deploying

```bash
# Development (hot reload)
cd website && npm run start

# Production build (verifies links, generates search index)
cd website && npm run build

# Deploy (automatic via GitHub Actions on push to main)
# Workflow: .github/workflows/gh-pages.yml
```

## Customizing the theme

- Colors/fonts: `website/src/css/custom.css` (Infima CSS variables)
- Homepage: `website/src/pages/index.js` (React component)
- Config: `website/docusaurus.config.js`

Current theme: dark (#070a13), Inter + JetBrains Mono, cyan accent (#22d3ee).
To change: edit the CSS variables, don't fight Docusaurus's Infima framework.

## Search

Local search via `@easyops-cn/docusaurus-search-local`. Index builds
automatically with `npm run build`. No Algolia config needed. Search is
offline-capable and respects the `/jekyll-js/` base URL.

## Playground

The playground is at `website/static/playground/` (gitignored, copied at
build time from `playground/`). It deploys to `/jekyll-js/playground/`
— top-level, NOT versioned.

To update: edit files in `playground/` (repo root), the build copies them.
