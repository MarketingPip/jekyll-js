# Opal Plugin Compatibility: Boundaries

**Date:** 2026-10-06
**Status:** Empirical (pilot) + code analysis

This document defines what Ruby Jekyll plugins can run under Opal 1.8.2,
based on the proven jekyll-feed pilot and code analysis of popular plugins.

## Proven: Works

### jekyll-feed 0.17.0 ✅
**Pilot result:** 100% unmodified gem code runs.
- `Jekyll::Generator` with `safe`/`priority` DSL
- `generate(site)` creating pages
- `Jekyll::Page` subclass (`PageWithoutAFile`)
- `File.read`/`File.exist?` (via shim over injected file map)
- `site.posts`, `site.config` access
- Liquid template rendering via callback to JS

**Shim required:** Generator DSL, Page class, File I/O, Site test doubles.

## Likely Works (code analysis)

### jekyll-sitemap 1.4.0 ⚠️
**Analysis:** Generator is simple, BUT:
- Uses regex lookbehind: `%r!(?<=>\n|})\s+!`
- **Opal 1.8.2 does NOT support lookbehind** (JavaScript RegExp didn't until ES2018, Opal's regex is JS-based)
- **Verdict:** FAILS unless the regex is rewritten. This is a hard Opal boundary.

### jekyll-seo-tag 2.8.0 ⚠️
**Analysis:** Complex. Uses:
- Liquid Drops (`Jekyll::Drops::Drop` subclasses)
- Custom filters
- `{% seo %}` Liquid tag
- **Verdict:** LIKELY WORKS with extended shim (Drops need `to_liquid`, filters need registration). The Drop pattern is shim-able. Not yet tested.

## Known Opal Boundaries (hard limits)

1. **Regex with `\n` escapes** — Opal 1.8.2's **parser** splits string/regex literals on `\n`, mangling patterns like `/(?<=>\n|\})\s+/`. **Lookbehind itself WORKS** (passes through to JS RegExp, ES2018+). The blocker is the parser, not the regex engine. Workarounds (`Regexp.new`, `10.chr`) are fragile — `10.chr` produces literal `"\\n"`, not a newline.
   - **Verdict for jekyll-sitemap:** Use the native JS implementation (already built). Don't fight the parser.
2. **Native extensions** — Ruby C extensions are written against MRI's C API (`rb_define_method`, `rb_str_new_cstr`, etc.). Clang can compile C→WASM, but without MRI's headers/runtime it won't link. You'd need a full MRI-compatible runtime (that's ruby.wasm at 115MB) or a man-year reimplementation of the C API.
   - **Pragmatic alternative:** For Jekyll plugins, "native" deps are usually `json`, `nokogiri`, `fileutils`. Provide JS equivalents via the shim (e.g., Ruby's `JSON.parse` → JS `JSON.parse`). Don't try to run the C code.
3. **File system access** — The Opal *pilot* used an injected file map, but **jekyll-js already supports real FS** via `fs-vfs.js` (`node:fs`, memfs, or plain objects). The Opal shim can bridge to the engine's VFS. This boundary is softer than it appears.
4. **Threads/Fibers** — Limited support. Plugins using them will fail.
5. **Method_missing / complex metaprogramming** — Opal supports basic `method_missing` but complex DSLs may break.

## Plugin Categories

| Category | Examples | Opal Viability |
|----------|----------|----------------|
| Simple generators | jekyll-feed, jekyll-sitemap* | ✅ High (*except regex) |
| Liquid tags | jekyll-seo-tag | ⚠️ Medium (needs Drop shim) |
| Filters | jekyll-assets | ⚠️ Medium |
| Converters | jekyll-sass-converter | ❌ Low (needs native Sass) |
| Complex | jekyll-archives | ⚠️ Medium (many edge cases) |

## Recommendation

**For jekyll-js:** The JS Plugin API (native) is the primary extension mechanism. Opal is a legacy compatibility layer for simple generators only.

**Opal is suitable for:**
- Simple `Jekyll::Generator` subclasses
- Plugins without regex lookbehind
- Plugins without native dependencies
- Plugins without complex metaprogramming

**Opal is NOT suitable for:**
- jekyll-sitemap (regex lookbehind)
- Any plugin with C extensions
- Plugins requiring real filesystem access
- Complex Drop hierarchies (possible but shim-heavy)

## Pushing Boundaries

To expand Opal compatibility:
1. **Regex:** Upgrade to Opal 2.x (may support lookbehind via newer JS)
2. **Shim completeness:** Build a comprehensive Jekyll API shim (Page, Document, Drop, Filters, Utils)
3. **File map:** Robust virtual filesystem for gem assets
4. **Testing:** Each plugin needs individual verification — there is no shortcut

**Estimated effort for "general" Opal bridge:** 2-4 weeks full-time. Not recommended; the JS Plugin API covers 95% of use cases natively.
