import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/**
 * Definiciones del kit modular Kenney Building (CC0, módulo 2u).
 * Medidas medidas desde los GLB (bounds de accessors):
 *  - módulo/base: 2u (Floor 2x0.1x2)
 *  - altura muro: 2.4u, losa: 0.1u  => altura de planta 2.5u
 *  - huecos puerta/ventana: 2u o 4u de largo
 *  - escaleras: ~1.3 (ancho) x 2.5 (alto) x 4 (fondo)
 */
export const KIT_MODULE = 2;
export const KIT_WALL_H = 2.4;
export const KIT_SLAB_H = 0.1;
export const KIT_FLOOR_H = KIT_WALL_H + KIT_SLAB_H; // 2.5u por planta

export const KIT_BASE_PATH = './models/kits/kenney-building/';

// Piezas de construcción disponibles (archivo, tamaño real, rol y huella en módulos).
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

// Piezas usadas en modo construcción (paleta sandbox).
export const BUILD_PIECES = {
  wall:       { kit: 'wall',               label: 'Pared',           snap: [KIT_MODULE, KIT_FLOOR_H, KIT_MODULE] },
  wall_door:  { kit: 'wall_doorway_round', label: 'Pared con puerta', snap: [KIT_MODULE, KIT_FLOOR_H, KIT_MODULE] },
  wall_window:{ kit: 'wall_window_square', label: 'Pared con ventana',snap: [KIT_MODULE, KIT_FLOOR_H, KIT_MODULE] },
  floor:      { kit: 'floor',              label: 'Suelo',           snap: [KIT_MODULE, KIT_SLAB_H, KIT_MODULE] },
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

export function cloneKitPiece(template) {
  if (!template) return null;
  const clone = template.clone(true);
  // clonar materiales para permitir tintes independientes si hace falta
  clone.traverse((o) => {
    if (o.isMesh && o.material) {
      o.material = Array.isArray(o.material) ? o.material.map(m => m.clone()) : o.material.clone();
      o.castShadow = true;
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
      for (const m of mats) if (m.color) m.color.copy(c);
    }
  });
}

/** Colisionador AABB alineado a ejes (en mundo) para una pieza colocada en (x,y,z) con rotY. */
export function kitPieceCollider(name, x, y, z, rotY = 0) {
  const def = KIT_CATALOG[name];
  if (!def) return null;
  const [sx, sy, sz] = def.size;
  const k = ((Math.round((rotY || 0) / (Math.PI / 2)) % 4) + 4) % 4;
  const swap = k % 2 === 1;
  const hx = (swap ? sz : sx) / 2;
  const hz = (swap ? sx : sz) / 2;
  // bounds del modelo: Y desde 0 hacia arriba, centrado en XZ
  return { minX: x - hx, maxX: x + hx, minY: y, maxY: y + sy, minZ: z - hz, maxZ: z + hz };
}

/** Caja de colisión "gruesa" para gameplay (asegura grosor mínimo en muros). */
export function kitPieceGameplayCollider(name, x, y, z, rotY = 0) {
  const c = kitPieceCollider(name, x, y, z, rotY);
  if (!c) return null;
  // engrosar muros finos para que el jugador no los atraviese fácilmente
  const def = KIT_CATALOG[name];
  if (def && def.role === 'wall' || def?.role === 'door' || def?.role === 'window') {
    const minThick = 0.3;
    if (c.maxX - c.minX < minThick) { const cx = (c.minX + c.maxX) / 2; c.minX = cx - minThick / 2; c.maxX = cx + minThick / 2; }
    if (c.maxZ - c.minZ < minThick) { const cz = (c.minZ + c.maxZ) / 2; c.minZ = cz - minThick / 2; c.maxZ = cz + minThick / 2; }
  }
  return c;
}
