/**
 * Example: Plugin composition in jekyll-js.
 *
 * Shows how to mix and match markdown renderers, highlighters,
 * and other plugins.
 */

import { JekyllEngine } from '../src/core.js';
import kramdownAdapter from '../src/adapters/markdown-kramdown.js';
import hljsAdapter from '../src/adapters/highlight-hljs.js';
import rougeAdapter from '../src/adapters/highlight-rouge.js';

// Example 1: Default (marked + no highlighting)
// Minimal bundle, fastest startup
const basic = new JekyllEngine({ vfs: {} });

// Example 2: Kramdown for Jekyll parity
// Use when migrating an existing Jekyll site
const jekyllParity = new JekyllEngine({
  vfs: {},
  markdown: kramdownAdapter,
});

// Example 3: Kramdown + highlight.js (lazy languages)
// Best for code-heavy sites
const codeHeavy = new JekyllEngine({
  vfs: {},
  markdown: kramdownAdapter,
  highlighter: hljsAdapter,
});
// Preload common languages for faster first render
await hljsAdapter.preload(['javascript', 'python', 'ruby']);

// Example 4: Kramdown + Rouge compat (for exact Jekyll output)
// Use when byte-identical output matters
const exactJekyll = new JekyllEngine({
  vfs: {},
  markdown: kramdownAdapter,
  highlighter: rougeAdapter,
});

// Example 5: Custom markdown renderer (bring your own)
// Any object with { name, render(src, opts) } works
const myRenderer = {
  name: 'my-markdown',
  render: (src, opts) => {
    // Your custom logic here
    return `<div class="custom">${src}</div>`;
  },
};
const custom = new JekyllEngine({
  vfs: {},
  markdown: myRenderer,
});

// Example 6: Jekyll _config.yml auto-detection
import { applyJekyllCompat } from '../src/jekyllCompat.js';

const jekyllConfig = {
  markdown: 'kramdown',
  highlighter: 'rouge',
  kramdown: {
    auto_ids: true,
    syntax_highlighter: 'rouge',
  },
};

const autoEngine = new JekyllEngine({ vfs: {} });
await applyJekyllCompat(autoEngine, jekyllConfig);
// Now uses kramdown + rouge with the specified options

console.log('All examples created successfully');
