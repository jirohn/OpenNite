/**
 * OpenNite — funciones autoritativas de economía.
 * Las reglas de Firestore impiden que el cliente modifique créditos, XP,
 * recompensas o inventario: todo pasa por estas llamadas.
 */
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');
const admin = require('firebase-admin');

setGlobalOptions({ region: 'us-central1', maxInstances: 10 });
admin.initializeApp();
const db = admin.firestore();

// Mantener sincronizado con src/core/economy.js.
const WELCOME_CREDITS = 2000;
const LEGACY_WELCOME_CREDITS = 600;
const ADMIN_GRANT_KEY = 'adminGrant2000';
const BATTLE_PASS_PRICE = 800;
const BATTLE_PASS_LEVELS = 10;
const XP_PER_LEVEL = 100;
const FREE_TIER_CREDITS = 20;
const PREMIUM_TIER_CREDITS = 100;
const PRESET_IDS = new Set(['islander', 'farmer', 'angler', 'cook', 'smith', 'miner', 'old-man']);
const SHOP_PRICES = {
  preset_farmer: 180, preset_angler: 180, preset_cook: 200, preset_smith: 240,
  preset_miner: 260, 'preset_old-man': 260,
  color_neon: 120, color_sunset: 120, color_royal: 150, color_lava: 180, color_ghost: 200,
};
const COLOR_BY_ITEM = {
  color_neon: 0x39ffd0, color_sunset: 0xff6a2b, color_royal: 0x4a6cff,
  color_lava: 0xff3548, color_ghost: 0xe8edf2,
};
const SHOP_COLORS = new Set([0xffb45c, ...Object.values(COLOR_BY_ITEM)]);

const num = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : fallback;
};
const levelFromXp = (xp) => Math.min(BATTLE_PASS_LEVELS, 1 + Math.floor(Math.max(0, xp) / XP_PER_LEVEL));

function sanitize(raw = {}, uid = 'offline') {
  const xp = num(raw.xp);
  const claimed = Array.isArray(raw.battlePass?.claimed)
    ? raw.battlePass.claimed.filter((k) => typeof k === 'string') : [];
  const owned = Array.isArray(raw.owned) ? raw.owned.filter((id) => typeof id === 'string') : [];
  const rawCredits = num(raw.credits, WELCOME_CREDITS);
  const needsAdminGrant = raw[ADMIN_GRANT_KEY] !== true && rawCredits <= LEGACY_WELCOME_CREDITS;
  return {
    uid,
    displayName: String(raw.displayName || 'Jugador').slice(0, 48),
    email: String(raw.email || '').slice(0, 120),
    photoURL: String(raw.photoURL || '').slice(0, 300),
    credits: needsAdminGrant ? WELCOME_CREDITS : rawCredits,
    xp,
    level: levelFromXp(xp),
    battlePass: { premium: !!raw.battlePass?.premium, level: levelFromXp(xp), claimed },
    owned: [...new Set(['preset_islander', ...owned])],
    equipped: {
      preset: PRESET_IDS.has(raw.equipped?.preset) ? raw.equipped.preset : 'islander',
      color: num(raw.equipped?.color, 0xffb45c) & 0xffffff,
    },
    stats: {
      matches: num(raw.stats?.matches),
      wins: num(raw.stats?.wins),
      kills: num(raw.stats?.kills),
    },
    awardedMatches: Array.isArray(raw.awardedMatches) ? raw.awardedMatches.slice(-60) : [],
    [ADMIN_GRANT_KEY]: true,
    updatedAt: num(raw.updatedAt, Date.now()) || Date.now(),
  };
}

function requireUser(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Inicia sesión para continuar.');
  return request.auth.uid;
}

async function withProfile(uid, mutate) {
  const ref = db.collection('users').doc(uid);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const profile = sanitize(snap.data() || {}, uid);
    const result = mutate(profile);
    const next = sanitize({ ...result.profile, updatedAt: Date.now() }, uid);
    tx.set(ref, next);
    return { ...result, profile: next };
  });
}

function matchXp(data) {
  const kills = num(data.kills);
  const rank = Math.max(1, Math.min(20, num(data.rank, 20)));
  const placement = 10 - Math.floor((rank - 1) / 2);
  const survival = Math.min(40, Math.floor(num(data.time) / 30) * 5);
  return 25 + kills * 25 + Math.max(0, placement) + (data.victory ? 120 : 0) + survival;
}

exports.purchaseItem = onCall(async (request) => {
  const uid = requireUser(request);
  const itemId = String(request.data?.itemId || '');
  const price = SHOP_PRICES[itemId];
  if (!price) throw new HttpsError('invalid-argument', 'Artículo desconocido.');
  return withProfile(uid, (profile) => {
    if (profile.owned.includes(itemId)) throw new HttpsError('already-exists', 'Ya tienes este artículo.');
    if (profile.credits < price) {
      throw new HttpsError('failed-precondition', `Te faltan ${price - profile.credits} créditos.`);
    }
    return {
      purchased: itemId,
      profile: { ...profile, credits: profile.credits - price, owned: [...profile.owned, itemId] },
    };
  });
});

exports.purchaseBattlePass = onCall(async (request) => {
  const uid = requireUser(request);
  return withProfile(uid, (profile) => {
    if (profile.battlePass.premium) throw new HttpsError('already-exists', 'Ya tienes el pase premium.');
    if (profile.credits < BATTLE_PASS_PRICE) {
      throw new HttpsError('failed-precondition', `Te faltan ${BATTLE_PASS_PRICE - profile.credits} créditos.`);
    }
    return {
      profile: {
        ...profile,
        credits: profile.credits - BATTLE_PASS_PRICE,
        battlePass: { ...profile.battlePass, premium: true },
      },
    };
  });
});

exports.claimBattlePassReward = onCall(async (request) => {
  const uid = requireUser(request);
  const track = request.data?.track === 'premium' ? 'premium' : 'free';
  const level = num(request.data?.level);
  if (level < 1 || level > BATTLE_PASS_LEVELS) {
    throw new HttpsError('invalid-argument', 'Nivel de recompensa no válido.');
  }
  const key = `${track === 'premium' ? 'p' : 'f'}${level}`;
  const credits = track === 'premium' ? PREMIUM_TIER_CREDITS : FREE_TIER_CREDITS;
  return withProfile(uid, (profile) => {
    if (level > profile.battlePass.level) {
      throw new HttpsError('failed-precondition', 'Nivel todavía no desbloqueado.');
    }
    if (profile.battlePass.claimed.includes(key)) {
      throw new HttpsError('already-exists', 'Recompensa ya reclamada.');
    }
    if (track === 'premium' && !profile.battlePass.premium) {
      throw new HttpsError('permission-denied', 'Necesitas el pase premium.');
    }
    return {
      credits,
      profile: {
        ...profile,
        credits: profile.credits + credits,
        battlePass: { ...profile.battlePass, claimed: [...profile.battlePass.claimed, key] },
      },
    };
  });
});

exports.equipItem = onCall(async (request) => {
  const uid = requireUser(request);
  const preset = String(request.data?.preset || 'islander');
  const color = num(request.data?.color, 0xffb45c) & 0xffffff;
  if (!PRESET_IDS.has(preset)) throw new HttpsError('invalid-argument', 'Traje desconocido.');
  if (!SHOP_COLORS.has(color)) throw new HttpsError('invalid-argument', 'Color desconocido.');
  return withProfile(uid, (profile) => {
    if (preset !== 'islander' && !profile.owned.includes(`preset_${preset}`)) {
      throw new HttpsError('permission-denied', 'Ese traje no está en tu taquilla.');
    }
    if (color !== 0xffb45c) {
      const ownsColor = profile.owned.some((id) => COLOR_BY_ITEM[id] === color);
      if (!ownsColor) throw new HttpsError('permission-denied', 'Ese color no está en tu taquilla.');
    }
    return { profile: { ...profile, equipped: { preset, color } } };
  });
});

exports.awardMatch = onCall(async (request) => {
  const uid = requireUser(request);
  const matchId = String(request.data?.matchId || '');
  if (!matchId || matchId.length > 80) {
    throw new HttpsError('invalid-argument', 'Identificador de partida no válido.');
  }
  const xpGain = matchXp(request.data || {});
  return withProfile(uid, (profile) => {
    if (profile.awardedMatches.includes(matchId)) {
      return { xp: 0, alreadyAwarded: true, profile };
    }
    const xp = profile.xp + xpGain;
    return {
      xp: xpGain,
      levelsGained: Math.max(0, levelFromXp(xp) - profile.battlePass.level),
      profile: {
        ...profile,
        xp,
        stats: {
          matches: profile.stats.matches + 1,
          wins: profile.stats.wins + (request.data?.victory ? 1 : 0),
          kills: profile.stats.kills + num(request.data?.kills),
        },
        awardedMatches: [...profile.awardedMatches, matchId].slice(-60),
      },
    };
  });
});
