/**
 * site.pages read order + site.html_pages predicate (Jekyll 4.3.4 parity).
 *
 * reader.rb#read_directories reads depth-first with subdirectories BEFORE
 * the files of each directory (retrieve_dirs runs before retrieve_pages),
 * then sort_files! runs `site.pages.sort_by!(&:name)` — a basename sort
 * that is stable for ties (verified against CRuby: ties keep DFS order).
 *
 * SiteDrop#html_pages (drops/site_drop.rb:31-35) selects
 * `page.html? || page.url.end_with?("/")` where Page#html? is
 * `HTML_EXTENSIONS.include?(output_ext)` (page.rb:169-171) — output_ext is
 * the CONVERTER's extension, not the URL's. A page like 404.html with
 * `permalink: /404` is html (output .html) even though its URL ends in
 * neither ".html" nor "/".
 */
import { JekyllEngine } from '../../src/engine.js';

function buildEngine(vfs, config = 'title: T\npermalink: pretty\n') {
  return new JekyllEngine({
    vfs: { '_config.yml': config, ...vfs },
    logger: () => {},
  });
}

describe('site.pages read order (reader.rb)', () => {
  test('subdirectories read before sibling files; basename ties keep DFS order', async () => {
    const engine = buildEngine({
      'docs/navigation/index.md': '---\ntitle: Nav\n---\nNav',
      'docs/navigation/main/index.md': '---\ntitle: Main\n---\nMain',
      'index.md': '---\ntitle: H\n---\nH',
    });
    await engine.build();
    const paths = engine._buildSiteContext().site.pages.map((p) => p.path);
    // DFS: main/index.md is read before navigation/index.md (subdirs first);
    // the stable basename sort keeps that tie order.
    expect(paths.indexOf('docs/navigation/main/index.md')).toBeLessThan(
      paths.indexOf('docs/navigation/index.md')
    );
  });

  test('pages sort by basename (filename), not full path', async () => {
    const engine = buildEngine({
      'zebra.md': '---\ntitle: Z\n---\nZ',
      'apple.md': '---\ntitle: A\n---\nA',
    });
    await engine.build();
    const paths = engine._buildSiteContext().site.pages.map((p) => p.path);
    expect(paths.indexOf('apple.md')).toBeLessThan(paths.indexOf('zebra.md'));
  });
});

describe('site.html_pages (SiteDrop#html_pages)', () => {
  test('includes a permalink page like /404 (Page#html? via output_ext)', async () => {
    const engine = buildEngine({
      '404.html': '---\npermalink: /404\ntitle: N\n---\nN',
      'index.md': '---\ntitle: H\n---\nH',
    });
    await engine.build();
    const urls = engine._buildSiteContext().site.html_pages.map((p) => p.url);
    expect(urls).toContain('/404');
  });

  test('excludes non-HTML pages (xml/txt output)', async () => {
    const engine = buildEngine({
      'feed.xml': '---\npermalink: /feed.xml\n---\n<xml/>',
      'robots.txt': '---\npermalink: /robots.txt\n---\nUser-agent',
      'index.md': '---\ntitle: H\n---\nH',
    });
    await engine.build();
    const urls = engine._buildSiteContext().site.html_pages.map((p) => p.url);
    expect(urls).not.toContain('/feed.xml');
    expect(urls).not.toContain('/robots.txt');
    expect(urls).toContain('/');
  });

  test('an .md page with a non-html permalink is NOT html (renderer.rb permalink_ext)', async () => {
    // Renderer#output_ext = permalink_ext || converter_output_ext
    // (renderer.rb:45-47): index.md + `permalink: /data.json` -> .json.
    const engine = buildEngine({
      'index.md': '---\ntitle: Home\npermalink: /data.json\n---\n{}',
    });
    await engine.build();
    const urls = engine._buildSiteContext().site.html_pages.map((p) => p.url);
    expect(urls).not.toContain('/data.json');
  });
});
