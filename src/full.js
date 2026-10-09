/**
 * jekyll-js/full — Everything, with lazy loading.
 *
 * ~500KB core + lazy-loaded adapters. Includes:
 * - Core engine
 * - kramdown-js adapter (lazy)
 * - highlight.js adapter (lazy, with language lazy-loading)
 * - dart-sass adapter (lazy, WASM)
 * - Jekyll compat layer
 *
 * @example
 * import { JekyllEngine, kramdownAdapter } from 'jekyll-js/full';
 * const engine = new JekyllEngine({
 *   vfs,
 *   markdown: kramdownAdapter,
 * });
 */

export { JekyllEngine } from './engine.js';
export * from './plugins.js';
export { applyJekyllCompat, detectJekyllCompat } from './jekyllCompat.js';

// Lazy adapters (import when needed)
export const adapters = {
  /** @returns {Promise<import('./plugins.js').MarkdownRenderer>} */
  kramdown: () => import('./adapters/markdown-kramdown.js').then(m => m.default),
  /** @returns {Promise<import('./plugins.js').MarkdownRenderer>} */
  marked: () => import('./adapters/markdown-marked.js').then(m => m.default),
  /** @returns {Promise<import('./plugins.js').Highlighter>} */
  rouge: () => import('./adapters/highlight-rouge.js').then(m => m.default),
};
