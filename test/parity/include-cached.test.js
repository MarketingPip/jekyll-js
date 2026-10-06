/**
 * test/parity/include-cached.test.js
 * ---------------------------------------------------------------------------
 * {% include_cached %} tag (from jekyll-include-cache plugin).
 *
 * The jekyll-include-cache plugin provides {% include_cached %} as a
 * performance optimization over {% include %} — it caches the rendered
 * output. For parity, we implement it as an alias to {% include %}
 * (caching is a performance detail, not a behavioral difference).
 *
 * This unblocks 3 of the top 5 Jekyll themes:
 * - minimal-mistakes (~13k stars)
 * - just-the-docs (~7.5k stars)
 * - chirpy (~7.5k stars)
 *
 * Grounding: https://github.com/benbalter/jekyll-include-cache
 * Real Jekyll with the plugin: {% include_cached foo.html %} renders
 * _includes/foo.html identically to {% include foo.html %}.
 */

import { JekyllEngine } from '../../src/engine.js';

describe('include_cached tag', () => {
  test('renders include identically to include tag', async () => {
    const engine = new JekyllEngine({
      vfs: {
        '_includes/greeting.html': '<p>Hello {{ include.name }}!</p>',
        'index.md': '---\n---\n{% include_cached greeting.html name="Alice" %}',
      },
    });
    const pages = await engine.build();
    const index = pages.find((p) => p.permalink === '/');
    expect(index.content).toContain('<p>Hello Alice!</p>');
  });

  test('works without parameters', async () => {
    const engine = new JekyllEngine({
      vfs: {
        '_includes/footer.html': '<footer>Footer</footer>',
        'index.md': '---\n---\n{% include_cached footer.html %}',
      },
    });
    const pages = await engine.build();
    const index = pages.find((p) => p.permalink === '/');
    expect(index.content).toContain('<footer>Footer</footer>');
  });
});
