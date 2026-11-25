/**
 * OpenNite - Formato de mapa de Easy Game Developer ("egd-map").
 *
 * Un mapa de EGD es:
 *   { format: "egd-map", version: 1, name, world, entities }
 *   - world: { size, tileSize, tiles[size*size], style, round, fade, paths, sky, fog, ... }
 *     cada tesela { t: tipo, h: altura en pasos de 0.5 m, m: "block"|"ramp", d: 0..3, r: subida,
 *                   w: nivel del agua (opcional, en pasos de 0.5 m; hay agua si w > h) }
 *     water: ajustes del agua (colores, opacidad, olas, reflejos, espuma, cascadas...)
 *   - entities: [{ id, type, name, position[3], rotation[3] (grados), scale[3], ... }]
 *
 * OpenNite lee y guarda ese archivo tal cual. Lo propio de OpenNite que EGD no
 * conoce (vientos, tema, semilla...) va en una clave extra `opennite`, que EGD ignora.
 *
 * Este módulo NO depende de Three.js (lo usa map-system.mjs). La forma del terreno
 * la construye src/core/egd-terrain.mjs, que es el código de terreno de EGD.
 */

export const EGD_MAP_FORMAT = 'egd-map';
export const EGD_STEP = 0.5;
export const EGD_LIQUIDS = ['water', 'lava'];
export const EGD_TYPES = ['grass', 'dirt', 'sand', 'stone', 'brick', 'wood', 'snow', 'volcanic', 'picon', 'blacksand', 'water', 'lava'];
const RAD = Math.PI / 180;

/** ¿Es un mapa (o mundo suelto) de Easy Game Developer? */
export function isEgdMap(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  if (raw.format === EGD_MAP_FORMAT) return true;
  if (raw.world && Array.isArray(raw.world.tiles)) return true;
  return Array.isArray(raw.tiles) && Number.isFinite(raw.size) && !raw.pieces;
}

/** Valores por defecto de un mundo de EGD (mismos que M0 en el motor). */
export function egdWorldDefaults(r) {
  r.name ??= 'Mapa principal';
  r.sky ??= '#8ec9ff';
  r.fog ??= true;
  r.sun ??= 2.4;
  r.ambient ??= 1;
  r.tileSize ??= 2;
  r.size ??= Math.round(Math.sqrt(r.tiles.length));
  r.style ??= 'smooth';
  r.round ??= 0.8;
  r.fade ??= 1.2;
  r.paths ??= [];
  r.mist ??= 0;
  r.grassOn ??= true;
  r.grassHeight ??= 0.55;
  r.grassBase ??= '#2f7d32';
  r.grassTip ??= '#b7e35a';
  return r;
}

export function egdNewTile(t = 'grass', h = 0) {
  return { t, h, m: 'block', d: 0, r: 2 };
}

/** Mundo vacío de EGD (igual que Hr en el motor). */
export function egdNewWorld(size = 32, tileSize = 2, type = 'grass') {
  return egdWorldDefaults({
    size, tileSize, tiles: Array.from({ length: size * size }, () => egdNewTile(type, 0)),
  });
}

export const egdOrigin = (w) => -w.size * w.tileSize / 2;
export function egdIndexAt(w, x, z) {
  const o = egdOrigin(w);
  return { ix: Math.floor((x - o) / w.tileSize), iz: Math.floor((z - o) / w.tileSize) };
}
export function egdTileCenter(w, ix, iz) {
  const o = egdOrigin(w);
  return [o + (ix + 0.5) * w.tileSize, o + (iz + 0.5) * w.tileSize];
}
export function egdTileAt(w, ix, iz) {
  return ix < 0 || iz < 0 || ix >= w.size || iz >= w.size ? null : w.tiles[iz * w.size + ix];
}

// ------------------------------------------------------------------ entidades
// OpenNite -> EGD
const PIECE_TO_ENTITY = {
  tree_round: ['prop', 'tree'], tree_tall: ['prop', 'tree'], tree_birch: ['prop', 'tree'], tree_autumn: ['prop', 'tree'],
  tree_dead: ['prop', 'tree'], tree_pine: ['prop', 'pine'], tree_palm: ['prop', 'palm'], tree_willow: ['prop', 'drago'],
  rock: ['prop', 'rock'], rock_small: ['prop', 'rock'], rock_big: ['prop', 'bigrock'], chest: ['prop', 'chest'],
  container: ['prop', 'crate'], house: ['build', 'house'], cabin: ['build', 'house'], tower: ['build', 'tower'],
  wall: ['build', 'wall'], wall_corner: ['build', 'wall'], wall_door: ['build', 'wallDoor'], wall_window: ['build', 'wallWindow'],
  floor: ['build', 'floor'], roof: ['build', 'roof'], stairs: ['build', 'stairs'], column: ['build', 'pillar'],
};

/** Entidad de EGD -> pieza de OpenNite, o null si OpenNite no la representa. */
export function egdEntityToPiece(e) {
  if (!e || typeof e !== 'object') return null;
  let type = null;
  // Jugabilidad de OpenNite: cofres y recogibles pasan a cofres/puntos de arma.
  if (e.type === 'prop' && e.prop === 'chest') type = 'chest';
  else if (e.type === 'pickup') type = 'weapon_spawn';
  // Punto de aparición del modo entrenamiento.
  else if (e.type === 'spawn') type = 'spawn';
  // El resto de objetos visibles se dibuja con el mismo código que EGD.
  else if (['build', 'prop', 'primitive', 'composite'].includes(e.type)) type = 'egd_object';
  if (!type) return null;
  const pos = Array.isArray(e.position) ? e.position : [0, 0, 0];
  const rot = Array.isArray(e.rotation) ? e.rotation : [0, 0, 0];
  const piece = { type, x: +pos[0] || 0, z: +pos[2] || 0, y: +pos[1] || 0, rot: (+rot[1] || 0) * RAD, egd: e };
  const s = Array.isArray(e.scale) ? +e.scale[1] : 1;
  if (Number.isFinite(s) && Math.abs(s - 1) > 1e-3) piece.scale = s;
  return piece;
}

let _idSeq = 0;
const newId = (p) => `${p}_${Date.now().toString(36)}${(_idSeq++).toString(36)}`;

/** Pieza de OpenNite -> entidad de EGD (respeta la entidad original si vino de EGD). */
export function egdPieceToEntity(p) {
  const rotDeg = Math.round((((+p.rot || 0) / RAD) % 360 + 360) % 360 * 1000) / 1000;
  const pos = [+p.x || 0, Number.isFinite(+p.y) ? +p.y : 0, +p.z || 0];
  if (p.egd && typeof p.egd === 'object') {
    const e = { ...p.egd, position: pos };
    const r = Array.isArray(e.rotation) ? [...e.rotation] : [0, 0, 0];
    // Conserva el valor original (p. ej. -90) si el ángulo no ha cambiado.
    const prev = +r[1] || 0;
    const same = Math.abs(((((prev - rotDeg) % 360) + 540) % 360) - 180) < 1e-3;
    if (!same) r[1] = rotDeg;
    e.rotation = r;
    return e;
  }
  const map = PIECE_TO_ENTITY[p.type];
  if (!map && p.type !== 'weapon_spawn') return null;
  const scale = Number.isFinite(p.scale) ? p.scale : 1;
  const base = { id: newId('ent'), name: p.type, position: pos, rotation: [0, rotDeg, 0], scale: [scale, scale, scale], scripts: [], props: { health: 0 }, color: '#c8c8c8', opennite: { type: p.type } };
  if (p.type === 'weapon_spawn') return { ...base, type: 'pickup', itemId: p.itemId || null };
  if (map[0] === 'prop') return { ...base, type: 'prop', prop: map[1] };
  return { ...base, type: 'build', piece: (map[1] === 'house' && p.floors > 1) ? 'house2' : map[1], material: p.material || 'wood', breakable: true };
}

// ------------------------------------------------------------------ agua
// Agua del EGD nuevo: cada tesela puede tener un nivel de agua `w` (en pasos de
// 0.5 m) por encima de su suelo `h`. La superficie está en w*0.5 - 0.15.
export const EGD_WATER_OFFSET = 0.15;
/** ¿Tiene agua la tesela? (mismo criterio que EGD: w > h) */
export const egdTileHasWater = (t) => !!t && t.w !== undefined && t.w !== null && t.w > t.h;
/** Altura de la superficie del agua de una tesela con agua. */
export const egdTileWaterY = (t) => t.w * EGD_STEP - EGD_WATER_OFFSET;

/**
 * Pasa las teselas de agua antiguas (tipo "water", lámina plana) al agua nueva de
 * EGD: misma superficie (w = h) y fondo de arena más hondo cuanto más lejos de la
 * orilla. Así el mapa se ve y se juega con el agua nueva (olas, reflejos, espuma,
 * cascadas y ondas). Devuelve cuántas teselas cambió.
 */
export function egdUpgradeWater(w) {
  const N = w.size, tiles = w.tiles;
  const old = (i) => tiles[i] && tiles[i].t === 'water';
  const dist = new Int32Array(N * N).fill(-1);
  const q = [];
  for (let i = 0; i < N * N; i++) if (tiles[i] && !old(i)) { dist[i] = 0; q.push(i); }
  for (let qi = 0; qi < q.length; qi++) {
    const i = q[qi], x = i % N, z = (i / N) | 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
      const j = nz * N + nx;
      if (dist[j] !== -1) continue;
      dist[j] = dist[i] + 1;
      q.push(j);
    }
  }
  let n = 0;
  for (let i = 0; i < N * N; i++) {
    if (!old(i)) continue;
    const t = tiles[i];
    const d = dist[i] > 0 ? dist[i] : 8; // todo agua: mar abierto
    const depth = Math.min(14, 1 + 2 * d); // 1.5 m en la orilla ... 7 m mar adentro
    t.w = t.h;
    t.h = t.h - depth;
    t.t = 'sand';
    t.m = 'block';
    n++;
  }
  return n;
}

/** Nivel del mar: si la mayoría del borde del mundo es agua, su superficie; si no, sin mar. */
export function egdSeaLevel(w) {
  const N = w.size;
  const counts = new Map();
  let border = 0;
  for (let i = 0; i < N; i++) {
    for (const [ix, iz] of [[i, 0], [i, N - 1], [0, i], [N - 1, i]]) {
      const t = egdTileAt(w, ix, iz);
      border++;
      if (egdTileHasWater(t)) counts.set(t.w, (counts.get(t.w) || 0) + 1);
      else if (t && t.t === 'water') counts.set(t.h, (counts.get(t.h) || 0) + 1);
    }
  }
  let best = null, bestN = 0;
  for (const [h, n] of counts) if (n > bestN) { best = h; bestN = n; }
  return bestN > border * 0.5 ? best * EGD_STEP - EGD_WATER_OFFSET : null;
}

/**
 * Celdas de agua de OpenNite (rejilla de `cell` m) que cubren el agua de EGD,
 * a la altura de su superficie (igual que EGD).
 */
export function egdWaterCells(w, cell = 2) {
  const out = new Map();
  const ts = w.tileSize;
  for (let iz = 0; iz < w.size; iz++) {
    for (let ix = 0; ix < w.size; ix++) {
      const t = w.tiles[iz * w.size + ix];
      let y;
      if (egdTileHasWater(t)) y = egdTileWaterY(t);
      else if (t && t.t === 'water') y = t.h * EGD_STEP - EGD_WATER_OFFSET;
      else continue;
      const [cx, cz] = egdTileCenter(w, ix, iz);
      const n = Math.max(1, Math.round(ts / cell));
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const x = cx - ts / 2 + (i + 0.5) * (ts / n);
        const z = cz - ts / 2 + (j + 0.5) * (ts / n);
        out.set(`${Math.round(x / cell)},${Math.round(z / cell)}`, y);
      }
    }
  }
  return out;
}

// ------------------------------------------------------------------ conversión
/**
 * Mapa de EGD -> objeto de mapa de OpenNite (se pasa luego por normalizeMapData).
 * El mundo de EGD va intacto en `egd.world`; las entidades que OpenNite dibuja
 * pasan a `pieces` y el resto se guarda en `egd.extraEntities` para no perderlas.
 */
export function egdMapToOpenNite(raw) {
  const file = raw.world ? raw : { world: raw, entities: [] };
  const world = egdWorldDefaults(JSON.parse(JSON.stringify(file.world)));
  if (file.name) world.name = file.name;
  egdUpgradeWater(world);
  const extra = [];
  const pieces = [];
  for (const e of Array.isArray(file.entities) ? file.entities : []) {
    const p = egdEntityToPiece(e);
    if (p) pieces.push(p); else extra.push(e);
  }
  const on = (file.opennite && typeof file.opennite === 'object') ? file.opennite : {};
  const sea = egdSeaLevel(world);
  const id = String(on.id || file.id || (world.name || 'egd-map').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'egd-map');
  return {
    ...on,
    id,
    name: file.name || world.name || 'Mapa EGD',
    size: Math.max(120, world.size * world.tileSize),
    waterLevel: sea ?? -100,
    pieces,
    egd: { world, extraEntities: extra, format: file.format || EGD_MAP_FORMAT, version: file.version || 1 },
  };
}

/** Objeto de mapa de OpenNite con bloque `egd` -> archivo egd-map. */
export function openNiteToEgdMap(map) {
  const egd = map.egd || {};
  const world = egdWorldDefaults(JSON.parse(JSON.stringify(egd.world || egdNewWorld())));
  world.name = map.name || world.name;
  const entities = [];
  for (const p of map.pieces || []) {
    if (!p || p.type === 'wind' || p.type === 'road' || p.type === 'path' || p.type === 'grass') continue;
    const e = egdPieceToEntity(p);
    if (e) entities.push(e);
  }
  for (const e of egd.extraEntities || []) entities.push(e);
  const opennite = {
    id: map.id,
    theme: map.theme,
    seed: map.seed,
    waterVegetation: map.waterVegetation,
    winds: (map.winds || []).map((w) => ({ ...w })),
  };
  if (map.lootDensity !== undefined) opennite.lootDensity = map.lootDensity;
  return { format: EGD_MAP_FORMAT, version: egd.version || 1, name: world.name, world, entities, opennite };
}
