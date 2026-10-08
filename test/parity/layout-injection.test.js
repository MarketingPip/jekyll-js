/**
 * Layout injection (Jekyll parity).
 *
 * Real Jekyll resolves `layout: <name>` against `_layouts/<name>.html`
 * (extension optional in front matter). For gem-based themes (e.g.
 * jekyll-theme-chirpy, beautiful-jekyll as a remote theme), the theme's
 * layouts live under the theme directory -- e.g.
 * `<theme>/_layouts/default.html` -- and real Jekyll merges them with the
 * site's own `_layouts/`, site winning on name conflicts.
 *
 * Jekyll source: lib/jekyll/theme.rb (Theme#layouts_path),
 * lib/jekyll/readers/layout_reader.rb, lib/jekyll/renderer.rb
 */
import { JekyllEngine } from '../../src/engine.js';

async function build(vfs) {
  const engine = new JekyllEngine({ vfs, logger: () => {} });
  const pages = await engine.build();
  return pages.find((p) => p.permalink === '/');
}

describe('layout injection', () => {
  test('layout: default (extensionless) wraps content', async () => {
    const index = await build({
      '_layouts/default.html': '<html><body>{{ content }}</body></html>',
      'index.md': '---\nlayout: default\ntitle: H\n---\n# Hi',
    });
    expect(index.content).toContain('<html><body>');
    expect(index.content).toContain('<h1');
  });

  test('layout: default.html (with extension) wraps content', async () => {
    const index = await build({
      '_layouts/default.html': '<html><body>{{ content }}</body></html>',
      'index.md': '---\nlayout: default.html\ntitle: H\n---\n# Hi',
    });
    expect(index.content).toContain('<html><body>');
    expect(index.content).toContain('<h1');
  });

  test('nested layouts chain correctly (page -> post layout -> default layout)', async () => {
    const engine = new JekyllEngine({
      vfs: {
        '_layouts/default.html': '<html><body>{{ content }}</body></html>',
        '_layouts/post.html': '---\nlayout: default\n---\n<article>{{ content }}</article>',
        '_posts/2024-01-01-hello.md': '---\nlayout: post\ntitle: Hello\n---\nPost body',
      },
      logger: () => {},
    });
    const pages = await engine.build();
    const post = pages.find((p) => p.permalink === '/2024/01/01/hello.html');
    expect(post.content).toContain('<html><body>');
    expect(post.content).toContain('<article>');
    expect(post.content).toContain('Post body');
    // Order: default outermost, post layout middle, content innermost
    const htmlPos = post.content.indexOf('<html>');
    const articlePos = post.content.indexOf('<article>');
    const bodyPos = post.content.indexOf('Post body');
    expect(htmlPos).toBeLessThan(articlePos);
    expect(articlePos).toBeLessThan(bodyPos);
  });

  test('theme-like nested setup: layouts under a theme dir are applied', async () => {
    const index = await build({
      'chirpy/_layouts/default.html': '<html><body>{{ content }}</body></html>',
      'index.md': '---\nlayout: default\ntitle: H\n---\n# Hi',
    });
    expect(index.content).toContain('<html><body>');
    expect(index.content).toContain('<h1');
  });

  test('theme-like nested setup: layout chains resolve inside the theme dir', async () => {
    const index = await build({
      'beautiful-jekyll/_layouts/base.html': '<html><body>{{ content }}</body></html>',
      'beautiful-jekyll/_layouts/page.html': '---\nlayout: base\n---\n<main>{{ content }}</main>',
      'index.md': '---\nlayout: page\n---\nHello',
    });
    expect(index.content).toContain('<html><body>');
    expect(index.content).toContain('<main>');
    expect(index.content).toContain('Hello');
    const htmlPos = index.content.indexOf('<html>');
    const mainPos = index.content.indexOf('<main>');
    const helloPos = index.content.indexOf('Hello');
    expect(htmlPos).toBeLessThan(mainPos);
    expect(mainPos).toBeLessThan(helloPos);
  });

  test("site _layouts/ wins over same-named theme-dir layout (Jekyll parity)", async () => {
    const index = await build({
      'chirpy/_layouts/default.html': '<html><body>THEME{{ content }}</body></html>',
      '_layouts/default.html': '<html><body>SITE{{ content }}</body></html>',
      'index.md': '---\nlayout: default\n---\nHi',
    });
    expect(index.content).toContain('SITE');
    expect(index.content).not.toContain('THEME');
  });
});
