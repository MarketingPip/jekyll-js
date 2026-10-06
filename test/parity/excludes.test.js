/**
 * exclude/include config (Jekyll parity).
 *
 * Real Jekyll (`lib/jekyll/configuration.rb` defaults, `lib/jekyll/entry_filter.rb`):
 * - `exclude:` lists files/dirs to skip. Defaults include Gemfile,
 *   Gemfile.lock, node_modules/, .sass-cache/, .jekyll-cache/, vendor/.
 * - `include:` forces inclusion, overriding `exclude:` (default: .htaccess).
 * - Special dirs (_layouts, _includes, _data, _sass, _config.yml itself)
 *   are infrastructure and are never excluded.
 */
import { JekyllEngine } from '../../engine.js';

describe('exclude config', () => {
  test('excludes a top-level page', async () => {
    const engine = new JekyllEngine({
      vfs: {
        '_config.yml': 'exclude:\n  - about.md\n',
        'index.md': '# Home',
        'about.md': '# About',
      },
    });
    const pages = await engine.build();
    const permalinks = pages.map((p) => p.permalink);
    expect(permalinks).toContain('/');
    expect(permalinks).not.toContain('/about/');
  });

  test('excludes a file from site.static_files (Gemfile)', async () => {
    const engine = new JekyllEngine({
      vfs: {
        '_config.yml': 'exclude:\n  - Gemfile\n',
        'index.md': '# Home',
        'Gemfile': 'source "https://rubygems.org"',
      },
    });
    await engine.build();
    const paths = engine._buildSiteContext().site.static_files.map((f) => f.path);
    expect(paths).not.toContain('/Gemfile');
  });

  test('default excludes apply without config (node_modules)', async () => {
    const engine = new JekyllEngine({
      vfs: {
        'index.md': '# Home',
        'node_modules/pkg/index.js': 'console.log("x")',
      },
    });
    await engine.build();
    const paths = engine._buildSiteContext().site.static_files.map((f) => f.path);
    expect(paths).not.toContain('/node_modules/pkg/index.js');
  });

  test('include overrides exclude', async () => {
    const engine = new JekyllEngine({
      vfs: {
        '_config.yml': 'exclude:\n  - assets\ninclude:\n  - assets/keep.css\n',
        'index.md': '# Home',
        'assets/drop.css': 'body {}',
        'assets/keep.css': 'html {}',
      },
    });
    await engine.build();
    const paths = engine._buildSiteContext().site.static_files.map((f) => f.path);
    expect(paths).toContain('/assets/keep.css');
    expect(paths).not.toContain('/assets/drop.css');
  });

  test('excluded posts do not appear in site.posts', async () => {
    const engine = new JekyllEngine({
      vfs: {
        '_config.yml': 'exclude:\n  - _posts\n',
        'index.md': '---\ntitle: Home\n---\n# Home',
        '_posts/2026-01-01-a.md': '---\ntitle: A\n---\nA',
      },
    });
    await engine.build();
    const posts = engine._buildSiteContext().site.posts || [];
    expect(posts.length).toBe(0);
  });

  test('special dirs are never excluded (_layouts still work)', async () => {
    const engine = new JekyllEngine({
      vfs: {
        // Even a misguided exclude of _layouts must not break the build;
        // layouts are infrastructure, not convertible content.
        '_config.yml': 'exclude:\n  - _layouts\n',
        '_layouts/default.html': '<html>{{ content }}</html>',
        'index.md': '---\nlayout: default\n---\n# Home',
      },
    });
    const pages = await engine.build();
    const index = pages.find((p) => p.permalink === '/');
    expect(index.content).toContain('<html>');
  });
});
