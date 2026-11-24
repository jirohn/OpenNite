const fs = require('fs');
const p = 'src/game/gun-config.js';
let s = fs.readFileSync(p, 'utf8');
const old = `  if (cfg.ikStrength != null) config[t].ikStrength = Number(cfg.ikStrength);`;
const neu = `  if (cfg.ikStrength != null) config[t].ikStrength = Number(cfg.ikStrength);
  if (cfg.ikStrengthLeft != null) config[t].ikStrengthLeft = Number(cfg.ikStrengthLeft);
  if (cfg.ikStrengthRight != null) config[t].ikStrengthRight = Number(cfg.ikStrengthRight);`;
if (!s.includes(old)) { console.error('old not found'); process.exit(1); }
s = s.replace(old, neu);
// getGunPlacement: include them
const old2 = `  if (entry.ikStrength != null) out.ikStrength = Number(entry.ikStrength);
  return out;`;
const neu2 = `  if (entry.ikStrength != null) out.ikStrength = Number(entry.ikStrength);
  if (entry.ikStrengthLeft != null) out.ikStrengthLeft = Number(entry.ikStrengthLeft);
  if (entry.ikStrengthRight != null) out.ikStrengthRight = Number(entry.ikStrengthRight);
  return out;`;
if (!s.includes(old2)) { console.error('old2 not found'); process.exit(1); }
s = s.replace(old2, neu2);
fs.writeFileSync(p, s, 'utf8');
console.log('done');
