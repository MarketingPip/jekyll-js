import {
  slugify,
  computeRelativeUrl,
  computeAbsoluteUrl,
  stripIndex,
  generatePermalink,
  getPostCategories,
  getPostTags,
  parsePostFilename,
} from '../engine.js';

describe('slugify (permalink helper)', () => {
  // FIX regression test: original used `\w` and kept underscores
  test('hyphenates underscores, not just whitespace/punctuation', () => {
    expect(slugify('My_Title')).toBe('my-title');
  });

  test('trims leading/trailing hyphens', () => {
    expect(slugify('  Hello World!  ')).toBe('hello-world');
  });
});

describe('computeRelativeUrl (FIX #7)', () => {
  test('prepends baseurl with leading slash', () => {
    expect(computeRelativeUrl('/about/', { baseurl: '/blog' })).toBe('/blog/about/');
  });

  test('chomps a trailing slash from baseurl', () => {
    expect(computeRelativeUrl('/about/', { baseurl: '/blog/' })).toBe('/blog/about/');
  });

  test('passes through an already-absolute URL unchanged -- the original bug', () => {
    // The original `(this._config.baseurl || "") + url` would have
    // mangled this into "/blogged-http://example.com/x" or similar.
    expect(computeRelativeUrl('http://example.com/x', { baseurl: '/blog' })).toBe(
      'http://example.com/x'
    );
  });

  test('works with no baseurl configured', () => {
    expect(computeRelativeUrl('/about/', {})).toBe('/about/');
  });
});

describe('computeAbsoluteUrl (FIX #7 -- filter did not exist at all before)', () => {
  test('combines site.url + baseurl + input', () => {
    expect(computeAbsoluteUrl('/about/', { url: 'http://example.com', baseurl: '/blog' })).toBe(
      'http://example.com/blog/about/'
    );
  });

  test('falls back to relative when site.url is unset', () => {
    expect(computeAbsoluteUrl('/about/', {})).toBe('/about/');
  });

  test('returns already-absolute input unchanged', () => {
    expect(computeAbsoluteUrl('http://other.com/x', { url: 'http://example.com' })).toBe(
      'http://other.com/x'
    );
  });
});

describe('stripIndex (FIX #7 -- did not exist before)', () => {
  test('strips a trailing /index.html', () => {
    expect(stripIndex('/foo/index.html')).toBe('/foo/');
  });

  test('leaves other URLs alone', () => {
    expect(stripIndex('/foo/bar/')).toBe('/foo/bar/');
  });
});

describe('parsePostFilename', () => {
  test('extracts date and slug from a standard Jekyll post filename', () => {
    expect(parsePostFilename('2026-06-20-getting-started.md')).toEqual({
      date: '2026-06-20',
      slug: 'getting started',
    });
  });
});

describe('generatePermalink (FIX #4 -- :title placeholder precedence)', () => {
  test(':title comes from the filename-derived slug, not front-matter title', () => {
    const frontMatter = { title: 'Getting Started with the Compiler', categories: [], tags: [] };
    const permalink = generatePermalink(frontMatter, 'getting started', '2026-06-20', {
      permalink: '/blog/:title/',
    });
    expect(permalink).toBe('/blog/getting-started/');
    expect(permalink).not.toContain('with-the-compiler');
  });

  test('an explicit front-matter `slug` still overrides everything', () => {
    const frontMatter = { title: 'Whatever', slug: 'custom-slug', categories: [], tags: [] };
    const permalink = generatePermalink(frontMatter, 'filename-slug', '2026-06-20', {
      permalink: '/blog/:title/',
    });
    expect(permalink).toBe('/blog/custom-slug/');
  });

  test('an explicit front-matter `permalink` wins over everything else', () => {
    const frontMatter = { title: 'X', permalink: '/custom/path/' };
    expect(generatePermalink(frontMatter, 'x', '2026-06-20', { permalink: '/blog/:title/' })).toBe(
      '/custom/path/'
    );
  });

  test('the "pretty" preset expands to the full date-based pattern', () => {
    const frontMatter = { title: 'Hello World', categories: [], tags: [] };
    const permalink = generatePermalink(frontMatter, 'hello-world', '2026-06-20', {
      permalink: 'pretty',
    });
    expect(permalink).toBe('/2026/06/20/hello-world/');
  });

  test('collapses an empty :categories segment instead of leaving a double slash', () => {
    const frontMatter = { title: 'No Cats', categories: [], tags: [] };
    const permalink = generatePermalink(frontMatter, 'no-cats', '2026-06-20', {
      permalink: 'pretty',
    });
    expect(permalink).not.toMatch(/\/\//);
  });
});

describe('getPostCategories / getPostTags', () => {
  test('normalizes a space-separated tags string into an array', () => {
    expect(getPostTags({ tags: 'a b c' })).toEqual(['a', 'b', 'c']);
  });

  test('deduplicates tags', () => {
    expect(getPostTags({ tag: 'a', tags: ['a', 'b'] })).toEqual(['a', 'b']);
  });

  test('does not pick up a spurious category from a top-level _posts path', () => {
    expect(getPostCategories({}, '_posts/2026-06-20-x.md')).toEqual([]);
  });

  test('picks up directory-based categories above _posts', () => {
    expect(getPostCategories({}, 'tutorials/_posts/2026-06-20-x.md')).toEqual(['tutorials']);
  });
});
