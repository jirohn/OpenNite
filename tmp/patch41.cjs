const fs = require('fs');
const p = 'src/game/weapons.js';
let s = fs.readFileSync(p, 'utf8');
const old = `export function randomLoot(rnd) {
  const roll = rnd();
  if (roll < 0.16) return { kind: 'shield', amount: 50, name: 'Escudo 50', icon: '🛡', color: '#41b7ff' };
  if (roll < 0.24) return { kind: 'health', amount: 35, name: 'Botiquín', icon: '➕', color: '#5bd88a' };
  if (roll < 0.31) return { kind: 'shield', amount: 100, name: 'Escudo 100', icon: '🛡', color: '#41b7ff' };`;
const neu = `export function randomLoot(rnd) {
  const roll = rnd();
  if (roll < 0.08) return { kind: 'health', amount: 15, name: 'Vendas', icon: '🩹', color: '#5bd88a' };
  if (roll < 0.16) return { kind: 'health', amount: 100, name: 'Botiquín', icon: '➕', color: '#5bd88a' };
  if (roll < 0.24) return { kind: 'shield', amount: 50, name: 'Escudo mini', icon: '🛡', color: '#41b7ff' };
  if (roll < 0.30) return { kind: 'shield', amount: 100, name: 'Escudo grande', icon: '🛡', color: '#41b7ff' };
  if (roll < 0.36) return { kind: 'slurp', amount: 25, name: 'Slurp', icon: '🧪', color: '#b06cff' };`;
if (!s.includes(old)) { console.error('old not found'); process.exit(1); }
s = s.replace(old, neu);
fs.writeFileSync(p, s, 'utf8');

// loot.js: handle slurp kind
const p2 = 'src/game/loot.js';
let s2 = fs.readFileSync(p2, 'utf8');
const old2 = `    } else if (item.kind === 'health') {
      const got = player.heal(item.amount);
      text = \`+${Math.round(got)} vida\`;
      color = '#5bd88a';
    } else if (item.kind === 'ammo') {`;
const neu2 = `    } else if (item.kind === 'health') {
      const got = player.heal(item.amount);
      text = \`+${Math.round(got)} vida\`;
      color = '#5bd88a';
    } else if (item.kind === 'slurp') {
      const gh = player.heal(item.amount);
      const gs = player.addShield(item.amount);
      text = \`+${Math.round(gh)} vida / +${Math.round(gs)} escudo\`;
      color = '#b06cff';
    } else if (item.kind === 'ammo') {`;
if (!s2.includes(old2)) { console.error('old2 not found'); process.exit(1); }
s2 = s2.replace(old2, neu2);
fs.writeFileSync(p2, s2, 'utf8');
console.log('done');
