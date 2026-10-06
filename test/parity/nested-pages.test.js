/**
 * Nested pages (Jekyll parity).
 * Real Jekyll renders any .md/.html file as a page, regardless of nesting.
 * Previously only top-level files were rendered.
 */
import { JekyllEngine } from '../../src/engine.js';

describe('nested pages', () => {
  test('renders docs/intro.md', async () => {
    const engine = new JekyllEngine({
      vfs: {
        'index.md': '---\ntitle: Home\n---\nHome',
        'docs/intro.md': '---\ntitle: Intro\n---\nIntro content',
      },
    });
    const pages = await engine.build();
    const permalinks = pages.map((p) => p.permalink);
    expect(permalinks).toContain('/');
    expect(permalinks).toContain('/docs/intro/');
    const intro = pages.find((p) => p.permalink === '/docs/intro/');
    expect(intro.content).toContain('Intro content');
  });

  test('renders deeply nested pages', async () => {
    const engine = new JekyllEngine({
      vfs: {
        'index.md': '---\ntitle: H\n---\nH',
        'docs/guide/advanced.md': '---\ntitle: Adv\n---\nAdvanced content',
      },
    });
    const pages = await engine.build();
    const adv = pages.find((p) => p.permalink === '/docs/guide/advanced/');
    expect(adv).toBeDefined();
    expect(adv.content).toContain('Advanced content');
  });

  test('nested index.html gets directory permalink', async () => {
    const engine = new JekyllEngine({
      vfs: {
        'index.md': '---\ntitle: H\n---\nH',
        'docs/index.html': '---\ntitle: Docs\n---\nDocs home',
      },
    });
    const pages = await engine.build();
    const docs = pages.find((p) => p.permalink === '/docs/');
    expect(docs).toBeDefined();
    expect(docs.content).toContain('Docs home');
  });
});
