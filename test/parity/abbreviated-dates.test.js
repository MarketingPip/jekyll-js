/**
 * Abbreviated dates in post filenames (from official Jekyll test suite).
 * Jekyll's DATE_FILENAME_MATCHER: (\d{2,4}-\d{1,2}-\d{1,2})
 * e.g. 2017-2-5 → 2017/02/05/
 */
import { JekyllEngine } from '../../src/engine.js';

describe('abbreviated post dates (Jekyll official)', () => {
  test('2017-2-5 parses as 2017/02/05', async () => {
    const engine = new JekyllEngine({
      vfs: {
        '_posts/2017-2-5-i-dont-like-zeroes.md': '---\ntitle: Test\n---\nContent',
      },
      logger: () => {},
    });
    const pages = await engine.build();
    expect(pages[0].permalink).toBe('/2017/02/05/i-dont-like-zeroes.html');
  });

  test('standard 2017-02-05 still works', async () => {
    const engine = new JekyllEngine({
      vfs: {
        '_posts/2017-02-05-test.md': '---\ntitle: Test\n---\nContent',
      },
      logger: () => {},
    });
    const pages = await engine.build();
    expect(pages[0].permalink).toBe('/2017/02/05/test.html');
  });
});
