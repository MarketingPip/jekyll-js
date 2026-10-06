import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MINIMA = path.join(__dirname, 'minima-theme');
const SITE = path.join(__dirname, 'testsite-source');

function walk(dir, base, vfs) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['_site', '.git', '.sass-cache', '.jekyll-cache'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      walk(full, rel, vfs);
    } else {
      if (['Gemfile', 'Gemfile.lock'].includes(entry.name)) continue;
      vfs[rel] = fs.readFileSync(full, 'utf8');
    }
  }
}

const vfs = {};
walk(MINIMA, '', vfs);   // theme files first
walk(SITE, '', vfs);     // site files (none collide for minima, but would win if they did)

fs.writeFileSync(path.join(__dirname, 'vfs.json'), JSON.stringify(vfs, null, 2));
console.log('VFS keys:', Object.keys(vfs).sort());
