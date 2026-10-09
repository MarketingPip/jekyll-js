/**
 * test/unit/permalink-edge.test.js
 * ---------------------------------------------------------------------------
 * Permalink edge cases, grounded in Jekyll 4.3.4 source:
 *
 * Bug 1 -- Jekyll's Page#template (lib/jekyll/page.rb) applies the site's
 *   `permalink: pretty` style ONLY when the page is HTML output
 *   (`if !html?` guard). A non-HTML page like `atom.xml` must keep
 *   `/atom.xml` even with `permalink: pretty` configured.
 *
 * Bug 2 -- Jekyll's Page#destination / Document#destination
 *   (lib/jekyll/page.rb, lib/jekyll/document.rb): a URL ending in "/"
 *   is written to `index.html` inside that directory. The URL itself is
 *   unchanged; only the output file path expands (`/about/` ->
 *   `about/index.html`).
 *
 * Bug 3 -- Jekyll's URL class (lib/jekyll/url.rb #generated_permalink)
 *   runs the SAME placeholder substitution over a front-matter
 *   `permalink:` as over a template; it is NOT emitted verbatim.
 *   Placeholders come from the document's UrlDrop
 *   (lib/jekyll/drops/url_drop.rb): :title, :slug, :categories, :path,
 *   :name, :year, :short_year, :month, :i_month, :day, :i_day, :y_day,
 *   :hour, :minute, :second, ...
 *   Pages use the smaller page.rb #url_placeholders set:
 *   :path (dir), :basename, :output_ext.
 */

import {
  JekyllEngine,
  generatePermalink,
  generateCollectionPermalink,
  permalinkToOutputPath,
} from '../../src/engine.js';

function buildEngine(vfs) {
  return new JekyllEngine({ vfs, logger: () => {} });
}

// ─── Bug 1: pretty permalinks must not rewrite non-HTML pages ───────────────

describe('Bug 1: `permalink: pretty` keeps non-HTML extensions (page.rb !html? guard)', () => {
  test('atom.xml keeps /atom.xml with permalink: pretty', async () => {
    const engine = buildEngine({
      '_config.yml': 'permalink: pretty\n',
      'atom.xml': '---\nlayout: null\n---\n<feed>hi</feed>',
    });
    const results = await engine.build();
    const atom = results.find((r) => r.path === 'atom.xml');
    expect(atom).toBeDefined();
    expect(atom.permalink).toBe('/atom.xml');
  });

  test('search.json keeps /search.json with permalink: pretty', async () => {
    const engine = buildEngine({
      '_config.yml': 'permalink: pretty\n',
      'search.json': '---\n---\n{"q": 1}',
    });
    const results = await engine.build();
    const json = results.find((r) => r.path === 'search.json');
    expect(json.permalink).toBe('/search.json');
  });

  test('about.md still gets /about/ with permalink: pretty (HTML output)', async () => {
    const engine = buildEngine({
      '_config.yml': 'permalink: pretty\n',
      'about.md': '---\n---\nAbout',
    });
    const results = await engine.build();
    const about = results.find((r) => r.path === 'about.md');
    expect(about.permalink).toBe('/about/');
  });

  test('site.pages url agrees: atom.xml -> /atom.xml under pretty', async () => {
    const engine = buildEngine({
      '_config.yml': 'permalink: pretty\n',
      'atom.xml': '---\nlayout: null\n---\n<feed>hi</feed>',
      'index.md': '---\n---\n{% for p in site.pages %}{{ p.url }};{% endfor %}',
    });
    const results = await engine.build();
    const index = results.find((r) => r.path === 'index.md');
    expect(index.content).toContain('/atom.xml');
    expect(index.content).not.toContain('/atom/;');
  });
});

// ─── Bug 2: trailing-slash permalink -> index.html output path ───────────────

describe('Bug 2: trailing-slash permalink expands to index.html (page.rb #destination)', () => {
  test("'/about/' -> 'about/index.html'", () => {
    expect(permalinkToOutputPath('/about/')).toBe('about/index.html');
  });

  test("'/' -> 'index.html'", () => {
    expect(permalinkToOutputPath('/')).toBe('index.html');
  });

  test("non-trailing-slash URLs keep their path ('/feed.xml' -> 'feed.xml')", () => {
    expect(permalinkToOutputPath('/feed.xml')).toBe('feed.xml');
  });

  test('build: permalink: /about/ keeps URL /about/, output path about/index.html', async () => {
    const engine = buildEngine({
      'about.md': '---\npermalink: /about/\n---\nAbout body',
    });
    const results = await engine.build();
    const about = results.find((r) => r.path === 'about.md');
    expect(about.permalink).toBe('/about/'); // URL unchanged
    expect(permalinkToOutputPath(about.permalink)).toBe('about/index.html');
  });
});

// ─── Bug 3: front-matter permalink placeholders are substituted ─────────────

describe('Bug 3: front-matter permalink placeholders (url.rb #generated_permalink)', () => {
  test(':categories/:title substituted in a post front-matter permalink', () => {
    const fm = { permalink: '/:categories/:title/', categories: ['Blog'], title: 'X' };
    expect(generatePermalink(fm, 'hello-world', '2026-01-02')).toBe('/blog/hello-world/');
  });

  test(':year/:month/:day/:title.html substituted in a post front-matter permalink', () => {
    const fm = { permalink: '/:year/:month/:day/:title.html' };
    expect(generatePermalink(fm, 'hello-world', '2026-01-02')).toBe('/2026/01/02/hello-world.html');
  });

  test(':short_year/:i_month/:i_day/:hour/:minute/:second from the date', () => {
    const fm = { permalink: '/:short_year/:i_month/:i_day/:hour/:minute/:second/' };
    expect(generatePermalink(fm, 'x', '2026-01-02')).toBe('/26/1/2/00/00/00/');
  });

  test(':slug prefers front-matter slug, falls back to the filename slug', () => {
    expect(generatePermalink({ permalink: '/:slug/', slug: 'my-slug' }, 'filename', '2026-01-02')).toBe(
      '/my-slug/'
    );
    expect(generatePermalink({ permalink: '/:slug/' }, 'filename-slug', '2026-01-02')).toBe(
      '/filename-slug/'
    );
  });

  test(':path is the collection-relative path without extension', () => {
    const fm = { permalink: '/:path/' };
    expect(generatePermalink(fm, 'hello-world', '2026-01-02', {}, '_posts/2026-01-02-hello-world.md')).toBe(
      '/2026-01-02-hello-world/'
    );
  });

  test('front-matter permalink is a literal URL template, not a style preset name', () => {
    // `permalink: pretty` in front matter must NOT expand the "pretty" preset
    expect(generatePermalink({ permalink: 'pretty' }, 'x', '2026-01-02')).toBe('/pretty');
  });

  test('placeholder-free front-matter permalink still passes through', () => {
    expect(generatePermalink({ permalink: '/custom/path/' }, 'x', '2026-01-02')).toBe('/custom/path/');
  });

  test('collection front-matter permalink: :title/:collection/:path/:name substituted', () => {
    expect(generateCollectionPermalink({ permalink: '/work/:title/' }, 'projects', 'web/widget.md', {})).toBe(
      '/work/widget/'
    );
    expect(
      generateCollectionPermalink({ permalink: '/:collection/:path/:name/' }, 'projects', 'web/widget.md', {})
    ).toBe('/projects/web/widget/widget/');
  });

  test('collection front-matter permalink: date placeholders from the doc date', () => {
    const fm = { permalink: '/:year/:month/:title/' };
    expect(generateCollectionPermalink(fm, 'projects', 'widget.md', {}, '2026-03-04')).toBe(
      '/2026/03/widget/'
    );
  });

  test('build: post permalink /:year/:title/ renders the substituted URL', async () => {
    const engine = buildEngine({
      '_posts/2026-01-03-ho.md': '---\npermalink: /:year/:title/\n---\nHo',
    });
    const results = await engine.build();
    const post = results.find((r) => r.path === '_posts/2026-01-03-ho.md');
    expect(post.permalink).toBe('/2026/ho/');
  });

  test('build: page permalink /:basename/ substitutes the page placeholders', async () => {
    const engine = buildEngine({
      'docs/guide.md': '---\npermalink: /:basename/\n---\nGuide',
    });
    const results = await engine.build();
    const page = results.find((r) => r.path === 'docs/guide.md');
    expect(page.permalink).toBe('/guide/');
  });
});
