/**
 * Title fallback (Jekyll parity).
 * When a post has no `title:` in front matter, Jekyll uses the
 * titleized filename slug. (Found via Minima theme battle test.)
 */
import { JekyllEngine } from '../../src/engine.js';

describe('title fallback', () => {
  test('uses titleized slug when no title in front matter', async () => {
    const engine = new JekyllEngine({
      vfs: {
        'index.md': '---\ntitle: Home\n---\n{% for post in site.posts %}{{ post.title }};{% endfor %}',
        '_posts/2026-01-15-my-example-post.md': '---\nlayout: post\n---\nContent',
      },
    });
    const pages = await engine.build();
    const index = pages.find((p) => p.permalink === '/');
    expect(index.content).toContain('My Example Post');
  });

  test('front matter title wins over slug', async () => {
    const engine = new JekyllEngine({
      vfs: {
        'index.md': '---\ntitle: Home\n---\n{% for post in site.posts %}{{ post.title }};{% endfor %}',
        '_posts/2026-01-15-my-post.md': '---\ntitle: Custom Title\n---\nContent',
      },
    });
    const pages = await engine.build();
    const index = pages.find((p) => p.permalink === '/');
    expect(index.content).toContain('Custom Title');
    expect(index.content).not.toContain('My Post;');
  });
});
