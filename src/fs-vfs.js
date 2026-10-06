/**
 * fs-vfs.js — universal adapter: read a directory into a VFS object.
 *
 * Works in Node AND the browser. It needs an `fs` implementation passed
 * via the `fs` option — anything with `readdirSync`/`readFileSync`:
 *
 *   // Node (real filesystem)
 *   import fs from 'node:fs';
 *   import { readDirToVFS } from './fs-vfs.js';
 *   const vfs = readDirToVFS('./my-jekyll-site', { fs });
 *
 *   // Browser (or Node) via memfs — e.g. a site assembled from a zip,
 *   // file uploads, or fixtures, entirely client-side
 *   import { fs as memfs } from 'memfs';
 *   const vfs = readDirToVFS('/site', { fs: memfs });
 *
 *   import { JekyllEngine } from './engine.js';
 *   const pages = await new JekyllEngine({ vfs }).build();
 *
 * The engine itself stays VFS-pure (a plain `{ path: content }` object).
 * This module is the bridge. It has NO `node:` imports, so it bundles
 * cleanly for the browser — the `fs` is always injected, never imported.
 *
 * Paths: `dir` is posix-style (`/site`, `./site`). VFS keys always use
 * forward slashes, even on Windows.
 */
export const DEFAULT_IGNORE = ['_site', '.git', '.sass-cache', '.jekyll-cache', 'node_modules'];

// Binary extensions: the engine only needs static files to *exist* (it
// tracks name/extname/basename/path, never renders their bytes), so we
// store a placeholder instead of decoding bytes as UTF-8.
const BINARY_EXT = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'ico', 'bmp', 'tiff',
  'woff', 'woff2', 'ttf', 'otf', 'eot',
  'mp4', 'webm', 'ogv', 'mp3', 'ogg', 'wav', 'flac',
  'pdf', 'zip', 'gz', 'tar', 'swf',
]);

/**
 * Read a directory recursively into a VFS object.
 *
 * @param {string} dir - directory to read (posix-style, e.g. './site' or '/site')
 * @param {Object} options
 * @param {Object} options.fs - REQUIRED. fs-compatible implementation
 *   (`readdirSync` with `withFileTypes`, `readFileSync`). `node:fs` in
 *   Node, memfs in the browser.
 * @param {string[]} [options.ignore] - names to skip. Any path *segment*
 *   matching an entry is skipped, at any depth (`node_modules` nested in
 *   a theme dir is skipped too).
 * @returns {Object} VFS: `{ "relative/path": "content" }`
 */
export function readDirToVFS(dir, options = {}) {
  const { fs, ignore = DEFAULT_IGNORE } = options;
  if (!fs || typeof fs.readdirSync !== 'function' || typeof fs.readFileSync !== 'function') {
    throw new Error(
      'readDirToVFS: an `fs` implementation is required via the `fs` option. ' +
        "In Node: `import fs from 'node:fs'` then `readDirToVFS(dir, { fs })`. " +
        "In the browser: pass memfs (`import { fs } from 'memfs'`)."
    );
  }

  const vfs = {};
  if (!String(dir).trim()) {
    throw new Error('readDirToVFS: `dir` must be a non-empty path (e.g. \'./site\' or \'/site\').');
  }
  const startDir = String(dir).replace(/[/\\]+$/, '') || '/';

  const walk = (curDir, relBase) => {
    for (const entry of fs.readdirSync(curDir, { withFileTypes: true })) {
      const rel = relBase ? `${relBase}/${entry.name}` : entry.name;
      // Skip if ANY path segment is ignored — matches the old battletest
      // walk, which checked each entry name at every depth.
      if (rel.split('/').some((seg) => ignore.includes(seg))) continue;
      const full = curDir === '/' ? `/${entry.name}` : `${curDir}/${entry.name}`;
      if (entry.isDirectory()) {
        walk(full, rel);
      } else {
        // Non-directories are read (symlinks followed), as before.
        const dot = entry.name.lastIndexOf('.');
        const ext = dot === -1 ? '' : entry.name.slice(dot + 1).toLowerCase();
        vfs[rel] = BINARY_EXT.has(ext) ? '' : fs.readFileSync(full, 'utf8');
      }
    }
  };

  walk(startDir, '');
  return vfs;
}
