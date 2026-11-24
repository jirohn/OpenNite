import { clamp } from '../core/utils.js';

export const RARITIES = [
  { id: 'common', name: 'Común', color: '#b9c2cc', mult: 1 },
  { id: 'uncommon', name: 'Poco común', color: '#5bdb79', mult: 1.1 },
  { id: 'rare', name: 'Rara', color: '#4aa8ff', mult: 1.22 },
  { id: 'epic', name: 'Épica', color: '#c274ff', mult: 1.35 },
  { id: 'legendary', name: 'Legendaria', color: '#ffab35', mult: 1.5 },
];

export const WEAPONS = {
  pickaxe: {
    id: 'pickaxe', name: 'Pico', icon: '⛏', dmg: 58, rpm: 105, mag: 1, reload: 0,
    spread: 0, adsSpread: 0, range: 4.5, falloff: 0, pellets: 1, recoil: 1.1,
    auto: false, ammo: null, rarity: 0, scope: false, melee: true,
  },
  pistol: {
    id: 'pistol', name: 'Pistola', icon: '🔫', dmg: 26, rpm: 320, mag: 12, reload: 1.25,
    spread: 0.014, adsSpread: 0.004, range: 130, falloff: 0.0009, pellets: 1, recoil: 0.55,
    auto: false, ammo: 'light', rarity: 1, scope: false,
  },
  smg: {
    id: 'smg', name: 'SMG', icon: '⌁', dmg: 19, rpm: 750, mag: 30, reload: 1.8,
    spread: 0.03, adsSpread: 0.012, range: 105, falloff: 0.0015, pellets: 1, recoil: 0.42,
    auto: true, ammo: 'light', rarity: 1, scope: false,
  },
  ar: {
    id: 'ar', name: 'Fusil AR', icon: '▰', dmg: 32, rpm: 540, mag: 30, reload: 2.1,
    spread: 0.021, adsSpread: 0.0055, range: 220, falloff: 0.0007, pellets: 1, recoil: 0.75,
    auto: true, ammo: 'medium', rarity: 2, scope: false,
  },
  shotgun: {
    id: 'shotgun', name: 'Escopeta', icon: '⛨', dmg: 11, rpm: 72, mag: 6, reload: 2.8,
    spread: 0.085, adsSpread: 0.055, range: 65, falloff: 0.008, pellets: 9, recoil: 2.4,
    auto: false, ammo: 'shells', rarity: 2, scope: false,
  },
  sniper: {
    id: 'sniper', name: 'Francotirador', icon: '◎', dmg: 118, rpm: 48, mag: 5, reload: 3.1,
    spread: 0.045, adsSpread: 0.0004, range: 600, falloff: 0.00012, pellets: 1, recoil: 3.4,
    auto: false, ammo: 'heavy', rarity: 3, scope: true,
  },
};

export const AMMO_MAX = { light: 240, medium: 270, heavy: 40, shells: 50 };

export class Inventory {
  constructor() {
    this.slots = new Array(5).fill(null);
    this.ammo = { light: 90, medium: 120, heavy: 20, shells: 24 };
    this.active = 0;
    this.cooldown = 0;
    this.reloadTime = 0;
    this.reloading = false;
    this.lastShotAt = -10;
    this.time = 0;
  }

  current() { return this.slots[this.active]; }

  addWeapon(type, rarity = 0) {
    const def = WEAPONS[type];
    if (!def) return false;
    const rar = RARITIES[clamp(rarity, 0, RARITIES.length - 1)];
    const weapon = { type, rarity: rarity, color: rar.color, name: `${rar.name} ${def.name}`, ammo: def.mag, def, mult: rar.mult };
    let idx = this.slots.findIndex((s) => s && s.type === type && s.rarity === rarity);
    if (idx >= 0) {
      this.slots[idx].ammo = Math.min(def.mag, this.slots[idx].ammo + def.mag);
      return idx;
    }
    idx = this.slots.findIndex((s) => !s);
    if (idx < 0) idx = this.active;
    this.slots[idx] = weapon;
    return idx;
  }

  addAmmo(type, amount) {
    if (!(type in this.ammo)) return false;
    this.ammo[type] = Math.min(AMMO_MAX[type], this.ammo[type] + amount);
    return true;
  }

  addShield(amount) { this.pendingShield = (this.pendingShield || 0) + amount; return true; }

  switchTo(index) {
    if (index < 0 || index >= this.slots.length) return false;
    this.active = index;
    this.reloading = false;
    this.reloadTime = 0;
    return true;
  }

  cycle(dir) {
    for (let i = 1; i <= this.slots.length; i++) {
      const idx = (this.active + dir * i + this.slots.length * 2) % this.slots.length;
      if (this.slots[idx]) return this.switchTo(idx);
    }
    return false;
  }

  reload() {
    const w = this.current();
    if (!w || !w.def.ammo || w.ammo >= w.def.mag || this.reloading || this.ammo[w.def.ammo] <= 0) return false;
    this.reloading = true;
    this.reloadTime = w.def.reload;
    return true;
  }

  update(dt) {
    this.time += dt;
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.reloading) {
      this.reloadTime -= dt;
      if (this.reloadTime <= 0) {
        const w = this.current();
        if (w) {
          const need = w.def.mag - w.ammo;
          const take = Math.min(need, this.ammo[w.def.ammo]);
          w.ammo += take;
          this.ammo[w.def.ammo] -= take;
        }
        this.reloading = false;
        return 'reloaded';
      }
    }
    return null;
  }

  /** Devuelve los datos del disparo o null si no puede disparar. */
  fire(ads = false) {
    const w = this.current();
    if (!w || this.reloading) return null;
    if (this.cooldown > 0) return null;
    if (!w.def.melee) {
      if (w.ammo <= 0) {
        this.reload();
        return null;
      }
      w.ammo--;
    }
    this.cooldown = 60 / w.def.rpm;
    this.lastShotAt = this.time;
    return {
      weapon: w,
      def: w.def,
      damage: w.def.dmg * w.mult,
      spread: ads ? w.def.adsSpread : w.def.spread,
      pellets: w.def.pellets,
      range: w.def.range,
      falloff: w.def.falloff,
      recoil: w.def.recoil,
    };
  }
}

export function randomWeaponLoot(rnd) {
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
}
