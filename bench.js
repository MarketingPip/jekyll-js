/**
 * Benchmark: jekyll-js build performance.
 * Measures cold build time for sites of varying sizes.
 */
import { JekyllEngine } from './engine.js';

function makeSite(numPosts, numPages) {
  const vfs = {
    '_config.yml': 'title: Bench\n',
    '_layouts/default.html': '<html><head><title>{{ page.title }}</title></head><body>{{ content }}</body></html>',
    '_layouts/post.html': '---\nlayout: default.html\n---\n<article><h1>{{ page.title }}</h1>{{ content }}</article>',
    'index.md': '---\nlayout: default.html\ntitle: Home\n---\n# Home\n{% for post in site.posts limit:5 %}{{ post.title }}\n{% endfor %}',
  };
  for (let i = 0; i < numPosts; i++) {
    const date = `2026-01-${String((i % 28) + 1).padStart(2, '0')}`;
    vfs[`_posts/${date}-post-${i}.md`] = `---\nlayout: post.html\ntitle: Post ${i}\n---\nContent for post ${i}. Lorem ipsum dolor sit amet.`;
  }
  for (let i = 0; i < numPages; i++) {
    vfs[`page-${i}.md`] = `---\nlayout: default.html\ntitle: Page ${i}\n---\n# Page ${i}\nContent here.`;
  }
  return vfs;
}

async function bench(label, vfs) {
  const engine = new JekyllEngine({ vfs, logger: () => {} });
  const start = performance.now();
  const pages = await engine.build();
  const ms = performance.now() - start;
  console.log(`${label}: ${pages.length} pages in ${ms.toFixed(0)}ms (${(ms / pages.length).toFixed(1)}ms/page)`);
}

console.log('jekyll-js benchmarks (Node, cold build)\n');
await bench('Small  (10 posts, 5 pages)', makeSite(10, 5));
await bench('Medium (100 posts, 20 pages)', makeSite(100, 20));
await bench('Large  (500 posts, 50 pages)', makeSite(500, 50));
