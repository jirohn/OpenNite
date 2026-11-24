import * as THREE from 'three';
import { fbm, hash2, makeRandom } from './utils.js';

export const GRID_CELL_SIZE = 1;
export const MODULAR_TYPES = new Set([
  'house','cabin','tower','container','wall','wall_corner','column','wall_door','wall_window',
  'floor','roof','stairs','chest','weapon_spawn','spawn','loot_spawn','tree_round','tree_pine',
  'tree_palm','tree_tall','tree_birch','tree_dead','tree_willow','tree_autumn','rock','rock_big','rock_small','grass',
  'road','path','barrier','ladder','crane','barrel','crate','lamp','bench','fence','generic_module',
]);

export function gridKey(x, y, z) { return `${x},${y},${z}`; }
export function cellKey(gx, gz) { return `${gx},${gz}`; }
export function snapPiece(x, z, type = '') {
  const cell = GRID_CELL_SIZE;
  const gx = Math.floor(x / cell), gz = Math.floor(z / cell);
  let sx = gx * cell, sz = gz * cell;
  if (type === 'wall' && Math.abs(((x / cell) - gx) * cell) > 1.5 && Math.abs(((z / cell) - gz) * cell) > 1.5) {
    // Walls choose the nearest face inside the current cell.
  }
  return { x: sx, z: sz, gx, gz };
}

export class GridState {
  constructor(entries = {}) { this.map = new Map(entries); }
  set(key, value) { this.map.set(key, value); }
  get(key) { return this.map.get(key); }
  has(key) { return this.map.has(key); }
  delete(key) { return this.map.delete(key); }
  clear() { this.map.clear(); }
  keys() { return this.map.keys(); }
  values() { return this.map.values(); }
  toJSON() { return [...this.map.entries()]; }
  static fromJSON(data = []) { return new GridState(data); }
}

export class TerrainState {
  constructor(data = {}) {
    this.seed = data.seed ?? 0;
    this.chunkSize = data.chunkSize ?? 32;
    this.modifiedVertices = new Map(Object.entries(data.modifiedVertices || {}));
  }
  setVertex(key, y) { this.modifiedVertices.set(key, y); }
  getVertex(key) { return this.modifiedVertices.get(key); }
  toJSON() { return { seed: this.seed, chunkSize: this.chunkSize, modifiedVertices: [...this.modifiedVertices.entries()] }; }
  static fromJSON(data) { return new TerrainState(data || {}); }
}

export class ChunkManager {
  static terrainHeightAt(x, z, seed, size = 32, baseFreq = 0.045) {
    const n = fbm(x * baseFreq, z * baseFreq, seed, 5, 2.02, 0.5);
    const broad = fbm(x * baseFreq * 0.38 + 30, z * baseFreq * 0.38 - 20, seed + 991, 3);
    const ridge = 1 - Math.abs(fbm(x * baseFreq * 1.6, z * baseFreq * 1.6, seed + 451, 3) * 2 - 1);
    const blockVary = hash2((x | 0) * 12, (z | 0) * 17, seed + 77) - 0.5;
    const h = 6 + n * 1.4 + broad * 0.7 + ridge * 1.2 + blockVary * 1.2;
    return Math.max(1, Math.round(Math.max(1, h) * 4) / 4);
  }
  createTerrainChunk(gx, gz, seed = 0, size = 32) {
    const geo = new THREE.PlaneGeometry(size, size, size, size);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position.array;
    for (let i = 0; i < pos.length; i += 3) {
      const local = Math.floor(i / 3);
      const ix = (local % (size + 1)) * (size / (size - 1));
      const iz = Math.floor(local / (size + 1)) * (size / (size - 1));
      const gxGlobal = gx * size + ix - size / 2;
      const gzGlobal = gz * size + iz - size / 2;
      pos[i + 1] = ChunkManager.terrainHeightAt(gxGlobal, gzGlobal, seed, size);
    }
    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    return geo;
  }
  static ensureSeamStitching(geoA, geoB) {
    if (!geoA || !geoB) return;
    const posA = geoA.attributes.position.array;
    const posB = geoB.attributes.position.array;
    const stride = geoA.attributes.position.itemSize;
    if (posA.length >= 3 && posB.length >= 3) {
      // Copia bordes igualmente calculados para suavizar costuras entre chunks.
      for (let i = 0; i < posA.length; i += 3) posB[i + 1] = posA[i + 1];
      for (let i = 0; i < posB.length; i += 3) posA[i + 1] = posB[i + 1];
    }
    geoA.attributes.position.needsUpdate = true;
    geoB.attributes.position.needsUpdate = true;
    if (geoA.attributes.normal) geoA.computeVertexNormals();
    if (geoB.attributes.normal) geoB.computeVertexNormals();
  }
}

export class PrefabManager {
  constructor(prefabs = []) { this.prefabs = Object.fromEntries(prefabs.map(p => [p.name, p])); }
  async load(path, fetchFn = fetch.bind(globalThis)) {
    try {
      const res = await fetchFn(path + '?t=' + Date.now());
      if (res.ok) this.prefabs = Object.fromEntries((await res.json())?.prefabs || []);
    } catch {}
    return this;
  }
  getPrefab(type) { return this.prefabs[type] || null; }
  async createVisualInstance(type, world, editorMode = false) {
    const prefab = this.getPrefab(type);
    if (!prefab) {
      const geo = new THREE.BoxGeometry(GRID_CELL_SIZE, 3, GRID_CELL_SIZE);
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.55 });
      const m = new THREE.Mesh(geo, mat); m.name = type || 'unknown_piece'; return m;
    }
    if (editorMode || !prefab.attached_model || !world?._loadCustomModel) {
      const geo = new THREE.BoxGeometry(
        (prefab.grid_size?.x || 1) * GRID_CELL_SIZE,
        (prefab.grid_size?.y || 1) * GRID_CELL_SIZE,
        (prefab.grid_size?.z || 1) * GRID_CELL_SIZE
      );
      const color = parseInt(prefab.placeholder_color || '0x5a7d3e', 16);
      const mat = new THREE.MeshStandardMaterial({ color, wireframe: !prefab.attached_model, roughness: 1 });
      const m = new THREE.Mesh(geo, mat); m.name = type || prefab.name; return m;
    }
    const mesh = await world._loadCustomModel(prefab.attached_model);
    if (!mesh) return this.createVisualInstance(type, world, true);
    PrefabManager.autoScaleAndPivot(mesh, prefab);
    return mesh;
  }
  static autoScaleAndPivot(mesh, prefab) {
    const target = new THREE.Vector3(
      (prefab.grid_size?.x || 1) * GRID_CELL_SIZE,
      (prefab.grid_size?.y || 1) * GRID_CELL_SIZE,
      (prefab.grid_size?.z || 1) * GRID_CELL_SIZE
    );
    const box = new THREE.Box3().setFromObject(mesh);
    const size = new THREE.Vector3();
    if (!box.isEmpty()) { box.getSize(size); if (size.lengthSq() > 1e-6) mesh.scale.set(target.x / size.x, target.y / size.y, target.z / size.z); }
    const offset = prefab.pivot_offset || { x: 0, y: 0, z: 0 };
    mesh.position.set(offset.x * GRID_CELL_SIZE, offset.y * GRID_CELL_SIZE, offset.z * GRID_CELL_SIZE);
  }
}

export function createInstancedMesh(name, geometry, material, matrices) {
  const mesh = new THREE.InstancedMesh(geometry, material, matrices?.length || 0);
  mesh.name = name;
  mesh.count = matrices?.length || 0;
  for (let i = 0; i < matrices?.length; i++) mesh.setMatrixAt(i, matrices[i]);
  mesh.instanceMatrix.needsUpdate = true;
  mesh.updateRange.count = matrices?.length || 0;
  return mesh;
}

export class ModularSandbox {
  constructor(world = null) {
    this.world = world;
    this.grid = new GridState();
    this.terrain = new TerrainState({ seed: world?.seed || 0 });
  }
  snapPieceToGrid(x, z, type = '') {
    const { x: sx, z: sz, gx, gz } = snapPiece(x, z, type);
    const y = this.world?.heightAt?.(sx, sz) ?? 0;
    return { x: sx, y, z: sz, rot: 0, gx, gz, cell: cellKey(gx, gz), type };
  }
  placePiece(type, x, z, rot = 0) {
    if (!MODULAR_TYPES.has(type)) return null;
    const placed = this.snapPieceToGrid(x, z, type);
    placed.rot = rot;
    this.grid.set(gridKey(placed.gx, placed.y, placed.gz), { type, x: placed.x, y: placed.y, z: placed.z, rot });
    return placed;
  }
  serialize() { return { grid: this.grid.toJSON(), terrain: this.terrain.toJSON(), version: 1 }; }
  async save(path) {
    const data = JSON.stringify(this.serialize(), null, 2);
    const app = globalThis.window?.opennite?.app;
    if (app?.saveMapFile) return app.saveMapFile(path, data);
    throw new Error('Instalador de Electron no disponible para guardar mapa modular');
  }
  async load(path) {
    const app = globalThis.window?.opennite?.app;
    if (!app?.openMapFile) throw new Error('Instalador de Electron no disponible para cargar mapa modular');
    const raw = await app.openMapFile();
    if (!raw) return false;
    const data = JSON.parse(raw);
    this.grid = GridState.fromJSON(data.grid || []);
    this.terrain = TerrainState.fromJSON(data.terrain || {});
    return true;
  }
}
