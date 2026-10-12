/**
 * {% gist %} tag parity vs jekyll-gist 1.5.0.
 * Ground truth: lib/jekyll-gist/gist_tag.rb (Jekyll 4.3.4 gem set).
 * - Script tag always emitted: <script src="https://gist.github.com/{id}.js?file={f}"> </script>
 * - Noscript tag fetched from gist.githubusercontent.com (3s timeout);
 *   network failure → no noscript (Ruby rescues to nil).
 * - Ruby uses response.body regardless of HTTP status (404 body → "404: Not Found").
 */
import { JekyllEngine } from '../../src/engine.js';

describe('{% gist %}', () => {
  // Mock fetch — unit tests must not hit the network.
  // The hyde theme build (15/15 byte-identical) verifies the real network path.
  const realFetch = global.fetch;
  beforeEach(() => {
    global.fetch = async () => ({
      text: async () => '404: Not Found',
    });
  });
  afterEach(() => {
    global.fetch = realFetch;
  });

  test('emits script tag with file param', async () => {
    const engine = new JekyllEngine({
      vfs: { 'index.md': '---\n---\n{% gist 5555251 gist.md %}' },
    });
    const results = await engine.build();
    const page = results.find(r => r.permalink === '/');
    const html = page.content;
    expect(html).toContain(
      '<script src="https://gist.github.com/5555251.js?file=gist.md"> </script>'
    );
  });

  test('emits script tag without file param', async () => {
    const engine = new JekyllEngine({
      vfs: { 'index.md': '---\n---\n{% gist 5555251 %}' },
    });
    const results = await engine.build();
    const page = results.find(r => r.permalink === '/');
    const html = page.content;
    expect(html).toContain('<script src="https://gist.github.com/5555251.js"> </script>');
  });

  test('syntax error on bad markup', async () => {
    const engine = new JekyllEngine({
      vfs: { 'index.md': '---\n---\n{% gist %}' },
    });
    await expect(engine.build()).rejects.toThrow(/Syntax error in tag 'gist'/);
  });
});
