const fs = require('fs');
const p = 'src/game/character.js';
let s = fs.readFileSync(p, 'utf8');
const old = "    model.userData.ikStrength = (cfg.ikStrength != null) ? Number(cfg.ikStrength) : 0;";
const neu = "    model.userData.ikStrengthLeft = (cfg.ikStrengthLeft != null) ? Number(cfg.ikStrengthLeft) : (cfg.ikStrength != null ? Number(cfg.ikStrength) : 0);\n    model.userData.ikStrengthRight = (cfg.ikStrengthRight != null) ? Number(cfg.ikStrengthRight) : 0;\n    model.userData.ikStrength = model.userData.ikStrengthLeft;";
if (!s.includes(old)) { console.error('old not found'); process.exit(1); }
s = s.replace(old, neu);
fs.writeFileSync(p, s, 'utf8');
console.log('done');
