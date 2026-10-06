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
 * @returns {{ css: string, permalink: string }}
 */
export function compileSassAsset(path, content, vfs, config = {}, sass) {
  if (!sass) {
    throw new Error(
      `Cannot compile ${path}: no Sass compiler provided. ` +
        `Pass a compiler via the JekyllEngine \`sass\` option ` +
        `(\`import * as sass from 'sass'\` in Node, or load dist/sass-plugin.js in the browser).`
    );
  }
  // Strip front matter before passing to Sass (Sass doesn't understand ---)
  const stripped = content.replace(/^---[\s\S]*?---\n?/, '');

  const sassStyle = config?.sass?.style || 'compressed';
  const syntax = path.endsWith('.sass') ? 'indented' : 'scss';

  // Build a map of all _sass/ partials for the custom importer
  const sassPartials = {};
  for (const [vfsPath, vfsContent] of Object.entries(vfs)) {
    if (vfsPath.startsWith('_sass/')) {
      // Normalise the key to what Sass would request in an @import:
      // "_sass/minima/_base.scss" → both "minima/_base" and "minima/_base.scss"
      const rel = vfsPath.slice('_sass/'.length);
      sassPartials[rel] = vfsContent;
      sassPartials[rel.replace(/\.(scss|sass)$/, '')] = vfsContent;
      // Also store with leading underscore stripped (Sass partial convention)
      const noUnderscore = rel.replace(/\/_(?=[^/]+$)/, '/').replace(/^_/, '');
      sassPartials[noUnderscore] = vfsContent;
      sassPartials[noUnderscore.replace(/\.(scss|sass)$/, '')] = vfsContent;
    }
  }

  const importer = {
    canonicalize(url, context) {
      // When Sass resolves a nested @import from inside an already-loaded
      // vfs: file, the `url` may be relative to the parent's canonical
      // URL. Strip the vfs: scheme and parent directory if present.
      let key = url;
      if (context?.containingUrl) {
        const containingPath = context.containingUrl.pathname.replace(/^\//, '');
        const containingDir = containingPath.includes('/')
          ? containingPath.slice(0, containingPath.lastIndexOf('/') + 1)
          : '';
        const candidate = containingDir + url;
        if (sassPartials[candidate] !== undefined) return new URL(`vfs:///${candidate}`);
        if (sassPartials[candidate.replace(/\.scss$/, '')] !== undefined)
          return new URL(`vfs:///${candidate.replace(/\.scss$/, '')}`);
      }
      if (sassPartials[key] !== undefined) return new URL(`vfs:///${key}`);
      // Try adding .scss extension
      if (sassPartials[`${key}.scss`] !== undefined) return new URL(`vfs:///${key}.scss`);
      // Also check without the leading _ (Sass convention)
      const segments = key.split('/');
      const last = segments[segments.length - 1];
      const withUnderscore = [...segments.slice(0, -1), `_${last}`].join('/');
      if (sassPartials[withUnderscore] !== undefined) return new URL(`vfs:///${withUnderscore}`);
      if (sassPartials[`${withUnderscore}.scss`] !== undefined)
        return new URL(`vfs:///${withUnderscore}.scss`);
      return null;
    },
    load(canonicalUrl) {
      const key = canonicalUrl.pathname.replace(/^\//, ''); // strip leading /
      const source =
        sassPartials[key] ||
        sassPartials[key.replace(/\.(scss|sass)$/, '')] ||
        '';
      return { contents: source, syntax: key.endsWith('.sass') ? 'indented' : 'scss' };
    },
  };

  let result;
  try {
    result = sass.compileString(stripped, {
      syntax,
      style: sassStyle === 'compressed' ? 'compressed' : 'expanded',
      importers: [importer],
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
    };
  }

  return {
    css: result.css,
    permalink: sassToCssPermalink(path),
  };
}

function sassToCssPermalink(path) {
  return '/' + path.replace(/\.(scss|sass)$/, '.css');
}
