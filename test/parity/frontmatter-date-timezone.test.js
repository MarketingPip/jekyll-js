/**
 * Front-matter date parsing honors site.timezone (Jekyll 4.3.4 parity).
 *
 * Grounding: document.rb -- Document#date is the front-matter `date:`
 * value parsed by Ruby's Time.parse in the process timezone (the oracle
 * runs TZ=Asia/Shanghai; `timezone: Asia/Shanghai` in _config.yml). An
 * explicit offset (+0800 / Z) fixes the exact instant; a naive date is
 * wall time in the site timezone.
 *
 * Oracle evidence (chirpy, real Jekyll 4.3.4): `date: 2019-08-08 11:33:00
 * +0800` renders `<lastmod>2019-08-08T11:33:00+08:00</lastmod>` in
 * sitemap.xml. The engine previously ignored the offset and parsed in
 * the host TZ, producing `2019-08-08T19:33:00+08:00` under TZ=UTC.
 */
import { JekyllEngine } from '../../src/engine.js';

const VFS = {
  '_config.yml':
    'url: https://example.com\ntimezone: Asia/Shanghai\nplugins:\n  - jekyll-sitemap\n',
  '_posts/2019-08-08-offset.md':
    '---\ntitle: Offset\ndate: 2019-08-08 11:33:00 +0800\n---\nHi',
  '_posts/2019-08-09-naive.md':
    '---\ntitle: Naive\ndate: 2019-08-09 20:55:00\n---\nHi',
  '_posts/2019-08-10-dateonly.md': '---\ntitle: DateOnly\ndate: 2019-08-10\n---\nHi',
  // Covers the _mapPost path (site.posts[].date), not just the sitemap filter.
  'dates.md':
    '---\ntitle: Dates\n---\n{% for post in site.posts %}{{ post.date | date_to_xmlschema }};{% endfor %}',
};

async function build() {
  const engine = new JekyllEngine({ vfs: { ...VFS } });
  const pages = await engine.build();
  const byPermalink = Object.fromEntries(pages.map((p) => [p.permalink, p]));
  return byPermalink;
}

describe('front-matter date parsing honors site.timezone', () => {
  test('explicit offset is honored: 11:33:00 +0800 -> 11:33:00+08:00', async () => {
    const byPermalink = await build();
    expect(byPermalink['/sitemap.xml'].content).toContain(
      '<lastmod>2019-08-08T11:33:00+08:00</lastmod>'
    );
  });

  test('naive datetime is wall time in site.timezone, not host TZ', async () => {
    const byPermalink = await build();
    expect(byPermalink['/sitemap.xml'].content).toContain(
      '<lastmod>2019-08-09T20:55:00+08:00</lastmod>'
    );
  });

  test('date-only is midnight in site.timezone, not host TZ', async () => {
    const byPermalink = await build();
    expect(byPermalink['/sitemap.xml'].content).toContain(
      '<lastmod>2019-08-10T00:00:00+08:00</lastmod>'
    );
  });

  test('site.posts[].date exposes the same instants', async () => {
    const byPermalink = await build();
    const dates = byPermalink['/dates.html'].content;
    expect(dates).toContain('2019-08-08T11:33:00+08:00');
    expect(dates).toContain('2019-08-09T20:55:00+08:00');
    expect(dates).toContain('2019-08-10T00:00:00+08:00');
  });
});
