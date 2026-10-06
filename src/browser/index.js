// Browser entry: exposes JekyllEngine as a global for playground.html.
// Build with: npm run build  (esbuild, see package.json)
import { JekyllEngine } from '../engine.js';
window.JekyllEngine = JekyllEngine;
