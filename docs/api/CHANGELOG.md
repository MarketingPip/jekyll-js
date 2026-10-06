# API Changelog

Every change to the public API is recorded here with the version that
introduced it, what changed, and how to migrate. **If you're looking for
how an older version behaved, this file is the record.**

Convention: breaking changes bump the minor version (pre-1.0) or major
version (post-1.0) and get a `MIGRATION` note. When a breaking change
lands, the previous behavior stays documented in the version section
below — nothing is deleted, only superseded.

---

## 0.1.0 (2026-10-05) — current

Initial documented API.

**`JekyllEngine`**
- `new JekyllEngine(options)` — options: `vfs`, `logger`, `stdout`,
  `cache`, `environment`, `relatedPostsFn`, `sass`, `highlighter`.
- `build()` → `Promise<[{ path, permalink, data, content }]>`.
- `useVFS(vfs)` → `this`.
- `writeFile(path, content)` → `this` · `readFile(path)` → `string|undefined` ·
  `removeFile(path)` → `this` · `listFiles()` → `string[]`.
- Fatal (throwing) errors: malformed `_config.yml`, malformed `_data/*`.
  Warn-and-keep (Jekyll parity): bad front matter on documents.
- `dist/`: `jekyll-engine.js` (~219KB, `window.JekyllEngine`),
  `sass-plugin.js` (`window.JekyllSass`), `highlight-plugin.js`
  (`window.JekyllHighlight`).

**Behavioral notes (intentional deviations from Jekyll, by design):**
- Sass syntax errors emit a CSS comment + `warn` log instead of aborting
  the build (playground-friendly).
- `build()` is async; Jekyll's is synchronous (ours awaits LiquidJS).

### Unreleased

- **Added** `fs-vfs.js` (universal, no `node:` imports): `readDirToVFS(dir, { fs, ignore })`
  reads a directory into a VFS object. `fs` is injected — `node:fs` in Node,
  memfs in the browser (proven by a real memfs test). Ignore matches any
  path segment at any depth; binary files get a placeholder.
