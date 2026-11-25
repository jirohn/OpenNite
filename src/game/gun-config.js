/**
 * Colocación del arma (antes se exportaba desde el editor de armas antiguo; ahora el equipo se edita en OpenNite Studio).
 * Soporta config por arma y una config global por defecto ("default").
 * Si una arma no tiene entrada propia, usa "default".
 * Formato: { "default": {position, quaternion}, "ar": {position, quaternion}, ... }
 * También se acepta el formato antiguo plano: { position, quaternion }.
 */
export const DEFAULT_GUN_PLACEMENT = {
  position: [0.03, -0.12, 0.21],
  quaternion: [0, 0, 0, 1],
};

function normalizePlacement(entry) {
  const src = entry && typeof entry === 'object' ? entry : DEFAULT_GUN_PLACEMENT;
  return {
    position: Array.isArray(src.position) ? src.position.map(Number) : [...DEFAULT_GUN_PLACEMENT.position],
    quaternion: Array.isArray(src.quaternion) ? src.quaternion.map(Number) : [...DEFAULT_GUN_PLACEMENT.quaternion],
  };
}

let config = { default: { ...DEFAULT_GUN_PLACEMENT } };

export function getGunPlacement(type) {
  const t = type || 'default';
  const entry = config[t] || config.default || DEFAULT_GUN_PLACEMENT;
  return normalizePlacement(entry);
}

export function setGunPlacement(cfg, type) {
  const t = type || 'default';
  if (!cfg || !Array.isArray(cfg.position) || !Array.isArray(cfg.quaternion)) return;
  config[t] = normalizePlacement(cfg);
}

export function getAllGunConfig() {
  const out = {};
  for (const [k, v] of Object.entries(config || {})) out[k] = normalizePlacement(v);
  return out;
}

export function setAllGunConfig(c) {
  if (!c || typeof c !== 'object') return;
  const next = {};
  for (const [k, v] of Object.entries(c)) next[k] = normalizePlacement(v);
  config = next;
  if (!config.default) config.default = { ...DEFAULT_GUN_PLACEMENT };
}

export async function loadGunConfig() {
  try {
    const res = await fetch('/config/gun-config.json', { cache: 'no-store' });
    if (!res.ok) return getAllGunConfig();
    const data = await res.json();
    if (data && Array.isArray(data.position)) {
      // Formato antiguo plano -> se convierte en "default".
      config = { default: normalizePlacement(data) };
    } else if (data && typeof data === 'object') {
      setAllGunConfig(data);
    }
  } catch { /* sin config: valores por defecto */ }
  if (!config.default) config.default = { ...DEFAULT_GUN_PLACEMENT };
  return getAllGunConfig();
}
