/**
 * Jekyll _config.yml compatibility layer.
 *
 * Auto-detects Jekyll config keys and maps them to jekyll-js plugin adapters.
 * Provides deprecation warnings (not hard failures) for legacy options.
 */

import { resolveAdapter } from './plugins.js';

/**
 * Apply Jekyll _config.yml compatibility.
 *
 * Reads `markdown`, `highlighter`, and `sass` keys from config
 * and loads the corresponding adapters.
 *
 * @param {JekyllEngine} engine - The engine instance
 * @param {Object} config - Parsed _config.yml
 */
export async function applyJekyllCompat(engine, config) {
  // Markdown renderer
  if (config.markdown) {
    const name = config.markdown.toLowerCase();
    try {
      const renderer = await resolveAdapter('markdown', name);
      engine._markdown = renderer;
    } catch (e) {
      console.warn(`[jekyll-js] Unknown markdown renderer: ${config.markdown}. Using default.`);
    }
  }

  // Syntax highlighter
  if (config.highlighter) {
    const name = config.highlighter.toLowerCase();
    try {
      const highlighter = await resolveAdapter('highlighter', name);
      engine._highlighter = highlighter;
    } catch (e) {
      // resolveAdapter throws for unsupported highlighters (pygments)
      // with a helpful message — rethrow
      throw e;
    }
  }

  // Kramdown-specific options (pass through to renderer)
  if (config.kramdown && typeof config.kramdown === 'object') {
    engine._markdownOptions = { ...config.kramdown };
  }

  // Sass
  if (config.sass) {
    const sassConfig = config.sass;
    // Jekyll sass config has style, sourcemap, etc.
    engine._sassOptions = {
      style: sassConfig.style || 'expanded',
      sourcemap: sassConfig.sourcemap || 'never',
    };
  }
}

/**
 * Detect Jekyll version-specific behaviors from config.
 * @param {Object} config
 * @returns {Object} Compatibility flags
 */
export function detectJekyllCompat(config) {
  return {
    // Jekyll 4.x defaults
    markdown: config.markdown || 'kramdown',
    highlighter: config.highlighter || 'rouge',
    // Warn if using defaults that we deprecate
    usesDeprecatedMarkdown: (config.markdown || 'kramdown') === 'kramdown',
    usesDeprecatedHighlighter: (config.highlighter || 'rouge') === 'rouge',
  };
}
