/**
 * Default markdown adapter using marked.
 *
 * This is the built-in default. It approximates kramdown behavior
 * with custom extensions (header IDs, etc.).
 *
 * For true kramdown parity, use the kramdown-js adapter:
 *   import kramdownAdapter from 'jekyll-js/adapters/markdown-kramdown';
 */

import { Marked, Renderer } from 'marked';

// Reuse the existing parseMarkdown logic from engine.js
// (extracted to avoid duplication — engine.js will import from here)

function createMarkedRenderer() {
  const renderer = new Renderer();
  // Header IDs like kramdown
  const origHeading = renderer.heading.bind(renderer);
  renderer.heading = (text, level, raw) => {
    const id = raw.toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-');
    return `<h${level} id="${id}">${text}</h${level}>\n`;
  };
  return renderer;
}

const marked = new Marked({ renderer: createMarkedRenderer() });

/**
 * @type {import('../plugins.js').MarkdownRenderer}
 */
const markedAdapter = {
  name: 'marked',
  supportedOptions: ['auto_ids', 'header_offset', 'hard_wrap'],

  render(src, options = {}) {
    let html = marked.parse(src);

    // Apply header_offset if specified
    if (options.header_offset) {
      const offset = options.header_offset;
      html = html.replace(/<(\/?)h([1-6])/g, (m, close, level) => {
        const newLevel = Math.min(6, Math.max(1, parseInt(level) + offset));
        return `<${close}h${newLevel}`;
      });
    }

    return html;
  }
};

export default markedAdapter;
