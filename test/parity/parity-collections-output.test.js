import { JekyllEngine } from '../../src/engine.js';

// True-parity tests for Jekyll collection output behavior, grounded in
// Jekyll 4.3.2 source (lib/jekyll/site.rb, collection.rb, document.rb,
// publisher.rb):
//   - `output: false` is the DEFAULT; only `output: true` renders pages.
//   - documents are readable via site.<collection> regardless of output.

describe('PARITY -- collection output: true (documents get URLs and output pages)', () => {
  const vfs = {
    '_config.yml': 'collections:\n  projects:\n    output: true\n',
    '_projects/alpha.md': '---\ntitle: Alpha\n---\nAlpha body',
  };

  test('documents get URLs', () => {
    const engine = new JekyllEngine({ vfs });
    expect(engine._buildSiteContext().site.projects[0].url).toBe('/projects/alpha/');
  });

  test('build() renders the documents as pages', async () => {
    const engine = new JekyllEngine({ vfs });
    const results = await engine.build();
    const page = results.find((r) => r.path === '_projects/alpha.md');
    expect(page).toBeDefined();
    expect(page.content).toContain('Alpha body');
  });
});

describe('PARITY -- output: false (explicit)', () => {
  const vfs = {
    '_config.yml': 'collections:\n  projects:\n    output: false\n',
    '_projects/alpha.md': '---\ntitle: Alpha\n---\nAlpha body',
  };

  test('documents are still readable via site.<collection>', () => {
    const engine = new JekyllEngine({ vfs });
    const ctx = engine._buildSiteContext();
    expect(ctx.site.projects.length).toBe(1);
    expect(ctx.site.projects[0].title).toBe('Alpha');
  });

  test('build() does NOT render them as pages', async () => {
    const engine = new JekyllEngine({ vfs });
    const results = await engine.build();
    expect(results.find((r) => r.path === '_projects/alpha.md')).toBeUndefined();
  });
});

describe("PARITY -- omitted output key defaults to false (Jekyll's actual default)", () => {
  test('hash form without output key', async () => {
    const vfs = {
      '_config.yml': 'collections:\n  projects:\n',
      '_projects/alpha.md': '---\ntitle: Alpha\n---\nAlpha body',
    };
    const engine = new JekyllEngine({ vfs });
    expect(engine._buildSiteContext().site.projects.length).toBe(1);
    const results = await engine.build();
    expect(results.find((r) => r.path === '_projects/alpha.md')).toBeUndefined();
  });

  test('array form (normalizeCollectionsConfig gives {})', async () => {
    const vfs = {
      '_config.yml': 'collections:\n  - projects\n',
      '_projects/alpha.md': '---\ntitle: Alpha\n---\nAlpha body',
    };
    const engine = new JekyllEngine({ vfs });
    expect(engine._buildSiteContext().site.projects.length).toBe(1);
    const results = await engine.build();
    expect(results.find((r) => r.path === '_projects/alpha.md')).toBeUndefined();
  });
});
