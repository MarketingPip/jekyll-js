/**
 * TDD tests for kramdown-js gaps (DO NOT FIX in kramdown-js; these document
 * the gaps for the coordinator). Each test verifies the CURRENT (buggy)
 * behavior vs Ruby 2.5.1 expected output.
 *
 * Gaps:
 * 1. Source-entity passthrough: Ruby preserves &name;/&#123;/&#x..; verbatim;
 *    kramdown-js decodes to chars (text) or escapes & to &amp; (block HTML).
 * 2. Block separation: Ruby emits \n\n only when src has blank line;
 *    kramdown-js always emits \n\n between blocks.
 * 3. Nested HTML indent: Ruby indents inner markdown="1" content by parent+2;
 *    kramdown-js uses flat indent.
 * 4. GFM task lists: Ruby renders - [x]/- [ ] as checkbox HTML;
 *    kramdown-js leaves as literal text. (SHIMMED in adapter)
 * 5. Fenced code inner newlines: Ruby keeps \n...\n; kramdown-js strips.
 * 6. Footnote/table HTML indent: Ruby indents nested elements;
 *    kramdown-js uses flat indent.
 */

import { kramdown } from '../../../kramdown-js/kramdown.js';
import { tokenizeMarkdown, formatRougeSpans, rougeHighlightInner } from '../../../kramdown-js/kramdown-rouge.js';
import fs from 'node:fs';

describe('kramdown-js gaps (for coordinator)', () => {
  test.failing('gap 1: source entities preserved verbatim (Ruby) vs decoded (kramdown-js)', () => {
    // Ruby: Kramdown::Document.new("a &mdash; b\n").to_html
    //   => "<p>a &mdash; b</p>\n"
    const rubyExpected = '<p>a &mdash; b</p>\n';
    const actual = kramdown('a &mdash; b\n');
    // Currently FAILS (kramdown-js outputs <p>a — b</p>\n)
    expect(actual).toBe(rubyExpected);
  });

  test.failing('gap 1b: block HTML entities verbatim (Ruby) vs escaped (kramdown-js)', () => {
    // Ruby: "<blockquote><p>x</p>&mdash;</blockquote>\n"
    const rubyExpected = '<blockquote><p>x</p>&mdash;</blockquote>\n';
    const actual = kramdown('<blockquote><p>x</p>&mdash;</blockquote>\n');
    // Currently FAILS (kramdown-js outputs &amp;mdash;)
    expect(actual).toBe(rubyExpected);
  });

  test.failing('gap 2: no blank line in src => no \\n\\n in output', () => {
    // Ruby: "a\n# h\n" (no blank) => "<p>a</p>\n<h1 id=\"h\">h</h1>\n"
    const rubyExpected = '<p>a</p>\n<h1 id="h">h</h1>\n';
    const actual = kramdown('a\n# h\n');
    // Currently FAILS (kramdown-js outputs <p>a</p>\n\n<h1...>...)
    expect(actual).toBe(rubyExpected);
  });

  test('gap 4: GFM task lists [CLOSED 2026-10-11] (SHIMMED in adapter, native support needed)', () => {
    // Ruby with input: GFM renders checkboxes
    const rubyExpected =
      '<ul class="task-list">\n' +
      '  <li class="task-list-item"><input type="checkbox" class="task-list-item-checkbox" disabled="disabled" checked="checked" />done</li>\n' +
      '</ul>\n';
    const actual = kramdown('- [x] done\n', { input: 'GFM' });
    // Currently FAILS (kramdown-js outputs <ul>\n  <li>[x] done</li>...)
    // The jekyll-js adapter shims this via fixTaskLists().
    expect(actual).toBe(rubyExpected);
  });

  test('gap 5: fenced code keeps inner newlines', () => {
    // Ruby: "```\nc\n```\n" => "<p><code>\nc\n</code></p>\n\n"
    // (kramdown without GFM treats fence as paragraph with code span)
    const actual = kramdown('```\nc\n```\n');
    // Documents current behavior; Ruby 2.5.1 keeps the newlines.
    expect(actual).toContain('<code>');
  });

  test('gap 6: footnote <li> content indented (Ruby) vs flat (kramdown-js)', () => {
    // Ruby indents <p> inside <li> by 6 spaces; kramdown-js uses 0.
    const actual = kramdown('a[^1]\n\n[^1]: b\n');
    // Documents the indent gap (adapter does not shim this).
    expect(actual).toContain('<div class="footnotes"');
  });
});

describe('kramdown-js gaps round 3 (just-the-docs 100% parity, 2026-10-11)', () => {
  // All verified against real Rouge 4.7.0 (rougify) and kramdown 2.5.1.
  // Proposed patches in /tmp/kramdown-patches.md (delivered to coordinator).

  test('gap 7: markdown lexer blockquote is whole-line gt [CLOSED 2026-10-11]', () => {
    // rouge/lexers/markdown.rb:88: rule %r/^\s*>.*?$/, Generic::Traceback
    // rougify: "> My note title" -> <span class="gt">&gt; My note title</span>
        const actual = formatRougeSpans(tokenizeMarkdown('> My note title\n'));
    expect(actual).toBe('<span class="gt">&gt; My note title</span>\n');
  });

  test.failing('gap 8: markdown lexer _em_ is ge', () => {
    // rouge/lexers/markdown.rb:115: rule %r/_#{edot}*?_/, Generic::Emph
        const actual = formatRougeSpans(tokenizeMarkdown('_or_'));
    expect(actual).toBe('<span class="ge">_or_</span>');
  });

  test('gap 9: markdown lexer list marker includes preceding newline [CLOSED 2026-10-11]', () => {
    // rouge: ^\s*[*+-] / ^\s*\d+\. — \s* consumes blank-line newlines
        const actual = formatRougeSpans(tokenizeMarkdown('{: .no_toc }\n\n1. TOC\n'));
    expect(actual).toBe('{: .no_toc }\n<span class="p">\n1.</span> TOC\n');
  });

  test('gap 10: markdown lexer fence is p, info string is nl [CLOSED 2026-10-11]', () => {
    // rouge/lexers/markdown.rb: token Punctuation (fence), Name::Label (info+\n)
        const actual = formatRougeSpans(tokenizeMarkdown('```js\n'));
    expect(actual).toContain('<span class="p">```</span>');
    expect(actual).toContain('<span class="nl">js\n</span>');
  });

  test.failing('gap 11: smart quote after space before punct is OPEN', () => {
    // kramdown smart_quotes.rb: scan_until consumes the space, so the quote
    // is never at the scan position; rule 10 fallback -> ldquo.
    // Ruby: `a ",b` -> `<p>a &#8220;,b</p>`
    const actual = kramdown('a ",b');
    expect(actual).toContain('&#8220;,b');
  });

  test.failing('gap 12: smart quote after space before codespan is OPEN', () => {
    // just-the-docs order.md: `"`, "`]`", "`{`" — the " before `{` is ldquo.
    // Ruby: `x "`:`" y` -> `x &#8220;<code>:</code>&#8221; y`
    const actual = kramdown('x "`:`" y');
    expect(actual).toContain('&#8220;<code>:</code>');
  });

  test.failing('gap 13: {::options} does not break following reference definitions', () => {
    // Ruby: {::options} emits nothing and the [CHANGELOG] ref still resolves.
    const actual = kramdown(
      'see the [CHANGELOG].\n\n{::options toc_levels="2..4" /}\n\n[CHANGELOG]: /CHANGELOG/\n'
    );
    expect(actual).toContain('<a href="/CHANGELOG/">CHANGELOG</a>');
  });

  test.failing('gap 14: TOC generates inside <details markdown="block">', () => {
    // Ruby: <ul id="markdown-toc"> is emitted INSIDE the <details> element.
    const actual = kramdown(
      '<details open markdown="block">\n  <summary>Hi</summary>\n- TOC\n{:toc}\n</details>\n\n## Hello\n'
    );
    expect(actual).toContain('<ul id="markdown-toc">');
    const d = actual.indexOf('<details'), t = actual.indexOf('<ul id="markdown-toc">'), c = actual.indexOf('</details>');
    expect(d).toBeLessThan(t);
    expect(t).toBeLessThan(c);
  });

  test.failing('gap 15: block IAL applied once after figure HTML block', () => {
    // Ruby: <p class="b c">P</p>. kramdown-js: <p class="b c b c">P</p>.
    // Trigger: multi-line <figure> (highlighted code) + heading IAL + para IAL.
        const fig = fs.readFileSync('/tmp/fig.txt', 'utf8');
    const actual = kramdown(fig + '\n\n## H\n{: .a }\n\nP\n{: .b .c }\n');
    expect(actual).toContain('<p class="b c">P</p>');
  });

  test('gap 16: python lexer highlights code [CLOSED 2026-10-11]', () => {
    // just-the-docs index-test.md ```python fence; rougify highlights `def` as k.
        const actual = rougeHighlightInner('def dump_args(func):\n', 'python');
    expect(actual).toContain('<span class="k">def</span>');
  });
});
