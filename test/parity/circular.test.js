/**
 * Circular import safety (robustness).
 * Includes and layouts that reference each other must not infinite-loop.
 */
import { JekyllEngine } from '../../src/engine.js';

describe('circular includes', () => {
  test('self-referencing include does not hang', async () => {
    const engine = new JekyllEngine({
      vfs: {
        '_includes/loop.html': 'A {% include "loop.html" %} B',
        'index.md': '---\ntitle: H\n---\n{% include "loop.html" %}',
      },
    });
    // Should either render with a limit or throw a clear error, not hang
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('HANG: circular include')), 5000)
    );
    const build = engine.build();
    try {
      await Promise.race([build, timeout]);
    } catch (e) {
      // Either a clear error or a hang detection is acceptable;
      // hanging forever is not.
      expect(e.message).not.toBe('HANG: circular include');
    }
  }, 10000);

  test('mutually recursive includes do not hang', async () => {
    const engine = new JekyllEngine({
      vfs: {
        '_includes/a.html': 'A {% include "b.html" %}',
        '_includes/b.html': 'B {% include "a.html" %}',
        'index.md': '---\ntitle: H\n---\n{% include "a.html" %}',
      },
    });
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('HANG')), 5000)
    );
    try {
      await Promise.race([engine.build(), timeout]);
    } catch (e) {
      expect(e.message).not.toBe('HANG');
    }
  }, 10000);
});

describe('circular layouts', () => {
  test('self-referencing layout does not hang', async () => {
    const engine = new JekyllEngine({
      vfs: {
        '_layouts/loop.html': '---\nlayout: loop\n---\n{{ content }}',
        'index.md': '---\nlayout: loop\ntitle: H\n---\nHi',
      },
    });
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('HANG')), 5000)
    );
    try {
      const pages = await Promise.race([engine.build(), timeout]);
      // If it completes, content should be there (loop broken by visited set)
      expect(pages[0].content).toContain('Hi');
    } catch (e) {
      expect(e.message).not.toBe('HANG');
    }
  }, 10000);
});
