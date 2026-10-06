#!/usr/bin/env node
/**
 * jekyll-js CLI.
 * Build Jekyll sites without Ruby.
 *
 * Usage:
 *   jekyll-js build [--source ./src] [--destination ./_site]
 *   jekyll-js serve [--source ./src] [--port 4000]
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { JekyllEngine } from '../src/engine.js';
import { readDirToVFS } from '../src/fs-vfs.js';

const args = process.argv.slice(2);
const command = args[0];

function getArg(name, defaultValue) {
  const idx = args.indexOf(name);
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  const prefixed = args.find((a) => a.startsWith(name + '='));
  if (prefixed) return prefixed.split('=')[1];
  return defaultValue;
}

async function build(source, destination) {
  console.log(`Reading ${source}...`);
  const vfs = readDirToVFS(source, { fs });
  console.log(`Building ${Object.keys(vfs).length} files...`);

  const engine = new JekyllEngine({
    vfs,
    logger: (msg, level) => {
      if (level === 'warn' || level === 'error') console[level](msg);
    },
  });
  const pages = await engine.build();

  // Write pages
  for (const page of pages) {
    // permalink /about/ -> _site/about/index.html
    // permalink /about.html -> _site/about.html
    let outPath;
    if (page.permalink.endsWith('/')) {
      outPath = path.join(destination, page.permalink, 'index.html');
    } else {
      outPath = path.join(destination, page.permalink);
    }
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, page.content);
  }

  // Copy binary static files (images, videos, fonts, etc.)
  // These are in VFS as empty strings (BINARY_EXT) — copy from source.
  const BINARY_EXT = new Set([
    'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'ico', 'bmp', 'tiff',
    'woff', 'woff2', 'ttf', 'otf', 'eot',
    'mp4', 'webm', 'ogv', 'mp3', 'ogg', 'wav', 'flac',
    'pdf', 'zip', 'gz', 'tar',
  ]);
  let binaryCount = 0;
  for (const [relPath, content] of Object.entries(vfs)) {
    if (content !== '') continue;
    const dot = relPath.lastIndexOf('.');
    const ext = dot === -1 ? '' : relPath.slice(dot + 1).toLowerCase();
    if (!BINARY_EXT.has(ext)) continue;
    // Skip if it's a page that was already written
    if (pages.some((p) => p.path === relPath)) continue;
    const srcPath = path.join(source, relPath);
    const destPath = path.join(destination, relPath);
    if (fs.existsSync(srcPath)) {
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.copyFileSync(srcPath, destPath);
      binaryCount++;
    }
  }

  console.log(`Built ${pages.length} pages + ${binaryCount} binary files to ${destination}`);
  return pages;
}

async function serve(source, port) {
  const pages = await build(source, '.jekyll-js-serve');

  const server = http.createServer((req, res) => {
    let urlPath = req.url.split('?')[0];
    if (urlPath.endsWith('/')) urlPath += 'index.html';
    const filePath = path.join('.jekyll-js-serve', urlPath);

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath);
      const types = {
        '.html': 'text/html',
        '.css': 'text/css',
        '.js': 'application/javascript',
        '.xml': 'application/xml',
        '.json': 'application/json',
      };
      res.writeHead(200, { 'Content-Type': types[ext] || 'text/plain' });
      res.end(fs.readFileSync(filePath));
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  server.listen(port, () => {
    console.log(`Serving at http://localhost:${port}/`);
  });
}

if (command === 'build') {
  const source = getArg('--source', '.');
  const destination = getArg('--destination', './_site');
  build(source, destination).catch((e) => {
    console.error('Build failed:', e.message);
    process.exit(1);
  });
} else if (command === 'serve') {
  const source = getArg('--source', '.');
  const port = parseInt(getArg('--port', '4000'), 10);
  serve(source, port).catch((e) => {
    console.error('Serve failed:', e.message);
    process.exit(1);
  });
} else {
  console.log('Usage:');
  console.log('  jekyll-js build [--source ./src] [--destination ./_site]');
  console.log('  jekyll-js serve [--source ./src] [--port 4000]');
  process.exit(1);
}
