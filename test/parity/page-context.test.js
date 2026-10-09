/**
 * page.* context gaps (Jekyll parity).
 *
 * Full-theme testing found the page context missing several fields that
 * real Jekyll's DocumentDrop/PageDrop expose and themes rely on:
 *  - page.content  (beautiful-jekyll meta descriptions:
 *    `{{ page.content | strip_html | truncatewords: 50 }}`)
 *  - page.id       (og tags; minimal-mistakes related posts)
 *  - page.next / page.previous (beautiful-jekyll prev/next post nav)
 *  - page.collection ("posts" for posts; chirpy archive/tag headings)
 *
 * Ground truth: jekyllrb.com/docs/variables/ + real Jekyll 4.3.4 output
 * (Document#id, Document#next_doc/#previous_doc, DocumentDrop#collection
 * in jekyll/lib/jekyll/{document.rb,drops/document_drop.rb}).
 * In Jekyll, a DOCUMENT's page.content is the rendered body
 * (post-conversion, pre-layout) via the live DocumentDrop
 * (document.rb:318-320; renderer.rb:85 overwrites Document#content before
 * any page template runs). A REGULAR PAGE's own page.content is instead
 * the RAW body: Renderer#run snapshots the page via Convertible#to_liquid
 * (a plain Hash) in assign_pages! BEFORE render_document
 * (renderer.rb:52-65, convertible.rb:114-121). Verified with the native
 * oracle (jekyll 4.3.4): layout 'WRAP({{ content }}|{{ page.content |
 * strip }})' renders a post as 'WRAP(<p>...</p>|<p>...</p>)' but a page as
 * 'WRAP(<p>...</p>|Hello *world*.\n\n{% assign x = 5 %}Raw check {{ x }}.)'.
 * (theme-verify/beautiful-jekyll/REPORT.md S4: real tags/index.html meta
 * descriptions contain the raw {% assign %} Liquid source.)
 * page.next is the NEWER post, page.previous the OLDER one;
 * regular pages expose none of id/next/previous/collection (all nil).
 */
import { JekyllEngine } from '../../src/engine.js';

const POSTS_VFS = {
  '_posts/2026-01-01-first.md':
    '---\ntitle: First Post\n---\nID=[{{ page.id }}]\nNEXT=[{{ page.next.title }}]\nPREV=[{{ page.previous.title }}]\nCOLL=[{{ page.collection }}]',
  '_posts/2026-01-02-second.md':
    '---\ntitle: Second Post\n---\nID=[{{ page.id }}]\nNEXT=[{{ page.next.title }}]\nPREV=[{{ page.previous.title }}]\nCOLL=[{{ page.collection }}]',
  '_posts/2026-01-03-third.md':
    '---\ntitle: Third Post\n---\nID=[{{ page.id }}]\nNEXT=[{{ page.next.title }}]\nPREV=[{{ page.previous.title }}]\nCOLL=[{{ page.collection }}]',
};

function buildEngine(vfs) {
  return new JekyllEngine({ vfs, logger: () => {} });
}

describe('page context (theme parity)', () => {
  test("a post's page.content exposes the rendered body to layouts", async () => {
    const engine = buildEngine({
      '_layouts/default.html': 'PAGECONTENT=[{{ page.content | strip }}]',
      '_posts/2026-01-01-hello.md':
        '---\nlayout: default\ntitle: Hello\n---\nAbout *body* here.',
    });
    const pages = await engine.build();
    const post = pages.find((p) => p.path === '_posts/2026-01-01-hello.md');
    expect(post.content).toContain('PAGECONTENT=[<p>About <em>body</em> here.</p>]');
  });

  test("a regular page's own page.content is the raw body (S4, oracle-verified)", async () => {
    const engine = buildEngine({
      '_layouts/default.html': 'PAGECONTENT=[{{ page.content | strip }}]',
      'about.md': '---\nlayout: default\ntitle: About\n---\nAbout *body* here.',
    });
    const pages = await engine.build();
    const about = pages.find((p) => p.permalink === '/about.html');
    expect(about.content).toContain('PAGECONTENT=[About *body* here.]');
  });

  test('page.content is empty during the page’s own body render (matches Jekyll)', async () => {
    const engine = buildEngine({
      'p.md': '---\ntitle: P\n---\nSELF=[{{ page.content }}]',
    });
    const pages = await engine.build();
    const p = pages.find((page) => page.permalink === '/p.html');
    expect(p.content).toContain('SELF=[]');
  });

  test('post exposes page.id, page.collection, page.next, page.previous', async () => {
    const engine = buildEngine({ ...POSTS_VFS });
    const pages = await engine.build();
    const second = pages.find((p) => p.path === '_posts/2026-01-02-second.md');
    expect(second.content).toContain('ID=[/2026/01/02/second]');
    expect(second.content).toContain('COLL=[posts]');
    // next = newer post, previous = older post (Jekyll semantics)
    expect(second.content).toContain('NEXT=[Third Post]');
    expect(second.content).toContain('PREV=[First Post]');
  });

  test('newest post has no next; oldest post has no previous', async () => {
    const engine = buildEngine({ ...POSTS_VFS });
    const pages = await engine.build();
    const third = pages.find((p) => p.path === '_posts/2026-01-03-third.md');
    expect(third.content).toContain('NEXT=[]');
    expect(third.content).toContain('PREV=[Second Post]');
    const first = pages.find((p) => p.path === '_posts/2026-01-01-first.md');
    expect(first.content).toContain('NEXT=[Second Post]');
    expect(first.content).toContain('PREV=[]');
  });

  test('page.next/previous expose full post drops (url, id)', async () => {
    const engine = buildEngine({
      '_posts/2026-01-01-first.md': '---\ntitle: First Post\n---\nX',
      '_posts/2026-01-02-second.md':
        '---\ntitle: Second Post\n---\nNURL=[{{ page.next.url }}] NID=[{{ page.next.id }}] PURL=[{{ page.previous.url }}] PID=[{{ page.previous.id }}]',
      '_posts/2026-01-03-third.md': '---\ntitle: Third Post\n---\nX',
    });
    const pages = await engine.build();
    const second = pages.find((p) => p.path === '_posts/2026-01-02-second.md');
    expect(second.content).toContain('NURL=[/2026/01/03/third.html]');
    expect(second.content).toContain('NID=[/2026/01/03/third]');
    expect(second.content).toContain('PURL=[/2026/01/01/first.html]');
    expect(second.content).toContain('PID=[/2026/01/01/first]');
  });

  test('regular pages expose no id/next/previous/collection', async () => {
    const engine = buildEngine({
      'about.md':
        '---\ntitle: About\n---\nID=[{{ page.id }}] NEXT=[{{ page.next.title }}] PREV=[{{ page.previous.title }}] COLL=[{{ page.collection }}]',
    });
    const pages = await engine.build();
    const about = pages.find((p) => p.permalink === '/about.html');
    expect(about.content).toContain('ID=[] NEXT=[] PREV=[] COLL=[]');
  });

  test('{{ content }} in layouts still works (regression)', async () => {
    const engine = buildEngine({
      '_layouts/default.html': 'WRAP({{ content }}|{{ page.content | strip }})',
      'about.md': '---\nlayout: default\ntitle: About\n---\nHello *world*.',
    });
    const pages = await engine.build();
    const about = pages.find((p) => p.permalink === '/about.html');
    // {{ content }} is the rendered body; a regular page's own page.content
    // is the raw body (S4 -- oracle-verified, see the header comment).
    expect(about.content).toContain('WRAP(<p>Hello <em>world</em>.</p>\n|Hello *world*.)');
  });
});
