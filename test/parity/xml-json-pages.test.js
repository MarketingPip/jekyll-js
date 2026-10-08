/**
 * test/parity/xml-json-pages.test.js
 * ---------------------------------------------------------------------------
 * .xml and .json files WITH front matter are rendered as pages (Liquid
 * processed), keeping their extension in the output permalink.
 *
 * Real Jekyll (document.rb, convertible.rb): any file with a YAML front
 * matter block is convertible regardless of extension (a theme's
 * `atom.xml` / `feed.xml` / `search.json` / `site.webmanifest` ship with
 * `---` front matter and go through Liquid, not markdown conversion).
 *
 * Found via full-theme testing: hyde's atom.xml, beautiful-jekyll's
 * feed.xml + searchcorpus.json, and chirpy's feed.xml + search.json +
 * site.webmanifest were all missing from build() output — they fell
 * through the page classifier into the static-file branch (and were
 * then never emitted, see static-files-emitted.test.js).
 */

import { JekyllEngine } from '../../src/engine.js';

describe('.xml/.json files with front matter are rendered as pages', () => {
  test('feed.xml renders Liquid and keeps its extension', async () => {
    const engine = new JekyllEngine({
      vfs: {
        '_config.yml': 'title: My Site\n',
        'feed.xml': '---\nlayout: null\n---\n<feed>{{ site.title }}</feed>',
      },
      logger: () => {},
    });
    const results = await engine.build();
    const feed = results.find((r) => r.permalink === '/feed.xml');
    expect(feed).toBeDefined();
    expect(feed.content).toContain('<feed>My Site</feed>');
    // No markdown conversion should run on xml files
    expect(feed.path).toBe('feed.xml');
  });

  test('search.json renders Liquid and keeps its extension', async () => {
    const engine = new JekyllEngine({
      vfs: {
        '_config.yml': 'title: My Site\n',
        'search.json': '---\n---\n{"q": "{{ site.title }}"}',
      },
      logger: () => {},
    });
    const results = await engine.build();
    const json = results.find((r) => r.permalink === '/search.json');
    expect(json).toBeDefined();
    expect(json.content).toContain('{"q": "My Site"}');
    expect(json.path).toBe('search.json');
  });

  test('.xml without front matter stays a static file, not a page', async () => {
    const engine = new JekyllEngine({
      vfs: {
        'data.xml': '<raw>no front matter</raw>',
      },
      logger: () => {},
    });
    const results = await engine.build();
    // Emitted verbatim (static file), but NOT Liquid-rendered as a page
    const entry = results.find((r) => r.path === 'data.xml');
    expect(entry).toBeDefined();
    expect(entry.content).toBe('<raw>no front matter</raw>');
    expect(entry.permalink).toBe('/data.xml');
    expect(entry.data).toEqual({});
  });
});
