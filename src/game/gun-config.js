/**
 * Colocación del arma (exportada desde tools/gun-editor.html).
 * Soporta config por arma y una config global por defecto ("default").
 * Si una arma no tiene entrada propia, usa "default" (la de la pistola/fusil).
 * Formato del fichero config/gun-config.json:
 *   { "default": {position, quaternion}, "pickaxe": {position, quaternion}, ... }
 * También se acepta el formato antiguo plano: { position, quaternion }.
 */
export const DEFAULT_GUN_PLACEMENT = {
  position: [0.03, -0.12, 0.21],
  quaternion: [0, 0, 0, 1],
};

let config = { default: { ...DEFAULT_GUN_PLACEMENT } };

export function getGunPlacement(type) {
  const t = type || 'default';
  const entry = config[t] || config.default || DEFAULT_GUN_PLACEMENT;
  const out = {
    position: [...(entry.position || DEFAULT_GUN_PLACEMENT.position)],
    quaternion: [...(entry.quaternion || DEFAULT_GUN_PLACEMENT.quaternion)],
  };
  if (entry.supportGrip) {
    out.supportGrip = {
      position: [...(entry.supportGrip.position || [0, -0.08, 0.02])],
      quaternion: [...(entry.supportGrip.quaternion || [0, 0, 0, 1])],
    };
  }
  if (entry.ikStrength != null) out.ikStrength = Number(entry.ikStrength);
  if (entry.ikStrengthLeft != null) out.ikStrengthLeft = Number(entry.ikStrengthLeft);
  if (entry.ikStrengthRight != null) out.ikStrengthRight = Number(entry.ikStrengthRight);
  if (entry.ikRightTarget && Array.isArray(entry.ikRightTarget.position)) {
    out.ikRightTarget = { position: entry.ikRightTarget.position.map(Number) };
  }
  return out;
}

export function setGunPlacement(cfg, type) {
  const t = type || 'default';
  if (!cfg || !Array.isArray(cfg.position) || !Array.isArray(cfg.quaternion)) return;
  config[t] = {
    position: cfg.position.map(Number),
    quaternion: cfg.quaternion.map(Number),
  };
  if (cfg.supportGrip && Array.isArray(cfg.supportGrip.position)) {
    config[t].supportGrip = {
      position: cfg.supportGrip.position.map(Number),
      quaternion: (cfg.supportGrip.quaternion || [0,0,0,1]).map(Number),
    };
  }
  if (cfg.ikStrength != null) config[t].ikStrength = Number(cfg.ikStrength);
  if (cfg.ikStrengthLeft != null) config[t].ikStrengthLeft = Number(cfg.ikStrengthLeft);
  if (cfg.ikStrengthRight != null) config[t].ikStrengthRight = Number(cfg.ikStrengthRight);
  if (cfg.ikRightTarget && Array.isArray(cfg.ikRightTarget.position)) {
    config[t].ikRightTarget = { position: cfg.ikRightTarget.position.map(Number) };
  }
}

export function getAllGunConfig() {
  return config;
}

export function setAllGunConfig(c) {
  if (c && typeof c === 'object') config = c;
}

export async function loadGunConfig() {
  try {
    const res = await fetch('/config/gun-config.json', { cache: 'no-store' });
    if (!res.ok) return config;
    const data = await res.json();
    if (data && Array.isArray(data.position)) {
      // Formato antiguo plano → se convierte en "default".
      config = { default: { position: data.position, quaternion: data.quaternion } };
    } else if (data && typeof data === 'object') {
      config = data;
      if (!config.default) config.default = { ...DEFAULT_GUN_PLACEMENT };
    }
  } catch { /* sin config: valores por defecto */ }
  return config;
}
