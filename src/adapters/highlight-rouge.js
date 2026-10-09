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

/**
 * @type {import('../plugins.js').Highlighter}
 */
const rougeAdapter = {
  name: 'rouge-compat',

  highlight(code, lang) {
    // rougeHighlightInner returns HTML with Rouge CSS classes
    return rougeHighlightInner(code, lang || 'plaintext');
  },

  supports(lang) {
    // We support ruby and html (the two lexers implemented)
    // Others fall back to plaintext
    return ['ruby', 'html', 'plaintext', 'text'].includes(lang?.toLowerCase());
  },
};

export default rougeAdapter;
