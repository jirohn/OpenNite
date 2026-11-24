import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/**
 * Definiciones del kit modular Kenney Building (CC0, mÃ³dulo 2u).
 * Medidas medidas desde los GLB (bounds de accessors):
 *  - mÃ³dulo/base: 2u (Floor 2x0.1x2)
 *  - altura muro: 2.4u, losa: 0.1u  => altura de planta 2.5u
 *  - huecos puerta/ventana: 2u o 4u de largo
 *  - escaleras: ~1.3 (ancho) x 2.5 (alto) x 4 (fondo)
 */
export const KIT_MODULE = 2;
export const KIT_WALL_VIS_Y = 1.35; // escala visual Y para muros/puertas/ventanas (mÃ¡s proporciÃ³n Fortnite)
export const KIT_WALL_H = 2.4 * KIT_WALL_VIS_Y; // 3.24u
export const KIT_SLAB_H = 0.1;
export const KIT_FLOOR_H = KIT_WALL_H + KIT_SLAB_H; // 3.34u por planta

export const KIT_BASE_PATH = './models/kits/kenney-building/';

// Piezas de construcciÃ³n disponibles (archivo, tamaÃ±o real, rol y huella en mÃ³dulos).
export const KIT_CATALOG = {
  floor:              { file: 'floor.glb',              size: [2, 0.1, 2], role: 'floor',  footprint: [1, 1] },
  floor_half:         { file: 'floor_half.glb',         size: [1, 0.1, 2], role: 'floor',  footprint: [0.5, 1] },
  floor_quarter:      { file: 'floor_quarter.glb',      size: [1, 0.1, 1], role: 'floor',  footprint: [0.5, 0.5] },
  wall:               { file: 'wall.glb',               size: [0.1, 2.4, 2], role: 'wall', footprint: [1, 0] },
  wall_half:          { file: 'wall_half.glb',          size: [0.1, 2.4, 1], role: 'wall', footprint: [0.5, 0] },
  wall_low:           { file: 'wall_low.glb',           size: [0.1, 1.2, 2], role: 'wall', footprint: [1, 0] },
  wall_corner:        { file: 'wall_corner.glb',        size: [2, 2.4, 2], role: 'wall', footprint: [1, 1] },
  wall_doorway_round: { file: 'wall_doorway_round.glb', size: [0.2, 2.4, 2], role: 'door', footprint: [1, 0] },
  wall_doorway_wide:  { file: 'wall_doorway_wide.glb',  size: [0.2, 2.4, 4], role: 'door', footprint: [2, 0] },
  wall_window_square: { file: 'wall_window_square.glb', size: [0.2, 2.4, 2], role: 'window', footprint: [1, 0] },
  wall_window_wide:   { file: 'wall_window_wide.glb',   size: [0.2, 2.4, 4], role: 'window', footprint: [2, 0] },
  roof_flat_center:   { file: 'roof_flat_center.glb',   size: [2, 0.1, 2], role: 'roof',  footprint: [1, 1] },
  roof_flat_side:     { file: 'roof_flat_side.glb',     size: [2.2, 0.4, 2], role: 'roof', footprint: [1, 1] },
  roof_flat_corner:   { file: 'roof_flat_corner.glb',   size: [2.2, 0.4, 2.2], role: 'roof', footprint: [1, 1] },
  roof_flat_square:   { file: 'roof_flat_square.glb',   size: [2.394515, 0.4, 2.394515], role: 'roof', footprint: [1, 1] },
  roof_flat_patch:    { file: 'roof_flat_patch.glb',    size: [1.1, 0.05, 1.1], role: 'roof', footprint: [0.5, 0.5] },
  stairs_center:      { file: 'stairs_center.glb',      size: [1.3, 2.5, 4], role: 'stairs', footprint: [1, 2] },
  stairs_closed:      { file: 'stairs_closed.glb',      size: [1.3, 2.5, 4], role: 'stairs', footprint: [1, 2] },
  column:             { file: 'column.glb',             size: [0.5, 2.4, 0.5], role: 'column', footprint: [0, 0] },
};

// Piezas usadas en modo construcciÃ³n (paleta sandbox).
export const BUILD_PIECES = {
  wall:        { kit: 'wall',               label: 'Pared',           snap: [KIT_MODULE, KIT_FLOOR_H, KIT_MODULE] },
  wall_corner: { kit: 'wall_corner',        label: 'Pared con esquina', snap: [KIT_MODULE, KIT_FLOOR_H, KIT_MODULE] },
  wall_door:   { kit: 'wall_doorway_round', label: 'Pared con puerta', snap: [KIT_MODULE, KIT_FLOOR_H, KIT_MODULE] },
  wall_window: { kit: 'wall_window_square', label: 'Pared con ventana', snap: [KIT_MODULE, KIT_FLOOR_H, KIT_MODULE] },
  column:      { kit: 'column',             label: 'Columna',         snap: [0.5, KIT_WALL_H, 0.5] },
  floor:       { kit: 'floor',              label: 'Suelo',           snap: [KIT_MODULE, KIT_SLAB_H, KIT_MODULE] },
  roof:       { kit: 'roof_flat_center',   label: 'Techo',           snap: [KIT_MODULE, KIT_SLAB_H, KIT_MODULE] },
  stairs:     { kit: 'stairs_closed',      label: 'Escaleras',       snap: [KIT_MODULE, KIT_FLOOR_H, KIT_MODULE] },
};

const _loader = new GLTFLoader();
const _cache = new Map(); // key: url -> Promise<THREE.Group template>

function normalizeBase(base) {
  if (!base) return KIT_BASE_PATH;
  return base.endsWith('/') ? base : base + '/';
}

export async function loadKitTemplate(name, base = KIT_BASE_PATH) {
  const def = KIT_CATALOG[name];
  if (!def) throw new Error(`Pieza de kit desconocida: ${name}`);
  const url = normalizeBase(base) + def.file;
  if (!_cache.has(url)) {
    _cache.set(url, _loader.loadAsync(url).then((gltf) => {
      const root = gltf.scene || gltf.scenes?.[0];
      root.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
        }
      });
      return root;
    }).catch((err) => {
      _cache.delete(url);
      throw err;
    }));
  }
  return _cache.get(url);
}

export async function loadBuildingKit(base = KIT_BASE_PATH, names = null) {
  const list = names || Object.keys(KIT_CATALOG);
  const entries = await Promise.all(list.map(async (n) => {
    try { return [n, await loadKitTemplate(n, base)]; }
    catch (e) { console.warn('[kit] No se pudo cargar', n, e); return [n, null]; }
  }));
  const out = {};
  for (const [n, t] of entries) if (t) out[n] = t;
  return out;
}

export function isGlassMaterial(m) {
  const n = String(m?.name || '').toLowerCase();
  if (n.includes('glass') || n.includes('window') || n.includes('pane') || n.includes('transparent')) return true;
  if (m?.userData?.glass) return true;
  // HeurÃ­stica Kenney: cristales claros, lisos y no metÃ¡licos.
  if (m?.color) {
    const c = m.color;
    const bright = (c.r + c.g + c.b) / 3;
    const maxC = Math.max(c.r, c.g, c.b);
    const minC = Math.min(c.r, c.g, c.b);
    const lowSat = (maxC - minC) < 0.18;
    if (bright > 0.78 && (m.roughness ?? 1) < 0.5 && (m.metalness ?? 0) < 0.35) return true;
    if (bright > 0.72 && lowSat && (m.roughness ?? 1) < 0.45) return true;
  }
  return !!m?.transparent && (m.opacity ?? 1) < 0.95;
}

export function cloneKitPiece(template) {
  if (!template) return null;
  const clone = template.clone(true);
  // clonar materiales para permitir tintes independientes si hace falta
  clone.traverse((o) => {
    if (o.isMesh && o.material) {
      const fixMat = (src) => {
        const m = src.clone();
        m.side = THREE.DoubleSide; // evita ventanas/paredes invisibles por una cara
        if (isGlassMaterial(m)) {
          m.transparent = true;
          m.opacity = Math.min(m.opacity ?? 1, 0.28);
          m.roughness = Math.min(m.roughness ?? 0.2, 0.15);
          m.metalness = Math.max(m.metalness ?? 0, 0.05);
          m.depthWrite = false;
          m.color?.setHex?.(0xcfe8ff);
        }
        m.needsUpdate = true;
        return m;
      };
      o.material = Array.isArray(o.material) ? o.material.map(fixMat) : fixMat(o.material);
      o.castShadow = !isGlassMaterial(Array.isArray(o.material) ? o.material[0] : o.material);
      o.receiveShadow = true;
    }
  });
  return clone;
}

export function tintKitPiece(root, color) {
  if (!root || color == null) return;
  const c = new THREE.Color(color);
  root.traverse((o) => {
    if (o.isMesh && o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (!m?.color) continue;
        if (isGlassMaterial(m)) continue; // no tintar cristal
        m.color.copy(c);
      }
    }
  });
}

/** Colisionador AABB alineado a ejes (en mundo) para una pieza colocada en (x,y,z) con rotY. */
export function kitPieceCollider(name, x, y, z, rotY = 0, scaleY = 1) {
  const def = KIT_CATALOG[name];
  if (!def) return null;
  const [sx, sy0, sz] = def.size;
  const sy = sy0 * (scaleY || 1);
  const k = ((Math.round((rotY || 0) / (Math.PI / 2)) % 4) + 4) % 4;
  const swap = k % 2 === 1;
  const hx = (swap ? sz : sx) / 2;
  const hz = (swap ? sx : sz) / 2;
  // bounds del modelo: Y desde 0 hacia arriba, centrado en XZ
  return { minX: x - hx, maxX: x + hx, minY: y, maxY: y + sy, minZ: z - hz, maxZ: z + hz };
}

export function rotLocalBoxToWorld(local, x, y, z, rotY = 0, minThick = 0) {
  const k = ((Math.round((rotY || 0) / (Math.PI / 2)) % 4) + 4) % 4;
  const swap = k % 2 === 1;
  let wx = swap ? local.sz : local.sx;
  let wz = swap ? local.sx : local.sz;
  if (minThick > 0) {
    wx = Math.max(wx, minThick);
    wz = Math.max(wz, minThick);
  }
  const hx = wx / 2;
  const hz = wz / 2;
  const cx = local.cx || 0;
  const cz = local.cz || 0;
  const wcx = swap ? cz : cx;
  const wcz = swap ? cx : cz;
  return {
    minX: x + wcx - hx, maxX: x + wcx + hx,
    minY: y + (local.minY || 0), maxY: y + (local.maxY || 0),
    minZ: z + wcz - hz, maxZ: z + wcz + hz,
  };
}

/** Colisionadores de gameplay para una pieza. Piezas con puerta dejan hueco pasable. */
export function kitPieceGameplayColliders(name, x, y, z, rotY = 0, scaleY = 1) {
  const def = KIT_CATALOG[name];
  if (!def) return [];
  const [sx, sy0, sz] = def.size;
  const sy = sy0 * (scaleY || 1);

  if (def.role === 'door') {
    // Hueco central amplio para que el jugador entre con holgura.
    const openW = Math.min(sz - 0.2, Math.max(1.4, sz * 0.76));
    const openH = Math.min(sy - 0.12, Math.max(2.2, sy * 0.82));
    const post = Math.max(0.08, (sz - openW) / 2);
    const thick = Math.max(0.24, sx);
    const boxes = [];
    // poste -Z
    boxes.push(rotLocalBoxToWorld({ sx: thick, sz: post, minY: 0, maxY: sy, cx: 0, cz: -(openW / 2 + post / 2) }, x, y, z, rotY, 0.3));
    // poste +Z
    boxes.push(rotLocalBoxToWorld({ sx: thick, sz: post, minY: 0, maxY: sy, cx: 0, cz: (openW / 2 + post / 2) }, x, y, z, rotY, 0.3));
    // dintel
    boxes.push(rotLocalBoxToWorld({ sx: thick, sz: openW, minY: openH, maxY: sy, cx: 0, cz: 0 }, x, y, z, rotY, 0.3));
    for (const b of boxes) b.role = 'door';
    return boxes.filter(Boolean);
  }

  if (def.role === 'window') {
    // Marco sÃ³lido + hueco de cristal (el cristal se gestiona como panel rompible en world).
    const fullH = sy;
    const glassW = Math.max(0.5, sz * 0.62);
    const sill = Math.max(0.65, fullH * 0.28);
    const top = Math.max(sill + 0.5, fullH * 0.82);
    const post = Math.max(0.08, (sz - glassW) / 2);
    const thick = Math.max(0.24, sx);
    const boxes = [];
    boxes.push(rotLocalBoxToWorld({ sx: thick, sz: post, minY: 0, maxY: fullH, cx: 0, cz: -(glassW / 2 + post / 2) }, x, y, z, rotY, 0.3));
    boxes.push(rotLocalBoxToWorld({ sx: thick, sz: post, minY: 0, maxY: fullH, cx: 0, cz:  (glassW / 2 + post / 2) }, x, y, z, rotY, 0.3));
    boxes.push(rotLocalBoxToWorld({ sx: thick, sz: glassW, minY: 0, maxY: sill, cx: 0, cz: 0 }, x, y, z, rotY, 0.3));
    boxes.push(rotLocalBoxToWorld({ sx: thick, sz: glassW, minY: top, maxY: fullH, cx: 0, cz: 0 }, x, y, z, rotY, 0.3));
    for (const b of boxes) { b.role = 'windowFrame'; b.windowSillY = y + sill; b.windowTopY = y + top; }
    return boxes.filter(Boolean);
  }

  if (name === 'column' || name === 'wall_corner') {
    const c = kitPieceCollider(name, x, y, z, rotY, scaleY);
    if (!c) return [];
    c.role = def.role || 'solid';
    return [c];
  }

  const c = kitPieceCollider(name, x, y, z, rotY, scaleY);
  if (!c) return [];
  c.role = def.role || 'solid';
  if (def.role === 'wall') {
    const minThick = 0.3;
    if (c.maxX - c.minX < minThick) { const cxm = (c.minX + c.maxX) / 2; c.minX = cxm - minThick / 2; c.maxX = cxm + minThick / 2; }
    if (c.maxZ - c.minZ < minThick) { const czm = (c.minZ + c.maxZ) / 2; c.minZ = czm - minThick / 2; c.maxZ = czm + minThick / 2; }
  }
  return [c];
}

/** Caja de colisiÃ³n "gruesa" para gameplay (compat). Para puertas devuelve null (usar kitPieceGameplayColliders). */
export function kitPieceGameplayCollider(name, x, y, z, rotY = 0, scaleY = 1) {
  const def = KIT_CATALOG[name];
  if (def?.role === 'door') return null;
  const cols = kitPieceGameplayColliders(name, x, y, z, rotY, scaleY);
  return cols[0] || null;
}

