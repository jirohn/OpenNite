const STORAGE_KEY = 'opennite.settings.v1';

export const QUALITY_PRESETS = {
  low: {
    name: 'Baja', resolutionScale: 0.68, shadows: false, shadowMapSize: 512,
    viewDistance: 2, vegetation: 0.35, bloom: false, ssao: false,
    anisotropy: 1, waterQuality: 0, effects: 0.35, maxParticles: 180,
  },
  medium: {
    name: 'Media', resolutionScale: 0.85, shadows: true, shadowMapSize: 1024,
    viewDistance: 4, vegetation: 0.7, bloom: true, ssao: false,
    anisotropy: 4, waterQuality: 1, effects: 0.7, maxParticles: 380,
  },
  high: {
    name: 'Alta', resolutionScale: 1, shadows: true, shadowMapSize: 2048,
    viewDistance: 6, vegetation: 1, bloom: true, ssao: false,
    anisotropy: 8, waterQuality: 2, effects: 1, maxParticles: 700,
  },
  ultra: {
    name: 'Ultra', resolutionScale: 1, shadows: true, shadowMapSize: 4096,
    viewDistance: 8, vegetation: 1.25, bloom: true, ssao: true,
    anisotropy: 16, waterQuality: 2, effects: 1.4, maxParticles: 1200,
  },
};

export const DEFAULT_SETTINGS = {
  quality: 'medium',
  ...QUALITY_PRESETS.medium,
  fov: 78,
  sensitivity: 0.0022,
  invertY: false,
  cameraShoulder: 1.35,
  cameraDistance: 3.8,
  masterVolume: 0.75,
  sfxVolume: 0.9,
  musicVolume: 0.4,
  showFPS: true,
  maxBots: 19,
  botDifficulty: 'normal',
  mapId: 'san-borondon',
  playerColor: 0xffb45c,
  playerPreset: 'islander',
  showDamageNumbers: true,
  crosshairColor: '#ffffff',
  debugMode: false,
  deafMode: false,
};

function sanitize(raw) {
  const out = { ...DEFAULT_SETTINGS, ...(raw || {}) };
  if (!QUALITY_PRESETS[out.quality]) out.quality = 'medium';
  out.resolutionScale = Math.min(1.5, Math.max(0.5, Number(out.resolutionScale) || 1));
  out.viewDistance = Math.min(10, Math.max(2, Math.floor(Number(out.viewDistance) || 6)));
  out.fov = Math.min(110, Math.max(60, Number(out.fov) || 78));
  out.sensitivity = Math.min(0.01, Math.max(0.0003, Number(out.sensitivity) || 0.0022));
  out.cameraShoulder = Math.min(2.4, Math.max(0.25, Number(out.cameraShoulder) || 1.15));
  out.cameraDistance = Math.min(6, Math.max(1.8, Number(out.cameraDistance) || 3.6));
  out.maxBots = Math.min(19, Math.max(0, Math.floor(Number(out.maxBots) || 19)));
  out.playerColor = Number(out.playerColor) || 0xffb45c;
  out.playerPreset = /^[a-z0-9-]{2,32}$/i.test(String(out.playerPreset || '')) ? out.playerPreset : 'islander';
  for (const key of ['masterVolume', 'sfxVolume', 'musicVolume']) {
    out[key] = Math.min(1, Math.max(0, Number(out[key] ?? 0.75)));
  }
  return out;
}

export class Settings {
  constructor() {
    this.data = sanitize(DEFAULT_SETTINGS);
    this.listeners = new Set();
  }

  async load() {
    let raw = null;
    try {
      if (window.opennite?.settings?.get) {
        raw = await window.opennite.settings.get();
      } else {
        raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      }
    } catch (error) {
      console.warn('No se pudo cargar la configuración:', error);
    }
    this.data = sanitize(raw);
    this.emit();
    return this.data;
  }

  get(key) {
    return this.data[key];
  }

  all() {
    return { ...this.data };
  }

  set(key, value) {
    this.data[key] = value;
    if (key === 'quality' && QUALITY_PRESETS[value]) {
      Object.assign(this.data, QUALITY_PRESETS[value], { quality: value });
    }
    this.data = sanitize(this.data);
    this.emit(key);
    this.save();
    return this.data;
  }

  setMany(values) {
    Object.assign(this.data, values);
    this.data = sanitize(this.data);
    this.emit();
    this.save();
    return this.data;
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(key) {
    for (const fn of this.listeners) {
      try { fn(this.data, key); } catch (error) { console.error(error); }
    }
  }

  save() {
    const payload = JSON.stringify(this.data);
    if (window.opennite?.settings?.set) {
      window.opennite.settings.set(this.data).catch(() => {});
    } else {
      try { localStorage.setItem(STORAGE_KEY, payload); } catch { /* ignore */ }
    }
  }
}

export const settings = new Settings();
