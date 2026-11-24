const fs = require('fs');
const p = 'src/game/gun-config.js';
let s = fs.readFileSync(p, 'utf8');
const old = `  config[t] = {
    position: cfg.position.map(Number),
    quaternion: cfg.quaternion.map(Number),
  };`;
const neu = `  config[t] = {
    position: cfg.position.map(Number),
    quaternion: cfg.quaternion.map(Number),
  };
  if (cfg.supportGrip && Array.isArray(cfg.supportGrip.position)) {
    config[t].supportGrip = {
      position: cfg.supportGrip.position.map(Number),
      quaternion: (cfg.supportGrip.quaternion || [0,0,0,1]).map(Number),
    };
  }
  if (cfg.ikStrength != null) config[t].ikStrength = Number(cfg.ikStrength);`;
if (!s.includes(old)) { console.error('old not found'); process.exit(1); }
s = s.replace(old, neu);
fs.writeFileSync(p, s, 'utf8');
console.log('done');
