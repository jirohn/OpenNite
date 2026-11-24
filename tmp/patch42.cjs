const fs = require('fs');
// weapons.js
const p = 'src/game/weapons.js';
let s = fs.readFileSync(p, 'utf8');
s = s.replace(
  "  if (roll < 0.16) return { kind: 'shield', amount: 50, name: 'Escudo 50', icon: '🛡', color: '#41b7ff' };\n  if (roll < 0.24) return { kind: 'health', amount: 35, name: 'Botiquín', icon: '➕', color: '#5bd88a' };\n  if (roll < 0.31) return { kind: 'shield', amount: 100, name: 'Escudo 100', icon: '🛡', color: '#41b7ff' };",
  "  if (roll < 0.08) return { kind: 'health', amount: 15, name: 'Vendas', icon: '🩹', color: '#5bd88a' };\n  if (roll < 0.16) return { kind: 'health', amount: 100, name: 'Botiquín', icon: '➕', color: '#5bd88a' };\n  if (roll < 0.24) return { kind: 'shield', amount: 50, name: 'Escudo mini', icon: '🛡', color: '#41b7ff' };\n  if (roll < 0.30) return { kind: 'shield', amount: 100, name: 'Escudo grande', icon: '🛡', color: '#41b7ff' };\n  if (roll < 0.36) return { kind: 'slurp', amount: 25, name: 'Slurp', icon: '🧪', color: '#b06cff' };"
);
fs.writeFileSync(p, s, 'utf8');

// loot.js
const p2 = 'src/game/loot.js';
let s2 = fs.readFileSync(p2, 'utf8');
s2 = s2.replace(
  "    } else if (item.kind === 'health') {\n      const got = player.heal(item.amount);\n      text = `+${Math.round(got)} vida`;\n      color = '#5bd88a';\n    } else if (item.kind === 'ammo') {",
  "    } else if (item.kind === 'health') {\n      const got = player.heal(item.amount);\n      text = `+${Math.round(got)} vida`;\n      color = '#5bd88a';\n    } else if (item.kind === 'slurp') {\n      const gh = player.heal(item.amount);\n      const gs = player.addShield(item.amount);\n      text = `+${Math.round(gh)} vida / +${Math.round(gs)} escudo`;\n      color = '#b06cff';\n    } else if (item.kind === 'ammo') {"
);
fs.writeFileSync(p2, s2, 'utf8');
console.log('done');
