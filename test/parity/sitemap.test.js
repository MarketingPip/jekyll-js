/**
 * jekyll-sitemap native generator (Jekyll parity).
 * Opt-in via `plugins: [jekyll-sitemap]` in _config.yml.
 * Generates /sitemap.xml listing all HTML pages and posts.
 */
import { JekyllEngine } from '../../src/engine.js';

describe('jekyll-sitemap', () => {
  test('generates sitemap.xml when plugin enabled', async () => {
    const engine = new JekyllEngine({
      vfs: {
        '_config.yml': 'url: https://example.com\nplugins:\n  - jekyll-sitemap\n',
        'index.md': '---\ntitle: Home\n---\nHome',
        'about.md': '---\ntitle: About\n---\nAbout',
        '_posts/2026-01-01-hi.md': '---\ntitle: Hi\n---\nHi',
      },
    });
    const pages = await engine.build();
    const sitemap = pages.find((p) => p.permalink === '/sitemap.xml');
    expect(sitemap).toBeDefined();
    expect(sitemap.content).toContain('<?xml');
    expect(sitemap.content).toContain('<urlset');
    expect(sitemap.content).toContain('https://example.com/');
    expect(sitemap.content).toContain('https://example.com/about/');
  });

  test('no sitemap without plugin', async () => {
    const engine = new JekyllEngine({
      vfs: {
        'index.md': '---\ntitle: Home\n---\nHome',
      },
    });
    const pages = await engine.build();
    const sitemap = pages.find((p) => p.permalink === '/sitemap.xml');
    expect(sitemap).toBeUndefined();
  });

  test('respects sitemap exclusion via front matter', async () => {
    const engine = new JekyllEngine({
      vfs: {
        '_config.yml': 'url: https://example.com\nplugins: [jekyll-sitemap]\n',
        'index.md': '---\ntitle: Home\n---\nHome',
        'secret.md': '---\ntitle: Secret\nsitemap: false\n---\nSecret',
      },
    });
    const pages = await engine.build();
    const sitemap = pages.find((p) => p.permalink === '/sitemap.xml');
    expect(sitemap.content).not.toContain('/secret/');
  });
});
