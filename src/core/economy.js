/**
 * Economía de OpenNite. Estas reglas se replican en functions/index.js para que
 * el servidor sea la autoridad cuando Firebase está configurado.
 */
// Regalo de administrador al crear perfil: 2000 créditos.
export const WELCOME_CREDITS = 2000;
const LEGACY_WELCOME_CREDITS = 600;
const ADMIN_GRANT_KEY = 'adminGrant2000';
export const BATTLE_PASS_PRICE = 800;
export const BATTLE_PASS_LEVELS = 10;
export const XP_PER_LEVEL = 100;
export const FREE_TIER_CREDITS = 20;   // 10 niveles × 20 = 200 gratis
export const PREMIUM_TIER_CREDITS = 100; // 10 niveles × 100 = 1000 premium

export const PRESETS = [
  { id: 'islander', name: 'Isleño', color: 0xffb45c, price: 0 },
  { id: 'farmer', name: 'Granjero', color: 0x6a9a4c, price: 180 },
  { id: 'angler', name: 'Pescador', color: 0x3f7ca8, price: 180 },
  { id: 'cook', name: 'Cocinero', color: 0xf3eee2, price: 200 },
  { id: 'smith', name: 'Herrero', color: 0x8a8a90, price: 240 },
  { id: 'miner', name: 'Minero', color: 0xd9a23a, price: 260 },
  { id: 'old-man', name: 'Anciano', color: 0x7a5a3a, price: 260 },
];

export const SHOP_ITEMS = [
  ...PRESETS.filter((p) => p.price > 0).map((p) => ({
    id: `preset_${p.id}`,
    name: `Traje · ${p.name}`,
    description: 'Aspecto cuerpo completo del kit CC0 compartido por los 20 jugadores.',
    category: 'Trajes',
    price: p.price,
    color: p.color,
    preset: p.id,
  })),
  { id: 'color_neon', name: 'Color · Neón', description: 'Tinte vivo para camisa, pantalón y botas.', category: 'Colores', price: 120, color: 0x39ffd0 },
  { id: 'color_sunset', name: 'Color · Atardecer', description: 'Naranja cálido inspirado en el faro de San Borondon.', category: 'Colores', price: 120, color: 0xff6a2b },
  { id: 'color_royal', name: 'Color · Real', description: 'Azul profundo con brillo frío.', category: 'Colores', price: 150, color: 0x4a6cff },
  { id: 'color_lava', name: 'Color · Lava', description: 'Rojo incandescente para destacar en la isla.', category: 'Colores', price: 180, color: 0xff3548 },
  { id: 'color_ghost', name: 'Color · Fantasma', description: 'Blanco hueso, discreto y letal.', category: 'Colores', price: 200, color: 0xe8edf2 },
];

export const SHOP_BY_ID = Object.fromEntries(SHOP_ITEMS.map((item) => [item.id, item]));

export function levelFromXp(xp = 0) {
  const value = Math.max(0, Math.floor(Number(xp) || 0));
  return Math.min(BATTLE_PASS_LEVELS, 1 + Math.floor(value / XP_PER_LEVEL));
}

export function xpProgress(xp = 0) {
  const value = Math.max(0, Math.floor(Number(xp) || 0));
  const level = levelFromXp(value);
  if (level >= BATTLE_PASS_LEVELS) return { level, current: XP_PER_LEVEL, need: XP_PER_LEVEL, percent: 100 };
  const current = value % XP_PER_LEVEL;
  return { level, current, need: XP_PER_LEVEL, percent: Math.round((current / XP_PER_LEVEL) * 100) };
}

export function matchXp(result = {}) {
  const kills = Math.max(0, Math.floor(Number(result.kills) || 0));
  const rank = Math.max(1, Math.min(20, Math.floor(Number(result.rank) || 20)));
  const placement = 10 - Math.floor((rank - 1) / 2);
  const survival = Math.min(40, Math.floor((Number(result.time) || 0) / 30) * 5);
  return 25 + kills * 25 + Math.max(0, placement) + (result.victory ? 120 : 0) + survival;
}

export function makeDefaultProfile(uid = 'offline') {
  return {
    uid,
    displayName: uid === 'offline' ? 'Jugador local' : 'Jugador',
    email: '',
    photoURL: '',
    credits: WELCOME_CREDITS,
    xp: 0,
    level: 1,
    battlePass: { premium: false, level: 1, claimed: [] },
    owned: ['preset_islander'],
    equipped: { preset: 'islander', color: 0xffb45c },
    stats: { matches: 0, wins: 0, kills: 0 },
    awardedMatches: [],
    [ADMIN_GRANT_KEY]: true,
    updatedAt: Date.now(),
  };
}

export function sanitizeProfile(raw = {}, uid = 'offline') {
  const base = makeDefaultProfile(uid);
  const n = (value, fallback = 0) => {
    const out = Number(value);
    return Number.isFinite(out) ? Math.max(0, Math.floor(out)) : fallback;
  };
  const battlePass = raw.battlePass || {};
  const stats = raw.stats || {};
  const equipped = raw.equipped || {};
  const xp = n(raw.xp, 0);
  const owned = Array.isArray(raw.owned) ? raw.owned.filter((id) => typeof id === 'string') : base.owned;
  const rawCredits = n(raw.credits, WELCOME_CREDITS);
  // Los perfiles que se crearon con 600 créditos reciben el regalo una sola vez.
  const needsAdminGrant = raw[ADMIN_GRANT_KEY] !== true && rawCredits <= LEGACY_WELCOME_CREDITS;
  return {
    ...base,
    uid,
    displayName: String(raw.displayName || base.displayName).slice(0, 48),
    email: String(raw.email || '').slice(0, 120),
    photoURL: String(raw.photoURL || '').slice(0, 300),
    credits: needsAdminGrant ? WELCOME_CREDITS : rawCredits,
    xp,
    level: levelFromXp(xp),
    battlePass: {
      premium: !!battlePass.premium,
      level: levelFromXp(xp),
      claimed: Array.isArray(battlePass.claimed) ? battlePass.claimed.filter((k) => typeof k === 'string') : [],
    },
    owned: [...new Set(['preset_islander', ...owned])],
    equipped: {
      preset: /^[a-z0-9-]{2,32}$/i.test(String(equipped.preset || '')) ? equipped.preset : 'islander',
      color: n(equipped.color, 0xffb45c) & 0xffffff,
    },
    stats: {
      matches: n(stats.matches),
      wins: n(stats.wins),
      kills: n(stats.kills),
    },
    awardedMatches: Array.isArray(raw.awardedMatches) ? raw.awardedMatches.slice(-60) : [],
    [ADMIN_GRANT_KEY]: true,
    updatedAt: n(raw.updatedAt, Date.now()) || Date.now(),
  };
}

export const rewardKey = (track, level) => `${track === 'premium' ? 'p' : 'f'}${level}`;

export function passRewards() {
  return Array.from({ length: BATTLE_PASS_LEVELS }, (_, index) => {
    const level = index + 1;
    return {
      level,
      free: { id: rewardKey('free', level), credits: FREE_TIER_CREDITS },
      premium: { id: rewardKey('premium', level), credits: PREMIUM_TIER_CREDITS },
    };
  });
}
