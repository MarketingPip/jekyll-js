/**
 * jekyll-js/core — Build only, no plugins.
 *
 * ~300KB. The core engine with default marked adapter.
 * No Sass, no highlight.js, no kramdown.
 *
 * @example
 * import { JekyllEngine } from 'jekyll-js/core';
 * const engine = new JekyllEngine({ vfs });
 * await engine.build();
 */

export { JekyllEngine } from './engine.js';
export { default as markedAdapter } from './adapters/markdown-marked.js';
export * from './plugins.js';
