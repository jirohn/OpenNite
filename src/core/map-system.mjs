/**
 * OpenNite - Core Map System & Single Source of Truth ("Libro de la Verdad Absoluta")
 * 
 * Este módulo centraliza y estandariza todas las constantes, reglas de cuadrícula,
 * esquemas de datos, funciones de snapping, adaptación de carreteras al terreno,
 * y matemáticas de elevación compartidas al 100% entre:
 *   1. El motor del juego en tiempo real (World, Physics, Loot, Spawns).
 *   2. El sistema modular de construcción tipo Fortnite (BuildingManager).
 *   3. El editor de mapas y herramientas de autoría (tools/map-editor).
 */

import { clamp, lerp, smoothstep, noise2 } from './utils.js';
import { normalizeModularTerrain, serializeModularTerrain, modularHeightAt } from './modular-terrain.mjs';
import { isEgdMap, egdMapToOpenNite, egdWorldDefaults } from './egd-map.mjs';

// ============================================================================
// 1. CONSTANTES DEL GRID MODULAR (ESTILO FORTNITE + CEL-SHADING TOTK)
// ============================================================================

/** Tamaño modular horizontal base: 2 metros (1 celda de suelo 2x2, muro de 2m de ancho). */
export const GRID_SIZE = 2.0;

/** Tamaño estándar de tesela de carretera: 4 metros (exactamente 2x2 celdas de construcción). */
export const ROAD_CELL_SIZE = 4.0;

/** Unidad de snap vertical para terreno y elevación (stud / escalón de terreno). */
export const GRID_HEIGHT_STEP = 0.5;

/** Altura de muro modular: 2.4 metros. */
export const WALL_HEIGHT = 2.4;

/** Grosor de losa / suelo: 0.1 metros. */
export const SLAB_HEIGHT = 0.1;

/**
 * Altura completa de planta (piso a piso): 2.5 metros.
 * Corresponde exactamente a WALL_HEIGHT (2.4) + SLAB_HEIGHT (0.1),
 * y coincide a la perfección con la altura nativa de las escaleras (2.5)
 * y con 5 escalones exactos de GRID_HEIGHT_STEP (0.5 * 5 = 2.5).
 */
export const FLOOR_HEIGHT = 2.5;

/** Radio de influencia de calzada para allanar el terreno automáticamente. */
export const ROAD_BED_HALF_WIDTH = 2.2;
export const ROAD_SHOULDER_WIDTH = 2.0; // zona de transición suave a la ladera

// ============================================================================
// 2. FUNCIONES DE SNAPPING MATEMÁTICO AL GRID
// ============================================================================

/** Ajusta una coordenada horizontal al múltiplo más cercano del grid (por defecto 2u). */
export function snapToGrid(v, step = GRID_SIZE) {
  return Math.round(v / step) * step;
}

/** Ajusta una altura al múltiplo más cercano del paso de elevación (por defecto 0.5u). */
export function snapHeight(y, step = GRID_HEIGHT_STEP) {
  return Math.round(y / step) * step;
}

/** Ajusta una altura a la planta modular más cercana (por defecto múltiplos de 2.5u). */
export function snapFloor(y, floorH = FLOOR_HEIGHT) {
  return Math.round(y / floorH) * floorH;
}

/** Convierte coordenadas mundiales (x, z) a coordenadas enteras del grid. */
export function toGridCoords(x, z, step = GRID_SIZE) {
  return [Math.round(x / step), Math.round(z / step)];
}

/** Genera la clave única "gx,gz" para Maps y Sets. */
export function gridKey(gx, gz) {
  return `${Math.round(gx)},${Math.round(gz)}`;
}

/** Parsea una clave "gx,gz" a coordenadas enteras [gx, gz]. */
export function parseGridKey(key) {
  const i = key.indexOf(',');
  if (i === -1) return [0, 0];
  return [parseInt(key.slice(0, i), 10) || 0, parseInt(key.slice(i + 1), 10) || 0];
}

// ============================================================================
// 3. MODELO Y ESQUEMA CANÓNICO DEL MAPA ("LIBRO DE LA VERDAD ABSOLUTA")
// ============================================================================

/**
 * Normaliza cualquier objeto o JSON de mapa (procedural, legacy o del editor)
 * garantizando que contenga todos los campos requeridos con tipos válidos.
 */
export function normalizeMapData(raw = {}) {
  // Mapas de Easy Game Developer: se leen tal cual (el terreno es el de EGD).
  if (isEgdMap(raw)) raw = egdMapToOpenNite(raw);
  const src = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
  const isCustomList = Array.isArray(raw);

  const id = String(src.id || src.base || 'map-' + Date.now());
  const name = String(src.name || (src.id ? src.id.toUpperCase() : 'Nuevo Mapa'));
  const version = Number(src.version) || 1;
  const theme = ['temperate', 'desert', 'snow', 'autumn'].includes(src.theme) ? src.theme : 'temperate';
  const size = Math.max(120, Math.min(2048, Number(src.size) || 360));
  const seed = Number.isFinite(src.seed) ? Number(src.seed) : 20261119;
  const waterLevel = Number.isFinite(src.waterLevel) ? Number(src.waterLevel) : 0;
  const waterVegetation = clamp(Number(src.waterVegetation ?? 0.6), 0, 1);

  // Terreno: alturas y suavizados por celda modular
  const terrainCell = Number(src.terrain?.cell) || GRID_SIZE;
  const heightOverrides = new Map();
  const rawHeights = src.terrain?.heights || [];
  if (Array.isArray(rawHeights)) {
    for (const item of rawHeights) {
      if (Array.isArray(item) && item.length >= 3) {
        const gx = Math.round(Number(item[0]));
        const gz = Math.round(Number(item[1]));
        const y = Number(item[2]);
        if (Number.isFinite(gx) && Number.isFinite(gz) && Number.isFinite(y)) {
          heightOverrides.set(gridKey(gx, gz), snapHeight(y));
        }
      }
    }
  }

  const heightSmooths = new Map();
  const rawSmooths = src.terrain?.smooths || [];
  if (Array.isArray(rawSmooths)) {
    for (const item of rawSmooths) {
      if (Array.isArray(item) && item.length >= 3) {
        const gx = Math.round(Number(item[0]));
        const gz = Math.round(Number(item[1]));
        const s = clamp(Number(item[2]), 0, 1);
        if (s > 0) heightSmooths.set(gridKey(gx, gz), s);
      }
    }
  }

  // Celdas de agua discretas (lagos, estanques, cascadas)
  // Regla de oro: si hay agua por debajo de otra agua en la misma celda,
  // sólo prevalece la superficie superior visible. El agua subterránea desaparece.
  const waterCells = new Map();
  const rawWater = src.waterCells || src.terrain?.waterCells || [];
  if (Array.isArray(rawWater)) {
    for (const item of rawWater) {
      if (Array.isArray(item) && item.length >= 3) {
        const gx = Math.round(Number(item[0]));
        const gz = Math.round(Number(item[1]));
        const wy = snapHeight(Number(item[2]));
        const veg = item.length >= 4 ? clamp(Number(item[3]), 0, 1) : waterVegetation;
        if (Number.isFinite(gx) && Number.isFinite(gz) && Number.isFinite(wy)) {
          const k = gridKey(gx, gz);
          // Si ya existe agua en esta celda, mantener solo la superficie superior más alta
          const existing = waterCells.get(k);
          if (!existing || wy > existing.y) {
            waterCells.set(k, { y: wy, veg });
          }
        }
      }
    }
  }

  // Si el terreno modificado sube por encima del nivel de agua de una celda,
  // el agua oculta bajo tierra queda purgada automáticamente.
  for (const [k, w] of waterCells.entries()) {
    const terrainH = heightOverrides.get(k);
    if (terrainH !== undefined && terrainH >= w.y) {
      waterCells.delete(k);
    }
  }

  // Fuentes y zonas de viento estilizadas (Zelda TotK)
  const winds = [];
  const rawWinds = Array.isArray(src.winds) ? src.winds : [];
  for (const w of rawWinds) {
    if (!w || typeof w !== 'object') continue;
    const x = snapToGrid(Number(w.x) || 0, GRID_SIZE);
    const z = snapToGrid(Number(w.z) || 0, GRID_SIZE);
    const y = snapHeight(Number.isFinite(w.y) ? Number(w.y) : (heightOverrides.get(gridKey(Math.round(x / GRID_SIZE), Math.round(z / GRID_SIZE))) || 0));
    const rot = Number(w.rot) || 0;
    winds.push({
      id: String(w.id || 'wind_' + Math.random().toString(36).slice(2, 8)),
      type: 'wind',
      x,
      y,
      z,
      rot,
      strength: clamp(Number(w.strength) || 2.5, 0.2, 20),
      radius: clamp(Number(w.radius) || 40, 5, 500),
      name: String(w.name || 'Viento'),
    });
  }

  // Piezas: colocadas en el mundo
  const pieces = [];
  const rawPieces = isCustomList ? raw : (Array.isArray(src.pieces) ? src.pieces : []);
  for (const p of rawPieces) {
    if (!p || typeof p !== 'object' || !p.type) continue;
    // Si la pieza es un viento colocado desde la paleta de piezas, sincronizar con winds
    if (p.type === 'wind') {
      const x = snapToGrid(Number(p.x) || 0, GRID_SIZE);
      const z = snapToGrid(Number(p.z) || 0, GRID_SIZE);
      const y = snapHeight(Number.isFinite(p.y) ? Number(p.y) : 0);
      const rot = Number(p.rot) || 0;
      const windObj = {
        id: String(p.id || 'wind_' + Math.random().toString(36).slice(2, 8)),
        type: 'wind',
        x,
        y,
        z,
        rot,
        strength: clamp(Number(p.strength) || 2.5, 0.2, 20),
        radius: clamp(Number(p.radius) || 40, 5, 500),
        name: String(p.name || 'Viento'),
      };
      if (!winds.some(w => Math.hypot(w.x - x, w.z - z) < 0.5 && Math.abs(w.y - y) < 0.5)) {
        winds.push(windObj);
      }
      pieces.push(windObj);
      continue;
    }
    const x = Number(p.x) || 0;
    const z = Number(p.z) || 0;
    const y = Number.isFinite(p.y) ? Number(p.y) : null;
    const rot = Number(p.rot) || 0;
    const exact = !!src.egd; // en mapas de EGD las posiciones son libres, como en el motor
    const entry = {
      type: String(p.type),
      x: exact ? x : snapToGrid(x, p.type === 'road' || p.type === 'path' ? ROAD_CELL_SIZE : GRID_SIZE),
      z: exact ? z : snapToGrid(z, p.type === 'road' || p.type === 'path' ? ROAD_CELL_SIZE : GRID_SIZE),
      rot,
    };
    if (y !== null) entry.y = exact ? y : snapHeight(y);
    if (Number(p.floors) > 1) entry.floors = Math.max(1, Math.min(10, Math.round(p.floors)));
    if (Number.isFinite(p.scale) && p.scale !== 1) entry.scale = Number(p.scale);
    for (const k of ['modelSrc', 'modelName', 'model', 'modelScale', 'modelRotX', 'modelRotY', 'modelRotZ', 'strength', 'radius', 'egd', 'itemId', 'material']) {
      if (p[k] !== undefined && p[k] !== null) entry[k] = p[k];
    }
    pieces.push(entry);
  }

  // POIs (Puntos de interés)
  const pois = Array.isArray(src.pois) ? src.pois.map((poi) => ({
    name: String(poi.name || 'Zona'),
    type: String(poi.type || 'town'),
    x: Number(poi.x) || 0,
    z: Number(poi.z) || 0,
    radius: Math.max(8, Number(poi.radius) || 24),
  })) : [];

  return {
    id,
    name,
    version,
    theme,
    size,
    seed,
    waterLevel,
    waterVegetation,
    terrain: {
      cell: terrainCell,
      heights: heightOverrides,
      smooths: heightSmooths,
    },
    waterCells,
    winds,
    pieces,
    pois,
    roads: Array.isArray(src.roads) ? src.roads : [],
    // Terreno modular (teselas de 4 m por niveles). null si el mapa no lo usa.
    modular: normalizeModularTerrain(src.modular),
    // Mundo de Easy Game Developer (formato egd-map). null si el mapa no es de EGD.
    egd: (src.egd && src.egd.world && Array.isArray(src.egd.world.tiles))
      ? { ...src.egd, world: egdWorldDefaults(src.egd.world), extraEntities: Array.isArray(src.egd.extraEntities) ? src.egd.extraEntities : [] }
      : null,
    raw: src,
  };
}

/**
 * Serializa un MapDefinition normalizado a un objeto JSON puro,
 * listo para guardarse en disco y ser consumido por el editor o el juego.
 */
export function serializeMapData(mapDef) {
  const norm = normalizeMapData(mapDef);

  const heights = [];
  for (const [key, y] of norm.terrain.heights.entries()) {
    const [gx, gz] = parseGridKey(key);
    heights.push([gx, gz, +y.toFixed(2)]);
  }

  const smooths = [];
  for (const [key, s] of norm.terrain.smooths.entries()) {
    const [gx, gz] = parseGridKey(key);
    smooths.push([gx, gz, +s.toFixed(2)]);
  }

  const waterCells = [];
  for (const [key, w] of norm.waterCells.entries()) {
    const [gx, gz] = parseGridKey(key);
    waterCells.push([gx, gz, +w.y.toFixed(2), +w.veg.toFixed(2)]);
  }

  return {
    id: norm.id,
    name: norm.name,
    version: norm.version,
    theme: norm.theme,
    size: norm.size,
    seed: norm.seed,
    waterLevel: norm.waterLevel,
    waterVegetation: norm.waterVegetation,
    terrain: {
      cell: norm.terrain.cell,
      heights,
      ...(smooths.length ? { smooths } : {}),
    },
    waterCells,
    winds: norm.winds.map((w) => ({ ...w })),
    pieces: norm.pieces.map((p) => ({ ...p })),
    pois: norm.pois.map((poi) => ({ ...poi })),
    ...(norm.modular ? { modular: serializeModularTerrain(norm.modular) } : {}),
    ...(norm.egd ? { egd: norm.egd } : {}),
  };
}

// ============================================================================
// 4. SISTEMA DE CARRETERAS Y ADAPTACIÓN DEL TERRENO
// ============================================================================

/**
 * Analiza las piezas para construir el grafo / conjunto de carreteras en la
 * cuadrícula de 4 metros, calculando elevaciones consistentes y conexiones.
 */
export function buildRoadNetwork(pieces = [], getHeightAtBase = null) {
  const nodes = new Map(); // key "rx,rz" -> { x, z, type, y, neighbors }

  for (const p of pieces) {
    if (!p || (p.type !== 'road' && p.type !== 'path')) continue;
    const rx = Math.round(p.x / ROAD_CELL_SIZE) * ROAD_CELL_SIZE;
    const rz = Math.round(p.z / ROAD_CELL_SIZE) * ROAD_CELL_SIZE;
    const key = `${Math.round(rx / ROAD_CELL_SIZE)},${Math.round(rz / ROAD_CELL_SIZE)}`;
    let y = p.y;
    if (y == null || !Number.isFinite(y)) {
      y = typeof getHeightAtBase === 'function' ? getHeightAtBase(rx, rz) : 0;
    }
    nodes.set(key, {
      x: rx,
      z: rz,
      key,
      type: p.type,
      y: snapHeight(y),
      conn: { n: false, s: false, e: false, w: false },
    });
  }

  // Detectar conexiones con vecinos cardinales
  const DIRS = {
    n: [0, -1],
    s: [0, 1],
    e: [1, 0],
    w: [-1, 0],
  };

  for (const node of nodes.values()) {
    const gx = Math.round(node.x / ROAD_CELL_SIZE);
    const gz = Math.round(node.z / ROAD_CELL_SIZE);
    for (const [dir, [dx, dz]] of Object.entries(DIRS)) {
      const neighbor = nodes.get(`${gx + dx},${gz + dz}`);
      if (neighbor) {
        node.conn[dir] = true;
      }
    }
  }

  return nodes;
}

/**
 * Calcula la influencia de la carretera en un punto (x, z) cualquiera del terreno.
 * Devuelve si está en la calzada, en el talud/hombro, la altura objetivo y el peso de mezcla.
 */
export function getRoadInfluenceAt(x, z, roadNetwork) {
  if (!roadNetwork || roadNetwork.size === 0) {
    return { inRoad: false, weight: 0, roadY: 0 };
  }

  const gx = Math.round(x / ROAD_CELL_SIZE);
  const gz = Math.round(z / ROAD_CELL_SIZE);

  let bestNode = null;
  let minD = Infinity;

  // Comprobar la celda actual y los 8 vecinos inmediatos
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const node = roadNetwork.get(`${gx + dx},${gz + dz}`);
      if (!node) continue;
      const d = Math.hypot(x - node.x, z - node.z);
      if (d < minD) {
        minD = d;
        bestNode = node;
      }
    }
  }

  if (!bestNode) return { inRoad: false, weight: 0, roadY: 0 };

  const totalRadius = ROAD_BED_HALF_WIDTH + ROAD_SHOULDER_WIDTH;
  if (minD > totalRadius) return { inRoad: false, weight: 0, roadY: bestNode.y };

  // Interpolación de altura entre el nodo actual y sus vecinos conectados
  let targetY = bestNode.y;
  const lx = x - bestNode.x;
  const lz = z - bestNode.z;

  const blendToNeighbor = (dx, dz, dist) => {
    const neighborKey = `${Math.round(bestNode.x / ROAD_CELL_SIZE) + dx},${Math.round(bestNode.z / ROAD_CELL_SIZE) + dz}`;
    const neighbor = roadNetwork.get(neighborKey);
    if (!neighbor) return bestNode.y;
    const t = clamp(dist / ROAD_CELL_SIZE, 0, 1);
    return lerp(bestNode.y, neighbor.y, t);
  };

  if (lz < 0 && bestNode.conn.n) targetY = blendToNeighbor(0, -1, -lz);
  else if (lz > 0 && bestNode.conn.s) targetY = blendToNeighbor(0, 1, lz);
  if (lx < 0 && bestNode.conn.w) targetY = (targetY + blendToNeighbor(-1, 0, -lx)) * 0.5;
  else if (lx > 0 && bestNode.conn.e) targetY = (targetY + blendToNeighbor(1, 0, lx)) * 0.5;

  if (minD <= ROAD_BED_HALF_WIDTH) {
    // Calzada plana: 100% altura de carretera
    return { inRoad: true, weight: 1.0, roadY: targetY };
  }

  // Hombro / talud: curva cúbica hermite ultra-suave hacia el terreno natural
  const shoulderT = (minD - ROAD_BED_HALF_WIDTH) / ROAD_SHOULDER_WIDTH;
  const weight = 1.0 - smoothstep(0, 1, shoulderT);

  return { inRoad: true, weight, roadY: targetY };
}

// ============================================================================
// 5. CÁLCULO UNIFICADO DE ALTURA DE TERRENO (LIBRO DE LA VERDAD ABSOLUTA)
// ============================================================================

/**
 * Función central de evaluación de altura de terreno.
 * Ejecutada de forma idéntica en el lector de mapas (World) y en el editor.
 */
export function evaluateTerrainHeight({
  x,
  z,
  rawHeightFn,
  heightOverrides = null,
  cell = GRID_SIZE,
  roadNetwork = null,
  terrainFlats = [],
  pois = [],
  waterLevel = 0,
  modular = null,
}) {
  // 0. Terreno modular: si hay tesela (o el exterior es mar), su altura es exacta
  //    y manda sobre todo lo demás. Mismo resultado en juego y editor.
  if (modular) {
    const mh = modularHeightAt(modular, x, z);
    if (mh !== null) return mh;
  }

  // 1. Altura base procedural
  let h = typeof rawHeightFn === 'function' ? rawHeightFn(x, z) : 0;

  // 2. Aplanados para POIs
  for (const poi of pois) {
    const dx = x - poi.x;
    const dz = z - poi.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist >= poi.radius) continue;
    const flatH = Math.max(poi.flatHeight ?? h, waterLevel + 1.8);
    const t = smoothstep(clamp((dist - poi.radius * 0.52) / (poi.radius * 0.48), 0, 1));
    h = lerp(flatH, h, t);
  }

  // 3. Aplanados locales de edificios (terrainFlats)
  for (const f of terrainFlats) {
    const dx = x - f.x, dz = z - f.z;
    const cos = Math.cos(-(f.rot || 0)), sin = Math.sin(-(f.rot || 0));
    const lx = Math.abs(dx * cos - dz * sin);
    const lz = Math.abs(dx * sin + dz * cos);
    const blend = f.blend || 4;
    const border = f.border || 2;
    const inside = lx <= f.hw && lz <= f.hd;
    if (inside) {
      h = f.y;
      break;
    }
    const ex = Math.max(0, lx - f.hw);
    const ez = Math.max(0, lz - f.hd);
    const dEdge = Math.sqrt(ex * ex + ez * ez);
    if (dEdge < border) {
      h = f.y;
    } else if (dEdge < border + blend) {
      const t = smoothstep(clamp((dEdge - border) / blend, 0, 1));
      h = lerp(f.y, h, t);
    }
  }

  // 4. Overrides de altura editados por cuadrícula (celda modular 2u)
  if (heightOverrides && heightOverrides.size > 0) {
    const cs = cell || GRID_SIZE;
    const gx = x / cs, gz = z / cs;
    const x0 = Math.floor(gx), z0 = Math.floor(gz);
    const x1 = x0 + 1, z1 = z0 + 1;

    const v00 = heightOverrides.get(`${x0},${z0}`);
    const v10 = heightOverrides.get(`${x1},${z0}`);
    const v01 = heightOverrides.get(`${x0},${z1}`);
    const v11 = heightOverrides.get(`${x1},${z1}`);

    if (v00 !== undefined || v10 !== undefined || v01 !== undefined || v11 !== undefined) {
      const h00 = v00 === undefined ? h : v00;
      const h10 = v10 === undefined ? h : v10;
      const h01 = v01 === undefined ? h : v01;
      const h11 = v11 === undefined ? h : v11;

      const tx = gx - x0;
      const tz = gz - z0;
      const a = h00 + (h10 - h00) * tx;
      const b = h01 + (h11 - h01) * tx;
      h = a + (b - a) * tz;
    }
  }

  // 5. Adaptación automática y perfecta del terreno a la red de carreteras
  if (roadNetwork && roadNetwork.size > 0) {
    const inf = getRoadInfluenceAt(x, z, roadNetwork);
    if (inf.inRoad && inf.weight > 0.001) {
      h = lerp(h, inf.roadY, inf.weight);
    }
  }

  return h;
}
