const fs = require('fs');
const p = 'src/game/character.js';
let s = fs.readFileSync(p, 'utf8');
const old = 'model.userData.ikStrength = (cfg.ikStrength != null) ? Number(cfg.ikStrength) : (type === \'pistol\' || type === \'pickaxe\' ? 0 : 0.6);';
const neu = 'model.userData.ikStrength = (cfg.ikStrength != null) ? Number(cfg.ikStrength) : 0;';
if (!s.includes(old)) { console.error('old not found'); process.exit(1); }
s = s.replace(old, neu);
fs.writeFileSync(p, s, 'utf8');
console.log('done');
