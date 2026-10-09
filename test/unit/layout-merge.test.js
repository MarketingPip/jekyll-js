/**
 * Layout front-matter merge chain (Jekyll 4.3.4 parity).
 *
 * Jekyll reference (lib/jekyll/renderer.rb#render_layout): every layout
 * level deep-merges its own front matter into the page payload (page
 * wins) and exposes the current layout's front matter as `layout`:
 *
 *   payload = Utils.deep_merge_hashes(payload, {
 *     "content" => output,
 *     "page"    => layout.data.merge(payload["page"]),
 *     "layout"  => layout.data,
 *   })
 *
 * The chain resolves innermost-first (the page's own layout, then the
 * layout named in that layout's front matter, and so on), so inner
 * layouts beat outer ones and the page beats them all.
 */
import { JekyllEngine } from '../../src/engine.js';

function makeEngine(files) {
  const engine = new JekyllEngine();
  for (const [path, content] of Object.entries(files)) engine.writeFile(path, content);
  return engine;
}

const FM = (data, body) => `---\n${data}\n---\n${body}`;

describe('layout merge chain', () => {
  test('bug 1: layout front matter is exposed as the `layout` variable', async () => {
    const engine = makeEngine({
      '_layouts/default.html': FM('css: custom.css\njs: app.js', '<html>{{ layout.css }}|{{ layout.js }}|{{ content }}</html>'),
      'index.md': FM('layout: default\ntitle: Home', '# Hi'),
    });
    const pages = await engine.build();
    const html = pages.find((p) => p.permalink === '/').content;
    expect(html).toContain('custom.css');
    expect(html).toContain('app.js');
  });

  test('bug 2: layout front matter merges into page data; page wins on conflicts', async () => {
    const engine = makeEngine({
      '_layouts/default.html': FM('nav_enabled: false', '<html>{{ page.nav_enabled }}|{{ content }}</html>'),
      'page-a.md': FM('layout: default', '# A'),
      'page-b.md': FM('layout: default\nnav_enabled: true', '# B'),
    });
    const pages = await engine.build();
    expect(pages.find((p) => p.permalink === '/page-a.html').content).toContain('false');
    expect(pages.find((p) => p.permalink === '/page-b.html').content).toContain('true');
  });

  test('bug 3: chained layouts merge innermost-first; page wins over all', async () => {
    const engine = makeEngine({
      '_layouts/outer.html': FM('a: outer\nd: outer', '<outer>{{ page.a }}|{{ page.b }}|{{ page.d }}|{{ content }}</outer>'),
      '_layouts/inner.html': FM('layout: outer\na: inner\nb: inner', '<inner>{{ page.a }}|{{ page.b }}|{{ content }}</inner>'),
      'index.md': FM('layout: inner\nb: page', '# Hi'),
    });
    const pages = await engine.build();
    const html = pages.find((p) => p.permalink === '/').content;
    // a: inner beats outer (innermost layout wins); b: page beats inner;
    // d: inherited from outer. The outer level sees the same merged page.
    expect(html).toContain('<inner>inner|page|<h1');
    expect(html).toContain('<outer>inner|page|outer|<inner>');
  });

  test('bug 3b: nested hashes deep-merge across the chain (Jekyll deep_merge_hashes)', async () => {
    const engine = makeEngine({
      '_layouts/outer.html': FM('meta:\n  y: 3\n  z: 4', '<html>{{ page.meta.x }}|{{ page.meta.y }}|{{ page.meta.z }}</html>'),
      '_layouts/inner.html': FM('layout: outer\nmeta:\n  x: 1\n  y: 2', '<html>{{ content }}</html>'),
      'index.md': FM('layout: inner\nmeta:\n  x: 9', '# Hi'),
    });
    const pages = await engine.build();
    const html = pages.find((p) => p.permalink === '/').content;
    // x: 9 (page wins over inner), y: 2 (inner wins over outer), z: 4 (outer inherited)
    expect(html).toContain('9|2|4');
  });

  test('layout variable is the front matter of the layout being rendered at each level', async () => {
    const engine = makeEngine({
      '_layouts/outer.html': FM('who: outer', '<outer>{{ layout.who }}|{{ content }}</outer>'),
      '_layouts/inner.html': FM('layout: outer\nwho: inner', '<inner>{{ layout.who }}|{{ content }}</inner>'),
      'index.md': FM('layout: inner', '# Hi'),
    });
    const pages = await engine.build();
    const html = pages.find((p) => p.permalink === '/').content;
    expect(html).toContain('<inner>inner|');
    expect(html).toContain('<outer>outer|<inner>');
  });

  test('cyclic layouts do not hang', async () => {
    const engine = makeEngine({
      '_layouts/a.html': FM('layout: b', '<a>{{ content }}</a>'),
      '_layouts/b.html': FM('layout: a', '<b>{{ content }}</b>'),
      'index.md': FM('layout: a', '# Hi'),
    });
    const pages = await engine.build();
    expect(pages.find((p) => p.permalink === '/').content).toContain('Hi');
  });
});
