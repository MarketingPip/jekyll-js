/**
 * Rouge-compatible highlight adapter.
 *
 * Wraps the kramdown-js Rouge emulation (70/70 byte-exact vs Ruby Rouge 4.7.0)
 * as a Highlighter plugin.
 *
 * For new projects, prefer highlight.js or shiki adapters.
 * This exists for Jekyll compatibility (sites using `highlighter: rouge`).
 */

import { rougeHighlightInner, ROUGE_SUPPORTED_LANGS } from '../../../kramdown-js/kramdown-rouge.js';

// Rouge's PlainText lexer aliases (tag 'plaintext', aliases 'text', 'plain').
const PLAINTEXT_ALIASES = new Set(['plaintext', 'text', 'plain']);

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function normalizeLang(lang) {
  return String(lang || 'plaintext').toLowerCase().split('?')[0];
}

/**
 * @type {Object} Highlighter adapter
 */
const rougeAdapter = {
  name: 'rouge-compat',

  highlight(code, lang) {
    const l = normalizeLang(lang);
    // Jekyll: Rouge::Lexer.find_fancy(@lang, code) || PlainText — unknown
    // languages and plaintext fall back to escaped text (no spans).
    if (PLAINTEXT_ALIASES.has(l)) return escapeHtml(code);
    const html = rougeHighlightInner(code, l);
    return html === null ? escapeHtml(code) : html;
  },

  supports(lang) {
    const l = normalizeLang(lang);
    return PLAINTEXT_ALIASES.has(l) || ROUGE_SUPPORTED_LANGS.has(l);
  },
};

export default rougeAdapter;
