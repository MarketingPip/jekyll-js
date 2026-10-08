import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';

import styles from './index.module.css';

const FEATURES = [
  {
    emoji: '🎯',
    title: 'Byte-identical plugin output',
    desc: 'jekyll-feed 0.17.0, jekyll-sitemap 1.4.0, jekyll-seo-tag 2.8.0, and jekyll-redirect-from 0.16.0 all produce byte-identical output vs real Jekyll 4.3.4. The Minima 2.5.1 theme renders identically too.',
  },
  {
    emoji: '📜',
    title: 'Grounded in the real source',
    desc: '~40% of tests are checked against actual gem source (file + line cited): the related_posts algorithm, publisher semantics, URL drops, and even {% link %} / {% post_url %} error messages, byte-matched.',
  },
  {
    emoji: '⏰',
    title: 'Details real Jekyll gets right',
    desc: "date_to_xmlschema emits the local timezone offset (not UTC), /about.html URLs match Jekyll's default, and Liquid filters — slugify, smartify, xml_escape, group_by — match the gem.",
  },
  {
    emoji: '🪞',
    title: 'Honest about the gaps',
    desc: 'Markdown goes through marked.js, not kramdown (known divergences; kramdown-js aims for full parity). No Sass source maps yet. The gaps live in the open scoreboard, never normalized as expected failures.',
  },
];

const STATS = [
  { number: '283', suffix: '/283', label: 'tests passing', sub: null },
  { number: '5', suffix: '', label: 'gem outputs byte-identical', sub: 'feed · sitemap · seo-tag · redirect-from · Minima' },
  { number: '0', suffix: '', label: 'fake greens', sub: 'gaps are tracked, never normalized' },
];

const LINKS = [
  {
    emoji: '📚',
    title: 'Guides',
    desc: 'Tutorials and how-tos: build your first site, plugins, deployment.',
    to: '/docs/getting-started',
  },
  {
    emoji: '🧩',
    title: 'API Reference',
    desc: 'Engine, plugins, browser bundle, and TypeScript types.',
    to: '/docs/api/engine-reference',
  },
  {
    emoji: '🧪',
    title: 'Playground',
    desc: 'Build and preview Jekyll sites live in your browser.',
    href: '/jekyll-js/playground/',
  },
  {
    emoji: '⭐',
    title: 'GitHub',
    desc: 'Source, issues, releases, and the parity scoreboard.',
    href: 'https://github.com/MarketingPip/jekyll-js',
  },
];

function Hero() {
  return (
    <header className={styles.heroBanner}>
      <div className="container">
        <p className={styles.badge}>
          <span className={styles.badgeDot} />
          v0.2.0 · Jekyll 4.3.4 parity · 283 tests green
        </p>
        <h1 className={styles.heroTitle}>
          Jekyll in the <span className="gradient-text glow-text">browser</span>
        </h1>
        <p className={styles.heroSubtitle}>
          A client-side Jekyll engine in JavaScript. Hand it files, get back
          rendered HTML — no Ruby, no filesystem, no server. It runs on a
          plain JS object, so your app, agent, or IDE can build Jekyll sites anywhere.
        </p>
        <div className={styles.buttons}>
          <a
            className="button button--primary button--lg"
            href="/jekyll-js/playground/">
            Try the playground
          </a>
          <Link
            className="button button--outline button--lg"
            to="/docs/getting-started">
            Read the guides
          </Link>
        </div>
        <p className={styles.npmLine}>
          <span>$</span> npm install jekyll-js
        </p>
      </div>
    </header>
  );
}

function Features() {
  return (
    <section className={styles.section}>
      <div className="container">
        <h2 className={styles.sectionTitle}>True Jekyll parity, verified</h2>
        <p className={styles.sectionDesc}>
          Every behavioral claim is grounded in Jekyll 4.3.4 source or byte-identical
          output from a real Ruby oracle. Honest scoreboard — gaps are tracked, never hidden.
        </p>
        <div className={styles.featureGrid}>
          {FEATURES.map((f) => (
            <article key={f.title} className={styles.featureCard}>
              <div className={styles.featureEmoji} aria-hidden="true">{f.emoji}</div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </article>
          ))}
        </div>
        <div className={styles.statGrid}>
          {STATS.map((s) => (
            <div key={s.label} className={styles.statCard}>
              <p className={styles.statNumber}>
                {s.number}
                {s.suffix && <span className={styles.statNumberSmall}>{s.suffix}</span>}
              </p>
              <p className={styles.statLabel}>{s.label}</p>
              {s.sub && <p className={styles.statSub}>{s.sub}</p>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function QuickStart() {
  return (
    <section className={`${styles.section} ${styles.sectionAlt}`}>
      <div className="container">
        <h2 className={styles.sectionTitle}>Quick start</h2>
        <p className={styles.sectionDesc}>
          Sites are plain <code>{'{ path: content }'}</code> objects — the virtual
          filesystem. Works identically in Node and the browser bundle.
        </p>
        <div className={styles.codeGrid}>
          <div className={styles.codeCard}>
            <div className={styles.codeCardHeader}>Terminal</div>
            <pre><code><span style={{color: '#64748b'}}>$</span> npm install jekyll-js</code></pre>
          </div>
          <div className={styles.codeCard}>
            <div className={styles.codeCardHeader}>build.mjs</div>
            <pre><code>{`import { JekyllEngine } from 'jekyll-js';

const pages = await JekyllEngine.render({
  '_config.yml': 'title: My Site\\n',
  '_layouts/default.html': '<html><body>{{ content }}</body></html>',
  'index.md': '---\\nlayout: default\\n---\\n# Hello world',
});

console.log(pages[0].content); // rendered HTML`}</code></pre>
          </div>
        </div>
      </div>
    </section>
  );
}

function LinksGrid() {
  return (
    <section className={styles.section}>
      <div className="container">
        <h2 className={styles.sectionTitle}>Where to go next</h2>
        <div className={styles.linkGrid}>
          {LINKS.map((l) => {
            const inner = (
              <>
                <div className={styles.featureEmoji} aria-hidden="true">{l.emoji}</div>
                <h3>{l.title}</h3>
                <p>{l.desc}</p>
              </>
            );
            return l.to ? (
              <Link key={l.title} to={l.to} className={styles.linkCard}>{inner}</Link>
            ) : (
              <a key={l.title} href={l.href} className={styles.linkCard}>{inner}</a>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default function Home() {
  return (
    <Layout
      title="Jekyll in the browser"
      description="jekyll-js is a faithful JavaScript port of Jekyll's static site engine. Render Jekyll sites entirely in JS — in the browser, in Node, anywhere.">
      <Hero />
      <main>
        <Features />
        <QuickStart />
        <LinksGrid />
      </main>
    </Layout>
  );
}
