/**
 * permalink_style config (Jekyll parity).
 * _config.yml `permalink_style:` (or `permalink:`) sets the default
 * permalink format. Styles: date (default), pretty, none, ordinal.
 */
import { JekyllEngine } from '../../src/engine.js';

describe('permalink_style config', () => {
  test('pretty style', async () => {
    const engine = new JekyllEngine({
      vfs: {
        '_config.yml': 'permalink_style: pretty\n',
        '_posts/2026-01-15-hello.md': '---\ntitle: Hello\n---\nHi',
        'index.md': '---\ntitle: H\n---\nH',
      },
    });
    const pages = await engine.build();
    const post = pages.find((p) => p.path.includes('_posts'));
    expect(post.permalink).toBe('/2026/01/15/hello/');
  });

  test('none style', async () => {
    const engine = new JekyllEngine({
      vfs: {
        '_config.yml': 'permalink_style: none\n',
        '_posts/2026-01-15-hello.md': '---\ntitle: Hello\n---\nHi',
        'index.md': '---\ntitle: H\n---\nH',
      },
    });
    const pages = await engine.build();
    const post = pages.find((p) => p.path.includes('_posts'));
    expect(post.permalink).toBe('/hello.html');
  });

  test('ordinal style (day of year)', async () => {
    const engine = new JekyllEngine({
      vfs: {
        '_config.yml': 'permalink_style: ordinal\n',
        // Jan 15 = day 15 of the year
        '_posts/2026-01-15-hello.md': '---\ntitle: Hello\n---\nHi',
        'index.md': '---\ntitle: H\n---\nH',
      },
    });
    const pages = await engine.build();
    const post = pages.find((p) => p.path.includes('_posts'));
    expect(post.permalink).toBe('/2026/015/hello.html');
  });

  test('front matter permalink overrides style', async () => {
    const engine = new JekyllEngine({
      vfs: {
        '_config.yml': 'permalink_style: pretty\n',
        '_posts/2026-01-15-hello.md': '---\ntitle: Hello\npermalink: /custom/url/\n---\nHi',
        'index.md': '---\ntitle: H\n---\nH',
      },
    });
    const pages = await engine.build();
    const post = pages.find((p) => p.path.includes('_posts'));
    expect(post.permalink).toBe('/custom/url/');
  });
});
