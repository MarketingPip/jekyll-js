---
title: WASM Oracle Status
---

# Ruby WASM Oracle: Status

**Date:** 2026-10-06
**Goal:** Run real Jekyll 4.3.4 under ruby.wasm via wasmtime as a parity oracle.

## What Works

- ✅ Ruby 4.0 WASM runs under wasmtime 49.0.2
- ✅ RubyGems loads (`Gem::VERSION` = 4.0.3)
- ✅ Downloaded Jekyll 4.3.4 + 15 dependencies from rubygems.org
- ✅ Extracted all gems, constructed load path with `-I` flags

## What's Blocked

- ❌ `forwardable/extended` (Ruby stdlib) missing from ruby.wasm build
  - **FIXED** via pure-Ruby shim (`shim/forwardable/extended.rb`)
  - Implements `rb_delegate` (original is C for performance)
- ❌ `bigdecimal` (C extension) missing from ruby.wasm build
  - `liquid` requires it for precise decimal arithmetic in filters
  - **HARD BLOCKER**: Can't shim safely (floating-point precision matters for parity)
  - Would need to rebuild ruby.wasm with bigdecimal, or patch liquid

## Dependency Chain Resolved

- jekyll 4.3.4 → liquid 4.0.4 → bigdecimal ❌
- jekyll 4.3.4 → addressable 2.9.0 → public_suffix 7.0.5 ✅
- jekyll 4.3.4 → pathutil 0.16.2 → forwardable/extended ✅ (shimmed)

## Next Steps (for future)

1. Find `forwardable/extended.rb` from a Ruby 4.0 source tarball
2. Continue dependency resolution (likely more stdlib gaps)
3. Test basic `Jekyll::Site.new(...).process`
4. Wire into `test/oracle/harness.js` via `--jekyll` flag pointing to a wrapper script

## Alternative: Native Ruby

If Ruby is installed natively (not WASM):
```bash
gem install jekyll
node test/oracle/harness.js --source <site> --jekyll $(which jekyll)
```

The harness is ready; it just needs a working `jekyll` binary.

## ROI Assessment

The WASM path is viable but requires stdlib gap-filling. Each missing file
is a 10-minute detour. Estimated 2-4 hours to get a basic Jekyll build working.

**Higher ROI right now:** Systematic conversion of official Jekyll tests
(already found the abbreviated-dates bug this way). The WASM oracle is
valuable for byte-exact theme comparisons, but test conversion catches
logic bugs faster.
