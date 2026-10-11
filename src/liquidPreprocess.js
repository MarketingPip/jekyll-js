/**
 * liquidPreprocess.js — template source preprocessing for LiquidJS parity.
 *
 * P0 FIX (parenthesized {% if %} aborts whole-site build):
 * Real-world themes (e.g. beautiful-jekyll's _includes/head.html:16) write
 *   {%- if site.title and site.title-on-all-pages and (site.title != pagetitle) -%}
 * Ruby Liquid (4.0.4) treats the parens as pure grouping and renders both
 * branches correctly. LiquidJS 10.x throws `TokenizationError: invalid range
 * syntax` at PARSE time, and because includes are parsed during the build,
 * one bad include aborts the entire site build (0 files emitted).
 *
 * Fix: at every template parse entry point, rewrite parenthesized groups
 * inside {% if %} / {% elsif %} / {% unless %} conditions before LiquidJS
 * parses. Liquid has no parens, so `(a != b)` -> `a != b` is
 * semantics-preserving (Ruby just groups). Nesting is handled
 * innermost-first; parens inside quoted string literals are left alone;
 * verbatim blocks ({% raw %}, {% comment %}, {% highlight %}) are untouched.
 */

/** Verbatim blocks whose literal text must never be rewritten. */
const VERBATIM_RE = /\{%-?\s*(raw|comment|highlight)\b[\s\S]*?\{%-?\s*end\1\s*-?%\}/g;
/** Any {% ... %} tag span (non-greedy). */
const TAG_RE = /\{%-?[\s\S]*?-?%\}/g;
/** {% if|elsif|unless <condition> %} — captures open, name, condition, close. */
const COND_TAG_RE = /^(\{%-?\s*)(if|elsif|unless)\b([\s\S]*?)(-?%\})$/;

/**
 * Remove one innermost balanced (...) pair per call, quote-aware.
 * Returns the string unchanged when no removable pair exists.
 */
function stripOneLevel(cond) {
  let depth = 0;
  let openIdx = -1;
  let quote = null;
  for (let i = 0; i < cond.length; i++) {
    const ch = cond[i];
    if (quote) {
      if (ch === quote && cond[i - 1] !== '\\') quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === '(') {
      depth++;
      openIdx = i;
    } else if (ch === ')') {
      if (depth > 0) {
        // Innermost pair found: openIdx..i. Splice out the parens.
        return cond.slice(0, openIdx) + cond.slice(openIdx + 1, i) + cond.slice(i + 1);
      }
      // Unmatched ')' — leave the condition alone.
    }
  }
  return cond;
}

/** Strip all balanced grouping parens from a condition string, innermost-first. */
function stripConditionParens(cond) {
  let prev;
  do {
    prev = cond;
    cond = stripOneLevel(cond);
    // Each iteration strictly shortens the string, so this always terminates.
  } while (cond !== prev);
  return cond;
}

/**
 * P1 FIX (LiquidJS misparses `.[...]` dynamic lookup): Ruby Liquid allows
 * `tabs.[tab_name]` (dot + bracket) as a dynamic property lookup, exactly
 * equivalent to `tabs[tab_name]`. LiquidJS 10.x's readProperties() consumes
 * the `.` then fails on `[` (not an identifier), silently dropping the
 * lookup and returning the base object -- `{{ tabs.[k] | upcase }}` renders
 * `[OBJECT OBJECT]`. Rewrite `. [` -> `[` inside {{ }}/{% %} tags
 * (quote-aware; verbatim blocks untouched). Semantics-preserving in Ruby.
 */

/** {{ ... }} output span (non-greedy). */
const OUTPUT_RE = /\{\{-?[\s\S]*?-?\}\}/g;

/** Replace `.\s*[` with `[` outside quoted string literals. */
function stripDotBracket(tag) {
  let out = '';
  let quote = null;
  for (let i = 0; i < tag.length; i++) {
    const ch = tag[i];
    if (quote) {
      out += ch;
      if (ch === quote && tag[i - 1] !== '\\') quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      out += ch;
      continue;
    }
    if (ch === '.' && /^\s*\[/.test(tag.slice(i + 1))) {
      // skip the dot and any whitespace; the '[' is copied next iteration
      let j = i + 1;
      while (j < tag.length && /\s/.test(tag[j])) j++;
      i = j - 1;
      continue;
    }
    out += ch;
  }
  return out;
}

export function normalizeDotBracket(source) {
  if (typeof source !== 'string' || !source.includes('.[')) return source;
  const stash = [];
  const stashed = source.replace(VERBATIM_RE, (m) => {
    stash.push(m);
    return `\u0000${stash.length - 1}\u0000`;
  });
  const processed = stashed
    .replace(TAG_RE, stripDotBracket)
    .replace(OUTPUT_RE, stripDotBracket);
  return processed.replace(/\u0000(\d+)\u0000/g, (_, i) => stash[+i]);
}

/**
 * Rewrite parenthesized groups inside {% if %}/{% elsif %}/{% unless %}
 * conditions. All other template text is returned byte-identical.
 *
 * @param {string} source — raw template source
 * @returns {string} — source with grouping parens removed from conditions
 */
export function preprocessConditionals(source) {
  if (typeof source === 'string' && source.includes('.[')) {
    source = normalizeDotBracket(source);
  }
  if (typeof source !== 'string' || !source.includes('(')) return source;

  // Stash verbatim blocks so raw/comment/highlighted literal text is never touched.
  const stash = [];
  const stashed = source.replace(VERBATIM_RE, (m) => {
    stash.push(m);
    return `\u0000${stash.length - 1}\u0000`;
  });

  const processed = stashed.replace(TAG_RE, (tag) => {
    const m = tag.match(COND_TAG_RE);
    if (!m || !m[3].includes('(')) return tag;
    const [, open, name, cond, close] = m;
    return `${open}${name}${stripConditionParens(cond)}${close}`;
  });

  return processed.replace(/\u0000(\d+)\u0000/g, (_, i) => stash[+i]);
}
