import fs from 'fs';
import path from 'path';
import { JekyllEngine } from '../engine.js';

const vfs = JSON.parse(fs.readFileSync('./battletest/vfs.json', 'utf8'));
const errors = [];

const engine = new JekyllEngine({
  vfs,
  logger: (msg, level) => process.stderr.write(`[${level}] ${msg}\n`),
});

let results;
try {
  results = await engine.build();
} catch (e) {
  console.error('BUILD FATAL:', e.message);
  process.exit(1);
}

const out = {};
for (const r of results) {
  out[r.permalink] = r.content;
}

fs.writeFileSync('./battletest/engine-out.json', JSON.stringify(out, null, 2));
console.log('Engine produced pages:', Object.keys(out).sort().join(', '));
