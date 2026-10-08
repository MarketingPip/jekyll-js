/**
 * Parenthesized {% if %} / {% elsif %} / {% unless %} conditions.
 *
 * Real-world themes (e.g. beautiful-jekyll's _includes/head.html:16) write
 *   {%- if site.title and site.title-on-all-pages and (site.title != pagetitle) -%}
 * Ruby Liquid groups the parenthesized expression and renders both branches
 * correctly. LiquidJS 10.x throws `TokenizationError: invalid range syntax`
 * at parse time, which aborts the ENTIRE site build (0 files emitted).
 * The preprocessor in src/liquidPreprocess.js strips grouping parens from
 * conditional tags before LiquidJS ever sees them.
 */
import { JekyllEngine } from '../../src/engine.js';
import { preprocessConditionals } from '../../src/liquidPreprocess.js';

const quietEngine = (vfs) => new JekyllEngine({ vfs, logger: () => {} });

// Exact beautiful-jekyll condition from _includes/head.html:16
const BJK_COND = `{%- if site.title and site.title-on-all-pages and (site.title != pagetitle) -%}YES{%- else -%}NO{%- endif -%}`;
// beautiful-jekyll's _config.yml keys the condition depends on
const BJK_CONFIG = { '_config.yml': 'title: My Site\ntitle-on-all-pages: true\n' };

describe('parenthesized conditions (beautiful-jekyll head.html)', () => {
  test('true branch renders when site.title != pagetitle', async () => {
    const engine = quietEngine({
      ...BJK_CONFIG,
      'index.md': '---\n---\n{%- assign pagetitle = "Other" -%}' + BJK_COND,
    });
    const pages = await engine.build();
    expect(pages[0].content).toContain('YES');
  });

  test('false branch renders when site.title == pagetitle', async () => {
    const engine = quietEngine({
      ...BJK_CONFIG,
      'index.md': '---\n---\n{%- assign pagetitle = site.title -%}' + BJK_COND,
    });
    const pages = await engine.build();
    expect(pages[0].content).toContain('NO');
  });

  test('build with include containing parenthesized condition does not throw', async () => {
    const engine = quietEngine({
      ...BJK_CONFIG,
      '_includes/head.html': BJK_COND,
      'index.md': '---\n---\n{%- assign pagetitle = "Other" -%}{% include head.html %}',
    });
    const pages = await engine.build();
    expect(pages).toHaveLength(1);
    expect(pages[0].content).toContain('YES');
  });

  test('{% elsif (a) %} and {% unless (a and b) %}', async () => {
    const engine = quietEngine({
      'index.md':
        '---\n---\n{% assign x = 2 %}' +
        '{% if (x == 1) %}one{% elsif (x == 2) %}two{% else %}other{% endif %}|' +
        '{% unless (a and b) %}UNLESS{% else %}both{% endunless %}',
    });
    const pages = await engine.build();
    expect(pages[0].content).toContain('two|UNLESS');
  });

  test('multiple groups and nested parens in one condition', async () => {
    const engine = quietEngine({
      'index.md':
        '---\n---\n{% assign a = 1 %}{% assign b = 3 %}{% assign c = true %}' +
        '{% if (a == 1) and (b != 2) %}multi{% endif %}' +
        '{% if ((c)) %}nested{% endif %}',
    });
    const pages = await engine.build();
    expect(pages[0].content).toContain('multinested');
  });

  test('whitespace variants {%- -%} and plain {% %}', async () => {
    const engine = quietEngine({
      'index.md':
        '---\n---\n{% assign a = true %}{% assign b = true %}' +
        '{% if (a) %}A{% endif %}{%- if (b) -%}B{%- endif -%}',
    });
    const pages = await engine.build();
    expect(pages[0].content).toContain('AB');
  });

  test('parens inside quoted strings are left alone', async () => {
    const engine = quietEngine({
      'index.md':
        '---\n---\n{% assign s = "foo (bar) baz" %}{{ s }}|{% assign a = "(x)" %}{% if (a == "(x)") %}lit{% endif %}',
    });
    const pages = await engine.build();
    expect(pages[0].content).toContain('foo (bar) baz|lit');
  });

  test('layouts with parenthesized conditions render', async () => {
    const engine = quietEngine({
      ...BJK_CONFIG,
      '_layouts/default.html': `<title>${BJK_COND}</title>{{ content }}`,
      'index.html': '---\nlayout: default\n---\n{%- assign pagetitle = "Other" -%}body',
    });
    const pages = await engine.build();
    expect(pages[0].content).toContain('<title>YES</title>');
  });
});

describe('preprocessConditionals unit behavior', () => {
  test('strips grouping parens, preserves everything else', () => {
    expect(preprocessConditionals('{% if (a != b) %}x{% endif %}')).toBe(
      '{% if a != b %}x{% endif %}'
    );
  });

  test('leaves non-conditional tags untouched', () => {
    const src = '{{ (a) }}{% assign x = (1) %}';
    expect(preprocessConditionals(src)).toBe(src);
  });

  test('unbalanced parens are left alone (no crash)', () => {
    const src = '{% if (a %}x{% endif %}';
    expect(preprocessConditionals(src)).toBe(src);
  });
});
