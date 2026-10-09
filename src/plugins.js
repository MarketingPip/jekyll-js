/**
 * jekyll-js plugin interfaces.
 *
 * Core principle: provide defaults, never mandate them.
 * Developers bring their own markdown renderer, highlighter, Sass compiler.
 *
 * Each interface is a plain object (not a class) so adapters can be
 * simple functions or objects. Tree-shakeable: import only what you use.
 */

/**
 * Markdown renderer adapter.
 *
 * Converts Markdown source to HTML. Implementations: kramdown-js,
 * marked, markdown-it, etc.
 *
 * @typedef {Object} MarkdownRenderer
 * @property {string} name - Adapter name (e.g. 'kramdown', 'marked', 'gfm')
 * @property {(src: string, options?: MarkdownOptions) => string | Promise<string>} render
 *   Convert markdown to HTML. May be async.
 * @property {string[]} [supportedOptions] - Option keys this adapter honors
 */

/**
 * @typedef {Object} MarkdownOptions
 * @property {boolean} [auto_ids] - Add id="" to headers (kramdown default: true)
 * @property {string} [auto_id_prefix] - Prefix for auto-generated header IDs
 * @property {number} [header_offset] - Offset header levels (e.g. 1 makes h1→h2)
 * @property {boolean} [parse_block_html] - Parse markdown inside block HTML
 * @property {boolean} [parse_span_html] - Parse markdown inside span HTML
 * @property {boolean} [smart_quotes] - Convert quotes to typographic quotes
 * @property {Object} [typographic_symbols] - Custom typographic replacements
 * @property {boolean} [hard_wrap] - Convert newlines to <br>
 * @property {string} [math_engine] - 'mathjax', 'katex', or null
 * @property {Object} [math_engine_opts] - Options for math engine
 * @property {number[]} [toc_levels] - Header levels for TOC (e.g. [1,2,3])
 * @property {boolean} [transliterated_header_ids] - Transliterate header IDs
 * @property {string} [entity_output] - :as_char, :numeric, :symbolic
 * @property {number} [line_width] - Wrap output at width (0 = no wrap)
 * @property {string} [syntax_highlighter] - Highlighter name for code blocks
 * @property {Object} [syntax_highlighter_opts] - Options for highlighter
 * @property {Object} [link_defs] - Predefined link definitions
 * @property {boolean} [html_to_native] - Convert HTML to native elements
 */

/**
 * Syntax highlighter adapter.
 *
 * Highlights code blocks. Implementations: highlight.js, shiki,
 * rouge-compat, etc.
 *
 * @typedef {Object} Highlighter
 * @property {string} name - Adapter name (e.g. 'highlight.js', 'shiki', 'rouge')
 * @property {(code: string, lang: string) => string | Promise<string>} highlight
 *   Highlight code. Returns HTML string (inner content of <code>).
 *   May be async (for lazy language loading).
 * @property {(lang: string) => boolean} [supports] - Check if language supported
 * @property {() => Promise<void>} [loadLanguage] - Lazy-load a language
 */

/**
 * Sass/SCSS compiler adapter.
 *
 * Compiles Sass/SCSS to CSS. Implementations: dart-sass, sass-embedded, etc.
 *
 * @typedef {Object} SassCompiler
 * @property {string} name - Adapter name (e.g. 'dart-sass')
 * @property {(src: string, options?: SassOptions) => string | Promise<string>} compile
 *   Compile Sass to CSS. May be async (WASM).
 */

/**
 * @typedef {Object} SassOptions
 * @property {'expanded'|'compressed'} [style] - Output style (default: 'expanded')
 * @property {string[]} [loadPaths] - Import resolution paths
 * @property {boolean} [sourceMap] - Generate source map
 */

/**
 * Site plugin.
 *
 * Extends build behavior. Plugins receive the site instance and can
 * hook into lifecycle events.
 *
 * @typedef {Object} SitePlugin
 * @property {string} name - Plugin name
 * @property {(site: Site) => void | Promise<void>} [onInit] - Called after config load
 * @property {(site: Site) => void | Promise<void>} [preRender] - Before rendering
 * @property {(site: Site) => void | Promise<void>} [postRender] - After rendering
 * @property {(site: Site) => void | Promise<void>} [postWrite] - After files written
 */

/**
 * Jekyll _config.yml compatibility mapping.
 *
 * Maps Jekyll config keys to plugin adapters. When a Jekyll site
 * specifies `markdown: kramdown`, we auto-load our kramdown adapter
 * with a deprecation nudge (not a hard failure).
 */
export const BUILTIN_ADAPTERS = {
  markdown: {
    'kramdown': () => import('./adapters/markdown-kramdown.js').then(m => {
      console.warn('[jekyll-js] markdown: kramdown is deprecated. Consider migrating to a maintained adapter.');
      return m.default;
    }),
    'gfm': () => import('./adapters/markdown-gfm.js'),
    'marked': () => import('./adapters/markdown-marked.js'),
  },
  highlighter: {
    'rouge': () => import('./adapters/highlight-rouge.js').then(m => {
      console.warn('[jekyll-js] highlighter: rouge is deprecated. Consider highlight.js or shiki.');
      return m.default;
    }),
    'highlight.js': () => import('./adapters/highlight-hljs.js'),
    'hljs': () => import('./adapters/highlight-hljs.js'),
    'shiki': () => import('./adapters/highlight-shiki.js'),
    'pygments': () => {
      throw new Error('[jekyll-js] Pygments is not supported. Use highlight.js or shiki.');
    },
  },
  sass: {
    'sass': () => import('./adapters/sass-dart.js'),
    'dart-sass': () => import('./adapters/sass-dart.js'),
  },
};

/**
 * Resolve a plugin adapter from config.
 * @param {'markdown'|'highlighter'|'sass'} type
 * @param {string} name - Config value (e.g. 'kramdown')
 * @returns {Promise<MarkdownRenderer|Highlighter|SassCompiler>}
 */
export async function resolveAdapter(type, name) {
  const adapters = BUILTIN_ADAPTERS[type];
  if (!adapters) throw new Error(`[jekyll-js] Unknown adapter type: ${type}`);
  const loader = adapters[name];
  if (!loader) throw new Error(`[jekyll-js] Unknown ${type} adapter: ${name}`);
  return loader();
}
