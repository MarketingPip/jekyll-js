/**
 * assetsPipeline.js
 * ---------------------------------------------------------------------------
 * Compiles VFS SCSS/Sass files to CSS, resolving @import partials from the
 * VFS's `_sass/` directory exactly as Jekyll + jekyll-sass-converter do.
 *
 * Jekyll's Sass pipeline:
 *   1. Files in `assets/` whose front matter contains `---` are processed.
 *   2. `@import` paths are resolved from `_sass/` (configurable via
 *      `sass.load_paths` in _config.yml, defaulting to `_sass`).
 *   3. Output is served at the same path with `.scss`/`.sass` → `.css`.
 *
 * Implementation note: Jekyll passes the _sass/ directory as an include
 * path to the Sass compiler. We do the same by feeding all `_sass/**` VFS
 * entries to Dart Sass as in-memory importers, which is the approach Dart
 * Sass itself recommends for VFS/in-memory compilation.
 *
 * NOTE: dart-sass is NOT imported here. It is an optional plugin: the caller
 * passes the sass implementation into compileSassAsset() (or via the
 * JekyllEngine `sass` option). This keeps the core bundle tree-shakeable and
 * lets browser builds lazy-load the dart-sass chunk only when the site
 * actually contains .scss/.sass files.
 */

/**
 * Determine if a VFS file should be processed by the Sass pipeline.
 * Jekyll's rule: files in `assets/` with `.scss` or `.sass` extension that
 * contain front-matter (start with `---`). Partial files (starting with `_`)
 * are compiled only when imported, not directly.
 */
export function isSassAsset(path, content) {
  // FIX (assets/-only scoping): real Jekyll compiles ANY .scss/.sass file
  // carrying front matter (e.g. css/main.scss), not just ones under
  // assets/. _sass/ contents are never entry points (Jekyll treats the
  // whole directory as partials land), and leading-underscore files are
  // Sass partials, compiled only when imported.
  if (!/\.(scss|sass)$/i.test(path)) return false;
  const name = path.split('/').pop();
  if (name.startsWith('_')) return false; // partial, not a root
  if (path === '_sass' || path.startsWith('_sass/') || path.includes('/_sass/')) return false;
  // Jekyll requires front matter for asset files to be processed
  return content.startsWith('---');
}

/**
 * Compile a single SCSS/Sass asset file using the VFS as the import resolver.
 *
 * @param {string} path - the VFS key (e.g. "assets/main.scss")
 * @param {string} content - raw file content (may have front matter)
 * @param {Object} vfs - full VFS map (used to resolve @import partials)
 * @param {Object} config - site config (reads `sass.style` for compressed/expanded)
 * @param {Object} sass - the Sass compiler implementation (dart-sass). Required:
 *   pass `import * as sass from 'sass'` (Node) or load `dist/sass-plugin.js`
 *   (browser, sets `window.JekyllSass`).
 *
 * NOTE (liquid ordering): real Jekyll renders Liquid in .scss/.sass files
 * BEFORE Sass compilation (lib/jekyll/renderer.rb: Renderer#run renders
 * Liquid first, then runs converters). The caller (engine.js build())
 * Liquid-renders the stripped body before calling this; `content` here
 * should therefore already be Liquid-rendered. Partials pulled in via
 * @import are NOT Liquid-rendered -- same as real Jekyll.
 *
 * @param {string} env - Jekyll environment ('development' default). Real
 *   Jekyll only writes sourcemaps when `sass.sourcemap` allows it for the
 *   current env (jekyll-sass-converter passes sourceMap: :development by
 *   default, i.e. maps only outside production).
 * @returns {{ css: string, permalink: string, sourceMap: string|null,
 *   sourceMapPermalink: string|null }} sourceMap is the processed
 *   (relativized) .map JSON; null when sourcemaps are disabled.
 */
function posixRelative(fromFile, toFile) {
  // Minimal posix relative(): from the css output file to the vfs source.
  const fromParts = fromFile.split('/').slice(0, -1);
  const toParts = toFile.split('/');
  while (fromParts.length && toParts.length && fromParts[0] === toParts[0]) {
    fromParts.shift();
    toParts.shift();
  }
  return [...fromParts.map(() => '..'), ...toParts].join('/') || '.';
}

/**
 * Rewrite dart-sass's sourceMap JSON the way jekyll-sass-converter does:
 * sources are recorded relative from the emitted .css to the real source
 * file (e.g. ../../_sass/minimal-mistakes/_copyright.scss), not vfs: URLs.
 */
function processSourceMap(rawMap, assetPath) {
  const map = JSON.parse(rawMap);
  // ORACLE-PROVEN (jekyll-sass-converter #process_source_map): sources are
  // relativized from the SCSS *source* file's directory (dirname of the
  // .scss page), and `file` is the emitted css basename.
  const scssDir = assetPath.includes('/')
    ? assetPath.slice(0, assetPath.lastIndexOf('/'))
    : '';
  map.file = assetPath.split('/').pop().replace(/\.(scss|sass)$/, '.css');
  map.sources = (map.sources || []).map((s) => {
    const m = String(s).match(/^vfs:\/\/(.+)$/);
    if (!m) return s;
    // relative from scssDir to the vfs path
    const fromParts = scssDir ? scssDir.split('/') : [];
    const toParts = m[1].replace(/^\//, '').split('/');
    while (fromParts.length && toParts.length && fromParts[0] === toParts[0]) {
      fromParts.shift();
      toParts.shift();
    }
    return [...fromParts.map(() => '..'), ...toParts].join('/');
  });
  return JSON.stringify(map);
}


/**
 * Should this compile emit a sourcemap? Mirrors jekyll-sass-converter:
 * `sass.sourcemap: none` disables; `always` forces; otherwise (default
 * `development`) maps are written only when NOT in production.
 */
function wantSourceMap(config, env = 'development') {
  // Mirrors jekyll-sass-converter#sourcemap_required? exactly:
  // default :always; :never disables; :development maps only in development.
  const sm = config?.sass?.sourcemap;
  if (sm === 'never' || sm === false) return false;
  if (sm === 'always' || sm === true) return true;
  if (sm === 'development') return env === 'development';
  return true;
}

export function compileSassAsset(path, content, vfs, config = {}, sass, env = 'development') {
  if (!sass) {
    throw new Error(
      `Cannot compile ${path}: no Sass compiler provided. ` +
        `Pass a compiler via the JekyllEngine \`sass\` option ` +
        `(\`import * as sass from 'sass'\` in Node, or load dist/sass-plugin.js in the browser).`
    );
  }
  // Strip front matter before passing to Sass (Sass doesn't understand ---)
  const stripped = content.replace(/^---[\s\S]*?---\n?/, '');

  // FIX (oracle-found): real Jekyll defaults to expanded, not compressed.
  // jekyll-sass-converter/lib/jekyll/converters/scss.rb:110
  const sassStyle = config?.sass?.style || 'expanded';
  const syntax = path.endsWith('.sass') ? 'indented' : 'scss';

  // Build a map of all _sass/ partials for the custom importer
  const sassPartials = {};
  // FIX (source maps): every lookup key also maps back to the REAL vfs path
  // (with leading _ and extension), so load() can report the true file path
  // in sourceMapUrl -- jekyll-sass-converter's map records
  // ../../_sass/minimal-mistakes/_copyright.scss, not the normalized key.
  const keyToVfsPath = {};
  for (const [vfsPath, vfsContent] of Object.entries(vfs)) {
    if (vfsPath.startsWith('_sass/')) {
      // Normalise the key to what Sass would request in an @import:
      // "_sass/minima/_base.scss" → both "minima/_base" and "minima/_base.scss"
      const rel = vfsPath.slice('_sass/'.length);
      const keys = [
        rel,
        rel.replace(/\.(scss|sass)$/, ''),
        rel.replace(/\/_(?=[^/]+$)/, '/').replace(/^_/, ''),
      ];
      keys.push(keys[2].replace(/\.(scss|sass)$/, ''));
      for (const k of keys) {
        sassPartials[k] = vfsContent;
        keyToVfsPath[k] = vfsPath;
      }
    }
  }

  const importer = {
    canonicalize(url, context) {
      // Single lookup helper: every key tried maps to its vfs: URL.
      const tryKey = (k) => {
        if (k != null && sassPartials[k] !== undefined) return new URL(`vfs:///${k}`);
        return null;
      };
      // When Sass resolves a nested @import from inside an already-loaded
      // vfs: file, the `url` may be relative to the parent's canonical URL.
      let key = url;
      if (context?.containingUrl) {
        const containingPath = context.containingUrl.pathname.replace(/^\//, '');
        const containingDir = containingPath.includes('/')
          ? containingPath.slice(0, containingPath.lastIndexOf('/') + 1)
          : '';
        // FIX (../ normalization): relative imports like
        // `@use '../abstracts/mixins'` must resolve `..` segments in posix
        // form before lookup.
        const normalizePosix = (p) => {
          const parts = [];
          for (const seg of p.split('/')) {
            if (seg === '..') parts.pop();
            else if (seg !== '.' && seg !== '') parts.push(seg);
          }
          return parts.join('/');
        };
        const candidate = normalizePosix(containingDir + url);
        const hit =
          tryKey(candidate) ||
          tryKey(candidate.replace(/\.(scss|sass)$/, '')) ||
          tryKey(candidate.replace(/\/([^/]+)$/, '/_$1')) ||
          tryKey(candidate.replace(/\/([^/]+)$/, '/_$1').replace(/\.(scss|sass)$/, ''));
        if (hit) return hit;
      }
      // FIX (directory @forward/@use): dart-sass resolves a directory to
      // its `_index.scss` / `_index.sass` (module system index files).
      const dirIndex =
        tryKey(`${key}/_index.scss`) || tryKey(`${key}/_index.sass`);
      if (dirIndex) return dirIndex;
      return (
        tryKey(key) ||
        tryKey(`${key}.scss`) ||
        tryKey(`${key}.sass`) ||
        tryKey(key.replace(/\/([^/]+)$/, '/_$1')) ||
        tryKey(key.replace(/\/([^/]+)$/, '/_$1') + '.scss') ||
        tryKey(key.replace(/\/([^/]+)$/, '/_$1') + '.sass') ||
        null
      );
    },
    load(canonicalUrl) {
      const key = canonicalUrl.pathname.replace(/^\//, ''); // strip leading /
      const source =
        sassPartials[key] ||
        sassPartials[key.replace(/\.(scss|sass)$/, '')] ||
        '';
      // Report the REAL vfs path (with leading _ and extension) so the
      // sourcemap's sources name the actual file, not the lookup key;
      // processSourceMap() relativizes it the way the converter does.
      const realVfsPath = keyToVfsPath[key] || key;
      return {
        contents: source,
        syntax: key.endsWith('.sass') ? 'indented' : 'scss',
        sourceMapUrl: new URL(`vfs:///${realVfsPath}`),
      };
    },
  };

  // FIX (sourcemap): jekyll-sass-converter requests a sourcemap
  // (sourceMap: :development by default, :always, or :never via
  // `sass.sourcemap`) and appends a sourceMappingURL comment to the CSS.
  const doSourceMap = wantSourceMap(config, env);
  let result;
  try {
    result = sass.compileString(stripped, {
      syntax,
      // Entry URL so the .map names the real scss file (not stdin).
      url: new URL(`vfs:///${path}`),
      style: sassStyle === 'compressed' ? 'compressed' : 'expanded',
      importers: [importer],
      sourceMap: doSourceMap,
      sourceMapIncludeSources: doSourceMap,
      // FIX (charset): jekyll-sass-converter passes `:charset => true`
      // (scss.rb) -- with compressed output dart-sass emits a BOM for
      // non-ASCII CSS instead of an @charset rule.
      charset: true,
      // Silence deprecation warnings from real-world themes
      quietDeps: true,
      logger: sass.Logger.silent,
    });
  } catch (err) {
    // Return a CSS comment with the error rather than crashing the whole build.
    // The `error` field lets callers (build()) also surface it via the logger.
    return {
      css: `/* Sass compile error: ${err.message.replace(/\*\//g, '* /')} */`,
      permalink: sassToCssPermalink(path),
      error: err.message,
      sourceMap: null,
      sourceMapPermalink: null,
    };
  }

  let css = result.css;
  let sourceMap = null;
  let sourceMapPermalink = null;
  if (doSourceMap && result.sourceMap) {
    const cssPermalink = sassToCssPermalink(path);
    const mapName = cssPermalink.split('/').pop() + '.map';
    sourceMapPermalink = cssPermalink + '.map';
    // processSourceMap() relativizes vfs: URLs to ../../_sass/... form;
    // the map file lands next to the css. Append the sourceMappingURL
    // comment (no leading newlines when compressed, matching the gem).
    sourceMap = processSourceMap(JSON.stringify(result.sourceMap), path);
    css += `${sassStyle === 'compressed' ? '' : '\n\n'}/*# sourceMappingURL=${mapName} */`;
  }

  return {
    css,
    permalink: sassToCssPermalink(path),
    sourceMap,
    sourceMapPermalink,
  };
}


function sassToCssPermalink(path) {
  return '/' + path.replace(/\.(scss|sass)$/, '.css');
}
