/**
 * SCSS @import support (verified via battle test).
 */
import { JekyllEngine } from '../../src/engine.js';
import * as sass from 'sass';

describe('scss imports', () => {
  test('@import resolves from _sass/', async () => {
    const engine = new JekyllEngine({
      vfs: {
        '_sass/_vars.scss': '$primary: #ff0000;',
        'assets/main.scss': '---\n---\n@import "vars";\nbody { color: $primary; }',
        'index.md': '---\ntitle: H\n---\nH',
      },
      sass,
      logger: () => {},
    });
    const pages = await engine.build();
    const css = pages.find((p) => p.permalink === '/assets/main.css');
    expect(css).toBeDefined();
    // #ff0000 compiles to `red` in compressed mode
    expect(css.content).toContain('color: #ff0000');
    expect(css.content).not.toContain('$primary');
  });

  test('nested @import chains work', async () => {
    const engine = new JekyllEngine({
      vfs: {
        '_sass/_base.scss': '$bg: white;',
        '_sass/_theme.scss': '@import "base";\nbody { background: $bg; }',
        'assets/app.scss': '---\n---\n@import "theme";',
        'index.md': '---\ntitle: H\n---\nH',
      },
      sass,
      logger: () => {},
    });
    const pages = await engine.build();
    const css = pages.find((p) => p.permalink === '/assets/app.css');
    expect(css.content).toContain('background');
  });
});
