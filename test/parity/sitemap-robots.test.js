/**
 * test/parity/sitemap-robots.test.js
 * ---------------------------------------------------------------------------
 * sitemap.xml emission order + robots.txt parity vs the real jekyll-sitemap
 * gem (1.4.0) on Jekyll 4.3.4.
 *
 * Ordering ground rules (Jekyll 4.3.4 source, confirmed against the native
 * Ruby oracle):
 *
 * - Collections iterate in `site.collections` insertion order: the config
 *   `collections:` order, with `posts` appended LAST -- it is lazily created
 *   via `collections["posts"] ||= Collection.new(self, "posts")` (site.rb),
 *   so it lands at the end unless the user listed it in `collections:`.
 * - Docs within a collection are in `Document#<=>` order: date ascending,
 *   relative-path tie-break (`Reader#sort_files!` -> `c.docs.sort!`).
 *   Note the sitemap template iterates `collection.docs` directly, so posts
 *   are OLDEST-first here even though the `site.posts` Liquid drop sorts
 *   newest-first.
 * - Pages are sorted by basename: `site.pages.sort_by!(&:name)` (reader.rb).
 *
 * robots.txt ground rules: real Jekyll's reader turns ANY file with a YAML
 * front matter block into a Page, regardless of extension. The themes ship
 * robots.txt with front matter (chirpy: `assets/robots.txt` with
 * `permalink: /robots.txt`; beautiful-jekyll / minimal-mistakes /
 * just-the-docs: root `robots.txt` with `layout: null`), so it must be
 * rendered as a page (front matter stripped, Liquid evaluated), not copied
 * as a static file.
 */

import { JekyllEngine } from '../../src/engine.js';

const sitemapOf = (pages) => pages.find((p) => p.permalink === '/sitemap.xml');
const locsOf = (sitemap) =>
  [...sitemap.content.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
const build = (vfs) =>
  new JekyllEngine({ vfs, logger: () => {} }).build();

describe('sitemap.xml emission order (jekyll-sitemap parity)', () => {
  test('posts are listed oldest-first (Document#<=> date ascending)', async () => {
    const pages = await build({
      '_config.yml': 'url: https://example.com\nplugins:\n  - jekyll-sitemap\n',
      // Filename says Jan, but front-matter date (which real Jekyll uses
      // for Document#date) says March -- so this post sorts AFTER Feb.
      '_posts/2026-01-01-a.md': '---\ntitle: A post\ndate: 2026-03-01\n---\nA',
      '_posts/2026-02-01-b.md': '---\ntitle: B post\n---\nB',
      'index.md': '---\ntitle: Home\n---\nHome',
    });
    const locs = locsOf(sitemapOf(pages));
    const aIdx = locs.findIndex((l) => l.endsWith('/a.html'));
    const bIdx = locs.findIndex((l) => l.endsWith('/b.html'));
    expect(aIdx).toBeGreaterThan(-1);
    expect(bIdx).toBeGreaterThan(-1);
    // B (Feb) before A (front-matter date: Mar), NOT filename order.
    expect(bIdx).toBeLessThan(aIdx);
  });

  test('output collections come before posts, in config order', async () => {
    const pages = await build({
      '_config.yml':
        'url: https://example.com\nplugins:\n  - jekyll-sitemap\n' +
        'collections:\n  docs:\n    output: true\n  guides:\n    output: true\n',
      // VFS order is guides-first; config order (docs, guides) must win.
      '_guides/g1.md': '---\ntitle: G1\n---\nG',
      '_docs/d1.md': '---\ntitle: D1\n---\nD',
      '_posts/2026-01-01-p.md': '---\ntitle: P\n---\nP',
      'index.md': '---\ntitle: Home\n---\nHome',
    });
    const locs = locsOf(sitemapOf(pages));
    const docsIdx = locs.findIndex((l) => l.startsWith('/docs/'));
    const guidesIdx = locs.findIndex((l) => l.startsWith('/guides/'));
    const postIdx = locs.findIndex((l) => l.includes('/2026/'));
    expect(docsIdx).toBeGreaterThan(-1);
    expect(guidesIdx).toBeGreaterThan(-1);
    expect(postIdx).toBeGreaterThan(-1);
    expect(docsIdx).toBeLessThan(guidesIdx);
    expect(guidesIdx).toBeLessThan(postIdx);
  });

  test('undated collection docs sort by relative path', async () => {
    const pages = await build({
      '_config.yml':
        'url: https://example.com\nplugins:\n  - jekyll-sitemap\n' +
        'collections:\n  docs:\n    output: true\n',
      '_docs/zz.md': '---\ntitle: ZZ\n---\nZ',
      '_docs/aa.md': '---\ntitle: AA\n---\nA',
      'index.md': '---\ntitle: Home\n---\nHome',
    });
    const locs = locsOf(sitemapOf(pages));
    const aaIdx = locs.findIndex((l) => l === '/docs/aa/');
    const zzIdx = locs.findIndex((l) => l === '/docs/zz/');
    expect(aaIdx).toBeGreaterThan(-1);
    expect(zzIdx).toBeGreaterThan(-1);
    expect(aaIdx).toBeLessThan(zzIdx);
  });

  test('pages sort by basename (Page#name), not full path', async () => {
    const pages = await build({
      '_config.yml': 'url: https://example.com\nplugins:\n  - jekyll-sitemap\n',
      'b.md': '---\ntitle: top b\n---\nB',
      'a/z.md': '---\ntitle: nested z\n---\nZ',
      'index.md': '---\ntitle: Home\n---\nHome',
    });
    const locs = locsOf(sitemapOf(pages));
    // Basename order: b.md, index.md, z.md  (NOT path order a/z.md first)
    expect(locs).toEqual(['/b.html', '/', '/a/z.html']);
  });
});

describe('robots.txt parity', () => {
  test('chirpy form: assets/robots.txt with front matter renders as a page', async () => {
    const pages = await build({
      '_config.yml': 'url: https://example.com\nplugins:\n  - jekyll-sitemap\n',
      'index.md': '---\ntitle: Home\n---\nHome',
      'assets/robots.txt':
        '---\npermalink: /robots.txt\n---\n\nUser-agent: *\n\nSitemap: {{ "/sitemap.xml" | absolute_url }}\n',
    });
    const robots = pages.find((p) => p.permalink === '/robots.txt');
    expect(robots).toBeDefined();
    expect(robots.content).toContain('User-agent: *');
    // Front matter stripped, Liquid evaluated (real Jekyll renders the page).
    expect(robots.content).not.toContain('---');
    expect(robots.content).toContain('https://example.com/sitemap.xml');
    // Not an HTML page -> excluded from sitemap.xml, like the real gem.
    expect(sitemapOf(pages).content).not.toContain('robots.txt');
  });

  test('minimal-mistakes form: root robots.txt with layout:null front matter', async () => {
    const pages = await build({
      '_config.yml': 'url: https://example.com\nplugins:\n  - jekyll-sitemap\n',
      'index.md': '---\ntitle: Home\n---\nHome',
      'robots.txt': '---\nlayout: null\n---\nUser-agent: *\nDisallow:\n',
    });
    const robots = pages.find((p) => p.permalink === '/robots.txt');
    expect(robots).toBeDefined();
    expect(robots.content).toContain('User-agent: *');
    expect(robots.content).not.toContain('---');
  });

  test('robots.txt WITHOUT front matter stays a static file (sibling lane)', async () => {
    // Real Jekyll copies a front-matter-less robots.txt as a static file.
    // Static-file EMISSION is a sibling worker's fix; this test pins the
    // classification handoff: it must be tracked as a static file and must
    // NOT be mis-parsed as a page.
    const engine = new JekyllEngine({
      vfs: {
        '_config.yml': 'url: https://example.com\nplugins:\n  - jekyll-sitemap\n',
        'index.md': '---\ntitle: Home\n---\nHome',
        'robots.txt': 'User-agent: *\nDisallow: /secret/\n',
      },
      logger: () => {},
    });
    const pages = await engine.build();
    expect(engine._staticFiles.some((f) => f.path === '/robots.txt')).toBe(true);
    expect(engine._rootPages.some((p) => p.path === 'robots.txt')).toBe(false);
    expect(pages.find((p) => p.permalink === '/robots.txt')).toBeUndefined();
  });
});
