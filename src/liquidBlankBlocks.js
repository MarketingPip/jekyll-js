/**
 * Ruby Liquid 4.0.4 parity: blank-block output skipping.
 *
 * In real Liquid (lib/liquid/block_body.rb), BlockBody#render SKIPS the
 * rendered output of any child node that is a Block whose static body is
 * "blank":
 *
 *     when Block
 *       render_node_to_output(node, output, context, node.blank?)
 *
 * "Blank" (Block#blank? / BlockBody#blank?) means: every text token is
 * whitespace-only, every `{{ }}` variable forces non-blank, and every tag
 * must itself be blank? — which is true only for `{% assign %}`,
 * `{% capture %}`, `{% comment %}` (Tag#blank? overrides),
 * `{% raw %}` with an empty body, or a nested block that is itself blank.
 * Crucially the block's render still RUNS (so `{% assign %}` side effects
 * inside a blank block happen — verified: `{% for i in (1..2) %}{% assign x
 * = i %}{% endfor %}` leaves x=2 in Ruby); only its emitted text is
 * discarded.
 *
 * LiquidJS renders the interior whitespace of such blocks, producing stray
 * blank lines / indented empty lines vs real Jekyll (e.g. minimal-mistakes'
 * footer.html `{% unless %}\n  {% assign show_atom = true %}\n{% endunless %}`
 * emits "\n  \n" in LiquidJS but "" in Ruby — the source of dozens of
 * byte-diffs in theme parity builds).
 *
 * This module patches a Liquid instance's renderer — the exact analog of
 * Ruby's BlockBody#render — to reproduce the skip. It is applied from
 * registerJekyllExtensions, so every JekyllEngine and liquid-only render
 * gets it.
 */

import { TokenKind } from 'liquidjs';

const patchedSym = Symbol('jekyllJsBlankBlockPatched');
const blankSym = Symbol('jekyllJsBlankBlock');
const wrappedSym = Symbol('jekyllJsBlankWrapped');

// Ruby Tag#blank? overrides (lib/liquid/tags/{assign,capture,comment}.rb).
// Note: Capture#blank? is unconditionally true, even with a non-blank body.
const ALWAYS_BLANK_TAG_NAMES = new Set(['assign', 'capture', 'comment']);

// Ruby Block subclasses in liquid 4.0.4 that parse a body, plus Jekyll's
// highlight (Jekyll::Tags::HighlightBlock < Liquid::Block, no blank?
// override, so a whitespace-only highlight body is skipped in real Jekyll).
const BLOCK_TAG_NAMES = new Set([
  'if',
  'unless',
  'case',
  'for',
  'tablerow',
  'capture',
  'comment',
  'raw',
  'highlight',
]);

// Black-hole emitter: tags that write directly to the emitter instead of
// returning html get their output discarded, while side effects still run.
const NULL_EMITTER = { write() {} };
const WS_ONLY = /^\s*$/;

function tagName(tpl) {
  return tpl && tpl.token ? tpl.token.name : undefined;
}

function isBlockTag(tpl) {
  if (!tpl || typeof tpl !== 'object') return false;
  if (BLOCK_TAG_NAMES.has(tagName(tpl))) return true;
  // Any other tag that parsed a body (mirrors Ruby's `when Block`).
  return Array.isArray(tpl.templates) || Array.isArray(tpl.branches);
}

// Raw (unparsed) body text for raw-style tags (raw, highlight).
function rawBodyText(tpl) {
  const toks = Array.isArray(tpl.tokens) ? tpl.tokens : [];
  return toks
    .map((t) => (t && typeof t.getText === 'function' ? t.getText() : ''))
    .join('');
}

function branchLists(tpl) {
  if (Array.isArray(tpl.branches)) {
    const lists = tpl.branches.map((b) =>
      b && Array.isArray(b.templates) ? b.templates : []
    );
    if (Array.isArray(tpl.elseTemplates)) lists.push(tpl.elseTemplates);
    return lists;
  }
  if (Array.isArray(tpl.templates)) return [tpl.templates];
  return [[]];
}

// Ruby BlockBody#blank? for one child node.
function childIsBlank(tpl) {
  if (!tpl || typeof tpl !== 'object') return true;
  const kind = tpl.token ? tpl.token.kind : undefined;
  if (kind === TokenKind.HTML) return WS_ONLY.test(tpl.str || '');
  if (kind === TokenKind.Output) return false; // {{ }} forces @blank = false
  const name = tagName(tpl);
  if (ALWAYS_BLANK_TAG_NAMES.has(name)) return true;
  if (name === 'raw' || name === 'highlight')
    return WS_ONLY.test(rawBodyText(tpl));
  if (isBlockTag(tpl)) return isBlankBlock(tpl);
  return false; // Ruby Tag#blank? defaults to false
}

function computeIsBlankBlock(tpl) {
  if (!isBlockTag(tpl)) return false;
  const name = tagName(tpl);
  // Ruby Raw#blank? is @body.empty?; highlight stores raw tokens the same way.
  if (name === 'raw' || name === 'highlight')
    return WS_ONLY.test(rawBodyText(tpl));
  return branchLists(tpl).every((list) => list.every(childIsBlank));
}

/**
 * Static (parse-time) check: would Ruby Liquid skip this block's output?
 * Result is memoized on the template instance; the parse tree is immutable.
 */
export function isBlankBlock(tpl) {
  if (!tpl || typeof tpl !== 'object' || !tpl.token) return false;
  if (tpl[blankSym] !== undefined) return tpl[blankSym];
  const result = computeIsBlankBlock(tpl);
  try {
    tpl[blankSym] = result;
  } catch {
    /* frozen template instance — recompute next time */
  }
  return result;
}

// Wrap a blank block's render so it still executes (side effects preserved)
// but emits nothing — the analog of Ruby's skip_output=true.
function wrapForBlankSkip(tpl) {
  if (tpl[wrappedSym]) return;
  tpl[wrappedSym] = true;
  const origRender = tpl.render;
  tpl.render = function (ctx, emitter) {
    const out = origRender.call(this, ctx, NULL_EMITTER);
    if (out && typeof out.next === 'function') {
      // Generator render (most tags): drain it, discard output.
      return (function* () {
        yield* out;
      })();
    }
    if (out && typeof out.then === 'function') {
      // Async render (e.g. custom tags): await completion, discard output.
      return (async () => {
        await out;
        return '';
      })();
    }
    return '';
  };
}

/**
 * Patch a Liquid instance so every template-list render skips blank blocks,
 * exactly like Ruby's BlockBody#render. Idempotent per renderer.
 */
export function patchBlankBlockSkipping(liquid) {
  const renderer = liquid && liquid.renderer;
  if (!renderer || renderer[patchedSym]) return;
  renderer[patchedSym] = true;
  const origRenderTemplates = renderer.renderTemplates;
  renderer.renderTemplates = function* (templates, ctx, emitter) {
    if (Array.isArray(templates)) {
      for (const tpl of templates) {
        if (isBlankBlock(tpl)) wrapForBlankSkip(tpl);
      }
    }
    return yield* origRenderTemplates.call(this, templates, ctx, emitter);
  };
}
