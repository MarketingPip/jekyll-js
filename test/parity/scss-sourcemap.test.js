/**
 * Sass sourcemap + charset parity (jekyll-sass-converter 3.1.0, scss.rb).
 *
 * - `charset` defaults true: dart-sass emits a BOM when CSS has non-ASCII.
 * - `sass.sourcemap` defaults to `always`: a `.css.map` page is emitted and
 *   the CSS ends with a newline-newline sourceMappingURL comment.
 * - `sourcemap: never` disables; `development` only maps in development.
 * - Map JSON: `file` is `<base>.css`, sources are relative to the scss dir.
 */
import { JekyllEngine } from '../../src/engine.js';
import * as sass from 'sass';

const VFS = {
  '_sass/_vars.scss': '$c: red;\nbody { color: $c; }',
  '_sass/dir/_index.scss': '@forward "inner";',
  '_sass/dir/_inner.scss': 'p::after { content: "h\u00e9llo"; }',
  'assets/app.scss': '---\n---\n@use "vars";\n@use "dir";\ndiv { margin: 0; }',
  'index.md': '---\ntitle: H\n---\nH',
};

async function build(extraConfig = {}, environment = 'development') {
  const engine = new JekyllEngine({
    vfs: {
      ...VFS,
      '_config.yml': `sass:\n${Object.entries(extraConfig)
        .map(([k, v]) => `  ${k}: ${v}`)
        .join('\n')}\n`,
    },
    sass,
    environment,
    logger: () => {},
  });
  return engine.build();
}

describe('scss sourcemap', () => {
  // ORACLE-PROVEN (jekyll-sass-converter 3.1.0 + sass-embedded 1.105.1):
  // with `charset: true` (the gem's default), dart-sass emits an
  // `@charset "UTF-8";` declaration in expanded mode when the CSS has
  // non-ASCII -- NOT a BOM. (A BOM is emitted only in compressed mode;
  // verified against `jekyll build` on this exact fixture.)
  test('charset: @charset declaration emitted when CSS contains non-ASCII (expanded)', async () => {
    const pages = await build();
    const css = pages.find((p) => p.permalink === '/assets/app.css');
    expect(css.content.startsWith('@charset "UTF-8";\n')).toBe(true);
  });

  test('charset: BOM emitted when CSS contains non-ASCII (compressed)', async () => {
    const engine = new JekyllEngine({
      vfs: { ...VFS, '_config.yml': 'sass:\n  style: compressed\n' },
      sass,
      environment: 'development',
      logger: () => {},
    });
    const pages = await engine.build();
    const css = pages.find((p) => p.permalink === '/assets/app.css');
    expect(css.content.charCodeAt(0)).toBe(0xfeff);
    expect(css.content.endsWith('/*# sourceMappingURL=app.css.map */')).toBe(true);
  });

  // ORACLE-PROVEN: sources are relativized from the scss file's directory
  // (the gem's #process_source_map routes file: URLs from the source root,
  // i.e. dirname of the scss page). For assets/app.scss that is ONE level
  // up: ../_sass/.... Stylesheets that contribute no mappings (like the
  // forwarding _index.scss) are omitted from sources -- verified against
  // `jekyll build` on this exact fixture.
  test('map page emitted with mapping comment, file field and relative sources', async () => {
    const pages = await build();
    const css = pages.find((p) => p.permalink === '/assets/app.css');
    expect(css.content.endsWith('\n\n/*# sourceMappingURL=app.css.map */')).toBe(true);
    const mapPage = pages.find((p) => p.permalink === '/assets/app.css.map');
    expect(mapPage).toBeDefined();
    const map = JSON.parse(mapPage.content);
    expect(map.file).toBe('app.css');
    expect(map.sources).toContain('../_sass/_vars.scss');
    expect(map.sources).toContain('../_sass/dir/_inner.scss');
    expect(map.sources).toContain('app.scss');
    expect(map.sources).not.toContain('../_sass/dir/_index.scss');
    expect(Array.isArray(map.sourcesContent)).toBe(true);
    expect(map.sourcesContent.length).toBe(map.sources.length);
  });

  test('sourcemap: never disables maps', async () => {
    const pages = await build({ sourcemap: 'never' });
    const css = pages.find((p) => p.permalink === '/assets/app.css');
    expect(css.content).not.toContain('sourceMappingURL');
    expect(pages.some((p) => p.permalink === '/assets/app.css.map')).toBe(false);
  });

  test('sourcemap: development only maps in development env', async () => {
    const devPages = await build({ sourcemap: 'development' }, 'development');
    expect(devPages.some((p) => p.permalink === '/assets/app.css.map')).toBe(true);
    const prodPages = await build({ sourcemap: 'development' }, 'production');
    expect(prodPages.some((p) => p.permalink === '/assets/app.css.map')).toBe(false);
  });
});
