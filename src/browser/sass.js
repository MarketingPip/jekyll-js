// Browser entry for the optional Sass plugin.
// dart-sass is ~3.4MB — it ships as a separate chunk that the host loads
// only when the site actually contains .scss/.sass files. Sets
// window.JekyllSass; pass it as `new JekyllEngine({ sass: window.JekyllSass })`.
// Build with: npm run build  (esbuild, see package.json)
import * as sass from 'sass';
window.JekyllSass = sass;
