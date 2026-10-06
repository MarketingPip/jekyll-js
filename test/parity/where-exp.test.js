import { JekyllEngine } from '../../engine.js';

// where_exp is a core Jekyll filter (used by jekyll-feed's template among
// others). Verified 2026-10-05: LiquidJS ships a correct native
// implementation, so the engine needs no override — these tests lock in
// the behavior against regressions.
describe('where_exp filter', () => {
  let engine;
  beforeAll(() => { engine = new JekyllEngine({ vfs: {} }); });

  const render = (tpl, ctx) => engine.liquidEngine.parseAndRenderSync(tpl, ctx);

  test('filters out drafts: post.draft != true (jekyll-feed use case)', () => {
    const posts = [
      { title: 'A', draft: false },
      { title: 'B', draft: true },
      { title: 'C' },
    ];
    const out = render(
      `{% assign f = posts | where_exp: "post", "post.draft != true" %}{% for p in f %}{{ p.title }}{% endfor %}`,
      { posts }
    );
    expect(out).toBe('AC');
  });

  test('string equality', () => {
    const items = [{ c: 'news' }, { c: 'blog' }];
    const out = render(
      `{% assign f = items | where_exp: "item", "item.c == 'news'" %}{{ f.size }}`,
      { items }
    );
    expect(out).toBe('1');
  });

  test('contains operator', () => {
    const posts = [{ tags: ['x', 'y'] }, { tags: ['z'] }];
    const out = render(
      `{% assign f = posts | where_exp: "post", "post.tags contains 'x'" %}{{ f.size }}`,
      { posts }
    );
    expect(out).toBe('1');
  });

  test('numeric comparison', () => {
    const items = [{ n: 1 }, { n: 5 }, { n: 10 }];
    const out = render(
      `{% assign f = items | where_exp: "item", "item.n > 4" %}{{ f.size }}`,
      { items }
    );
    expect(out).toBe('2');
  });
});
