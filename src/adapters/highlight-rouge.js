/**
 * Rouge-compatible highlight adapter.
 *
 * Wraps the kramdown-js Rouge emulation (70/70 byte-exact vs Ruby Rouge 4.7.0)
 * as a Highlighter plugin.
 *
 * For new projects, prefer highlight.js or shiki adapters.
 * This exists for Jekyll compatibility (sites using `highlighter: rouge`).
 */

import { rougeHighlightInner } from '../../../kramdown-js/kramdown-rouge.js';

// Language names with implemented Rouge 4.7.0 tokenizers in kramdown-rouge.js
// (mirrors ROUGE_SUPPORTED_LANGS there; kept local to avoid touching that
// file while another worker has it open).
const ROUGE_LANGS = new Set([
  'ruby', 'rb',
  'html', 'htm', 'xhtml',
  'liquid',
  'js', 'javascript',
  'css', 'scss', 'sass',
  'yaml', 'yml',
  'markdown', 'md',
]);

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
    return PLAINTEXT_ALIASES.has(l) || ROUGE_LANGS.has(l);
  },
};

export default rougeAdapter;
