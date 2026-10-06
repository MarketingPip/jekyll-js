/**
 * Plugin API: site.posts shortcut (Jekyll parity).
 */
import { JekyllEngine } from '../../src/engine.js';

describe('plugin site.posts', () => {
  test('site.posts is available in generators', async () => {
    let seenPosts = null;
    const engine = new JekyllEngine({
      vfs: {
        '_posts/2026-01-01-a.md': '---\ntitle: A\n---\nA',
        '_posts/2026-01-02-b.md': '---\ntitle: B\n---\nB',
      },
      logger: () => {},
    });
    engine.registerGenerator((site) => {
      seenPosts = site.posts;
    });
    await engine.build();
    expect(seenPosts).toHaveLength(2);
    expect(seenPosts[0].title).toBe('B'); // newest first
  });
});
