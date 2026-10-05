import { JekyllEngine } from '../engine.js';
import { defaultVFS } from '../defaultVFS.js';

describe('JekyllEngine.build() against the real defaultVFS fixture', () => {
  let results;
  let byPath;

  beforeAll(async () => {
    const engine = new JekyllEngine({ vfs: defaultVFS });
    results = await engine.build();
    byPath = Object.fromEntries(results.map((r) => [r.path, r]));
  });

  test('FIX #1 -- build() completes without throwing, and every include resolved', async () => {
    // Before the dynamicPartials fix, `{% include navigation.html %}` and
    // `{% include {{ custom_component }} ... %}` would either throw
    // "Template not resolved" or silently render as a missing variable.
    expect(results.length).toBe(5); // index, about, blog, 2 posts
    for (const r of results) {
      expect(r.content).not.toMatch(/Template not resolved/);
    }
  });

  test('FIX #1 -- literal unquoted include (navigation.html) actually rendered', () => {
    expect(byPath['index.md'].content).toContain('href="/blog"');
    expect(byPath['index.md'].content).toMatch(/<nav>/);
  });

  test('FIX #1 -- dynamic {{ var }}-interpolated include rendered with its params', () => {
    const html = byPath['index.md'].content;
    expect(html).toContain('Local Sandbox Scope'); // include.title from sidebar_card.html
  });

  test('FIX #1 -- key="value" include params (jekyllInclude) still work alongside the fix', () => {
    const html = byPath['index.md'].content;
    expect(html).toContain('Compilation Alert'); // include.heading from alert_box.html
    expect(html).toContain('compiles straight to include.heading'); // include.body_content
  });

  test('FIX #4 -- post permalink uses the filename slug, not the front-matter title', () => {
    const post = byPath['_posts/2026-06-20-getting-started.md'];
    expect(post.permalink).toBe('/blog/getting-started/');
    expect(post.permalink).not.toContain('with-the-compiler');
  });

  test('FIX #2 -- excerpt is a real, sane string (not an unbounded paragraph array)', () => {
    // Render the blog index, which pipes post.excerpt through strip_html | truncate: 150
    const html = byPath['blog.md'].content;
    expect(html).not.toContain('[object Object]');
    // Confirms the value going into strip_html/truncate was a string,
    // not an array (which would render as comma-joined garbage or throw).
    expect(html).toMatch(/Static Sandbox Runtimes|This system mimics/);
    // Bonus fix found during testing: excerpt is converted from Markdown
    // to HTML like the rest of the body, not left as literal "# Heading".
    expect(html).not.toContain('# Static Sandbox Runtimes');
  });

  test('FIX #3 -- date_to_string uses Jekyll\'s UK format via the real LiquidJS built-in', () => {
    const html = byPath['blog.md'].content;
    // Real Jekyll format: "20 Jun 2026", not the old override's "Jun 20, 2026"
    expect(html).toMatch(/20 Jun 2026/);
    expect(html).not.toMatch(/Jun 20, 2026/);
  });

  test('FIX #3 -- truncate respects the standard Liquid budget (ellipsis counted inside it)', () => {
    const post = byPath['_posts/2026-06-15-advanced-liquid.md'];
    // Find the truncated sentence in the rendered post and check its length
    const match = post.content.match(/This is a long sentence[^<]*/);
    expect(match).not.toBeNull();
    expect(match[0].length).toBeLessThanOrEqual(45);
  });

  test('FIX #3 -- "now" | date still resolves via the built-in date filter (no custom override needed)', () => {
    const post = byPath['_posts/2026-06-20-getting-started.md'];
    expect(post.content).toMatch(/Current year: \*\*\d{4}\*\*|Current year: <strong>\d{4}<\/strong>/);
  });

  test('FIX #9 -- site.pages now exists and includes all root pages', async () => {
    const engine = new JekyllEngine({ vfs: defaultVFS });
    const ctx = engine._buildSiteContext();
    const paths = ctx.site.pages.map((p) => p.path).sort();
    expect(paths).toEqual(['about.md', 'blog.md', 'index.md']);
    const about = ctx.site.pages.find((p) => p.path === 'about.md');
    expect(about.url).toBe('/about/');
  });

  test('removed filter overrides: standard `truncate`/`upcase` still work via LiquidJS built-ins', () => {
    const post = byPath['_posts/2026-06-15-advanced-liquid.md'];
    expect(post.content).toContain('HELLO STANDARD RUNTIME');
  });

  test('site.tags and site.categories are still populated correctly', async () => {
    const engine = new JekyllEngine({ vfs: defaultVFS });
    const ctx = engine._buildSiteContext();
    expect(Object.keys(ctx.site.tags).sort()).toEqual(
      ['advanced', 'compiler', 'design', 'patterns', 'runtime', 'tutorial'].sort()
    );
  });

  test('posts are sorted newest-first, matching Jekyll\'s site.posts order', async () => {
    const engine = new JekyllEngine({ vfs: defaultVFS });
    const ctx = engine._buildSiteContext();
    // Note: front-matter's YAML parser converts `date: 2026-06-20` into a
    // real Date object (this is correct, pre-existing behavior -- not
    // something this fix touched), so compare as dates.
    const dates = ctx.site.posts.map((p) => new Date(p.date).toISOString().slice(0, 10));
    expect(dates).toEqual(['2026-06-20', '2026-06-15']);
  });
});

describe('newly-registered filters are usable directly in templates', () => {
  test('relative_url / absolute_url / strip_index / markdownify all work end-to-end', async () => {
    const engine = new JekyllEngine({
      vfs: { '_config.yml': 'url: "http://example.com"\nbaseurl: "/blog"\n' },
    });
    const tpl = [
      '{{ "/about/" | relative_url }}',
      '{{ "/about/" | absolute_url }}',
      '{{ "/about/index.html" | strip_index }}',
      '{{ "**bold**" | markdownify }}',
    ].join('|');
    const out = await engine.liquidEngine.parseAndRender(tpl, engine._buildSiteContext());
    const [rel, abs, stripped, md] = out.split('|');
    expect(rel).toBe('/blog/about/');
    expect(abs).toBe('http://example.com/blog/about/');
    expect(stripped).toBe('/about/');
    expect(md.trim()).toContain('<strong>bold</strong>');
  });
});
