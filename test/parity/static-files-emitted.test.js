/**
 * test/parity/static-files-emitted.test.js
 * ---------------------------------------------------------------------------
 * Static files (images, CSS, JS, fonts, ...) are copied verbatim into the
 * build output.
 *
 * Real Jekyll (site.rb, StaticFile#copy / write): every non-convertible
 * file that isn't a special directory is copied as-is into the destination.
 *
 * Found via full-theme testing: minimal-mistakes was missing 185 assets
 * (images/js/css) from build() output because useVFS() tracked them into
 * this._staticFiles but build() never emitted them.
 */

import { JekyllEngine } from '../../src/engine.js';

describe('static files emitted by build()', () => {
  test('images, css and js are emitted with verbatim content', async () => {
    const engine = new JekyllEngine({
      vfs: {
        'index.md': '---\ntitle: H\n---\nH',
        'assets/logo.png': 'BINARY-ISH-STRING',
        'css/a.css': 'body { color: red; }',
        'js/app.js': 'console.log("hi");',
      },
      logger: () => {},
    });
    const results = await engine.build();

    for (const [vfsPath, expected] of [
      ['assets/logo.png', 'BINARY-ISH-STRING'],
      ['css/a.css', 'body { color: red; }'],
      ['js/app.js', 'console.log("hi");'],
    ]) {
      const entry = results.find((r) => r.path === vfsPath);
      expect(entry).toBeDefined();
      expect(entry.content).toBe(expected);
      expect(entry.permalink).toBe(`/${vfsPath}`);
      expect(entry.data).toEqual({});
    }
  });

  test('static files do not disturb page rendering', async () => {
    const engine = new JekyllEngine({
      vfs: {
        'index.md': '---\ntitle: H\n---\nH',
        'assets/x.txt': 'plain',
      },
      logger: () => {},
    });
    const results = await engine.build();
    const index = results.find((r) => r.permalink === '/');
    expect(index).toBeDefined();
    expect(index.content).toContain('H');
  });

  test('nested-directory assets are emitted', async () => {
    const engine = new JekyllEngine({
      vfs: {
        'assets/images/icons/star.svg': '<svg/>',
      },
      logger: () => {},
    });
    const results = await engine.build();
    const entry = results.find((r) => r.path === 'assets/images/icons/star.svg');
    expect(entry).toBeDefined();
    expect(entry.content).toBe('<svg/>');
    expect(entry.permalink).toBe('/assets/images/icons/star.svg');
  });
});
