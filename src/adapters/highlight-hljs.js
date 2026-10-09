/**
 * highlight.js adapter with lazy language loading.
 *
 * Loads language grammars on-demand instead of bundling all ~190.
 * Reduces initial bundle size significantly.
 *
 * @example
 * import hljsAdapter from 'jekyll-js/adapters/highlight-hljs';
 * const engine = new JekyllEngine({ highlighter: hljsAdapter });
 * // Languages load automatically when first used
 */

let hljs = null;
const loadedLanguages = new Set(['plaintext']);

/**
 * Lazy-load highlight.js core (without languages).
 */
async function getHljs() {
  if (!hljs) {
    const mod = await import('highlight.js/lib/core');
    hljs = mod.default;
  }
  return hljs;
}

/**
 * Lazy-load a language grammar.
 * @param {string} lang
 */
async function loadLanguage(lang) {
  const hl = await getHljs();
  const normalized = lang.toLowerCase();

  if (loadedLanguages.has(normalized) || hl.getLanguage(normalized)) {
    return;
  }

  try {
    // Dynamic import of language module
    const langMod = await import(`highlight.js/lib/languages/${normalized}.js`);
    hl.registerLanguage(normalized, langMod.default);
    loadedLanguages.add(normalized);
  } catch (e) {
    // Language not found — fall back to plaintext
    // (don't throw, just don't highlight)
  }
}

/**
 * @type {import('../plugins.js').Highlighter}
 */
const hljsAdapter = {
  name: 'highlight.js',

  async highlight(code, lang) {
    const hl = await getHljs();
    const normalizedLang = (lang || 'plaintext').toLowerCase();

    // Lazy-load the language if needed
    await loadLanguage(normalizedLang);

    if (hl.getLanguage(normalizedLang)) {
      return hl.highlight(code, { language: normalizedLang }).value;
    }
    // Fallback: auto-detect or plaintext
    return hl.highlightAuto(code).value;
  },

  supports(lang) {
    // We can lazy-load any highlight.js language
    // Return true optimistically; actual load happens in highlight()
    return true;
  },

  /**
   * Preload languages (e.g. for critical path).
   * @param {string[]} langs
   */
  async preload(langs) {
    await Promise.all(langs.map(loadLanguage));
  },
};

export default hljsAdapter;
