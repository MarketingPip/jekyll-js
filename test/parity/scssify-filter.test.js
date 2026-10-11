/**
 * `scssify` Liquid filter — Jekyll::Filters#scssify (jekyll 4.3.4,
 * lib/jekyll/filters.rb:49-53) → Jekyll::Converters::Scss#convert
 * (jekyll-sass-converter 3.1.0, lib/jekyll/converters/scss.rb:162-176).
 *
 * Real Jekyll: `{{ scss_source | scssify }}` compiles the string with the
 * site's shared Scss converter. Because the :pages pre_render/post_render
 * hooks only associate that converter with .scss/.sass pages, a scssify
 * call from inside a filter sees `associate_page_failed? == true` and
 * compiles with `source_map: false` (NO sourceMappingURL comment),
 * `charset: false`, expanded style, and no entry URL.
 */
import { JekyllEngine } from '../../src/engine.js';
import * as sass from 'sass';

function buildEngine(vfs) {
  return new JekyllEngine({
    vfs: {
      '_config.yml': 'title: T\n',
      'index.md': '---\ntitle: H\n---\nH',
      ...vfs,
    },
    sass,
    logger: () => {},
  });
}

describe('scssify filter', () => {
  test('compiles an SCSS string to expanded CSS', async () => {
    const engine = buildEngine({
      'page.html':
        '---\n---\n{% capture s %}.a { color: red; }{% endcapture %}{{ s | scssify }}',
    });
    const pages = await engine.build();
    const page = pages.find((p) => p.permalink === '/page.html');
    expect(page).toBeDefined();
    expect(page.content).toContain('.a {');
    expect(page.content).toContain('color: red;');
  });

  test('emits no sourceMappingURL comment (associate_page_failed? parity)', async () => {
    const engine = buildEngine({
      'page.html':
        '---\n---\n{% capture s %}.a { color: red; }{% endcapture %}{{ s | scssify }}',
    });
    const pages = await engine.build();
    const page = pages.find((p) => p.permalink === '/page.html');
    expect(page.content).not.toContain('sourceMappingURL');
  });

  test('resolves @import from the VFS _sass/ directory', async () => {
    const engine = buildEngine({
      '_sass/_vars.scss': '$c: blue;',
      'page.html':
        '---\n---\n{% capture s %}@import "vars"; .a { color: $c; }{% endcapture %}{{ s | scssify }}',
    });
    const pages = await engine.build();
    const page = pages.find((p) => p.permalink === '/page.html');
    expect(page.content).toContain('color: blue;');
  });

  test('a Sass syntax error fails the build (Jekyll SyntaxError parity)', async () => {
    const engine = buildEngine({
      'page.html':
        '---\n---\n{% capture s %}.a { color: ; }{% endcapture %}{{ s | scssify }}',
    });
    await expect(engine.build()).rejects.toThrow(/scssify/i);
  });
});
