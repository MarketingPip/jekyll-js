/**
 * TDD tests for kramdown-js gaps found during just-the-docs 100% parity push.
 * Ground truth: real Rouge 4.7.0 (rougify) and real kramdown 2.5.1.
 * Run: node --test /tmp/kramdown-gaps.test.mjs (from ~/workspace/kramdown-js)
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { kramdown } from './kramdown.js';
import { tokenizeMarkdown, formatRougeSpans, rougeHighlightInner } from './kramdown-rouge.js';

const mdHl = (src) => formatRougeSpans(tokenizeMarkdown(src));

describe('Rouge markdown lexer (real Rouge 4.7.0)', () => {
  it('blockquote: whole line is gt (Generic::Traceback)', () => {
    // rouge/lexers/markdown.rb:88: rule %r/^\s*>.*?$/, Generic::Traceback
    // rougify: "> My note title" -> <span class="gt">&gt; My note title</span>
    assert.strictEqual(
      mdHl('> My note title\n'),
      '<span class="gt">&gt; My note title</span>\n'
    );
  });

  it('underscore emphasis: _or_ is ge (Generic::Emph)', () => {
    // rouge/lexers/markdown.rb:115: rule %r/_#{edot}*?_/, Generic::Emph
    assert.strictEqual(mdHl('_or_'), '<span class="ge">_or_</span>');
  });

  it('list marker after blank line: newline inside p span', () => {
    // rouge: ^\s*[*+-] and ^\s*\d+\. — \s* consumes the preceding newline
    // rougify: "{: x }\n\n1. TOC" -> "{: x }\n<span class=\"p\">\n1.</span> TOC"
    assert.strictEqual(
      mdHl('{: .no_toc }\n\n1. TOC\n'),
      '{: .no_toc }\n<span class="p">\n1.</span> TOC\n'
    );
  });

  it('fence: backticks are p, info string is nl', () => {
    // rouge/lexers/markdown.rb: token Punctuation, m[2]; token Name::Label, m[3]
    // rougify: "```js\n" -> <span class="p">```</span><span class="nl">js\n</span>
    const out = mdHl('```js\n');
    assert.ok(out.includes('<span class="p">```</span>'), 'fence is p: ' + out);
    assert.ok(out.includes('<span class="nl">js\n</span>'), 'info is nl: ' + out);
  });
});

describe('kramdown smart quotes (real kramdown 2.5.1)', () => {
  it('quote after space before punctuation is OPEN (rule 10 fallback)', () => {
    // smart_quotes.rb: rule 6 /(\s)('|")(?=\w)/ fails on punct; rule 10 /(?:")/
    // gives ldquo. Verified: `a ",b` -> `a “,b`
    assert.ok(kramdown('a ",b').includes('&#8220;,b'));
  });

  it('quote after space before codespan is OPEN', () => {
    // just-the-docs order.md: `"`, "`]`", "`{`" — the " before `{` is ldquo
    const html = kramdown('x "`:`" y');
    assert.ok(html.includes('&#8220;<code>:</code>'), 'got: ' + html);
  });
});

describe('kramdown GFM task lists', () => {
  it('renders checkboxes with input: GFM (Jekyll default)', () => {
    // jekyll configuration.rb:72: "input" => "GFM"
    // kramdown-parser-gfm: <ul class="task-list"><li class="task-list-item">
    //   <input type="checkbox" class="task-list-item-checkbox" disabled="disabled" />
    const html = kramdown('- [ ] todo\n- [x] done\n', { input: 'GFM' });
    assert.ok(html.includes('class="task-list"'), 'got: ' + html);
    assert.ok(html.includes('type="checkbox"'), 'got: ' + html);
  });
});

describe('kramdown block extensions', () => {
  it('{::options} does not break following reference definitions', () => {
    const html = kramdown(
      'see the [CHANGELOG].\n\n{::options toc_levels="2..4" /}\n\n[CHANGELOG]: /CHANGELOG/\n'
    );
    assert.ok(html.includes('<a href="/CHANGELOG/">CHANGELOG</a>'), 'got: ' + html);
  });

  it('TOC generates inside <details markdown="block">', () => {
    const html = kramdown(
      '<details open markdown="block">\n  <summary>Hi</summary>\n- TOC\n{:toc}\n</details>\n\n## Hello\n'
    );
    assert.ok(html.includes('<ul id="markdown-toc">'), 'got: ' + html);
    // TOC must be INSIDE details, not dropped
    const detailsIdx = html.indexOf('<details');
    const tocIdx = html.indexOf('<ul id="markdown-toc">');
    const closeIdx = html.indexOf('</details>');
    assert.ok(detailsIdx < tocIdx && tocIdx < closeIdx, 'got: ' + html);
  });

  it('block IAL applied once after figure HTML block', async () => {
    // Minimal trigger: multi-line <figure> (highlighted code) + heading IAL + para IAL.
    // Full trigger bytes in /tmp/fig.txt. Expected <p class="b c">, got <p class="b c b c">.
    const fs = await import('node:fs');
    const fig = fs.readFileSync('/tmp/fig.txt', 'utf8');
    const html = kramdown(fig + '\n\n## H\n{: .a }\n\nP\n{: .b .c }\n');
    assert.ok(html.includes('<p class="b c">P</p>'), 'got: ' + html);
    assert.ok(!html.includes('b c b c'), 'got: ' + html);
  });
});

describe('Rouge python lexer', () => {
  it('python code is highlighted (not plaintext)', () => {
    // just-the-docs index-test.md has a ```python fence; real Rouge highlights it
    // rougify: "def f():" -> <span class="k">def</span> <span class="nf">f</span>...
    const out = rougeHighlightInner('def dump_args(func):\n', 'python');
    assert.ok(out.includes('<span class="k">def</span>'), 'got: ' + out);
  });
});
