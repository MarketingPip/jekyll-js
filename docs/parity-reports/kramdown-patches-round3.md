# Proposed kramdown-js patches — just-the-docs 100% parity (2026-10-11)

All ground truth verified against real Rouge 4.7.0 and kramdown 2.5.1
(`~/workspace/local/ruby/`). TDD tests: `/tmp/kramdown-gaps.test.mjs`
(all 11 fail against current kramdown-js; run from `~/workspace/kramdown-js`
as `cp /tmp/kramdown-gaps.test.mjs ./ && node --test kramdown-gaps.test.mjs`).

---

## P1. Markdown lexer: blockquote → whole line `gt`
**File:** `kramdown-rouge.js`, `markdownStates()`, root rules
**Ground truth:** `rouge/lexers/markdown.rb:88`: `rule %r/^\s*>.*?$/, Generic::Traceback`
**Current:** `R(Y('^>[ \t]?', 'm'), 'p')` — emits `p` for `>` only, text plain.
**Patch:**
```js
// Rouge markdown.rb:88: ^\s*>.*?$ -> Generic::Traceback (class gt, whole line)
R(Y('^\\s*>.*$', 'm'), 'gt'),
```
(replaces the `R(Y('^>[ \t]?', 'm'), 'p')` line)

## P2. Markdown lexer: `_em_` → `ge`
**File:** `kramdown-rouge.js`, `markdownStates()`, root rules
**Ground truth:** `rouge/lexers/markdown.rb:115`: `rule %r/_#{edot}*?_/, Generic::Emph`
**Current:** `R(Y('\\*[^*\\n]+\\*'), 'ge')` with comment "but _..._ stays raw" (wrong).
**Patch:** add after the `*em*` rule:
```js
R(Y('_[^_\\n]+_'), 'ge'), // Rouge: _..._ -> Generic::Emph (like *...*)
```
(keep the `__strong__` rule before both; delete the "stays raw" comment)

## P3. Markdown lexer: list marker `^\s*` (newline inside `p` span)
**File:** `kramdown-rouge.js`, `markdownStates()`, root rules
**Ground truth:** `rouge/lexers/markdown.rb:83-86`:
`rule %r/^\s*[*+-](?=\s)/, Punctuation` and `rule %r/^\s*\d+\./, Punctuation`
**Current:** `R(Y('^[ \t]*(?:[*+-]|\\d{1,9}[.)])(?=[ \t]|$)', 'm'), 'p')`
**Patch:** change `[ \t]*` to `\\s*`:
```js
R(Y('^\\s*(?:[*+-]|\\d{1,9}[.)])(?=[ \\t]|$)', 'm'), 'p'),
```
(`\s*` consumes preceding blank-line newlines into the `p` span, matching
`{: x }\n\n1. TOC` -> `{: x }\n<span class="p">\n1.</span> TOC`)

## P4. Markdown lexer: fence markers `p`, info string `nl`
**File:** `kramdown-rouge.js`, `markdownStates()`, fence rule
**Ground truth:** `rouge/lexers/markdown.rb:36-43`:
`token Punctuation, m[2]` (fence), `token Name::Label, m[3]` (info + `\n`)
**Current:** emits `sb` (fence) and `s` (info, no `\n`); content lexed as `sb`.
**Patch (classes only):**
```js
ctx.emit('p', m[1]);            // was 'sb'
if (m[2].trim()) ctx.emit('nl', m[2] + '\n');  // was 's', add trailing \n
```
**Follow-up (bigger):** real Rouge delegates fence content to the sublexer
(`Lexer.find_fancy(name, m[5])`); the port lexes it all as `sb`. The closing
fence is `token Punctuation, m[7]`. Full parity needs delegation.

## P5. Smart quotes: quote after whitespace → OPEN
**File:** `kramdown.js`, `kramdownSmartQuotes()`, core rule
**Ground truth:** `kramdown/parser/kramdown/smart_quotes.rb` SQ_RULES.
Mechanism: `scan_until(/[^\\]?["']/)` always consumes a preceding space, so a
quote with P=space is NEVER at the scan position; rules 1/2/8 (which anchor
`("|')` at the scan position) cannot fire. Rule 6 `/(\s)('|")(?=\w)/` needs a
word char after; otherwise rule 10 `/(.?")/m` fallback → OPEN.
Verified: `a ",b` -> `a “,b`; `a ", "` (before codespan) -> `a “, "`.
**Current:** port rule order tries `SQ_PUNCT_RE.test(N) -> close` before
considering P=space, giving `”` for `", "` + codespan.
**Patch:** replace the
`// SQ_RULES 5: whitespace + quote + word char -> opening`
branch:
```js
} else if (isSpace(P) && isWord(N)) {
  rep = open;
```
with:
```js
// SQ_RULES 6/10: quote after whitespace is never at the scan position
// (the space is consumed by scan_until), so (?=\w) is the only opener;
// otherwise the rule-10 fallback gives OPEN. Verified: `a ",b` -> `a “,b`.
} else if (isSpace(P)) {
  rep = open;
```
(subsumes the old rule 5; N=word/space/punct all -> open when P=space)

## P6. GFM task lists
**File:** `kramdown.js` (new)
**Ground truth:** Jekyll 4.3.4 `configuration.rb:72`: `"input" => "GFM"`;
`kramdown-parser-gfm` renders:
`<ul class="task-list"><li class="task-list-item"><input type="checkbox"
class="task-list-item-checkbox" disabled="disabled" />...`
(`checked="checked"` for `[x]`).
**Current:** `input: 'GFM'` is accepted but task-list syntax is ignored
(`- [ ] todo` -> `<li>[ ] todo</li>`).
**Patch:** implement GFM task-list items when `options.input === 'GFM'`
(or always — Jekyll always sets GFM). Sketch: in the list-item rule,
match `^\[([ xX])\] ` at item start, emit the checkbox input.

## P7. `{::options}` block extension
**File:** `kramdown.js` (block parser)
**Ground truth:** kramdown `{::options key="val" /}` sets parse options,
emits no output, and does NOT disturb following blocks.
**Current:** the line is rendered as a literal paragraph
(`<p>{::options toc_levels="2..4" /}</p>`), and worse, it breaks the
following link reference definition (`[CHANGELOG]: /CHANGELOG/` not recognized).
**Patch:** recognize `{::options ... /}` as a block extension: consume it,
apply `toc_levels` (at minimum), emit nothing, and ensure the following
reference definition is still parsed.

## P8. TOC inside `<details markdown="block">`
**File:** `kramdown.js` (HTML block + TOC)
**Ground truth:** kramdown parses markdown inside HTML blocks with
`markdown="block"`, and `{:toc}` generates `<ul id="markdown-toc">` in place.
**Current:** the `- TOC\n{:toc}` list inside `<details>` is dropped entirely.
**Patch:** ensure markdown content inside `markdown="block"` HTML elements is
parsed (including `{:toc}` lists). Note: jekyll-js's markdown-kramdown adapter
already has a `{:toc}` pre-pass for top-level lists; the gap is specifically
TOC inside HTML blocks.

## P9. Block IAL duplicated after `<figure>` HTML block
**File:** `kramdown.js`, `blockIAL` core rule
**Repro:** `/tmp/fig.txt` + `\n\n## H\n{: .a }\n\nP\n{: .b .c }\n`
**Current:** `<p class="b c b c">P</p>` (IAL applied twice).
**Expected:** `<p class="b c">P</p>`.
**Notes:** trigger requires the specific multi-line `<figure>` (highlighted
code with `<span>`s); simple `<div>`/`<figure>` blocks do not trigger.
Likely the blockIAL rule mis-attributes the IAL when a preceding HTML block
confuses the token stream.

## P10. Python lexer (Rouge)
**File:** `kramdown-rouge.js` (new `tokenizePython` + wiring in `rougeHighlightInner`)
**Ground truth:** `rouge/lexers/python.rb`; `def` -> `k`, func name -> `nf`, etc.
**Current:** no python lexer; ` ```python ` fences render as plaintext.
**Patch:** port the Python lexer (keywords, builtins, strings, numbers,
comments, decorators, etc.) following the existing `tokenizeRuby` pattern.
