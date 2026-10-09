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

/**
 * @type {import('../plugins.js').MarkdownRenderer}
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
    return kramdown(src, options);
  }
};

export default kramdownAdapter;
