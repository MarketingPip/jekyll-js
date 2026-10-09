/**
 * Plugin interface tests (TDD).
 * Verifies the engine accepts pluggable markdown renderers.
 */

import { JekyllEngine } from '../../src/engine.js';

describe('MarkdownRenderer plugin interface', () => {
  test('engine uses default renderer when none provided', () => {
    const engine = new JekyllEngine();
    const renderer = engine._getMarkdownRenderer();
    expect(renderer.name).toBe('marked-builtin');
    expect(typeof renderer.render).toBe('function');
  });

  test('engine accepts custom markdown renderer', () => {
    const customRenderer = {
      name: 'test-renderer',
      render: (src) => `<custom>${src}</custom>`,
    };
    const engine = new JekyllEngine({ markdown: customRenderer });
    expect(engine._getMarkdownRenderer()).toBe(customRenderer);
  });

  test('custom renderer is used for markdown conversion', () => {
    let renderCalled = false;
    const customRenderer = {
      name: 'test-renderer',
      render: (src) => {
        renderCalled = true;
        return `<custom>${src}</custom>`;
      },
    };
    const engine = new JekyllEngine({ markdown: customRenderer });
    const output = engine._renderMarkdown('Hello');
    expect(renderCalled).toBe(true);
    expect(output).toContain('<custom>');
  });

  test('markdownify filter uses custom renderer', async () => {
    const customRenderer = {
      name: 'test-renderer',
      render: (src) => `<custom>${src}</custom>`,
    };
    const engine = new JekyllEngine({ markdown: customRenderer });
    const output = await engine.liquidEngine.parseAndRender(
      '{{ "**bold**" | markdownify }}',
      {}
    );
    expect(output).toContain('<custom>');
  });
});
