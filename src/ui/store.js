import { useSyncExternalStore } from 'react';

function createStore(initial) {
  let state = initial;
  const listeners = new Set();
  return {
    getState: () => state,
    setState(patch) {
      const next = typeof patch === 'function' ? patch(state) : patch;
      state = { ...state, ...next };
      for (const fn of listeners) fn();
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

export const uiStore = createStore({
  screen: null,
  props: {},
  rev: 0,
  version: '0.1.0',
  updateStatus: '',
  updateProgress: { percent: 0, text: '' },
  loading: { mounted: true, visible: true, percent: 8, text: 'Iniciando motor...' },
});

export const hudStore = createStore({
  mounted: false,
  mapName: '',
  showLockPrompt: false,
  fps: '',
  hp: 100,
  shield: 0,
  lowHp: false,
  damageOpacity: 0,
  stormOpacity: 0,
  slots: [],
  weaponName: 'Pistola',
  weaponColor: '#ffffff',
  ammo: '12',
  reserve: '/ 90',
  reloadHint: '',
  alive: 1,
  stormTime: '',
  hit: false,
  hiddenCrosshair: false,
  pickupVisible: false,
  pickupText: '',
  bannerVisible: false,
  bannerTitle: '',
  bannerSub: '',
  toasts: [],
  kills: [],
});

export function bumpUi() {
  uiStore.setState((s) => ({ rev: s.rev + 1 }));
}

export function pushHudToast(text, type = '') {
  const id = Math.random();
  hudStore.setState((s) => ({
    toasts: [...s.toasts.slice(-4), { text, type, life: 3.4, id }],
  }));
  setTimeout(() => {
    hudStore.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  }, 3400);
}

export const useUi = () => useSyncExternalStore(uiStore.subscribe, uiStore.getState);
export const useHud = () => useSyncExternalStore(hudStore.subscribe, hudStore.getState);
