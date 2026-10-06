// Browser entry for the optional syntax-highlight plugin.
// highlight.js (full language build) is ~1.5MB — it ships as a separate
// chunk that the host loads only when the site uses {% highlight %}.
// Sets window.JekyllHighlight; pass it as
// `new JekyllEngine({ highlighter: window.JekyllHighlight })`.
// Build with: npm run build  (esbuild, see package.json)
import hljs from 'highlight.js';
window.JekyllHighlight = hljs;
