/**
 * Programmatic VFS API: build sites with JS calls (writeFile/readFile/
 * removeFile/listFiles) instead of a pre-built vfs JSON object.
 */
import { JekyllEngine } from '../../src/engine.js';

function makeSite() {
  const engine = new JekyllEngine();
  engine.writeFile('_config.yml', 'title: "JS API"\n');
  engine.writeFile('_layouts/default.html', '<html><body>{{ content }}</body></html>');
  engine.writeFile('index.md', '---\nlayout: default\ntitle: Home\n---\n# Hi\n');
  return engine;
}

describe('programmatic VFS API', () => {
  test('writeFile accumulates files and build() renders them', async () => {
    const pages = await makeSite().build();
    expect(pages.some((p) => p.permalink === '/' && p.content.includes('<h1>Hi</h1>'))).toBe(true);
  });

  test('writeFile overwrites an existing file', async () => {
    const engine = makeSite();
    engine.writeFile('index.md', '---\nlayout: default\ntitle: Home\n---\n# Changed\n');
    const pages = await engine.build();
    expect(pages.find((p) => p.permalink === '/').content).toContain('<h1>Changed</h1>');
  });

  test('readFile returns content, undefined for missing files', () => {
    const engine = makeSite();
    expect(engine.readFile('index.md')).toContain('# Hi');
    expect(engine.readFile('nope.md')).toBeUndefined();
  });

  test('removeFile drops the file from the next build', async () => {
    const engine = makeSite();
    engine.writeFile('about.md', '---\ntitle: About\n---\nAbout\n');
    expect((await engine.build()).some((p) => p.permalink === '/about/')).toBe(true);
    engine.removeFile('about.md');
    expect((await engine.build()).some((p) => p.permalink === '/about/')).toBe(false);
  });

  test('listFiles reflects writes and removals', () => {
    const engine = makeSite();
    expect(engine.listFiles()).toEqual(
      expect.arrayContaining(['_config.yml', '_layouts/default.html', 'index.md'])
    );
    engine.writeFile('extra.md', 'x');
    expect(engine.listFiles()).toContain('extra.md');
    engine.removeFile('extra.md');
    expect(engine.listFiles()).not.toContain('extra.md');
  });

  test('methods are chainable', () => {
    const engine = new JekyllEngine()
      .writeFile('a.md', 'a')
      .writeFile('b.md', 'b')
      .removeFile('a.md');
    expect(engine.listFiles()).toEqual(['b.md']);
  });

  test('writeFile re-ingests config (not just the file map)', async () => {
    // Changing _config.yml after construction must take effect —
    // writeFile re-runs ingestion, it doesn't just patch the map.
    const engine = new JekyllEngine();
    engine.writeFile('_config.yml', 'title: "First Title"\n');
    engine.writeFile('index.md', '---\ntitle: Home\n---\n{{ site.title }}\n');
    expect((await engine.build()).find((p) => p.permalink === '/').content).toContain('First Title');
    engine.writeFile('_config.yml', 'title: "Changed Title"\n');
    const pages = await engine.build();
    expect(pages.find((p) => p.permalink === '/').content).toContain('Changed Title');
  });
});
