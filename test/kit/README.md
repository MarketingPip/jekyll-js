# Parity Test Kit

**For developers and LLM agents:** How to verify jekyll-js matches real Jekyll.

## The Oracle

The ground truth is **real Jekyll 4.3.x**. The oracle harness builds a site with both engines and diffs:

```bash
# Build with jekyll-js only (no Ruby needed)
node test/oracle/harness.js --source /path/to/site

# Full oracle (requires Ruby + Jekyll)
node test/oracle/harness.js --source /path/to/site --jekyll /path/to/jekyll
```

Output goes to `test/oracle/out/`:
- `js/` — jekyll-js output
- `jekyll/` — real Jekyll output

### Normalization

The harness normalizes nondeterministic output before diffing:
- Timestamps (build times, `site.time`)
- Jekyll version strings
- Absolute temp paths

If you see a mismatch, check if it's a normalization gap before filing a bug.

## Official Jekyll Tests

We track the official Jekyll test suite at `/tmp/jekyll-src/test/` (cloned from jekyll/jekyll).

**High-value test files for parity:**
| File | What it tests | Priority |
|------|---------------|----------|
| `test_generated_site.rb` | End-to-end site build | P0 |
| `test_filters.rb` | Liquid filters | P0 |
| `test_document.rb` | Posts/documents | P0 |
| `test_page.rb` | Pages | P0 |
| `test_url.rb` | URL generation | P1 |
| `test_excerpt.rb` | Excerpts | P1 |
| `test_collections.rb` | Collections | P1 |
| `test_configuration.rb` | Config handling | P1 |

### Converting a Jekyll Test

1. Read the Ruby test in `/tmp/jekyll-src/test/test_*.rb`
2. Note the fixture it uses (usually `test/source/`)
3. Write a JS test in `test/parity/` that:
   - Builds the same fixture with jekyll-js
   - Asserts the same output as the Ruby test
4. If Ruby+Jekyll is available, verify against the oracle first

**Example:**
```ruby
# Jekyll (Ruby)
should "hide unpublished posts" do
  published = Dir[dest_dir("publish_test/2008/02/02/*.html")]
  assert_equal 1, published.size
end
```

```js
// jekyll-js
test('hides unpublished posts', async () => {
  const pages = await buildFixture('publish_test');
  const published = pages.filter(p => p.permalink.includes('/2008/02/02/'));
  expect(published).toHaveLength(1);
});
```

## Theme Compatibility

To test a theme:
1. Clone the theme to `/tmp/`
2. Run the oracle harness on it
3. Record results in `docs/theme-compat.md`

**Tested themes:**
| Theme | Version | Pages | Match |
|-------|---------|-------|-------|
| Minima | master | 13 | ✅ Build succeeds* |
| Cayman | master | 7 | ✅ Build succeeds* |

*Exact byte-match pending Ruby+Jekyll oracle.

## Plugin Parity

For each native plugin, verify against the real gem:
1. Install the gem: `gem install jekyll-feed`
2. Create a test site with the plugin enabled
3. Run oracle harness
4. Diff `/feed.xml` (or equivalent)

**Plugin status:**
| Plugin | Gem version | Status |
|--------|-------------|--------|
| jekyll-feed | 0.17.0 | ✅ Template verbatim, needs oracle |
| jekyll-seo-tag | 2.8.0 | ✅ Native, needs oracle |
| jekyll-sitemap | 1.4.0 | ✅ Native, needs oracle |

## For LLM Agents

When asked to verify parity:
1. **Always** check `/tmp/jekyll-src/test/` for the relevant official test first
2. Use the oracle harness if Ruby is available
3. If Ruby is NOT available, use the documented expected outputs in `test/parity/`
4. Never assert parity without either (a) oracle diff or (b) official test conversion
5. Record the evidence (which test, which fixture, what matched)
