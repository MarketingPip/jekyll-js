/**
 * Nested layouts (Jekyll parity).
 *
 * Real Jekyll: a layout can itself specify a layout in its front matter,
 * creating a layout chain. `layout: page` where page.html has
 * `layout: base` renders content → page → base.
 * Verified against WASM oracle (Jekyll 4.3.4).
 *
 * Jekyll source: lib/jekyll/layout.rb, lib/jekyll/renderer.rb
 */
import { JekyllEngine } from '../../src/engine.js';

describe('nested layouts', () => {
  test('layout chain renders inside-out', async () => {
    const engine = new JekyllEngine({
      vfs: {
        '_layouts/base.html': '<html><body>{{ content }}</body></html>',
        '_layouts/page.html': '---\nlayout: base\n---\n<main>{{ content }}</main>',
        'index.md': '---\nlayout: page\n---\nHello World',
      },
    });
    const pages = await engine.build();
    const index = pages.find((p) => p.permalink === '/');
    // Content should be wrapped by page layout, then base layout
    expect(index.content).toContain('<main>');
    expect(index.content).toContain('Hello World');
    expect(index.content).toContain('<html><body>');
    // Order: base outermost, page middle, content innermost
    const htmlPos = index.content.indexOf('<html>');
    const mainPos = index.content.indexOf('<main>');
    const helloPos = index.content.indexOf('Hello World');
    expect(htmlPos).toBeLessThan(mainPos);
    expect(mainPos).toBeLessThan(helloPos);
  });

  test('three-level layout chain', async () => {
    const engine = new JekyllEngine({
      vfs: {
        '_layouts/root.html': 'ROOT[{{ content }}]',
        '_layouts/middle.html': '---\nlayout: root\n---\nMID[{{ content }}]',
        '_layouts/leaf.html': '---\nlayout: middle\n---\nLEAF[{{ content }}]',
        'index.md': '---\nlayout: leaf\n---\nCONTENT',
      },
    });
    const pages = await engine.build();
    const index = pages.find((p) => p.permalink === '/');
    expect(index.content).toContain('ROOT[MID[LEAF[');
    expect(index.content).toContain('CONTENT');
  });
});
