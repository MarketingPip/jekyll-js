/**
 * test/parity/no-frontmatter.test.js
 * ---------------------------------------------------------------------------
 * Files without front matter are static files, not pages.
 *
 * Real Jekyll (reader.rb, entry_filter.rb): only files WITH a YAML front
 * matter block (starting with `---`) are processed as convertible documents.
 * A .md file without front matter is copied as-is as a static file.
 *
 * This was found via theme testing: minimal-mistakes' CHANGELOG.md (no
 * front matter) was being processed through Liquid, causing a parse error
 * from a `{% highlight %}` code span in the changelog text.
 */

import { JekyllEngine } from '../../src/engine.js';

describe('files without front matter', () => {
  test('.md without front matter is a static file, not a page', async () => {
    const engine = new JekyllEngine({
      vfs: {
        'index.md': '---\ntitle: Home\n---\n# Home',
        'CHANGELOG.md': '# Changelog\n\n## 1.0.0\n\nSome changes.',
      },
    });
    const pages = await engine.build();
    // index.md should be a page
    const index = pages.find((p) => p.path === 'index.html' || p.permalink === '/');
    expect(index).toBeDefined();
    // CHANGELOG.md should NOT be a page (no front matter)
    const changelog = pages.find((p) => p.path.includes('CHANGELOG'));
    expect(changelog).toBeUndefined();
  });

  test('.md with empty front matter is still a page', async () => {
    const engine = new JekyllEngine({
      vfs: {
        'about.md': '---\n---\n# About',
      },
    });
    const pages = await engine.build();
    const about = pages.find((p) => p.path.includes('about'));
    expect(about).toBeDefined();
  });
});
