/**
 * JS Plugin API (driven by the exhibits-pagination use case).
 *
 * An AI agent (or human) should be able to write a Jekyll plugin in JS
 * as naturally as the Ruby original. This test ports the core of a
 * real-world pagination plugin:
 *   - Jekyll::Hooks.register :site, :post_read
 *   - site.collections['exhibits'].docs
 *   - site.config['paginate']
 *   - Custom Page creation, page.data, site.pages <<
 *   - Jekyll::Hooks.trigger :pages, :post_init
 *   - Jekyll::Utils.slugify
 */
import { JekyllEngine } from '../../src/engine.js';

// Simplified port of the exhibits pagination plugin.
// Generates /exhibits/categories/<slug>/ index pages.
function exhibitsPaginationPlugin(engine) {
  engine.registerHook('site', 'post_read', (site) => {
    const collection = site.collections['exhibits'];
    if (!collection) return;

    const docs = [...collection.docs].sort((a, b) => b.date - a.date);
    const perPage = site.config.paginate || 10;

    if (!engine.fileExists('_layouts/category.html')) {
      engine.logger.warn('Exhibits Pagination: template not found');
      return;
    }

    const categoryCounts = {};
    docs.forEach((doc) => {
      (doc.data.categories || []).forEach((c) => {
        categoryCounts[c] = (categoryCounts[c] || 0) + 1;
      });
    });

    Object.keys(categoryCounts).sort().forEach((category) => {
      const page = engine.createPage({
        dir: `exhibits/categories/${engine.utils.slugify(category)}`,
        name: 'index.html',
        layout: 'category',
      });
      page.data.title = `Exhibits in category '${category}'`;
      page.data.category = { name: category, count: categoryCounts[category] };
      page.data.paginator = {
        page: 1,
        per_page: perPage,
        total_posts: categoryCounts[category],
      };

      engine.triggerHook('pages', 'post_init', page);
      site.pages.push(page);
    });
  });
}

describe('JS plugin API', () => {
  test('hook generates category pages from collection', async () => {
    const engine = new JekyllEngine({
      vfs: {
        '_config.yml': 'paginate: 2\ncollections:\n  exhibits:\n    output: true\n',
        '_layouts/category.html': '<h1>{{ page.title }}</h1>{{ page.category.name }} ({{ page.category.count }})',
        '_exhibits/a.md': '---\ntitle: A\ncategories: [art, history]\n---\nA',
        '_exhibits/b.md': '---\ntitle: B\ncategories: [art]\n---\nB',
        '_exhibits/c.md': '---\ntitle: C\ncategories: [science]\n---\nC',
        'index.md': '---\ntitle: Home\n---\nHome',
      },
    });

    engine.use(exhibitsPaginationPlugin);
    const pages = await engine.build();

    const permalinks = pages.map((p) => p.permalink);
    // art, history, science -> 3 category pages
    expect(permalinks).toContain('/exhibits/categories/art/');
    expect(permalinks).toContain('/exhibits/categories/history/');
    expect(permalinks).toContain('/exhibits/categories/science/');

    const artPage = pages.find((p) => p.permalink === '/exhibits/categories/art/');
    expect(artPage.content).toContain("Exhibits in category 'art'");
    expect(artPage.content).toContain('art (2)');
  });

  test('registerTag and registerFilter work', async () => {
    const engine = new JekyllEngine({
      vfs: {
        'index.md': '---\ntitle: Home\n---\n{% shout "hello" %} {{ "abc" | reverse }}',
      },
    });
    engine.registerTag('shout', (text) => text.toUpperCase() + '!');
    engine.registerFilter('reverse', (s) => [...s].reverse().join(''));
    const pages = await engine.build();
    expect(pages[0].content).toContain('HELLO!');
    expect(pages[0].content).toContain('cba');
  });

  test('registerGenerator runs and can add pages', async () => {
    const engine = new JekyllEngine({
      vfs: {
        'index.md': '---\ntitle: Home\n---\nHome',
      },
    });
    engine.registerGenerator((site) => {
      const page = engine.createPage({
        dir: 'generated',
        name: 'index.html',
        content: '# Generated',
      });
      site.pages.push(page);
    });
    const pages = await engine.build();
    const permalinks = pages.map((p) => p.permalink);
    expect(permalinks).toContain('/generated/');
  });
});
