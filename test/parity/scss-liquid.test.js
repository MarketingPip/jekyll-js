/**
 * Liquid renders in .scss/.sass assets BEFORE Sass compilation.
 *
 * Real Jekyll: Renderer#run (lib/jekyll/renderer.rb) renders Liquid into
 * the document content first, then runs converters (including
 * jekyll-sass-converter's Scss converter) on the result. That is how
 * themes inject `{{ site.color }}` / `{% if %}` into stylesheets.
 * Parity: strip front matter → render Liquid → compile Sass.
 */
import { JekyllEngine } from '../../src/engine.js';
import * as sass from 'sass';

describe('scss liquid rendering', () => {
  test('{{ site.* }} tags render before Sass compiles', async () => {
    const engine = new JekyllEngine({
      vfs: {
        '_config.yml': 'brand_color: "#1a2b3c"\n',
        'assets/main.scss': '---\n---\nbody { color: {{ site.brand_color }}; }',
        'index.md': '---\ntitle: H\n---\nH',
      },
      sass,
      logger: () => {},
    });
    const pages = await engine.build();
    const css = pages.find((p) => p.permalink === '/assets/main.css');
    expect(css).toBeDefined();
    expect(css.content).toContain('color: #1a2b3c');
    expect(css.content).not.toContain('{{');
  });

  test('{% if %} / {% assign %} work in SCSS', async () => {
    const engine = new JekyllEngine({
      vfs: {
        '_config.yml': 'dark_mode: true\n',
        'assets/theme.scss':
          '---\n---\n{% assign bg = "#000000" %}\n' +
          '{% if site.dark_mode %}body { background: {{ bg }}; }{% endif %}',
        'index.md': '---\ntitle: H\n---\nH',
      },
      sass,
      logger: () => {},
    });
    const pages = await engine.build();
    const css = pages.find((p) => p.permalink === '/assets/theme.css');
    expect(css).toBeDefined();
    expect(css.content).toContain('background: #000000');
    expect(css.content).not.toContain('{%');
  });

  test('{% if %} false branch renders nothing', async () => {
    const engine = new JekyllEngine({
      vfs: {
        '_config.yml': 'dark_mode: false\n',
        'assets/theme.scss':
          '---\n---\n{% if site.dark_mode %}body { background: black; }{% endif %}',
        'index.md': '---\ntitle: H\n---\nH',
      },
      sass,
      logger: () => {},
    });
    const pages = await engine.build();
    const css = pages.find((p) => p.permalink === '/assets/theme.css');
    expect(css).toBeDefined();
    expect(css.content).not.toContain('background');
    expect(css.content).not.toContain('{%');
  });

  test('Liquid works together with @import from _sass/', async () => {
    const engine = new JekyllEngine({
      vfs: {
        '_config.yml': 'brand_color: "#123456"\n',
        '_sass/_vars.scss': '$primary: #ff0000;',
        'assets/main.scss':
          '---\n---\n@import "vars";\nbody { color: {{ site.brand_color }}; border-color: $primary; }',
        'index.md': '---\ntitle: H\n---\nH',
      },
      sass,
      logger: () => {},
    });
    const pages = await engine.build();
    const css = pages.find((p) => p.permalink === '/assets/main.css');
    expect(css).toBeDefined();
    expect(css.content).toContain('color: #123456');
    expect(css.content).toContain('border-color: #ff0000');
    expect(css.content).not.toContain('{{');
  });
});
