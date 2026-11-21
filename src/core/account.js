import {
  BATTLE_PASS_PRICE, FREE_TIER_CREDITS, PREMIUM_TIER_CREDITS,
  SHOP_BY_ID, SHOP_ITEMS, matchXp, rewardKey, sanitizeProfile,
} from './economy.js';
import { settings } from './settings.js';

const LOCAL_KEY = 'opennite.account.v1';
const env = import.meta.env || {};
const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || '',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: env.VITE_FIREBASE_PROJECT_ID || '',
  appId: env.VITE_FIREBASE_APP_ID || '',
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
};
const FUNCTIONS_REGION = env.VITE_FIREBASE_FUNCTIONS_REGION || 'us-central1';
export const FIREBASE_CONFIGURED = !!(firebaseConfig.apiKey && firebaseConfig.authDomain
  && firebaseConfig.projectId && firebaseConfig.appId);
export const FIREBASE_PROJECT_ID = firebaseConfig.projectId;

const defaultColor = 0xffb45c;
const colorItemIds = new Set(SHOP_ITEMS.filter((item) => item.category === 'Colores').map((item) => item.id));
const colorItemValues = new Set(SHOP_ITEMS.filter((item) => item.category === 'Colores').map((item) => item.color));

class AccountManager {
  constructor() {
    this.profile = null;
    this.status = 'loading';
    this.cloud = false;
    this.error = '';
    this.listeners = new Set();
    this.firebase = null;
    this.unsubscribeAuth = null;
    this.unsubscribeProfile = null;
  }

  snapshot() {
    return {
      status: this.status,
      profile: this.profile,
      cloud: this.cloud,
      configured: FIREBASE_CONFIGURED,
      projectId: FIREBASE_PROJECT_ID,
      error: this.error,
    };
  }

  subscribe(fn) {
    this.listeners.add(fn);
    fn(this.snapshot());
    return () => this.listeners.delete(fn);
  }

  emit() {
    const snapshot = this.snapshot();
    for (const fn of this.listeners) {
      try { fn(snapshot); } catch (error) { console.error(error); }
    }
  }

  async readLocal() {
    try {
      if (window.opennite?.account?.get) {
        const raw = await window.opennite.account.get();
        if (raw) return sanitizeProfile(raw, raw.uid || 'offline');
        // Migración: en versiones anteriores la cuenta solo vivía en localStorage,
        // pero en Electron el origen (puerto local) cambia y ese storage se pierde.
        try {
          const legacy = JSON.parse(localStorage.getItem(LOCAL_KEY) || 'null');
          if (legacy) return sanitizeProfile(legacy, legacy.uid || 'offline');
        } catch { /* ignore */ }
        return sanitizeProfile({}, 'offline');
      }
      const raw = JSON.parse(localStorage.getItem(LOCAL_KEY) || 'null');
      return sanitizeProfile(raw || {}, raw?.uid || 'offline');
    } catch {
      return sanitizeProfile({}, 'offline');
    }
  }

  saveLocal() {
    try {
      if (window.opennite?.account?.set) {
        window.opennite.account.set(this.profile).catch((error) => {
          console.warn('No se pudo guardar el perfil local:', error);
        });
      } else {
        localStorage.setItem(LOCAL_KEY, JSON.stringify(this.profile));
      }
    } catch (error) {
      console.warn('No se pudo guardar el perfil local:', error);
    }
  }

  applyProfile(raw = {}, persist = true) {
    const uid = raw.uid || this.profile?.uid || 'offline';
    this.profile = sanitizeProfile({ ...this.profile, ...raw }, uid);
    if (persist) this.saveLocal();
    const { preset, color } = this.profile.equipped;
    settings.setMany({ playerPreset: preset, playerColor: color });
    this.error = '';
    this.emit();
    return this.profile;
  }

  async init() {
    this.profile = await this.readLocal();
    this.status = FIREBASE_CONFIGURED ? 'connecting' : 'offline';
    this.emit();
    if (!FIREBASE_CONFIGURED) return this.profile;
    try {
      await this.connectFirebase();
    } catch (error) {
      console.warn('Firebase no disponible; se usa el perfil local:', error);
      this.cloud = false;
      this.status = 'offline';
      this.error = error.message || 'Firebase no disponible';
      this.emit();
    }
    return this.profile;
  }

  async connectFirebase() {
    const [{ initializeApp, getApp, getApps }, authMod, fsMod, fnMod] = await Promise.all([
      import('firebase/app'), import('firebase/auth'), import('firebase/firestore'), import('firebase/functions'),
    ]);
    const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    const auth = authMod.getAuth(app);
    try {
      await authMod.setPersistence(auth, authMod.browserLocalPersistence);
    } catch { /* en algunos entornos Electron se usa memoria; no es fatal */ }
    this.firebase = {
      app, auth,
      db: fsMod.getFirestore(app),
      functions: fnMod.getFunctions(app, FUNCTIONS_REGION),
      authMod, fsMod, fnMod,
    };

    this.unsubscribeAuth = authMod.onAuthStateChanged(auth, async (user) => {
      try {
        this.unsubscribeProfile?.();
        this.unsubscribeProfile = null;
        if (!user) {
          this.cloud = false;
          this.status = 'signed-out';
          this.applyProfile({ uid: 'offline', displayName: 'Jugador local', email: '', photoURL: '' });
          return;
        }
        this.cloud = true;
        this.status = 'signed-in';
        const { fsMod: fs } = this.firebase;
        const ref = fs.doc(this.firebase.db, 'users', user.uid);
        const snap = await fs.getDoc(ref);
        const identity = {
          uid: user.uid,
          displayName: user.displayName || this.profile?.displayName || 'Jugador',
          email: user.email || '',
          photoURL: user.photoURL || '',
        };
        if (!snap.exists()) {
          await fs.setDoc(ref, sanitizeProfile({ ...this.profile, ...identity }, user.uid));
          this.applyProfile({ ...this.profile, ...identity });
        } else {
          this.applyProfile({ ...this.profile, ...identity, ...snap.data(), uid: user.uid });
        }
        this.unsubscribeProfile = fs.onSnapshot(ref, (update) => {
          if (update.exists()) this.applyProfile({ ...update.data(), uid: user.uid });
        });
      } catch (error) {
        console.warn('No se pudo sincronizar el perfil:', error);
        this.error = error.message || 'No se pudo sincronizar';
        this.emit();
      }
    });
  }

  async signIn() {
    if (!FIREBASE_CONFIGURED || !this.firebase) throw new Error('Configura Firebase para iniciar sesión');
    const { authMod, auth } = this.firebase;
    const provider = new authMod.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    await authMod.signInWithPopup(auth, provider);
    return this.profile;
  }

  async signOut() {
    if (!this.firebase) return;
    await this.firebase.authMod.signOut(this.firebase.auth);
  }

  async call(name, data = {}) {
    if (!this.cloud || !this.firebase) throw new Error('Se necesita una cuenta conectada');
    const callable = this.firebase.fnMod.httpsCallable(this.firebase.functions, name);
    const response = await callable(data);
    if (response.data?.profile) this.applyProfile(response.data.profile);
    return response.data;
  }

  async purchaseItem(id) {
    const item = SHOP_BY_ID[id];
    if (!item) throw new Error('Artículo desconocido');
    if (this.profile.owned.includes(id)) throw new Error('Ya tienes este artículo');
    if (this.profile.credits < item.price) throw new Error(`Te faltan ${item.price - this.profile.credits} créditos`);
    if (this.cloud) return this.call('purchaseItem', { itemId: id });
    this.applyProfile({
      credits: this.profile.credits - item.price,
      owned: [...this.profile.owned, id],
      updatedAt: Date.now(),
    });
    return { profile: this.profile, purchased: id };
  }

  async purchaseBattlePass() {
    if (this.profile.battlePass.premium) throw new Error('Ya tienes el pase premium');
    if (this.profile.credits < BATTLE_PASS_PRICE) {
      throw new Error(`Te faltan ${BATTLE_PASS_PRICE - this.profile.credits} créditos`);
    }
    if (this.cloud) return this.call('purchaseBattlePass');
    this.applyProfile({
      credits: this.profile.credits - BATTLE_PASS_PRICE,
      battlePass: { ...this.profile.battlePass, premium: true },
      updatedAt: Date.now(),
    });
    return { profile: this.profile };
  }

  async claimReward(track, level) {
    const key = rewardKey(track, level);
    const profile = this.profile;
    if (level > profile.battlePass.level) throw new Error('Nivel todavía no desbloqueado');
    if (profile.battlePass.claimed.includes(key)) throw new Error('Recompensa ya reclamada');
    if (track === 'premium' && !profile.battlePass.premium) throw new Error('Necesitas el pase premium');
    const credits = track === 'premium' ? PREMIUM_TIER_CREDITS : FREE_TIER_CREDITS;
    if (this.cloud) return this.call('claimBattlePassReward', { track, level });
    this.applyProfile({
      credits: profile.credits + credits,
      battlePass: { ...profile.battlePass, claimed: [...profile.battlePass.claimed, key] },
      updatedAt: Date.now(),
    });
    return { profile: this.profile, credits };
  }

  canEquipColor(color) {
    if (Number(color) === defaultColor) return true;
    return colorItemValues.has(Number(color)) && SHOP_ITEMS.some(
      (item) => colorItemIds.has(item.id) && item.color === Number(color) && this.profile.owned.includes(item.id),
    );
  }

  async equip({ preset, color } = {}) {
    const nextPreset = preset || this.profile.equipped.preset;
    const nextColor = color === undefined || color === null ? this.profile.equipped.color : Number(color) & 0xffffff;
    if (nextPreset !== 'islander' && !this.profile.owned.includes(`preset_${nextPreset}`)) {
      throw new Error('Ese traje no está en tu taquilla');
    }
    if (!this.canEquipColor(nextColor)) throw new Error('Ese color no está en tu taquilla');
    if (this.cloud) return this.call('equipItem', { preset: nextPreset, color: nextColor });
    this.applyProfile({ equipped: { preset: nextPreset, color: nextColor }, updatedAt: Date.now() });
    return { profile: this.profile };
  }

  async awardMatch(result = {}) {
    const matchId = result.matchId || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    if (this.profile.awardedMatches.includes(matchId)) {
      return { xp: 0, matchId, alreadyAwarded: true };
    }
    const xp = matchXp(result);
    const before = this.profile.battlePass.level;
    if (this.cloud) {
      const response = await this.call('awardMatch', {
        matchId,
        kills: result.kills || 0,
        rank: result.rank || 20,
        time: result.time || 0,
        victory: !!result.victory,
      });
      const after = this.profile.battlePass.level;
      return { xp, matchId, levelsGained: Math.max(0, after - before), ...response };
    }
    const profile = this.profile;
    const nextXp = profile.xp + xp;
    this.applyProfile({
      xp: nextXp,
      stats: {
        matches: profile.stats.matches + 1,
        wins: profile.stats.wins + (result.victory ? 1 : 0),
        kills: profile.stats.kills + Math.max(0, Math.floor(result.kills || 0)),
      },
      awardedMatches: [...profile.awardedMatches, matchId].slice(-60),
      updatedAt: Date.now(),
    });
    return {
      xp,
      matchId,
      levelsGained: Math.max(0, this.profile.battlePass.level - before),
    };
  }
}

export const account = new AccountManager();
