const fs = require('fs');
const p = 'tools/gun-editor.mjs';
let s = fs.readFileSync(p, 'utf8');
const old = `  try {
    // JSON que el juego lee en el arranque (colocación compartida para todas las armas).
    const gq = gun.quaternion;
    window.opennite?.app?.writeFile?.('config/gun-config.json', JSON.stringify({
      position: gun.position.toArray(),
      quaternion: [gq.x, gq.y, gq.z, gq.w],
    }));
    window.opennite?.app?.writeFile?.('config/gun-config.txt', text);
  } catch { /* ignore */ }`;
const neu = `  try {
    const gq = gun.quaternion;
    const placement = { position: gun.position.toArray(), quaternion: [gq.x, gq.y, gq.z, gq.w] };
    // Guardar por arma; si es el fusil (arma base) también actualiza "default".
    setGunPlacement(placement, weaponType);
    if (weaponType === 'ar' || weaponType === 'pistol') setGunPlacement(placement, 'default');
    const all = getAllGunConfig();
    window.opennite?.app?.writeFile?.('config/gun-config.json', JSON.stringify(all, null, 2));
    window.opennite?.app?.writeFile?.('config/gun-config.txt', text);
  } catch { /* ignore */ }`;
if (!s.includes(old)) { console.error('old not found'); process.exit(1); }
s = s.replace(old, neu);
fs.writeFileSync(p, s, 'utf8');
console.log('done');
