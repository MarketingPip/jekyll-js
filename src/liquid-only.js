/**
 * jekyll-js/liquid-only — Just the template engine.
 *
 * ~100KB. LiquidJS with Jekyll tags/filters, no markdown, no build pipeline.
 * For when you only need template rendering.
 *
 * @example
 * import { renderLiquid } from 'jekyll-js/liquid-only';
 * const html = await renderLiquid('Hello {{ name }}', { name: 'World' });
 */

export { Liquid } from 'liquidjs';
export { registerJekyllExtensions } from './jekyllTags.js';
export { preprocessConditionals } from './liquidPreprocess.js';

/**
 * Render a Liquid template with Jekyll extensions.
 * @param {string} template
 * @param {Object} context
 * @returns {Promise<string>}
 */
export async function renderLiquid(template, context = {}) {
  const { Liquid } = await import('liquidjs');
  const { registerJekyllExtensions } = await import('./jekyllTags.js');
  const engine = new Liquid({
    dynamicPartials: false,
    jekyllInclude: true,
    jekyllWhere: true,
  });
  registerJekyllExtensions(engine, {});
  return engine.parseAndRender(template, context);
}
