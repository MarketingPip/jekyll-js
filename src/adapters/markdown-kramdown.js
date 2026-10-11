/**
 * kramdown-js adapter for jekyll-js.
 *
 * Wraps the kramdown-js implementation (172/177 oracle parity)
 * as a MarkdownRenderer plugin.
 *
 * Note: This adapter imports from the kramdown-js repo.
 * For production use, install kramdown-js as a dependency.
 */

import { kramdown } from '../../../kramdown-js/kramdown.js';

// Nesting depth (open block-level tags) in html at position pos.
function htmlTagDepth(html, pos) {
  const voidElements = new Set(['area', 'base', 'br', 'col', 'embed', 'hr',
    'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
  const stack = [];
  const tagRe = /<\/?([A-Za-z][\w-]*)\b[^>]*>/g;
  let m;
  while ((m = tagRe.exec(html)) !== null && m.index < pos) {
    const tag = m[1].toLowerCase();
    if (m[0][1] === '/') {
      const idx = stack.lastIndexOf(tag);
      if (idx !== -1) stack.length = idx;
    } else if (!/\/>$/.test(m[0]) && !voidElements.has(tag)) {
      stack.push(tag);
    }
  }
  return stack.length;
}

// --- GFM task lists ----------------------------------------------------------
// Ruby kramdown (input: GFM) renders `- [x]`/`- [ ]` as task-list HTML.
// kramdown-js leaves them as literal text. Convert in the adapter.
function fixTaskLists(html) {
  // Process innermost <ul> first (loop until stable) to handle nesting.
  let out = html;
  let changed = true;
  while (changed) {
    changed = false;
    out = out.replace(/<ul>((?:(?!<\/?ul>)[\s\S])*)<\/ul>/g, (ul, inner) => {
      if (!/<li>\[[ xX]\]/.test(inner)) return ul;
      changed = true;
      const newInner = inner
        .replace(/<li>\[x\] ?/gi, '<li class="task-list-item"><input type="checkbox" class="task-list-item-checkbox" disabled="disabled" checked="checked" />')
        .replace(/<li>\[ \] ?/g, '<li class="task-list-item"><input type="checkbox" class="task-list-item-checkbox" disabled="disabled" />');
      return '<ul class="task-list">' + newInner + '</ul>';
    });
  }
  return out;
}

// --- HTML block verbatim -----------------------------------------------------
// Ruby kramdown passes block-level HTML through VERBATIM (entities like
// &mdash; are preserved). kramdown-js escapes every `&` to `&amp;` inside
// block HTML. Restore the verbatim src blocks in the adapter.
const BLOCK_TAGS = 'address|article|aside|blockquote|div|dl|fieldset|figcaption|figure|footer|form|h[1-6]|header|main|nav|ol|p|section|table|ul|pre|hr';
function fixBlockHtmlEntities(html, src) {
  const re = new RegExp(`^[ \\t]*<(${BLOCK_TAGS})([\\s>])[\\s\\S]*?<\\/\\1>[ \\t]*$`, 'gm');
  let m;
  let out = html;
  while ((m = re.exec(src)) !== null) {
    const block = m[0];
    // Skip if kramdown-js didn't just escape & (e.g. it restructured).
    const escaped = block.replace(/&/g, '&amp;');
    if (out.includes(escaped)) {
      out = out.split(escaped).join(block);
    }
  }
  return out;
}

// --- HTML comment blank lines ------------------------------------------------
// Ruby kramdown emits :blank elements for blank lines around HTML comment
// blocks (<!--more--> etc.); kramdown-js drops them:
//   "a\n\n<!--c-->\n\nb\n" -> ruby "<p>a</p>\n\n<!--c-->\n\n<p>b</p>\n"
//                            kramdown-js "<p>a</p>\n<!--c-->\n<p>b</p>\n"
// Restore the blank lines in the adapter by aligning src comments with html.
function fixCommentBlanks(html, src) {
  const commentRe = /<!--[\s\S]*?-->/g;
  let m;
  const comments = [];
  while ((m = commentRe.exec(src)) !== null) {
    const before = src.slice(0, m.index);
    const after = src.slice(m.index + m[0].length);
    comments.push({
      text: m[0],
      blankBefore: /(?:^|\n)[ \t]*\n[ \t]*$/.test(before),
      blankAfter: /^[ \t]*\n[ \t]*\n/.test(after),
    });
  }
  if (comments.length === 0) return html;
  let out = html;
  let searchFrom = 0;
  for (const c of comments) {
    const idx = out.indexOf(c.text, searchFrom);
    if (idx === -1) continue;
    let end = idx + c.text.length;
    if (c.blankBefore) {
      const beforeHtml = out.slice(0, idx);
      if (beforeHtml !== '' && !/^\s*$/.test(beforeHtml) && /\n$/.test(beforeHtml) && !/\n\n$/.test(beforeHtml)) {
        out = beforeHtml + '\n' + out.slice(idx);
        end += 1;
      }
    }
    if (c.blankAfter) {
      const afterHtml = out.slice(end);
      if (afterHtml !== '' && !/^\s*$/.test(afterHtml) && /^\n/.test(afterHtml) && !/^\n\n/.test(afterHtml)) {
        out = out.slice(0, end) + '\n' + afterHtml;
        end += 1;
      }
    }
    searchFrom = end;
  }
  return out;
}

// --- {:toc} support ---------------------------------------------------------
// Ruby kramdown replaces a ul/ol block carrying a {:toc} block IAL with an
// auto-generated table of contents (converter/html.rb: convert_ul checks
// el.options[:ial][:refs] for 'toc'; generate_toc_tree builds the nested
// list; only the FIRST {:toc} in a document takes effect). kramdown-js drops
// the block, so emulate it here: swap the list+IAL source span for a
// placeholder div, render, then splice in a byte-faithful TOC built from
// the rendered headers (ids come from kramdown-js's own output, so TOC
// links always match the document's header ids by construction).
const TOC_PLACEHOLDER = '<div data-jj-toc="0">JJTOC</div>';
const TOC_IAL_RE = /^[ \t]*\{:[ \t]*toc\b([^\}\n]*)\}[ \t]*$/m;
const TOC_PLACEHOLDER_RE = /^[ \t]*<div data-jj-toc="0">JJTOC<\/div>[ \t]*$/m;

// Parse the inside of a {:...} IAL: .class, #id, key="val".
function parseTocIal(inner) {
  const attrs = {};
  const classes = [];
  const tokRe = /([.#])([\w-]+)|([\w-]+)\s*=\s*("[^"]*"|'[^']*'|[^\s'"]+)/g;
  let m;
  while ((m = tokRe.exec(inner)) !== null) {
    if (m[1] === '.') classes.push(m[2]);
    else if (m[1] === '#') attrs.id = m[2];
    else {
      let v = m[4];
      if (v.length >= 2 && ((v[0] === '"' && v[v.length - 1] === '"') || (v[0] === "'" && v[v.length - 1] === "'"))) {
        v = v.slice(1, -1);
      }
      attrs[m[3]] = v;
    }
  }
  if (classes.length > 0) attrs.class = classes.join(' ');
  return attrs;
}

// If src contains a {:toc} block IAL attached to a ul/ol list block, return
// { src, listType, ialAttrs } with the list+IAL span replaced by a
// placeholder; otherwise null.
function prepareToc(src) {
  const m = TOC_IAL_RE.exec(src);
  if (!m) return null;
  const lines = src.slice(0, m.index).split('\n');
  let end = lines.length - 1;
  if (lines[end] === '') end--;
  // The {:toc} IAL attaches to the block directly above it; that block must
  // be a ul/ol list (ruby only generates a TOC for convert_ul/convert_ol).
  // Walk back over list-item and indented-continuation lines only.
  const LIST_ITEM_RE = /^[ \t]{0,3}(?:[*+-]|\d{1,9}[.)])\s/;
  if (!LIST_ITEM_RE.test(lines[end] || '')) return null;
  let start = end;
  while (start > 0 && (LIST_ITEM_RE.test(lines[start - 1]) || /^[ \t]+\S/.test(lines[start - 1]))) start--;
  const firstItem = lines[start].match(/^[ \t]{0,3}([*+-]|\d{1,9}[.)])\s/);
  if (!firstItem) return null;
  const listType = /[*+-]/.test(firstItem[1]) ? 'ul' : 'ol';
  const spanStart = lines.slice(0, start).join('\n').length + (start > 0 ? 1 : 0);
  const spanEnd = m.index + m[0].length;
  const newSrc = src.slice(0, spanStart) + TOC_PLACEHOLDER + src.slice(spanEnd);
  return { src: newSrc, listType, ialAttrs: parseTocIal(m[1]) };
}

// Build the TOC html byte-faithful to kramdown 2.5.1's generate_toc_tree +
// HTML conversion (indent=2): <ul class id>\n, "  <li><a href..>..</a>    <ul>\n"
// nesting, leaf "  <li><a..>..</a></li>\n".
function buildTocHtml(headers, listType, ialAttrs) {
  const tocId = ialAttrs.id || 'markdown-toc';
  const openAttrs = `${ialAttrs.class ? ` class="${ialAttrs.class}"` : ''} id="${tocId}"`;
  const root = [];
  const stack = [];
  for (const h of headers) {
    const li = { ...h, children: [] };
    for (;;) {
      if (stack.length === 0) { root.push(li); stack.push(li); break; }
      if (stack[stack.length - 1].level < li.level) {
        stack[stack.length - 1].children.push(li); stack.push(li); break;
      }
      stack.pop();
    }
  }
  const renderItems = (items, indent) => {
    let out = '';
    for (const it of items) {
      const sp = ' '.repeat(indent);
      const a = `<a href="#${it.id}" id="${tocId}-${it.id}">${it.inner}</a>`;
      if (it.children.length === 0) {
        out += `${sp}<li>${a}</li>\n`;
      } else {
        const sub = ' '.repeat(indent + 2);
        out += `${sp}<li>${a}${sub}<${listType}>\n`;
        out += renderItems(it.children, indent + 4);
        out += `${sub}</${listType}>\n${sp}</li>\n`;
      }
    }
    return out;
  };
  return `<${listType}${openAttrs}>\n${renderItems(root, 2)}</${listType}>\n`;
}

// Extract headers from rendered html: [{ level, id, inner }] with TOC
// filtering (toc_levels option, no_toc class) and TOC entry cleanup
// (footnotes removed, links unwrapped) per converter/html.rb.
// Normalize the toc_levels option: kramdown accepts an array of integers
// or a "1..6" range string (which is what `toc_levels: 1..6` in _config.yml
// parses to). A raw string would false-positive on substring matches
// ("1..6".includes(1) is true, .includes(2) is false).
function normalizeTocLevels(tocLevels) {
  if (Array.isArray(tocLevels)) return tocLevels.map(Number);
  if (typeof tocLevels === 'string') {
    const m = tocLevels.match(/(\d+)\s*\.\.\s*(\d+)/);
    if (m) {
      const out = [];
      const lo = Math.min(Number(m[1]), Number(m[2]));
      const hi = Math.max(Number(m[1]), Number(m[2]));
      for (let i = lo; i <= hi; i++) out.push(i);
      return out;
    }
  }
  return [1, 2, 3, 4, 5, 6];
}

function extractTocHeaders(html, options) {
  const tocLevels = normalizeTocLevels(options.toc_levels);
  const headers = [];
  const re = /<h([1-6])\b([^>]*)>([\s\S]*?)<\/h\1>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const level = Number(m[1]);
    if (!tocLevels.includes(level)) continue;
    const idMatch = m[2].match(/\bid="([^"]*)"/);
    const classMatch = m[2].match(/\bclass="([^"]*)"/);
    if (!idMatch || !idMatch[1]) continue; // ruby: header without id is skipped
    if (classMatch && /\bno_toc\b/.test(classMatch[1])) continue;
    let inner = m[3];
    inner = inner.replace(/<sup\b[^>]*\bid="fnref[^"]*"[^>]*>[\s\S]*?<\/sup>/g, '');
    inner = inner.replace(/<a\b[^>]*>([\s\S]*?)<\/a>/g, '$1');
    headers.push({ level, id: idMatch[1], inner });
  }
  return headers;
}

/**
 * @type {Object} MarkdownRenderer adapter
 */
const kramdownAdapter = {
  name: 'kramdown',
  supportedOptions: [
    'auto_ids',
    'auto_id_prefix',
    'header_offset',
    'parse_block_html',
    'parse_span_html',
    'smart_quotes',
    'typographic_symbols',
    'hard_wrap',
    'math_engine',
    'math_engine_opts',
    'toc_levels',
    'transliterated_header_ids',
    'entity_output',
    'line_width',
    'syntax_highlighter',
    'syntax_highlighter_opts',
    'link_defs',
    'html_to_native',
    'footnote_nr',
    'footnote_backlink',
    'footnote_backlink_inline',
    'footnote_prefix',
  ],

  render(src, options = {}) {
    // {:toc} pre-pass (kramdown-js has no TOC generation).
    const toc = prepareToc(src);
    let html = kramdown(toc ? toc.src : src, options);
    // GFM task lists (kramdown-js leaves [x]/[ ] as text).
    html = fixTaskLists(html);
    // HTML block verbatim (kramdown-js escapes & in block HTML; Ruby doesn't).
    html = fixBlockHtmlEntities(html, src);
    // HTML comment blank lines (kramdown-js drops :blank around <!-- -->).
    html = fixCommentBlanks(html, src);
    if (toc) {
      const headers = extractTocHeaders(html, options);

      const tocHtml = buildTocHtml(headers, toc.listType, toc.ialAttrs).trimEnd();
      const pm = TOC_PLACEHOLDER_RE.exec(html);
      if (pm) {
        const after = html.slice(pm.index + pm[0].length);
        const closeMatch = after.match(/^\n(<\/[A-Za-z][^>]*>)/);
        if (closeMatch) {
          // Ruby's CODE-substitution (converter/html.rb:228, 391-394): the
          // parent HTML element emits ">\n" + CODE.chomp + "\n" + indent +
          // "</tag>", then CODE is replaced by the TOC html (which ends with
          // "\n"). Net: TOC + "\n" + indent + "</tag>". kramdown-js puts the
          // closing tag at col 0 with no blank line; restore Ruby's bytes.
          // indent = 2 * (parent element's nesting depth), from the tag
          // stack at the placeholder.
          const depth = htmlTagDepth(html, pm.index);
          const indent = '  '.repeat(Math.max(0, depth - 1));
          html = html.slice(0, pm.index) + tocHtml + '\n\n' + indent +
                 closeMatch[1] + after.slice(closeMatch[0].length);
        } else {
          html = html.slice(0, pm.index) + tocHtml + after;
        }
      }
    }
    // PARITY (ruby kramdown 2.5.1, Jekyll 4.3.4's parser): trailing blank
    // lines. Ruby's parser emits a :blank element for trailing blank lines
    // (BLANK_LINE = /(?>^\s*\n)+/, consecutive blanks merged to ONE) and for
    // empty/whitespace-only input; the HTML converter renders :blank as "\n".
    // Net rule, verified against kramdown 2.5.1:
    //   "" | "\n" | "  \n " -> "\n"        (kramdown-js: "")
    //   "a\n\n"            -> "<p>a</p>\n\n" (kramdown-js: "<p>a</p>\n")
    // kramdown-js drops the :blank element, so restore it here. This is the
    // adapter layer (jekyll-js code), not the kramdown-js parser itself.
    if (html === '') {
      return /\S/.test(src) ? html : '\n';
    }
    // Leading blank lines: Ruby emits one leading :blank element -> "\n".
    if (/^[ \t]*\r?\n/.test(src) && !html.startsWith('\n')) {
      html = '\n' + html;
    }
    if (/\n\s*\n\s*$/.test(src) && html.endsWith('\n') && !html.endsWith('\n\n')) {
      html = html + '\n';
    }
    return html;
  }
};

export default kramdownAdapter;
