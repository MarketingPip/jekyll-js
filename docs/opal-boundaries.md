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

1. **Regex lookbehind** (`(?<=...)`, `(?<!...)`) — NOT supported in Opal 1.8.2. Any plugin using it fails. (jekyll-sitemap does.)
2. **Native extensions** — Any gem with C extensions cannot run. Pure Ruby only.
3. **`require` of stdlib** — `fileutils`, `json`, `time`, etc. need shims or are missing. The pilot stripped `require "fileutils"`.
4. **File system access** — No real FS. Must inject a file map via shim.
5. **`__dir__`** — Works if compiled with Opal's `file:` option (proven in pilot).
6. **Threads/Fibers** — Limited support. Plugins using them will fail.
7. **Method_missing / complex metaprogramming** — Opal supports basic `method_missing` but complex DSLs may break.

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
