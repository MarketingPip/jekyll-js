/**
 * Fluent builder API + lifecycle events + static render.
 * Cherry-picked from external review; adapted to our tested engine.
 */
import { JekyllEngine } from '../../src/engine.js';

describe('fluent builder', () => {
  test('addLayout/addPage/setConfig chain builds a site', async () => {
    const engine = new JekyllEngine();
    const pages = await engine
      .setConfig({ title: 'Builder Site' })
      .addLayout('default.html', '<html><body>{{ content }}</body></html>')
      .addPage('index.md', '---\nlayout: default.html\n---\n# {{ site.title }}')
      .build();
    expect(pages).toHaveLength(1);
    expect(pages[0].content).toContain('<html>');
    expect(pages[0].content).toContain('Builder Site');
  });

  test('addData/addInclude/addCollection work', async () => {
    const engine = new JekyllEngine();
    const pages = await engine
      .addData('authors', { alice: { name: 'Alice' } })
      .addInclude('hi.html', 'Hi {{ site.data.authors.alice.name }}')
      .addCollection('notes', [
        { path: '_notes/a.md', content: '---\ntitle: A\n---\n{% include "hi.html" %}' },
      ])
      .addPage('index.md', '---\ntitle: H\n---\nHome')
      .build();
    // Collection without output:true should not render, but data/include work
    const index = pages.find((p) => p.permalink === '/');
    expect(index).toBeDefined();
  });

  test('setConfig accepts YAML string', async () => {
    const engine = new JekyllEngine();
    engine.setConfig('title: YAML Title');
    expect(engine._config.title).toBe('YAML Title');
  });
});

describe('lifecycle events', () => {
  test('pre:build and post:build fire', async () => {
    const events = [];
    const engine = new JekyllEngine({
      vfs: { 'index.md': '---\ntitle: H\n---\nHi' },
    });
    engine.on('pre:build', () => events.push('pre:build'));
    engine.on('post:build', (results) => events.push(`post:build:${results.length}`));
    await engine.build();
    expect(events).toEqual(['pre:build', 'post:build:1']);
  });

  test('pre:render and post:render fire per page', async () => {
    const events = [];
    const engine = new JekyllEngine({
      vfs: {
        'index.md': '---\ntitle: H\n---\nHi',
        'about.md': '---\ntitle: A\n---\nAbout',
      },
    });
    engine.on('pre:render', ({ path }) => events.push(`pre:${path}`));
    engine.on('post:render', (result) => events.push(`post:${result.path}`));
    await engine.build();
    expect(events).toContain('pre:index.md');
    expect(events).toContain('post:index.md');
    expect(events).toContain('pre:about.md');
    expect(events).toContain('post:about.md');
  });
});

describe('static render', () => {
  test('JekyllEngine.render(vfs) one-shot', async () => {
    const pages = await JekyllEngine.render({
      '_config.yml': 'title: Static',
      'index.md': '---\ntitle: H\n---\n# {{ site.title }}',
    });
    expect(pages).toHaveLength(1);
    expect(pages[0].content).toContain('Static');
  });
});
