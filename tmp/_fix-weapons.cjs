const fs=require('fs');
const p='src/game/weapons.js';
let s=fs.readFileSync(p,'utf8');
const old = `export function randomLoot(rnd) {
  const roll = rnd();
  if (roll < 0.16) return { kind: 'shield', amount: 50, name: 'Escudo 50', icon: '🛡️', color: '#41b7ff' };
  if (roll < 0.24) return { kind: 'health', amount: 35, name: 'Botiquín', icon: '➕', color: '#5bd88a' };
  if (roll < 0.31) return { kind: 'shield', amount: 100, name: 'Escudo 100', icon: '🔵', color: '#41b7ff' };
  const types = Object.keys(WEAPONS).filter((id) => !WEAPONS[id].melee);
  const type = types[Math.floor(rnd() * types.length)];
  const maxRar = WEAPONS[type].rarity;
  const rarity = Math.floor(rnd() ** 1.8 * (maxRar + 1));
  const ammoTypes = { pistol: 'light', smg: 'light', ar: 'medium', shotgun: 'shells', sniper: 'heavy' };
  const ammoAmount = { light: 40, medium: 45, shells: 10, heavy: 8 }[ammoTypes[type]];
  return {
    kind: 'weapon', type, rarity, name: `${RARITIES[rarity].name} ${WEAPONS[type].name}`,
    icon: WEAPONS[type].icon, color: RARITIES[rarity].color, ammo: ammoAmount, ammoType: ammoTypes[type],
  };
}`;
const neu = `export function randomWeaponLoot(rnd) {
  const types = Object.keys(WEAPONS).filter((id) => !WEAPONS[id].melee);
  const type = types[Math.floor(rnd() * types.length)];
  const maxRar = WEAPONS[type].rarity;
  const rarity = Math.floor(rnd() ** 1.8 * (maxRar + 1));
  const ammoTypes = { pistol: 'light', smg: 'light', ar: 'medium', shotgun: 'shells', sniper: 'heavy' };
  const ammoAmount = { light: 40, medium: 45, shells: 10, heavy: 8 }[ammoTypes[type]];
  return {
    kind: 'weapon', type, rarity, name: `${RARITIES[rarity].name} ${WEAPONS[type].name}`,
    icon: WEAPONS[type].icon, color: RARITIES[rarity].color, ammo: ammoAmount, ammoType: ammoTypes[type],
  };
}

export function randomLoot(rnd) {
  const roll = rnd();
  if (roll < 0.16) return { kind: 'shield', amount: 50, name: 'Escudo 50', icon: '🛡️', color: '#41b7ff' };
  if (roll < 0.24) return { kind: 'health', amount: 35, name: 'Botiquín', icon: '➕', color: '#5bd88a' };
  if (roll < 0.31) return { kind: 'shield', amount: 100, name: 'Escudo 100', icon: '🔵', color: '#41b7ff' };
  return randomWeaponLoot(rnd);
}`;
if(!s.includes(old)){ console.log('not found'); process.exit(1); }
fs.writeFileSync(p, s.replace(old, neu));
console.log('ok');
