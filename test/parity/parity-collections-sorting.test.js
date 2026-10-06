import { JekyllEngine } from '../../engine.js';

// True-parity tests grounded in Jekyll 4.3.2 source:
//   Collection#read -> sort_docs! -> Document#<=> : date ASCENDING,
//     tie-break by path. (Posts are newest-first; custom collections are
//     oldest-first -- a real, documented asymmetry.)
//   Document#date: front matter -> filename (DATE_FILENAME_MATCHER) ->
//     site.time fallback.
//   Collection#read_document: `docs << doc if site.unpublished ||
//     doc.published?` -- published:false excluded at READ time.
//   PostReader#read_publishable -> Publisher#publish?: posts exclude
//     published:false AND future-dated (unless `future: true`).
//   Collection docs: future docs STAY readable (read phase) but are not
//     WRITTEN (Document#write? -> publisher).

describe('PARITY -- collection documents sort oldest-first by date (Document#<=>)', () => {
  const vfs = {
    '_config.yml': 'collections:\n  projects:\n    output: true\n',
    '_projects/2026-03-01-c.md': '---\ntitle: C\n---\nC',
    '_projects/2026-01-01-a.md': '---\ntitle: A\n---\nA',
    '_projects/2026-02-01-b.md': '---\ntitle: B\n---\nB',
  };

  test('insertion order is NOT preserved; date ascending wins', () => {
    const engine = new JekyllEngine({ vfs });
    const titles = engine._buildSiteContext().site.projects.map((p) => p.title);
    expect(titles).toEqual(['A', 'B', 'C']);
  });

  test('filename dates are picked up (Jekyll DATE_FILENAME_MATCHER)', () => {
    const engine = new JekyllEngine({ vfs });
    const a = engine._buildSiteContext().site.projects.find((p) => p.title === 'A');
    expect(new Date(a.date).toISOString().slice(0, 10)).toBe('2026-01-01');
  });

  test('front-matter date wins over the filename date', () => {
    const vfs2 = {
      '_config.yml': 'collections:\n  projects:\n    output: true\n',
      '_projects/2026-03-01-x.md': '---\ntitle: X\ndate: 2026-01-15\n---\nX',
      '_projects/2026-02-01-y.md': '---\ntitle: Y\n---\nY',
    };
    const engine = new JekyllEngine({ vfs: vfs2 });
    const ctx = engine._buildSiteContext();
    expect(ctx.site.projects.map((p) => p.title)).toEqual(['X', 'Y']);
    expect(new Date(ctx.site.projects[0].date).toISOString().slice(0, 10)).toBe('2026-01-15');
  });

  test('equal dates tie-break by path', () => {
    const vfs2 = {
      '_config.yml': 'collections:\n  projects:\n    output: true\n',
      '_projects/b.md': '---\ntitle: B\ndate: 2026-05-01\n---\nB',
      '_projects/a.md': '---\ntitle: A\ndate: 2026-05-01\n---\nA',
    };
    const engine = new JekyllEngine({ vfs: vfs2 });
    const titles = engine._buildSiteContext().site.projects.map((p) => p.title);
    expect(titles).toEqual(['A', 'B']);
  });
});

describe('PARITY -- published: false excludes at read time (all collections)', () => {
  test('unpublished collection documents vanish from site.<collection>', () => {
    const vfs = {
      '_config.yml': 'collections:\n  projects:\n    output: true\n',
      '_projects/alpha.md': '---\ntitle: Alpha\n---\nAlpha',
      '_projects/beta.md': '---\ntitle: Beta\npublished: false\n---\nBeta',
    };
    const engine = new JekyllEngine({ vfs });
    const titles = engine._buildSiteContext().site.projects.map((p) => p.title);
    expect(titles).toEqual(['Alpha']);
  });

  test('unpublished posts vanish from site.posts too', () => {
    const vfs = {
      '_config.yml': 'title: Test\n',
      '_posts/2026-01-01-a.md': '---\ntitle: A\n---\nA',
      '_posts/2026-01-02-b.md': '---\ntitle: B\npublished: false\n---\nB',
    };
    const engine = new JekyllEngine({ vfs });
    const titles = engine._buildSiteContext().site.posts.map((p) => p.title);
    expect(titles).toEqual(['A']);
  });

  test('unpublished documents are not rendered by build() either', async () => {
    const vfs = {
      '_config.yml': 'collections:\n  projects:\n    output: true\n',
      '_projects/beta.md': '---\ntitle: Beta\npublished: false\n---\nBeta',
    };
    const engine = new JekyllEngine({ vfs });
    const results = await engine.build();
    expect(results.find((r) => r.path === '_projects/beta.md')).toBeUndefined();
  });
});

describe('PARITY -- future-dated documents (Jekyll Publisher)', () => {
  test('future posts are excluded from site.posts by default', () => {
    const vfs = {
      '_config.yml': 'title: Test\n',
      '_posts/2026-01-01-a.md': '---\ntitle: A\n---\nA',
      '_posts/2030-01-01-future.md': '---\ntitle: Future\n---\nFuture',
    };
    const engine = new JekyllEngine({ vfs });
    const titles = engine._buildSiteContext().site.posts.map((p) => p.title);
    expect(titles).toEqual(['A']);
  });

  test('future: true keeps future posts in site.posts', () => {
    const vfs = {
      '_config.yml': 'title: Test\nfuture: true\n',
      '_posts/2026-01-01-a.md': '---\ntitle: A\n---\nA',
      '_posts/2030-01-01-future.md': '---\ntitle: Future\n---\nFuture',
    };
    const engine = new JekyllEngine({ vfs });
    const titles = engine._buildSiteContext().site.posts.map((p) => p.title);
    expect(titles).toContain('Future');
  });

  test('future collection docs STAY readable (Jekyll reads them, just never writes them)', () => {
    const vfs = {
      '_config.yml': 'collections:\n  projects:\n    output: true\n',
      '_projects/2030-01-01-f.md': '---\ntitle: F\n---\nF',
    };
    const engine = new JekyllEngine({ vfs });
    const titles = engine._buildSiteContext().site.projects.map((p) => p.title);
    expect(titles).toEqual(['F']);
  });

  test('future collection docs are NOT rendered by build() by default', async () => {
    const vfs = {
      '_config.yml': 'collections:\n  projects:\n    output: true\n',
      '_projects/2030-01-01-f.md': '---\ntitle: F\n---\nF',
    };
    const engine = new JekyllEngine({ vfs });
    const results = await engine.build();
    expect(results.find((r) => r.path === '_projects/2030-01-01-f.md')).toBeUndefined();
  });

  test('future: true renders future collection docs', async () => {
    const vfs = {
      '_config.yml': 'collections:\n  projects:\n    output: true\nfuture: true\n',
      '_projects/2030-01-01-f.md': '---\ntitle: F\n---\nF',
    };
    const engine = new JekyllEngine({ vfs });
    const results = await engine.build();
    expect(results.find((r) => r.path === '_projects/2030-01-01-f.md')).toBeDefined();
  });
});

describe('PARITY -- drafts (_drafts/, show_drafts)', () => {
  const draftVfs = {
    '_config.yml': 'title: Test\n',
    '_posts/2026-01-01-a.md': '---\ntitle: A\n---\nA',
    '_drafts/2026-01-02-d.md': '---\ntitle: D\n---\nD',
  };

  test('_drafts are excluded from site.posts by default', () => {
    const engine = new JekyllEngine({ vfs: draftVfs });
    const titles = engine._buildSiteContext().site.posts.map((p) => p.title);
    expect(titles).toEqual(['A']);
  });

  test('show_drafts: true includes _drafts as posts', () => {
    const vfs = {
      '_config.yml': 'title: Test\nshow_drafts: true\n',
      '_posts/2026-01-01-a.md': '---\ntitle: A\n---\nA',
      '_drafts/2026-01-02-d.md': '---\ntitle: D\n---\nD',
    };
    const engine = new JekyllEngine({ vfs });
    const titles = engine._buildSiteContext().site.posts.map((p) => p.title);
    expect(titles).toContain('D');
  });
});
