// Escanea src/**/*.js por importación 'three/*' y verifica existencia.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.isFile() && /\.(js|mjs)$/.test(e.name)) out.push(p);
  }
  return out;
}
const files = walk('src');
const set = new Set();
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(/['"](three\/[^'"]+)['"]/g)) set.add(m[1]);
}
const list = [...set].sort();
console.log('imports de three:', JSON.stringify(list));
const missing = [];
for (const u of list) {
  const rel = u.replace(/^three/, 'node_modules/three');
  const ex = fs.existsSync(rel);
  console.log((ex ? 'OK  ' : 'MISS'), u, ex ? '' : ` -> ${rel}`);
  if (!ex) missing.push(u);
}
console.log('missing:', missing.length ? JSON.stringify(missing) : 'none');
