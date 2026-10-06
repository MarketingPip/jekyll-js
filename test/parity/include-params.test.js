/**
 * Includes with parameters (Jekyll parity).
 *
 * Real Jekyll: `{% include greeting.html name="Alice" age=30 %}` passes
 * parameters accessible as `{{ include.name }}` inside the include.
 * Verified against WASM oracle (Jekyll 4.3.4): outputs
 * `<p>Hello Alice, you are 30 years old.</p>`
 *
 * Jekyll source: lib/jekyll/tags/include.rb
 */
import { JekyllEngine } from '../../src/engine.js';

describe('includes with parameters', () => {
  test('passes string and number parameters to include', async () => {
    const engine = new JekyllEngine({
      vfs: {
        '_includes/greeting.html': 'Hello {{ include.name }}, you are {{ include.age }} years old.',
        'index.md': '---\n---\n{% include greeting.html name="Alice" age=30 %}',
      },
    });
    const pages = await engine.build();
    const index = pages.find((p) => p.permalink === '/');
    expect(index.content).toContain('Hello Alice, you are 30 years old.');
  });

  test('passes variable parameters to include', async () => {
    const engine = new JekyllEngine({
      vfs: {
        '_includes/show.html': 'Value: {{ include.val }}',
        'index.md': '---\ntitle: Test\n---\n{% include show.html val=page.title %}',
      },
    });
    const pages = await engine.build();
    const index = pages.find((p) => p.permalink === '/');
    expect(index.content).toContain('Value: Test');
  });

  test('include without parameters still works', async () => {
    const engine = new JekyllEngine({
      vfs: {
        '_includes/simple.html': 'Simple include',
        'index.md': '---\n---\n{% include simple.html %}',
      },
    });
    const pages = await engine.build();
    const index = pages.find((p) => p.permalink === '/');
    expect(index.content).toContain('Simple include');
  });
});
