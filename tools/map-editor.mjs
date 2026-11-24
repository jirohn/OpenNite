window.__mapEditorModule = true;
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { World } from '../src/game/world.js';
import { Settings } from '../src/core/settings.js';
import { LootManager } from '../src/game/loot.js';
import { applyCartoonStyle } from '../src/core/cartoon.mjs';
import { createWindGizmo } from '../src/game/grass.mjs';

import {
  GRID_SIZE,
  FLOOR_HEIGHT,
  GRID_HEIGHT_STEP,
  ROAD_CELL_SIZE,
  snapToGrid,
  snapHeight,
  snapFloor,
  normalizeMapData,
  serializeMapData,
  buildRoadNetwork,
} from '../src/core/map-system.mjs';
import {
  MODULAR_TILE,
  MODULAR_LEVEL,
  MODULAR_DIRS,
  modularKey,
  modularIndex,
  normalizeModularTerrain,
  serializeModularTerrain,
  resampleModularTerrain,
  modularHeightAt,
  modularLevelY,
} from '../src/core/modular-terrain.mjs';

const gltfLoader = new GLTFLoader();
const fbxLoader = new FBXLoader();
const customModelCache = new Map();
const customModelPending = new Map();

function cloneCustomModel(src) {
  const cached = customModelCache.get(src);
  if (!cached) return null;
  return cached.clone(true);
}

async function loadCustomModel(src) {
  if (!src) return null;
  if (customModelCache.has(src)) return customModelCache.get(src);
  if (customModelPending.has(src)) return customModelPending.get(src);
  const p = (async () => {
    try {
      const lower = String(src).toLowerCase();
      const isFbx = lower.includes('.fbx') || lower.startsWith('data:application/octet-stream') || lower.startsWith('data:model/fbx');
      let obj = null;
      if (isFbx) obj = await fbxLoader.loadAsync(src);
      else {
        const gltf = await gltfLoader.loadAsync(src);
        obj = gltf.scene || gltf.scenes?.[0] || null;
      }
      if (!obj) { customModelCache.set(src, null); return null; }
      obj.traverse((o) => {
        if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
      });
      // Normalize to roughly same size/grounding as game defaults: center on XZ, base at Y=0
      const box = new THREE.Box3().setFromObject(obj);
      if (!box.isEmpty()) {
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        obj.position.x -= center.x;
        obj.position.z -= center.z;
        obj.position.y -= box.min.y;
        // Wrap in group so scaling is clean
        const wrap = new THREE.Group();
        wrap.add(obj);
        customModelCache.set(src, wrap);
        return wrap;
      }
      const wrap = new THREE.Group();
      wrap.add(obj);
      customModelCache.set(src, wrap);
      return wrap;
    } catch (e) {
      console.warn('No se pudo cargar modelo custom en editor', src, e);
      customModelCache.set(src, null);
      return null;
    } finally {
      customModelPending.delete(src);
    }
  })();
  customModelPending.set(src, p);
  return p;
}

async function applyCustomModelToPiece(group, modelSrc, scale = 1, rot = null) {
  if (!group || !modelSrc) return false;
  const model = await loadCustomModel(modelSrc);
  if (!model) return false;
  // Only apply if group still attached (not deleted/replaced)
  if (!group.parent) return false;
  // Clear default procedural children
  while (group.children.length) {
    const c = group.children[0];
    group.remove(c);
    c.traverse?.((o) => { o.geometry?.dispose?.(); if (o.material) { (Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.dispose?.()); } });
  }
  const inst = model.clone(true);
  inst.scale.setScalar(scale || 1);
  if (rot) {
    const toRad = (d) => (Number(d) || 0) * Math.PI / 180;
    inst.rotation.set(toRad(rot.x ?? rot.rotX), toRad(rot.y ?? rot.rotY), toRad(rot.z ?? rot.rotZ));
  }
  inst.userData.__customModel = true;
  group.add(inst);
  return true;
}

const natureModelCache = new Map();
const natureModelPending = new Map();
const NATURE_BASE = '/models/quaternius/glTF/';
const NATURE_VARIANTS = {
  tree_pine: ['Pine_1','Pine_2','Pine_4'],
  tree_round: ['CommonTree_1','CommonTree_2','CommonTree_3'],
  tree_palm: ['CoconutPalm_1','CoconutPalm_2','CoconutPalm_3'],
  tree_tall: ['Pine_1','CommonTree_1','Pine_2'],
  tree_birch: ['CommonTree_2','CommonTree_1','CommonTree_3'],
  tree_dead: ['CommonTree_3','CommonTree_1','Pine_4'],
  tree_willow: ['CommonTree_1','CommonTree_2','CommonTree_3'],
  tree_autumn: ['CommonTree_1','CommonTree_2','CommonTree_3'],
  rock: ['Rock_Medium_1','Rock_Medium_2','Rock_Medium_3'],
  rock_big: ['Rock_Medium_1','Rock_Medium_2','Rock_Medium_3'],
  rock_small: ['Pebble_Round_1','Pebble_Square_1','Rock_Medium_3'],
  bush: ['Bush_Common','Bush_Common_Flowers','Fern_1'],
};

async function loadNatureModel(name) {
  if (!name) return null;
  if (natureModelCache.has(name)) return natureModelCache.get(name);
  if (natureModelPending.has(name)) return natureModelPending.get(name);
  const p = (async () => {
    try {
      const gltf = await gltfLoader.loadAsync(`${NATURE_BASE}${name}.gltf`);
      gltf.scene.updateMatrixWorld(true);
      const wrap = new THREE.Group();
      gltf.scene.traverse((o) => {
        if (!o.isMesh) return;
        const geom = o.geometry.clone();
        geom.applyMatrix4(o.matrixWorld);
        const m = new THREE.Mesh(geom, o.material);
        m.castShadow = true; m.receiveShadow = true;
        wrap.add(m);
      });
      natureModelCache.set(name, wrap);
      return wrap;
    } catch (e) {
      natureModelCache.set(name, null);
      return null;
    } finally { natureModelPending.delete(name); }
  })();
  natureModelPending.set(name, p);
  return p;
}

function pickNatureName(type, x, z) {
  const pool = NATURE_VARIANTS[type] || (type?.startsWith?.('tree_') ? NATURE_VARIANTS.tree_round : null);
  if (!pool) return null;
  return pool[Math.abs(((Math.round(x*10)*73856093) ^ (Math.round(z*10)*19349663)) | 0) % pool.length];
}

async function applyDefaultNatureModel(group, type, x, z, scale = 1) {
  if (!group || !type) return false;
  const name = pickNatureName(type, x, z);
  if (!name) return false;
  const model = await loadNatureModel(name);
  if (!model || !group.parent) return false;
  // Don't override if a custom model was applied
  if (group.children.some(c => c.userData?.__customModel)) return false;
  while (group.children.length) {
    const c = group.children[0];
    group.remove(c);
    c.traverse?.((o) => { o.geometry?.dispose?.(); if (o.material) { (Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.dispose?.()); } });
  }
  const inst = model.clone(true);
  let s = scale || 1;
  if (type === 'tree_tall') s *= 1.15;
  if (type === 'tree_birch') s *= 0.95;
  if (type === 'tree_dead') s *= 0.95;
  if (type === 'tree_willow') s *= 1.1;
  if (type === 'rock_big') s *= 1.8;
  if (type === 'rock_small') s *= 0.45;
  if (type === 'bush') s *= 0.9;
  inst.scale.setScalar(s);
  group.add(inst);
  return true;
}

const canvas = document.querySelector('#map-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setClearColor(0x101a24, 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.toneMappingExposure = 1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.BasicShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101a24); // fondo visible para no quedar en la pantalla negra.
const ambientLight = new THREE.AmbientLight(0x404040, 2.2);
scene.add(ambientLight);
const editorDirLight = new THREE.DirectionalLight(0xffffff, 0.8);
editorDirLight.position.set(120, 160, 80);
scene.add(editorDirLight);
const camera = new THREE.PerspectiveCamera(60, canvas.clientWidth / canvas.clientHeight, 0.1, 8000);
camera.position.set(0, 80, 120);
camera.lookAt(0, 0, 0);

const orbit = new OrbitControls(camera, canvas);
orbit.target.set(0, 0, 0);
orbit.enableDamping = true;
orbit.maxPolarAngle = Math.PI * 0.48;
orbit.minDistance = 10;
orbit.maxDistance = 500;
orbit.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
orbit.enablePan = true;

const tControls = new TransformControls(camera, canvas);
tControls.addEventListener('dragging-changed', (e) => {
  orbit.enabled = !e.value;
  if (e.value) {
    // drag start: store offsets
    tControls.userData.start = selectProxy.position.clone();
    tControls.userData.offsets = Array.from(selected).map((idx) => {
      const o = placedGroup.children[idx];
      return { idx, off: o ? o.position.clone().sub(selectProxy.position) : new THREE.Vector3() };
    });
  } else {
    // drag end: sync placed entries
    syncPlacedFromSelection();
  }
});
tControls.addEventListener('objectChange', () => {
  const offsets = tControls.userData.offsets;
  if (!offsets) return;
  for (const { idx, off } of offsets) {
    const o = placedGroup.children[idx];
    if (!o) continue;
    o.position.copy(selectProxy.position).add(off);
  }
  updateSelectionHelpers();
});
tControls.setMode('translate');
tControls.visible = false;
tControls.enabled = false;
scene.add(tControls.getHelper());

const settings = new Settings();
// No bloqueamos el editor en un fetch: el mapa base se muestra inmediatamente
// con el mapa procedural por defecto; `loadCustomMap()` actualiza datos si existen.
const mapData = { type: 'island', theme: 'temperate', size: 360, seed: 20261119, waterLevel: 5, pois: [], islandFlat: true, base: 'island' };
mapData.modelBase = '/models/quaternius/glTF/';
mapData.propBase = '/models/quaternius/props/glTF/';
// El editor no crea su propio terreno ni su propia agua: usa el World real.
const world = new World(scene, mapData, settings);
world.root.visible = true;
window.debugWorld = () => ({
  chunks: world.chunks.size,
  rootChildren: world.root.children.length,
  sceneChildren: scene.children.length,
  camera: camera.position.toArray(),
  lookAt: camera.getWorldDirection(new THREE.Vector3()).toArray(),
  canvasSize: [canvas.clientWidth, canvas.clientHeight],
  webgl2: !!canvas.getContext('webgl2'),
  status: document.querySelector('#status')?.textContent,
  worldChunks: Array.from(world.chunks.keys()).slice(0, 5),
  procedural: world.procedural,
  mapType: world.map?.type,
  worldHalf: world.half,
  worldSize: world.size,
  terrainStyle: world.terrainStyle,
  waterLevel: world.waterLevel,
  waterLevelAuto: world.waterLevelAuto,
  globalGrid: window.globalGrid ? {
    visible: window.globalGrid.visible,
    children: window.globalGrid.children.map(c => ({ name: c.name, type: c.type, count: c.count ?? c.children.length })),
    position: window.globalGrid.position.toArray(),
    worldHalf: world.half,
  } : null,
});
window.world = world; window.scene = scene; window.renderer = renderer;
world.playerState = { speed: 1.2 };
world.detailDistance = 5000;
world.renderDistance = 5000;
const terrainStyleEl = document.querySelector('#terrainStyle');
world.terrainStyle = terrainStyleEl?.value || world.terrainStyle || 'blocky';
if (terrainStyleEl) {
  terrainStyleEl.value = world.terrainStyle;
  terrainStyleEl.addEventListener('change', () => {
    world.terrainStyle = terrainStyleEl.value;
    scheduleRebuild();
  });
}
const GRID_H = GRID_HEIGHT_STEP; // 0.5u - paso vertical de elevación
const waterLevelInput = document.querySelector('#waterLevelInput');
const setWaterLevelBtn = document.querySelector('#setWaterLevelBtn');
const tideToggleBtn = document.querySelector('#tideToggleBtn');
const tideMinEl = document.querySelector('#tideMin');
const tideMaxEl = document.querySelector('#tideMax');
const tideDurationEl = document.querySelector('#tideDuration');
if (waterLevelInput) {
  waterLevelInput.value = snapH(world.waterLevel ?? 0);
  setWaterLevelBtn?.addEventListener('click', () => {
    world.setWaterLevel(snapH(+waterLevelInput.value || 0));
    const statusEl = document.querySelector('#status');
    if (statusEl) statusEl.textContent = `Nivel de agua: ${world.waterLevel.toFixed(2)}`;
    scheduleRebuild();
  });
}
if (tideToggleBtn) {
  const updateTideBtn = () => { tideToggleBtn.textContent = world.waterLevelAuto ? 'Pausar tides' : 'Activar tides'; };
  updateTideBtn();
  tideToggleBtn.addEventListener('click', () => {
    const on = !world.waterLevelAuto;
    world.setWaterLevelAuto(on, {
      min: snapH(+tideMinEl?.value || 0),
      max: snapH(+tideMaxEl?.value || 0),
      duration: Math.max(0.5, +tideDurationEl?.value || 6),
    });
    updateTideBtn();
    const tideStatusEl = document.querySelector('#status');
    if (tideStatusEl) tideStatusEl.textContent = world.waterLevelAuto ? 'Mareas activas (lerp por rangos)' : 'Mareas pausadas';
    scheduleRebuild();
  });
  ['tideMin','tideMax','tideDuration'].forEach((id) => document.querySelector(`#${id}`)?.addEventListener('change', () => {
    if (!world.waterLevelAuto) return;
    world.setWaterLevelAuto(true, { min: snapH(+tideMinEl?.value || 0), max: snapH(+tideMaxEl?.value || 0), duration: Math.max(0.5, +tideDurationEl?.value || 6) });
    scheduleRebuild();
  }));
}
const loot = new LootManager(scene, world, null);
// No bloqueamos el editor si el modelo de cofre tarda/falta: el mapa base ya
// debe verse; el loot puede rellenarse cuando termine en segundo plano.
loot.load(mapData.propBase || '/models/quaternius/props/glTF/').catch((e) => console.warn('[map-editor] loot load:', e));
const cartoonCache = new Map();

// Estado del editor: son los mismos mapas que usa el juego (Libro de la Verdad Absoluta).
const TERRAIN_CELL = GRID_SIZE; // 2.0u - celda modular única para terreno, carreteras y piezas
const FLOOR_H = FLOOR_HEIGHT; // 2.5u - altura de planta modular
const heightOverrides = world.heightOverrides;
const cellSmooth = world.heightSmooths;
const waterCells = world.waterCells;
const waterVegCells = world.waterVegCells;
let baseCustomData = {};
let placedGroup = new THREE.Group(); // se sustituye por el grupo real de piezas
scene.add(placedGroup);
const placed = [];

// ===========================================================================
// GRID 3D — snap modular al grid de piezas (2u base, 4u carretera, 8u edificio)
// ===========================================================================

// Tamaño activo del grid de snap: el usuario puede cambiarlo desde los botones 2u/4u/8u.
let activeGridSize = GRID_SIZE; // 2u por defecto (módulo base)

/** Actualiza el helper visual del grid global según el tamaño elegido. */
function rebuildGlobalGrid() {
  if (globalGrid.parent) globalGrid.parent.remove(globalGrid);
  const totalSize = world.half * 2 + 20;
  const cells = Math.ceil(totalSize / activeGridSize);
  globalGrid.geometry?.dispose?.();
  // Three.js GridHelper: (size, divisions, colorCenter, colorGrid)
  // Creamos un nuevo helper con el tamaño correcto
  const newHelper = new THREE.GridHelper(totalSize, cells, 0x00f0ff, activeGridSize === GRID_SIZE ? 0x0a3050 : activeGridSize === ROAD_CELL_SIZE ? 0x0d4020 : 0x3b2200);
  newHelper.name = 'global-grid';
  newHelper.material.opacity = 0.65;
  newHelper.material.transparent = true;
  newHelper.material.depthWrite = false;
  newHelper.visible = globalGrid.visible;
  newHelper.position.y = 0.08; // ligeramente sobre el suelo
  scene.add(newHelper);
  Object.assign(globalGrid, newHelper);
  // Reemplazar la referencia interna
  _globalGridRef.current = newHelper;
}
// Referencia mutable al grid para poder removerlo y recrearlo
const _globalGridRef = { current: null };

// Grid visual principal del mapa
const _initialGridSize = world.half * 2 + 20;
const _initialCells = Math.ceil(_initialGridSize / GRID_SIZE);
// Grid cubicular visible en todo el mapa: líneas + puntos blancos en cada vértice.
const globalGrid = new THREE.Group();
globalGrid.name = 'global-grid';
const worldGridLine = new THREE.GridHelper(_initialGridSize, Math.max(2, Math.ceil(_initialGridSize / 2)), 0x00f0ff, 0x0a3050);
worldGridLine.name = 'global-grid-lines';
worldGridLine.position.y = 0.1;
globalGrid.add(worldGridLine);
const worldGridDotsGeo = new THREE.BoxGeometry(0.3, 0.3, 0.3);
const worldGridDotsMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x00ddff, roughness: 0.4, metalness: 0 });
const worldGridMaxCount = Math.ceil((world.half * 2 + 20) / 2) ** 2;
const worldGridDots = new THREE.InstancedMesh(worldGridDotsGeo, worldGridDotsMat, worldGridMaxCount);
worldGridDots.name = 'global-grid-dots';
worldGridDots.visible = true;
worldGridDots.frustumCulled = false;
let worldGridDotsCount = 0;
const worldGridDotsMatT = new THREE.Matrix4();
for (let gx = -Math.floor(world.half); gx <= Math.floor(world.half); gx += 2) {
  for (let gz = -Math.floor(world.half); gz <= Math.floor(world.half); gz += 2) {
    worldGridDotsMatT.makeTranslation(gx, 0.1, gz);
    worldGridDots.setMatrixAt(worldGridDotsCount++, worldGridDotsMatT);
  }
}
worldGridDots.count = worldGridDotsCount;
worldGridDots.instanceMatrix.needsUpdate = true;
globalGrid.add(worldGridDots);
// La rejilla antigua de 2u queda oculta: la sustituye la rejilla 3D de teselas.
globalGrid.visible = false;
scene.add(globalGrid);
window.globalGrid = globalGrid;
_globalGridRef.current = globalGrid;

// Botones de tamaño de grid
document.querySelector('#gridSm')?.addEventListener('click', () => { activeGridSize = GRID_SIZE; updateGridSizeUI(); });
document.querySelector('#gridMd')?.addEventListener('click', () => { activeGridSize = ROAD_CELL_SIZE; updateGridSizeUI(); });
document.querySelector('#gridLg')?.addEventListener('click', () => { activeGridSize = 8.0; updateGridSizeUI(); });

function updateGridSizeUI() {
  const lbl = document.querySelector('#gridSizeLabel');
  if (lbl) lbl.innerHTML = `Tamaño celda grid: <strong>${activeGridSize === GRID_SIZE ? '2u (módulo base)' : activeGridSize === ROAD_CELL_SIZE ? '4u (carretera)' : '8u (edificio)'}</strong>`;
  ['#gridSm','#gridMd','#gridLg'].forEach((s, i) => {
    document.querySelector(s)?.classList.toggle('active', [GRID_SIZE, ROAD_CELL_SIZE, 8][i] === activeGridSize);
  });
}
updateGridSizeUI();

const gridVisibilityEl = document.querySelector('#gridVisibility');
gridVisibilityEl?.addEventListener('change', () => { tileGrid.visible = gridVisibilityEl.checked; brushGhostGrid.visible = gridVisibilityEl.checked && mode !== 'select'; });

// Ghost del cursor: una celda de grid resaltada donde caerá la pieza, del tamaño exacto de activeGridSize
const brushGhostGrid = (() => {
  const g = new THREE.Group();
  g.name = 'brush-ghost-grid';
  g.visible = false;
  // Contorno del bloque activo
  const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 0.05, 1));
  const lineMat = new THREE.LineBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.9 });
  const edgesLine = new THREE.LineSegments(edges, lineMat);
  edgesLine.name = 'ghost-edges';
  g.add(edgesLine);
  // Relleno del bloque activo
  const fillGeo = new THREE.PlaneGeometry(1, 1);
  fillGeo.rotateX(-Math.PI / 2);
  const fillMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.09, depthWrite: false });
  const fill = new THREE.Mesh(fillGeo, fillMat);
  fill.name = 'ghost-fill';
  g.add(fill);
  scene.add(g);
  return g;
})();

/** Actualiza el ghost del cursor al tamaño de grid activo. */
function updateBrushGhost(wx, wz, heightY) {
  if (mode === 'tiles') {
    const r = tileRadius();
    const t = modularState.tile;
    brushGhostGrid.position.set(modularIndex(wx, t) * t, heightY + 0.08, modularIndex(wz, t) * t);
    brushGhostGrid.scale.set(t * (2 * r + 1), 1, t * (2 * r + 1));
    brushGhostGrid.visible = true;
    return;
  }
  const gs = (['place','select'].includes(mode) && (selectedPiece === 'road' || selectedPiece === 'path')) ? ROAD_CELL_SIZE :
             mode === 'road' || mode === 'path' ? ROAD_CELL_SIZE :
             mode === 'wind' ? GRID_SIZE : activeGridSize;
  const sx = snapToGrid(wx, gs);
  const sz = snapToGrid(wz, gs);
  brushGhostGrid.position.set(sx, heightY + 0.06, sz);
  brushGhostGrid.scale.set(gs, 1, gs);
  brushGhostGrid.visible = !!gridVisibilityEl?.checked && mode !== 'select';
}

// Brush preview heredado (lo mantenemos para herramientas de terreno)
const brushRing = new THREE.GridHelper(GRID_SIZE, 2, 0x7fd0ff);
brushRing.visible = false;
brushRing.material.transparent = true; brushRing.material.opacity = 0.8;
scene.add(brushRing);

// Terreno tipo bloque: redondeo de bordes expuestos (porcentaje configurable).
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function syncWorldRounding() {
  const pct = clamp(+document.querySelector('#roundPercent')?.value || 50, 0, 100);
  world.pieceRounding = pct / 100;
}
document.querySelector('#roundPercent')?.addEventListener('change', syncWorldRounding);
document.querySelector('#roundPercent')?.addEventListener('input', syncWorldRounding);
syncWorldRounding();

function key(gx, gz) { return gx + ',' + gz; }
function snap(v, g = GRID_SIZE) { return snapToGrid(v, g); }

// La altura que ve el editor es exactamente la del juego.
function editorHeightAt(x, z) { return world.heightAt(x, z); }

// ===========================================================================
// SISTEMA DE VIENTOS — objetos de viento colocables en el mapa
// ===========================================================================
const winds = []; // Array de { id, type:'wind', x,y,z,rot, strength, radius, name }
const windGizmos = new Map(); // id -> THREE.Group (gizmo 3D)
const windGizmoGroup = new THREE.Group();
windGizmoGroup.name = 'wind-gizmos';
scene.add(windGizmoGroup);

let selectedWindId = null;

function addWindGizmo(wind, selected = false) {
  removeWindGizmo(wind.id);
  const gizmo = createWindGizmo(wind, selected);
  windGizmos.set(wind.id, gizmo);
  windGizmoGroup.add(gizmo);
  return gizmo;
}

function removeWindGizmo(windId) {
  const existing = windGizmos.get(windId);
  if (existing) {
    windGizmoGroup.remove(existing);
    existing.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); });
    windGizmos.delete(windId);
  }
}

function refreshWindGizmos() {
  for (const w of winds) addWindGizmo(w, w.id === selectedWindId);
  refreshWindList();
}

function refreshWindList() {
  const listEl = document.querySelector('#windList');
  if (!listEl) return;
  listEl.innerHTML = '';
  if (!winds.length) { listEl.innerHTML = '<div style="color:#778;padding:4px;">Sin fuentes de viento</div>'; return; }
  for (const w of winds) {
    const row = document.createElement('div');
    row.style.cssText = 'padding:3px 6px;cursor:pointer;border-bottom:1px solid #1a2235;display:flex;justify-content:space-between;align-items:center;';
    row.style.background = w.id === selectedWindId ? '#1e3a60' : '';
    const info = document.createElement('span');
    info.textContent = `🌬️ ${w.name} (${w.strength}N, r${w.radius}u)`;
    info.style.flex = '1';
    info.addEventListener('click', () => { selectedWindId = w.id; refreshWindGizmos(); });
    const del = document.createElement('button');
    del.textContent = '🗑️';
    del.style.cssText = 'background:none;border:none;color:#e55;cursor:pointer;padding:0 4px;font-size:13px;';
    del.addEventListener('click', (e) => { e.stopPropagation(); removeWind(w.id); });
    row.append(info, del);
    listEl.appendChild(row);
  }
}

function placeWindAt(wx, wz) {
  const strength = +document.querySelector('#windStrength')?.value || 2.5;
  const radius = +document.querySelector('#windRadius')?.value || 40;
  const name = document.querySelector('#windName')?.value || 'Viento';
  const y = snapHeight(editorHeightAt(wx, wz), GRID_H);
  const wind = {
    id: 'wind_' + Date.now().toString(36),
    type: 'wind',
    x: snapToGrid(wx, GRID_SIZE),
    y,
    z: snapToGrid(wz, GRID_SIZE),
    rot: rotY || 0,
    strength: clamp(strength, 0.2, 20),
    radius: clamp(radius, 5, 500),
    name,
  };
  winds.push(wind);
  placed.push({ ...wind });
  selectedWindId = wind.id;
  refreshWindGizmos();
  document.querySelector('#status').textContent = `Viento "${name}" colocado (fuerza ${strength}, radio ${radius}u)`;
  scheduleRebuild();
}

function removeWind(windId) {
  const idx = winds.findIndex(w => w.id === windId);
  if (idx >= 0) winds.splice(idx, 1);
  const pidx = placed.findIndex(p => p.id === windId && p.type === 'wind');
  if (pidx >= 0) placed.splice(pidx, 1);
  if (selectedWindId === windId) selectedWindId = null;
  removeWindGizmo(windId);
  refreshWindList();
  scheduleRebuild();
}

document.querySelector('#clearWindsBtn')?.addEventListener('click', () => {
  winds.length = 0;
  for (const id of windGizmos.keys()) removeWindGizmo(id);
  for (let i = placed.length - 1; i >= 0; i--) if (placed[i].type === 'wind') placed.splice(i, 1);
  selectedWindId = null;
  refreshWindList();
  scheduleRebuild();
  document.querySelector('#status').textContent = 'Todos los vientos eliminados';
});

// ===========================================================================
// BORRADOR DE AGUA — clic derecho en modo agua, o botón "Borrar agua"
// ===========================================================================
function eraseWaterAt(wx, wz) {
  const radius = Math.max(1, +document.querySelector('#brushSize')?.value || 4);
  const cellR = Math.ceil(radius / TERRAIN_CELL) + 1;
  const cgx = Math.round(wx / TERRAIN_CELL);
  const cgz = Math.round(wz / TERRAIN_CELL);
  let erased = 0;
  for (let dz = -cellR; dz <= cellR; dz++) {
    for (let dx = -cellR; dx <= cellR; dx++) {
      const gx = cgx + dx, gz = cgz + dz;
      const k = key(gx, gz);
      if (waterCells.has(k)) {
        waterCells.delete(k);
        waterVegCells.delete(k);
        erased++;
      }
    }
  }
  if (erased > 0) scheduleRebuild();
  document.querySelector('#status').textContent = `Agua borrada: ${erased} celdas`;
}

// ===========================================================================
// TERRENO MODULAR (teselas de 4 m por niveles) — mismo formato que el juego
// ===========================================================================
const modularState = { tile: MODULAR_TILE, level: MODULAR_LEVEL, baseY: 0.5, outside: 'sea' };
const tileCells = new Map(); // "gx,gz" -> { gx, gz, level, surface, shape, dir, edge }
const tileStroke = new Set(); // teselas ya tocadas en el trazo actual (subir/bajar una vez)
let tileStrokeActive = false;
const tileVal = (id, d) => document.querySelector(id)?.value ?? d;
function tileRadius() { return Math.max(0, Math.min(6, Math.round(+tileVal('#tileRadius', 0) || 0))); }

/** Bloque `modular` listo para guardar (o undefined si no hay teselas). */
function modularPayload() {
  if (!tileCells.size) return undefined;
  return serializeModularTerrain({ ...modularState, cells: tileCells });
}

/** El World del editor usa el mismo terreno modular al instante (alturas exactas). */
function syncWorldModular() {
  world.modular = normalizeModularTerrain(modularPayload());
}

function autoTileDir(c) {
  const sel = tileVal('#tileDir', 'auto');
  if (sel !== 'auto') return +sel;
  for (let d = 0; d < 4; d++) {
    const [dx, dz] = MODULAR_DIRS[d];
    const n = tileCells.get(modularKey(c.gx + dx, c.gz + dz));
    if (n && n.level === c.level + 1) return d;
  }
  return c.dir || 0;
}

function pickTileAt(wx, wz) {
  const t = modularState.tile;
  const c = tileCells.get(modularKey(modularIndex(wx, t), modularIndex(wz, t)));
  if (!c) { document.querySelector('#status').textContent = 'No hay tesela ahí'; return; }
  const set = (id, v) => { const el = document.querySelector(id); if (el) el.value = String(v); };
  set('#tileLevel', c.level);
  set('#tileSurface', c.surface);
  set('#tileShape', c.shape);
  set('#tileEdge', c.edge);
  set('#tileRound', Math.round((c.round || 0) * 100));
  syncTileLabels();
  document.querySelector('#status').textContent = `Tesela ${c.gx},${c.gz}: nivel ${c.level}, ${c.surface}, ${c.shape}, borde ${c.edge}`;
}

function applyTiles(wx, wz) {
  const tool = tileVal('#tileTool', 'paint');
  const t = modularState.tile;
  const cgx = modularIndex(wx, t), cgz = modularIndex(wz, t);
  const r = tileRadius();
  const level = Math.round(+tileVal('#tileLevel', 1) || 0);
  const surface = tileVal('#tileSurface', 'grass');
  const shape = tileVal('#tileShape', 'flat');
  const edge = tileVal('#tileEdge', 'cliff');
  let changed = 0;
  for (let gz = cgz - r; gz <= cgz + r; gz++) {
    for (let gx = cgx - r; gx <= cgx + r; gx++) {
      const k = modularKey(gx, gz);
      const cur = tileCells.get(k);
      if ((tool === 'raise' || tool === 'lower') && tileStroke.has(k)) continue;
      tileStroke.add(k);
      if (tool === 'erase') { if (tileCells.delete(k)) changed++; continue; }
      if (tool === 'paint') {
        const c = { gx, gz, level, surface, shape: r === 0 ? shape : 'flat', dir: cur?.dir || 0, edge, round: Math.max(0, Math.min(1, (+tileVal('#tileRound', 0) || 0) / 100)) };
        if (c.shape !== 'flat') c.dir = autoTileDir(c);
        tileCells.set(k, c);
        changed++;
        continue;
      }
      if (tool === 'raise' || tool === 'lower') {
        const base = cur || { gx, gz, level: tool === 'raise' ? -1 : 1, surface, shape: 'flat', dir: 0, edge };
        tileCells.set(k, { ...base, level: base.level + (tool === 'raise' ? 1 : -1) });
        changed++;
        continue;
      }
      if (!cur) continue;
      if (tool === 'round') cur.round = Math.max(0, Math.min(1, (+tileVal('#tileRound', 0) || 0) / 100));
      else if (tool === 'surface') cur.surface = surface;
      else if (tool === 'edge') cur.edge = edge;
      else if (tool === 'shape') { cur.shape = shape; if (shape !== 'flat') cur.dir = autoTileDir(cur); }
      changed++;
    }
  }
  if (!changed) return;
  syncWorldModular();
  repositionPlacedToTerrain();
  scheduleRebuild();
  document.querySelector('#status').textContent = `Teselas: ${tileCells.size}`;
}

document.querySelector('#tileOutside')?.addEventListener('change', (e) => {
  modularState.outside = e.target.value === 'terrain' ? 'terrain' : 'sea';
  syncWorldModular();
  scheduleRebuild();
});
document.querySelector('#clearTilesBtn')?.addEventListener('click', () => {
  tileCells.clear();
  syncWorldModular();
  repositionPlacedToTerrain();
  scheduleRebuild();
  document.querySelector('#status').textContent = 'Teselas borradas';
});

// Abrir cualquier mapa del juego (mismo catálogo que el menú MAPAS).
(async () => {
  const sel = document.querySelector('#gameMapSelect');
  if (!sel) return;
  try {
    const res = await fetch('/maps/index.json?t=' + Date.now());
    const idx = await res.json();
    const opts = [{ id: 'custom-map', name: 'Mapa personalizado (custom-map)', file: 'custom-map.json' }, ...(idx.maps || [])];
    for (const m of opts) {
      const o = document.createElement('option');
      o.value = m.file || `${m.id}.json`;
      o.textContent = m.name || m.id;
      sel.appendChild(o);
    }
  } catch (e) { console.warn('[map-editor] index de mapas:', e); }
  document.querySelector('#openGameMapBtn')?.addEventListener('click', async () => {
    try {
      const res = await fetch('/maps/' + sel.value + '?t=' + Date.now());
      const data = await res.json();
      if (!data.id) data.id = sel.value.replace(/\.json$/, '');
      await loadCustomMap(data);
    } catch (e) {
      document.querySelector('#status').textContent = 'No se pudo abrir: ' + e.message;
    }
  });
})();

// ---------------------------------------------------------------------------
// Rejilla 3D de teselas: plano de rejilla al nivel activo que cubre todo el
// mundo, contorno de cada tesela sobre su cara superior y columna de guía en
// la tesela bajo el cursor.
// ---------------------------------------------------------------------------
const tileGrid = new THREE.Group();
tileGrid.name = 'tile-grid-3d';
scene.add(tileGrid);
let tileGridPlane = null;
let tileGridOutlines = null;
const tileGridColumn = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
  new THREE.LineBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0.85, depthTest: false })
);
tileGridColumn.renderOrder = 10;
tileGrid.add(tileGridColumn);

function rebuildTileGridPlane() {
  if (tileGridPlane) { tileGridPlane.geometry.dispose(); tileGridPlane.material.dispose(); tileGrid.remove(tileGridPlane); }
  const t = modularState.tile;
  const size = Math.ceil((world.half * 2) / t) * t;
  tileGridPlane = new THREE.GridHelper(size, Math.round(size / t), 0x4fd2ff, 0x2a6f9a);
  tileGridPlane.material.transparent = true;
  tileGridPlane.material.opacity = 0.35;
  tileGridPlane.material.depthWrite = false;
  // Las líneas caen en los bordes de las teselas (centros en múltiplos de t).
  const off = (Math.round(size / t) % 2 === 0) ? t / 2 : 0;
  tileGridPlane.position.set(off, modularState.baseY, off);
  tileGrid.add(tileGridPlane);
}

function rebuildTileOutlines() {
  if (tileGridOutlines) { tileGridOutlines.geometry.dispose(); tileGridOutlines.material.dispose(); tileGrid.remove(tileGridOutlines); tileGridOutlines = null; }
  if (!tileCells.size) return;
  const t = modularState.tile, h = t / 2;
  const pos = new Float32Array(tileCells.size * 24);
  let i = 0;
  for (const c of tileCells.values()) {
    const y = modularState.baseY + c.level * modularState.level + 0.04 + (c.shape !== 'flat' ? modularState.level : 0);
    const x0 = c.gx * t - h, x1 = c.gx * t + h, z0 = c.gz * t - h, z1 = c.gz * t + h;
    const yl = c.shape !== 'flat' ? y - modularState.level : y;
    const seg = [[x0, z0, x1, z0], [x1, z0, x1, z1], [x1, z1, x0, z1], [x0, z1, x0, z0]];
    for (const [ax, az, bx, bz] of seg) {
      pos[i++] = ax; pos[i++] = yl; pos[i++] = az;
      pos[i++] = bx; pos[i++] = yl; pos[i++] = bz;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  tileGridOutlines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x0b2233, transparent: true, opacity: 0.35, depthWrite: false }));
  tileGrid.add(tileGridOutlines);
}

/** Coloca el plano de rejilla y la columna guía en la tesela bajo el cursor. */
function updateTileGridCursor(wx, wz) {
  const t = modularState.tile;
  const gx = modularIndex(wx, t), gz = modularIndex(wz, t);
  const c = tileCells.get(modularKey(gx, gz));
  const tool = tileVal('#tileTool', 'paint');
  const level = mode === 'tiles' && tool === 'paint' ? Math.round(+tileVal('#tileLevel', 1) || 0) : (c ? c.level : 0);
  const topY = modularState.baseY + level * modularState.level;
  if (tileGridPlane) tileGridPlane.position.y = topY + 0.03;
  const bottom = Math.min(modularState.baseY - modularState.level, topY);
  const hgt = Math.max(0.05, topY - bottom);
  tileGridColumn.visible = mode === 'tiles';
  tileGridColumn.scale.set(t * (2 * tileRadius() + 1), hgt, t * (2 * tileRadius() + 1));
  tileGridColumn.position.set(gx * t, bottom + hgt / 2, gz * t);
}

// ---------------------------------------------------------------------------
// Render final: sin él, el agua es un plano plano sin efectos (más rápido y
// legible para editar). Con él, se ve exactamente como en el juego.
// ---------------------------------------------------------------------------
const finalRenderEl = document.querySelector('#finalRender');
const flatWaterMat = new THREE.MeshBasicMaterial({ color: 0x3aa9d6, transparent: true, opacity: 0.45, depthWrite: false });
let flatWater = null;
function applyRenderMode() {
  const final = !!finalRenderEl?.checked;
  world.setWaterVisible?.(final);
  for (const m of [world.waterfallMesh, world.waterfallFoamMesh, world.waterfallParticles, world.seaweedMesh]) if (m) m.visible = final;
  renderer.shadowMap.enabled = final;
  if (world.sun) world.sun.castShadow = final;
  if (flatWater) { flatWater.geometry.dispose(); scene.remove(flatWater); flatWater = null; }
  if (final) return;
  // Mar + lagos (celdas de agua) como superficies planas.
  const geos = [];
  if (Number.isFinite(world.waterLevel) && world.waterLevel > -20) {
    const g = new THREE.PlaneGeometry(world.half * 2 + 400, world.half * 2 + 400);
    g.rotateX(-Math.PI / 2);
    g.translate(0, world.waterLevel, 0);
    geos.push(g);
  }
  for (const [k, wy] of waterCells.entries()) {
    const [gx, gz] = k.split(',').map(Number);
    const g = new THREE.PlaneGeometry(TERRAIN_CELL, TERRAIN_CELL);
    g.rotateX(-Math.PI / 2);
    g.translate(gx * TERRAIN_CELL, wy, gz * TERRAIN_CELL);
    geos.push(g);
  }
  if (!geos.length) return;
  const merged = new THREE.BufferGeometry();
  const arrays = geos.map((g) => g.toNonIndexed().attributes.position.array);
  const total = arrays.reduce((a, b) => a + b.length, 0);
  const pos = new Float32Array(total);
  let o = 0;
  for (const a of arrays) { pos.set(a, o); o += a.length; }
  merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  for (const g of geos) g.dispose();
  flatWater = new THREE.Mesh(merged, flatWaterMat);
  flatWater.renderOrder = 2;
  scene.add(flatWater);
}
finalRenderEl?.addEventListener('change', applyRenderMode);

// ---------------------------------------------------------------------------
// Resolución del mundo y pincel de redondeo
// ---------------------------------------------------------------------------
function syncTileLabels() {
  const r = document.querySelector('#tileRoundLabel');
  if (r) r.textContent = `${Math.round(+tileVal('#tileRound', 0))}%`;
  const rr = document.querySelector('#tileRadiusLabel');
  if (rr) rr.textContent = String(tileRadius());
  const info = document.querySelector('#tileInfo');
  if (info) info.textContent = `Teselas de ${modularState.tile} m, nivel de ${modularState.level} m. Clic/arrastrar: aplicar. Shift+clic: coger nivel y estilo.`;
  const wt = document.querySelector('#worldTile'); if (wt) wt.value = String(modularState.tile);
  const wl = document.querySelector('#worldLevel'); if (wl) wl.value = String(modularState.level);
}
document.querySelector('#tileRound')?.addEventListener('input', syncTileLabels);
document.querySelector('#tileRadius')?.addEventListener('input', syncTileLabels);
document.querySelector('#applyResolutionBtn')?.addEventListener('click', () => {
  const tile = +tileVal('#worldTile', modularState.tile);
  const level = +tileVal('#worldLevel', modularState.level);
  if (tileCells.size) {
    const res = resampleModularTerrain({ ...modularState, cells: tileCells }, tile, level);
    tileCells.clear();
    if (res) for (const [k, c] of res.cells) tileCells.set(k, { ...c });
  }
  modularState.tile = tile;
  modularState.level = level;
  syncWorldModular();
  rebuildTileGridPlane();
  repositionPlacedToTerrain();
  scheduleRebuild();
  syncTileLabels();
  document.querySelector('#status').textContent = `Resolución: teselas de ${tile} m, nivel ${level} m (${tileCells.size} teselas)`;
});

// ---------------------------------------------------------------------------
// Importar mapas antiguos (heightfield/procedural) a teselas
// ---------------------------------------------------------------------------
function convertLegacyToTiles(norm) {
  const tile = norm.terrain.heights.size ? 2 : 4;
  const level = modularState.level;
  const waterY = Number.isFinite(norm.waterLevel) ? norm.waterLevel : 0;
  const baseY = waterY + 0.5;
  Object.assign(modularState, { tile, level, baseY, outside: 'sea' });
  world.modular = null;
  world._hCache = new Map();
  const half = Math.min(world.half, (norm.size || 360) / 2);
  const roadTiles = new Map();
  for (const p of norm.pieces) {
    if (p.type === 'road' || p.type === 'path') roadTiles.set(modularKey(modularIndex(p.x, tile), modularIndex(p.z, tile)), p.type === 'road' ? 'stone' : 'path');
  }
  tileCells.clear();
  // 1) Muestreo: media de 5 puntos por tesela (evita teselas sueltas por ruido).
  const g0 = modularIndex(-half, tile), g1 = modularIndex(half, tile);
  const q = tile * 0.3;
  const raw = new Map();
  for (let gz = g0; gz <= g1; gz++) {
    for (let gx = g0; gx <= g1; gx++) {
      const x = gx * tile, z = gz * tile;
      const hs = [world.heightAt(x, z), world.heightAt(x - q, z - q), world.heightAt(x + q, z - q), world.heightAt(x + q, z + q), world.heightAt(x - q, z + q)].filter(Number.isFinite);
      if (!hs.length) continue;
      const h = hs.reduce((a, b) => a + b, 0) / hs.length;
      if (h < waterY - 0.6) continue;
      raw.set(modularKey(gx, gz), { gx, gz, h, lvl: Math.max(0, Math.round((h - baseY) / level)) });
    }
  }
  // 2) Filtro de mediana 3x3 (dos pasadas): limpia picos y hoyos de una tesela.
  for (let pass = 0; pass < 2; pass++) {
    const next = new Map();
    for (const [k, c] of raw) {
      const vals = [];
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const n = raw.get(modularKey(c.gx + dx, c.gz + dz));
        vals.push(n ? n.lvl : 0);
      }
      vals.sort((a, b) => a - b);
      next.set(k, vals[4]);
    }
    for (const [k, v] of next) raw.get(k).lvl = v;
  }
  for (const [k, c] of raw) {
    const surface = roadTiles.get(k) || (c.h < waterY + 1.6 ? 'sand' : 'grass');
    tileCells.set(k, { gx: c.gx, gz: c.gz, level: c.lvl, surface, shape: 'flat', dir: 0, edge: 'cliff', round: 0 });
  }
  // 3) Laderas suaves: un escalón de 1 nivel con pendiente original baja pasa a rampa;
  //    las pendientes fuertes se quedan como acantilado (estilo terrazas).
  for (const c of tileCells.values()) {
    const src = raw.get(modularKey(c.gx, c.gz));
    let best = -1, bestSlope = Infinity;
    for (let d = 0; d < 4; d++) {
      const [dx, dz] = MODULAR_DIRS[d];
      const up = tileCells.get(modularKey(c.gx + dx, c.gz + dz));
      const down = tileCells.get(modularKey(c.gx - dx, c.gz - dz));
      if (!up || up.level !== c.level + 1 || up.shape !== 'flat') continue;
      if (down && down.level > c.level) continue;
      const upSrc = raw.get(modularKey(up.gx, up.gz));
      const slope = Math.abs(upSrc.h - src.h) / tile;
      if (slope < bestSlope) { bestSlope = slope; best = d; }
    }
    if (best >= 0 && bestSlope < 0.32) { c.shape = 'ramp'; c.dir = best; }
  }
  // Las carreteras/caminos pasan a ser superficie de tesela.
  for (let i = placed.length - 1; i >= 0; i--) if (placed[i].type === 'road' || placed[i].type === 'path') placed.splice(i, 1);
  heightOverrides.clear();
  cellSmooth.clear();
}

/** Mundo vacío inicial: isla de teselas de hierba con playa. */
function makeStarterTiles() {
  Object.assign(modularState, { tile: 4, level: 1.25, baseY: (world.waterLevel ?? 0) + 0.5, outside: 'sea' });
  tileCells.clear();
  for (let gz = -8; gz <= 8; gz++) for (let gx = -8; gx <= 8; gx++) {
    const d = Math.max(Math.abs(gx), Math.abs(gz));
    tileCells.set(modularKey(gx, gz), { gx, gz, level: d >= 8 ? 0 : 1, surface: d >= 8 ? 'sand' : 'grass', shape: 'flat', dir: 0, edge: 'cliff', round: 0 });
  }
}

let rebuildTimer = null;
let rebuildChain = Promise.resolve();
async function rebuildNow() {
  const result = await world.rebuildCustomMap(buildSavePayload());
  placedGroup = result.root;
  refreshLootPreview();
  applyCartoonStyle(world.root, cartoonCache);
  applyCartoonStyle(loot.root, cartoonCache);
  updateSelectionHelpers();
  refreshWindGizmos();
  rebuildTileOutlines();
  applyRenderMode();
}
function scheduleRebuild() {
  clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(() => {
    rebuildChain = rebuildChain.then(rebuildNow).catch((err) => console.error('[map-editor] rebuild:', err));
  }, 90);
}

function refreshLootPreview() {
  if (!loot) return;
  loot.spawn();
  // En el editor el loot es parte decorativa del mapa: no caduca.
  for (const entity of loot.items) entity.life = Infinity;
}

function repositionPlacedToTerrain() {
  for (const p of placed) {
    const ny = editorHeightAt(p.x, p.z);
    if (Math.abs((p.y || 0) - ny) > 0.001) p.y = ny;
  }
}

function rebuildTerrainMesh() {
  for (const [k, wy] of waterCells.entries()) {
    const [gx, gz] = k.split(',').map(Number);
    if (editorHeightAt(gx * TERRAIN_CELL, gz * TERRAIN_CELL) >= wy - 0.01) {
      waterCells.delete(k);
      waterVegCells.delete(k);
    }
  }
  repositionPlacedToTerrain();
  scheduleRebuild();
}

function setOverride(gx, gz, y) { heightOverrides.set(key(gx, gz), y); }
function clearOverrides() { heightOverrides.clear(); rebuildTerrainMesh(); }

function snapH(v) { return snapHeight(v, GRID_H); }

function applyBrush(cx, cz, mode) {
  const radius = +document.querySelector('#brushSize').value || 4;
  const strength = Math.max(1, Math.round(+document.querySelector('#brushStrength').value || 1));
  const falloff = document.querySelector('#falloffMode').value || 'smooth';
  const target = snapH(+document.querySelector('#targetHeight').value);
  const waterDepth = Math.max(GRID_H, snapH(+document.querySelector('#waterDepth')?.value || 2));
  const isWater = mode === 'terrain-water' || mode === 'water';
  const rim = isWater ? 3 : 0;
  // Minecraft: pintar un bloque (celdas cuadradas), con radio configurable.
  const br = isWater ? null : Math.max(1, Math.min(8, Math.round(+document.querySelector('#blockRadius')?.value || 1)));
  const brushCx = Math.round(cx / TERRAIN_CELL) * TERRAIN_CELL;
  const brushCz = Math.round(cz / TERRAIN_CELL) * TERRAIN_CELL;
  const cellR = Math.ceil((isWater ? radius : br) + rim) + 1;
  const cgx = Math.round(brushCx / TERRAIN_CELL);
  const cgz = Math.round(brushCz / TERRAIN_CELL);
  for (let dz = -cellR; dz <= cellR; dz++) {
    for (let dx = -cellR; dx <= cellR; dx++) {
      const gx = cgx + dx, gz = cgz + dz;
      const wx = gx * TERRAIN_CELL, wz = gz * TERRAIN_CELL;
      const d = Math.max(Math.abs(wx - brushCx), Math.abs(wz - brushCz));
      const cur = editorHeightAt(wx, wz);
      let ny = cur;
      if (isWater) {
        if (d <= radius) {
          ny = Math.min(cur, snapH(target - waterDepth));
        } else if (d <= radius + rim) {
          // raise banks so water doesn't float
          if (cur < target + GRID_H) ny = Math.max(cur, snapH(target + GRID_H));
        } else continue;
      } else {
        if (d > br) continue;
        if (mode === 'terrain-up') ny = cur + GRID_H * strength;
        else if (mode === 'terrain-down') ny = cur - GRID_H * strength;
        else if (mode === 'terrain-flat') ny = target;
        else continue;
      }
      ny = snapH(Math.max(-20, Math.min(80, ny)));
      if (ny !== cur) setOverride(gx, gz, ny);
    }
  }
  rebuildTerrainMesh();
}

// El agua (mar, lagos, cascadas y algas) la genera World con los mismos
// materiales y shaders que el juego; aquí solo se pide una reconstrucción.
function rebuildWaterMesh() { scheduleRebuild(); }
function rebuildWaterMeshes() { scheduleRebuild(); }
function clearWaterPatches() {
  waterCells.clear();
  waterVegCells.clear();
  scheduleRebuild();
}

function addWaterPatch(x, z) {
  // Lagos sobre teselas: se pinta la superficie del agua donde las teselas
  // quedan por debajo de la altura elegida. El vaso se hace bajando teselas.
  const radius = Math.max(2, (+document.querySelector('#brushSize').value || 6));
  const y = snapH(Number.isFinite(+document.querySelector('#targetHeight').value) ? +document.querySelector('#targetHeight').value : (world.waterLevel ?? 0));
  const veg = clamp((+document.querySelector('#waterVegetation')?.value || 0) / 100, 0, 1);
  const cellR = Math.ceil(radius / TERRAIN_CELL) + 1;
  const cgx = Math.round(x / TERRAIN_CELL), cgz = Math.round(z / TERRAIN_CELL);
  let added = 0;
  for (let dz = -cellR; dz <= cellR; dz++) for (let dx = -cellR; dx <= cellR; dx++) {
    const gx = cgx + dx, gz = cgz + dz;
    const wx = gx * TERRAIN_CELL, wz = gz * TERRAIN_CELL;
    if (Math.hypot(wx - x, wz - z) > radius) continue;
    if (editorHeightAt(wx, wz) >= y - 0.05) continue;
    waterCells.set(key(gx, gz), y);
    waterVegCells.set(key(gx, gz), veg);
    added++;
  }
  document.querySelector('#status').textContent = added ? `Agua: ${added} celdas a ${y} m` : 'Ahí las teselas están por encima del agua: bájalas primero';
  // remove/sink decorations inside water
  for (let i = placed.length - 1; i >= 0; i--) {
    const p = placed[i];
    const gx = Math.round(p.x / TERRAIN_CELL), gz = Math.round(p.z / TERRAIN_CELL);
    const wy = waterCells.get(key(gx, gz));
    if (wy !== undefined) {
      const ty = editorHeightAt(p.x, p.z);
      if (ty < wy - 0.02) {
        const isRock = /rock|pebble|boulder/i.test(p.type || '');
        if (isRock) {
          p.y = ty;
        } else if (/tree|grass|bush|fern|flower|plant|shrub/i.test(p.type || '')) {
          placed.splice(i, 1);
        }
      }
    }
  }
  rebuildTerrainMesh();
  rebuildWaterMesh();
}

// --------------- Pieces ---------------
let selectedPiece = 'house';
let rotY = 0;
let mode = 'tiles';
let painting = false;
let lastPaintAt = 0;

// Selection
const selected = new Set(); // indices in placed/placedGroup
const selectionHelpers = new THREE.Group();
scene.add(selectionHelpers);
const selectProxy = new THREE.Group();
scene.add(selectProxy);
let marquee = { active: false, startX: 0, startY: 0, moved: false };
const marqueeEl = document.querySelector('#marquee');
let moveMode = false;

const DECOR_MODEL_TYPES = new Set(['tree_round','tree_pine','tree_palm','tree_tall','tree_birch','tree_dead','tree_willow','tree_autumn','rock','rock_big','rock_small','grass']);
let decorModelConfig = {};
const modelConfigEl = document.querySelector('#objectModelConfig');
const modelConfigTypeEl = document.querySelector('#modelConfigType');
const modelRandomEl = document.querySelector('#modelRandom');
const modelListEl = document.querySelector('#modelList');
const modelAddBtn = document.querySelector('#modelAddBtn');
const modelClearBtn = document.querySelector('#modelClearBtn');
const modelFileInput = document.querySelector('#modelFileInput');
const modelEditBox = document.querySelector('#modelEditBox');
const modelScaleEl = document.querySelector('#modelScale');
const modelRotXEl = document.querySelector('#modelRotX');
const modelRotYEl = document.querySelector('#modelRotY');
const modelRotZEl = document.querySelector('#modelRotZ');

function getDecorConfig(type) {
  if (!decorModelConfig[type]) decorModelConfig[type] = { random: true, models: [] };
  return decorModelConfig[type];
}
function isDecorType(type) {
  if (!type) return false;
  const structures = new Set(['house','cabin','tower','container','wall','wall_corner','column','wall_door','wall_window','floor','roof','stairs','road','path','chest','weapon_spawn','spawn','loot_spawn']);
  if (structures.has(type)) return false;
  return DECOR_MODEL_TYPES.has(type) || /^(tree_|rock|grass|bush|plant|flower|prop|crate|barrel|lamp|bench|fence|debris|rubble)/.test(type) || true;
}
async function loadDecorModelConfig() {
  try {
    const r = await fetch('/config/decor-models.json', { cache: 'no-store' });
    if (r.ok) { const d = await r.json(); if (d && typeof d === 'object') decorModelConfig = d; }
  } catch {}
  updateObjectModelUI();
}
async function saveDecorModelConfig() {
  try {
    const payload = JSON.stringify(decorModelConfig, null, 2);
    await window.opennite?.app?.writeFile?.('config/decor-models.json', payload);
  } catch (e) { console.warn('No se pudo guardar decor-models.json', e); }
}
function selectedModelEntry() {
  const cfg = getDecorConfig(selectedPiece);
  const idx = parseInt(modelListEl?.dataset?.selected ?? '-1', 10);
  if (idx >= 0 && idx < (cfg.models || []).length) return { cfg, idx, m: cfg.models[idx] };
  return null;
}
function syncModelEditBox() {
  const sel = selectedModelEntry();
  if (!modelEditBox) return;
  if (!sel) { modelEditBox.style.display = 'none'; return; }
  modelEditBox.style.display = '';
  if (modelScaleEl) modelScaleEl.value = String(sel.m.scale ?? 1);
  if (modelRotXEl) modelRotXEl.value = String(sel.m.rotX ?? 0);
  if (modelRotYEl) modelRotYEl.value = String(sel.m.rotY ?? 0);
  if (modelRotZEl) modelRotZEl.value = String(sel.m.rotZ ?? 0);
}
function updateObjectModelUI() {
  const show = isDecorType(selectedPiece) && mode === 'place';
  if (modelConfigEl) modelConfigEl.style.display = show ? '' : 'none';
  if (!show) return;
  const cfg = getDecorConfig(selectedPiece);
  if (modelConfigTypeEl) modelConfigTypeEl.textContent = selectedPiece;
  if (modelRandomEl) modelRandomEl.checked = !!cfg.random;
  if (modelListEl) {
    const prevSel = parseInt(modelListEl.dataset?.selected ?? '-1', 10);
    modelListEl.innerHTML = '';
    (cfg.models || []).forEach((m, i) => {
      const row = document.createElement('div');
      row.style.cssText = 'padding:2px 4px;cursor:pointer;border-bottom:1px solid #222;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
      const extra = (m.scale && m.scale !== 1) || m.rotX || m.rotY || m.rotZ ? ` [s:${m.scale ?? 1} r:${m.rotX||0},${m.rotY||0},${m.rotZ||0}]` : '';
      row.textContent = (m.name || m.src || `Modelo ${i+1}`) + extra;
      row.dataset.idx = String(i);
      row.addEventListener('click', () => {
        modelListEl.querySelectorAll('div').forEach(d => d.style.background = '');
        row.style.background = '#2a3555';
        modelListEl.dataset.selected = String(i);
        syncModelEditBox();
      });
      modelListEl.appendChild(row);
    });
    if (!(cfg.models || []).length) {
      modelListEl.innerHTML = '<div style="color:#778">Sin modelos personalizados (usa default)</div>';
      modelListEl.dataset.selected = '-1';
    } else if (prevSel >= 0 && prevSel < cfg.models.length) {
      modelListEl.dataset.selected = String(prevSel);
      const row = modelListEl.querySelector(`div[data-idx="${prevSel}"]`);
      if (row) row.style.background = '#2a3555';
    } else {
      modelListEl.dataset.selected = '-1';
    }
  }
  syncModelEditBox();
}
modelRandomEl?.addEventListener('change', async () => { getDecorConfig(selectedPiece).random = !!modelRandomEl.checked; await saveDecorModelConfig(); });
modelAddBtn?.addEventListener('click', () => modelFileInput?.click());
modelClearBtn?.addEventListener('click', async () => {
  const cfg = getDecorConfig(selectedPiece);
  const idx = parseInt(modelListEl?.dataset?.selected ?? '-1', 10);
  if (idx >= 0 && idx < cfg.models.length) { cfg.models.splice(idx, 1); modelListEl.dataset.selected = '-1'; updateObjectModelUI(); await saveDecorModelConfig(); }
});
async function onModelEditChange() {
  const sel = selectedModelEntry();
  if (!sel) return;
  sel.m.scale = Math.max(0.01, parseFloat(modelScaleEl?.value || '1') || 1);
  sel.m.rotX = parseFloat(modelRotXEl?.value || '0') || 0;
  sel.m.rotY = parseFloat(modelRotYEl?.value || '0') || 0;
  sel.m.rotZ = parseFloat(modelRotZEl?.value || '0') || 0;
  updateObjectModelUI();
  await saveDecorModelConfig();
}
modelScaleEl?.addEventListener('change', onModelEditChange);
modelRotXEl?.addEventListener('change', onModelEditChange);
modelRotYEl?.addEventListener('change', onModelEditChange);
modelRotZEl?.addEventListener('change', onModelEditChange);
modelFileInput?.addEventListener('change', async (e) => {
  const files = [...(e.target.files || [])];
  if (!files.length) return;
  const cfg = getDecorConfig(selectedPiece);
  for (const f of files) {
    const dataUrl = await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(f); });
    cfg.models.push({ name: f.name, src: dataUrl });
  }
  e.target.value = '';
  updateObjectModelUI();
  await saveDecorModelConfig();
});

const palette = document.querySelectorAll('#piecePalette button');
palette.forEach(b => b.addEventListener('click', () => {
  palette.forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  selectedPiece = b.dataset.piece;
  syncBrushUI();
  updateObjectModelUI();
}));
document.querySelector('#rotSelect').addEventListener('change', (e) => { rotY = parseFloat(e.target.value); });

function isDecorBrushMode() {
  return mode === 'grass' || (mode === 'place' && isDecorType(selectedPiece));
}
function syncBrushUI() {
  const isWind = mode === 'wind';
  const terrain = mode.startsWith('terrain') || mode === 'water' || mode === 'erase-water' || mode === 'pick-height' || mode === 'grass';
  const decorBrush = isDecorBrushMode();
  const showBrush = terrain || decorBrush;
  document.querySelector('#terrainControls').style.display = showBrush ? '' : 'none';
  document.querySelector('#terrainOnlyControls').style.display = (terrain && !decorBrush && mode !== 'erase-water') ? '' : 'none';
  const densLabel = document.querySelector('#brushDensityLabel');
  const dens = document.querySelector('#brushDensity');
  if (densLabel) densLabel.style.display = decorBrush ? '' : 'none';
  if (dens) dens.style.display = decorBrush ? '' : 'none';
  const title = document.querySelector('#brushTitle');
  if (title) title.textContent = decorBrush ? 'Pincel decoración' : (isWind ? 'Viento' : 'Terreno');
  brushRing.visible = showBrush;
  // Viento: mostrar panel de configuración de viento
  const windCtl = document.querySelector('#windControls');
  if (windCtl) windCtl.style.display = isWind ? '' : 'none';
  const tileCtl = document.querySelector('#tileControls');
  if (tileCtl) tileCtl.style.display = mode === 'tiles' ? '' : 'none';
}
const modeButtons = document.querySelectorAll('#modePalette button');
modeButtons.forEach(b => b.addEventListener('click', () => {
  modeButtons.forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  mode = b.dataset.mode;
  const place = mode === 'place';
  const select = mode === 'select';
  document.querySelector('#placeControls').style.display = place ? '' : 'none';
  const selCtl = document.querySelector('#selectControls');
  if (selCtl) selCtl.style.display = select ? '' : 'none';
  if (!select) { moveMode = false; syncSelectionControls(); }
  syncBrushUI();
  updateObjectModelUI();
  document.querySelector('#status').textContent = `Modo: ${b.textContent.trim()}`;
}));

function addM(parent, geo, mat, px, py, pz, rx=0, ry=0, rz=0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(px, py, pz);
  m.rotation.set(rx, ry, rz);
  m.castShadow = true; m.receiveShadow = true;
  parent.add(m);
  return m;
}

const KIT = { module: 2, wallH: 3.24, slab: 0.1, floorH: 3.34 };

function buildHouseVisual(g, floors = 1) {
  floors = Math.max(1, Math.min(3, Math.round(floors || 1)));
  const W = 8, D = 6;
  const matWall = new THREE.MeshStandardMaterial({ color: 0xe8dcc6, roughness: 0.85 });
  const matWall2 = new THREE.MeshStandardMaterial({ color: 0xd8ccb3, roughness: 0.85 });
  const matFloor = new THREE.MeshStandardMaterial({ color: 0x9a8a70, roughness: 0.9 });
  const matRoof = new THREE.MeshStandardMaterial({ color: 0x5b7fa6, roughness: 0.8 });
  const matWood = new THREE.MeshStandardMaterial({ color: 0x7b5738, roughness: 0.8 });
  const matGlass = new THREE.MeshStandardMaterial({ color: 0xbfe5ff, roughness: 0.1, transparent: true, opacity: 0.28, side: THREE.DoubleSide });
  addM(g, new THREE.BoxGeometry(W + 0.4, 0.4, D + 0.4), matWall2, 0, -0.2, 0);
  addM(g, new THREE.BoxGeometry(W, KIT.slab, D), matFloor, 0, KIT.slab / 2, 0);
  const addWallSeg = (cx, cz, len, dir, yBase, mat, isDoor = false, isWindow = false) => {
    const thick = 0.12;
    const w = dir === 'x' ? len : thick;
    const d = dir === 'z' ? len : thick;
    if (isDoor) {
      const doorW = 1.2, doorH = 2.5;
      const side = (len - doorW) / 2;
      if (dir === 'x') {
        addM(g, new THREE.BoxGeometry(side, KIT.wallH, thick), mat, cx - doorW / 2 - side / 2, yBase + KIT.wallH / 2, cz);
        addM(g, new THREE.BoxGeometry(side, KIT.wallH, thick), mat, cx + doorW / 2 + side / 2, yBase + KIT.wallH / 2, cz);
        addM(g, new THREE.BoxGeometry(doorW, KIT.wallH - doorH, thick), mat, cx, yBase + doorH + (KIT.wallH - doorH) / 2, cz);
      } else {
        addM(g, new THREE.BoxGeometry(thick, KIT.wallH, side), mat, cx, yBase + KIT.wallH / 2, cz - doorW / 2 - side / 2);
        addM(g, new THREE.BoxGeometry(thick, KIT.wallH, side), mat, cx, yBase + KIT.wallH / 2, cz + doorW / 2 + side / 2);
        addM(g, new THREE.BoxGeometry(thick, KIT.wallH - doorH, doorW), mat, cx, yBase + doorH + (KIT.wallH - doorH) / 2, cz);
      }
      return;
    }
    addM(g, new THREE.BoxGeometry(w, KIT.wallH, d), mat, cx, yBase + KIT.wallH / 2, cz);
    if (isWindow) {
      const ww = 1.0, wh = 1.1;
      if (dir === 'x') addM(g, new THREE.BoxGeometry(ww, wh, 0.06), matGlass, cx, yBase + 1.8, cz);
      else addM(g, new THREE.BoxGeometry(0.06, wh, ww), matGlass, cx, yBase + 1.8, cz);
    }
  };
  for (let f = 0; f < floors; f++) {
    const by = f * KIT.floorH + KIT.slab;
    addWallSeg(-3, 3, 2, 'x', by, matWall, false, true);
    addWallSeg(-1, 3, 2, 'x', by, matWall, false, true);
    addWallSeg(1, 3, 2, 'x', by, matWall, false, true);
    addWallSeg(3, 3, 2, 'x', by, matWall, false, true);
    if (f === 0) {
      addWallSeg(-3, -3, 2, 'x', by, matWall, false, true);
      addWallSeg(-1, -3, 2, 'x', by, matWall, true, false);
      addWallSeg(1, -3, 2, 'x', by, matWall, false, false);
      addWallSeg(3, -3, 2, 'x', by, matWall, false, true);
    } else {
      for (const sx of [-3,-1,1,3]) addWallSeg(sx, -3, 2, 'x', by, matWall, false, true);
    }
    for (const sz of [-2,0,2]) { addWallSeg(-4, sz, 2, 'z', by, matWall2, false, sz!==0); addWallSeg(4, sz, 2, 'z', by, matWall2, false, sz!==0); }
    const topY = by + KIT.wallH;
    addM(g, new THREE.BoxGeometry(W, KIT.slab, D), f < floors - 1 ? matFloor : matRoof, 0, topY + KIT.slab / 2, 0);
  }
  if (floors >= 2) addM(g, new THREE.BoxGeometry(1.2, 2.6, 4), matWood, 3, KIT.slab + 1.3, 0);
}

function buildCabinVisual(g, floors = 1) {
  floors = Math.max(1, Math.min(3, Math.round(floors || 1)));
  const W = 4, D = 4;
  const matWall = new THREE.MeshStandardMaterial({ color: 0xc2a06a, roughness: 0.85 });
  const matDark = new THREE.MeshStandardMaterial({ color: 0x8a6336, roughness: 0.9 });
  const matRoof = new THREE.MeshStandardMaterial({ color: 0x7a4a2a, roughness: 0.85 });
  const matGlass = new THREE.MeshStandardMaterial({ color: 0xbfe5ff, roughness: 0.1, transparent: true, opacity: 0.28, side: THREE.DoubleSide });
  addM(g, new THREE.BoxGeometry(W + 0.4, 0.3, D + 0.4), matDark, 0, -0.15, 0);
  addM(g, new THREE.BoxGeometry(W, KIT.slab, D), matDark, 0, KIT.slab / 2, 0);
  for (let f = 0; f < floors; f++) {
    const by = f * KIT.floorH + KIT.slab;
    for (const sx of [-1,1]) { addM(g, new THREE.BoxGeometry(2, KIT.wallH, 0.12), matWall, sx, by + KIT.wallH / 2, -2); addM(g, new THREE.BoxGeometry(2, KIT.wallH, 0.12), matWall, sx, by + KIT.wallH / 2, 2); }
    for (const sz of [-1,1]) { addM(g, new THREE.BoxGeometry(0.12, KIT.wallH, 2), matWall, -2, by + KIT.wallH / 2, sz); addM(g, new THREE.BoxGeometry(0.12, KIT.wallH, 2), matWall, 2, by + KIT.wallH / 2, sz); }
    addM(g, new THREE.BoxGeometry(0.9, 1.9, 0.06), new THREE.MeshStandardMaterial({ color: 0x5c3d22 }), 1, by + 0.95, -2.02);
    addM(g, new THREE.BoxGeometry(0.7, 0.7, 0.05), matGlass, -1, by + 1.4, -2.02);
    addM(g, new THREE.BoxGeometry(0.7, 0.7, 0.05), matGlass, -1, by + 1.4, 2.02);
    const topY = by + KIT.wallH;
    addM(g, new THREE.BoxGeometry(W, KIT.slab, D), f === floors - 1 ? matRoof : matDark, 0, topY + KIT.slab / 2, 0);
  }
}

function makePiece(type, x, z, floors = 1) {
  const y = editorHeightAt(x, z);
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  if (type === 'house') buildHouseVisual(g, floors);
  else if (type === 'cabin') buildCabinVisual(g, floors);
  else if (type === 'tower') {
    const mat = new THREE.MeshStandardMaterial({ color: 0xd4c4a8, roughness: 0.85 });
    addM(g, new THREE.CylinderGeometry(2.6, 2.8, 2, 8), new THREE.MeshStandardMaterial({ color: 0xc2b08a, roughness: 0.85 }), 0, 1, 0);
    addM(g, new THREE.CylinderGeometry(2, 2.5, 12, 8), mat, 0, 8, 0);
    addM(g, new THREE.CylinderGeometry(2.6, 2.6, 0.4, 8), new THREE.MeshStandardMaterial({ color: 0x8c4f3c }), 0, 14.2, 0);
  } else if (type === 'container') {
    addM(g, new THREE.BoxGeometry(6.2, 0.3, 2.6), new THREE.MeshStandardMaterial({ color: 0xc2b08a, roughness: 0.85 }), 0, 0.15, 0);
    addM(g, new THREE.BoxGeometry(6, 2.4, 2.4), new THREE.MeshStandardMaterial({ color: 0xe2843c, roughness: 0.6, metalness: 0.3 }), 0, 1.5, 0);
  } else if (type === 'wall' || type === 'wall_door' || type === 'wall_window') {
    addM(g, new THREE.BoxGeometry(0.12, KIT.wallH, 2), new THREE.MeshStandardMaterial({ color: 0xc2b08a, roughness: 0.85 }), 0, KIT.wallH / 2, 0);
  } else if (type === 'wall_corner') {
    addM(g, new THREE.BoxGeometry(2, KIT.wallH, 2), new THREE.MeshStandardMaterial({ color: 0xc2b08a, roughness: 0.85 }), 0, KIT.wallH / 2, 0);
  } else if (type === 'floor' || type === 'roof') {
    addM(g, new THREE.BoxGeometry(2, KIT.slab, 2), new THREE.MeshStandardMaterial({ color: 0x8a7a5e, roughness: 0.9 }), 0, KIT.slab / 2, 0);
  } else if (type === 'stairs') {
    addM(g, new THREE.BoxGeometry(2, KIT.floorH, 2), new THREE.MeshStandardMaterial({ color: 0x7b5738, roughness: 0.8 }), 0, KIT.floorH / 2, 0);
  } else if (type === 'column') {
    addM(g, new THREE.CylinderGeometry(0.2, 0.2, KIT.wallH, 8), new THREE.MeshStandardMaterial({ color: 0xc2b08a, roughness: 0.85 }), 0, KIT.wallH / 2, 0);
  } else if (type === 'tree' || type.startsWith('tree_')) {
    const trunk = new THREE.MeshStandardMaterial({ color: 0x7b5738, roughness: 0.9 });
    const leaf = new THREE.MeshStandardMaterial({ color: 0x2f6b3e, roughness: 0.9 });
    if (type === 'tree_pine') {
      addM(g, new THREE.CylinderGeometry(0.2, 0.3, 3.2, 8), trunk, 0, 1.6, 0);
      addM(g, new THREE.ConeGeometry(1.8, 3.2, 8), new THREE.MeshStandardMaterial({ color: 0x245a32, roughness: 0.9 }), 0, 3.8, 0);
      addM(g, new THREE.ConeGeometry(1.4, 2.6, 8), new THREE.MeshStandardMaterial({ color: 0x2f6b3e, roughness: 0.9 }), 0, 5.2, 0);
    } else if (type === 'tree_palm') {
      addM(g, new THREE.CylinderGeometry(0.18, 0.28, 4.8, 8), new THREE.MeshStandardMaterial({ color: 0x9b7653, roughness: 0.9 }), 0, 2.4, 0);
      for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; addM(g, new THREE.BoxGeometry(0.5, 0.08, 2.2), new THREE.MeshStandardMaterial({ color: 0x4f9a45, roughness: 0.9 }), Math.cos(a)*0.8, 5.0, Math.sin(a)*0.8, 0.5, a, 0); }
    } else if (type === 'tree_tall') {
      addM(g, new THREE.CylinderGeometry(0.22, 0.35, 5.0, 8), trunk, 0, 2.5, 0);
      addM(g, new THREE.SphereGeometry(2.2, 8, 8), leaf, 0, 6.2, 0);
    } else if (type === 'tree_birch') {
      addM(g, new THREE.CylinderGeometry(0.16, 0.22, 4.2, 8), new THREE.MeshStandardMaterial({ color: 0xd8d2c4, roughness: 0.85 }), 0, 2.1, 0);
      addM(g, new THREE.SphereGeometry(1.5, 8, 8), new THREE.MeshStandardMaterial({ color: 0x6fa84d, roughness: 0.9 }), 0, 4.6, 0);
      addM(g, new THREE.SphereGeometry(1.1, 8, 8), new THREE.MeshStandardMaterial({ color: 0x7fb85a, roughness: 0.9 }), 0.5, 5.4, -0.3);
    } else if (type === 'tree_dead') {
      addM(g, new THREE.CylinderGeometry(0.14, 0.28, 4.0, 7), new THREE.MeshStandardMaterial({ color: 0x6b5a48, roughness: 0.95 }), 0, 2.0, 0);
      addM(g, new THREE.CylinderGeometry(0.05, 0.08, 1.4, 6), new THREE.MeshStandardMaterial({ color: 0x6b5a48, roughness: 0.95 }), 0.5, 3.2, 0, 0, 0, 0.7);
      addM(g, new THREE.CylinderGeometry(0.05, 0.07, 1.2, 6), new THREE.MeshStandardMaterial({ color: 0x6b5a48, roughness: 0.95 }), -0.45, 3.6, 0.2, 0.2, 0, -0.8);
    } else if (type === 'tree_willow') {
      addM(g, new THREE.CylinderGeometry(0.26, 0.38, 3.8, 8), trunk, 0, 1.9, 0);
      addM(g, new THREE.SphereGeometry(2.4, 8, 7, 0, Math.PI * 2, 0, Math.PI * 0.75), new THREE.MeshStandardMaterial({ color: 0x5f8f4a, roughness: 0.95 }), 0, 4.8, 0);
      addM(g, new THREE.CylinderGeometry(2.1, 2.4, 1.8, 10, 1, true), new THREE.MeshStandardMaterial({ color: 0x4f7f3d, roughness: 1, side: THREE.DoubleSide }), 0, 3.9, 0);
    } else if (type === 'tree_autumn') {
      addM(g, new THREE.CylinderGeometry(0.24, 0.34, 3.8, 8), trunk, 0, 1.9, 0);
      addM(g, new THREE.SphereGeometry(2.1, 8, 8), new THREE.MeshStandardMaterial({ color: 0xc96b2c, roughness: 0.9 }), 0, 5.0, 0);
      addM(g, new THREE.SphereGeometry(1.4, 8, 8), new THREE.MeshStandardMaterial({ color: 0xd98b2f, roughness: 0.9 }), 0.6, 5.8, -0.3);
    } else {
      addM(g, new THREE.CylinderGeometry(0.25, 0.35, 3.6, 8), trunk, 0, 1.8, 0);
      addM(g, new THREE.SphereGeometry(2.0, 8, 8), leaf, 0, 4.8, 0);
    }
  } else if (type === 'rock' || type === 'rock_big' || type === 'rock_small') {
    if (type === 'rock_big') {
      addM(g, new THREE.DodecahedronGeometry(2.2, 0), new THREE.MeshStandardMaterial({ color: 0x6f736d, roughness: 0.96 }), 0, 1.2, 0);
      addM(g, new THREE.DodecahedronGeometry(1.2, 0), new THREE.MeshStandardMaterial({ color: 0x82867f, roughness: 0.96 }), 1.4, 0.7, 0.8);
    } else if (type === 'rock_small') {
      const rm = new THREE.MeshStandardMaterial({ color: 0x7b7f78, roughness: 0.96 });
      addM(g, new THREE.DodecahedronGeometry(0.45, 0), rm, 0, 0.22, 0);
      addM(g, new THREE.DodecahedronGeometry(0.32, 0), rm, 0.45, 0.16, 0.25);
      addM(g, new THREE.DodecahedronGeometry(0.28, 0), rm, -0.35, 0.14, 0.3);
      addM(g, new THREE.DodecahedronGeometry(0.22, 0), rm, 0.1, 0.11, -0.38);
    } else {
      addM(g, new THREE.DodecahedronGeometry(1.2), new THREE.MeshStandardMaterial({ color: 0x777b74, roughness: 0.95 }), 0, 0.7, 0);
    }
  } else if (type === 'grass') {
    const gm = new THREE.MeshStandardMaterial({ color: 0x4f8a3e, roughness: 1 });
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + Math.random() * 0.4;
      const r = 0.08 + Math.random() * 0.12;
      const h = 0.25 + Math.random() * 0.25;
      addM(g, new THREE.ConeGeometry(r, h, 5), gm, Math.cos(a) * 0.15, h / 2, Math.sin(a) * 0.15, 0, a, 0);
    }
  } else if (type === 'chest') {
    addM(g, new THREE.BoxGeometry(1.25, 0.75, 0.85), new THREE.MeshStandardMaterial({ color: 0xc98a3a, roughness: 0.8, metalness: 0.05 }), 0, 0.42, 0);
    addM(g, new THREE.BoxGeometry(1.28, 0.08, 0.88), new THREE.MeshStandardMaterial({ color: 0x8a5a1f, roughness: 0.7 }), 0, 0.82, 0);
    addM(g, new THREE.BoxGeometry(0.18, 0.12, 0.06), new THREE.MeshStandardMaterial({ color: 0xffd36a, roughness: 0.4, metalness: 0.6 }), 0, 0.5, 0.46);
  } else if (type === 'weapon_spawn') {
    const base = new THREE.MeshStandardMaterial({ color: 0x2b6cb0, roughness: 0.5, metalness: 0.2, emissive: 0x1a365d, emissiveIntensity: 0.35 });
    addM(g, new THREE.CylinderGeometry(0.55, 0.65, 0.12, 16), base, 0, 0.06, 0);
    addM(g, new THREE.BoxGeometry(0.9, 0.18, 0.28), new THREE.MeshStandardMaterial({ color: 0x4a5568, roughness: 0.6, metalness: 0.4 }), 0, 0.35, 0, 0, 0.2, 0);
    addM(g, new THREE.BoxGeometry(0.35, 0.22, 0.18), new THREE.MeshStandardMaterial({ color: 0x2f855a, roughness: 0.7 }), 0.55, 0.32, 0.22, 0, -0.3, 0);
    addM(g, new THREE.SphereGeometry(0.12, 10, 10), new THREE.MeshStandardMaterial({ color: 0x63b3ed, emissive: 0x63b3ed, emissiveIntensity: 0.8 }), 0, 0.75, 0);
  } else if (type === 'road' || type === 'path') {
    const isRoad = type === 'road';
    const baseC = isRoad ? 0x44484d : 0x7a6a52;
    const markC = isRoad ? 0xd8d0b8 : 0x9a8662;
    addM(g, new THREE.BoxGeometry(4, 0.12, 4), new THREE.MeshStandardMaterial({ color: baseC, roughness: 0.95 }), 0, 0.06, 0);
    const conn = g.userData.conn || { n:false,s:false,e:false,w:false };
    const arms = [];
    if (conn.n) arms.push([0,0,-1]);
    if (conn.s) arms.push([0,0,1]);
    if (conn.e) arms.push([1,0,0]);
    if (conn.w) arms.push([-1,0,0]);
    if (!arms.length) arms.push([0,0,-1],[0,0,1]);
    for (const [ax,ay,az] of arms) {
      const len = 2;
      const cx2 = ax*1, cz2 = az*1;
      const w = ax!==0 ? 2 : (isRoad?1.2:1.6);
      const d = az!==0 ? 2 : (isRoad?1.2:1.6);
      addM(g, new THREE.BoxGeometry(w, 0.125, d), new THREE.MeshStandardMaterial({ color: baseC, roughness: 0.95 }), cx2, 0.065, cz2);
      if (isRoad) {
        if (ax!==0) addM(g, new THREE.BoxGeometry(1.8,0.13,0.14), new THREE.MeshStandardMaterial({color:markC,roughness:0.8}), cx2,0.072,cz2);
        if (az!==0) addM(g, new THREE.BoxGeometry(0.14,0.13,1.8), new THREE.MeshStandardMaterial({color:markC,roughness:0.8}), cx2,0.072,cz2);
      }
    }
    addM(g, new THREE.CylinderGeometry(isRoad?0.45:0.55, isRoad?0.45:0.55, 0.126, 12), new THREE.MeshStandardMaterial({ color: baseC, roughness: 0.95 }), 0, 0.065, 0);
  }
  return g;
}

function roadKey(x,z){ return Math.round(x/4)+','+Math.round(z/4); }
function isRoadLike(type){ return type==='road' || type==='path'; }
function getRoadConn(x,z,type){
  const g=4, k=roadKey(x,z);
  const has = (dx,dz)=> placed.some(p=>isRoadLike(p.type) && p.type===type && Math.round(p.x/g)===Math.round(x/g)+dx && Math.round(p.z/g)===Math.round(z/g)+dz);
  return { n:has(0,-1), s:has(0,1), e:has(1,0), w:has(-1,0) };
}
// Las carreteras las reconstruye World con sus modelos reales.
function rebuildRoadAt() {}
function refreshRoadNeighbors() { scheduleRebuild(); }

function snapWallPlacement(x, z, type, rot) {
  const wallTypes = ['wall','wall_door','wall_window'];
  if (!wallTypes.includes(type)) return { x, z, rot };
  // snap to grid 2u but also snap to adjacent wall edges
  let best = { x, z, rot, d: 1.6 };
  const candidates = [];
  for (const p of placed) {
    if (!wallTypes.includes(p.type)) continue;
    const dx = x - p.x, dz = z - p.z;
    if (Math.hypot(dx, dz) > 6) continue;
    // same rotation: snap adjacent along wall length
    const sameRot = Math.abs(((rot - p.rot) % Math.PI + Math.PI) % Math.PI) < 0.2 || Math.abs(((rot - p.rot) % Math.PI + Math.PI) % Math.PI - Math.PI) < 0.2;
    if (sameRot) {
      const k = ((Math.round(rot / (Math.PI / 2)) % 4) + 4) % 4;
      if (k % 2 === 0) { // runs along Z
        candidates.push({ x: p.x, z: p.z + 2, rot: p.rot });
        candidates.push({ x: p.x, z: p.z - 2, rot: p.rot });
      } else { // runs along X
        candidates.push({ x: p.x + 2, z: p.z, rot: p.rot });
        candidates.push({ x: p.x - 2, z: p.z, rot: p.rot });
      }
    } else {
      // corner: snap to end of other wall, rotate perpendicular
      const pk = ((Math.round(p.rot / (Math.PI / 2)) % 4) + 4) % 4;
      if (pk % 2 === 0) {
        candidates.push({ x: p.x + 1, z: p.z + 1, rot: Math.PI / 2 });
        candidates.push({ x: p.x - 1, z: p.z + 1, rot: Math.PI / 2 });
        candidates.push({ x: p.x + 1, z: p.z - 1, rot: Math.PI / 2 });
        candidates.push({ x: p.x - 1, z: p.z - 1, rot: Math.PI / 2 });
      } else {
        candidates.push({ x: p.x + 1, z: p.z + 1, rot: 0 });
        candidates.push({ x: p.x + 1, z: p.z - 1, rot: 0 });
        candidates.push({ x: p.x - 1, z: p.z + 1, rot: 0 });
        candidates.push({ x: p.x - 1, z: p.z - 1, rot: 0 });
      }
    }
  }
  for (const c of candidates) {
    const d = Math.hypot(x - c.x, z - c.z);
    if (d < best.d) best = { ...c, d };
  }
  return { x: snap(best.x, 1), z: snap(best.z, 1), rot: best.rot };
}

function placePieceAt(x, z) {
  const isRoad = selectedPiece === 'road' || selectedPiece === 'path';
  const gs = isRoad ? ROAD_CELL_SIZE : GRID_SIZE;
  const preX = x, preZ = z;
  x = snapToGrid(x, gs); z = snapToGrid(z, gs);
  const isWall = ['wall','wall_corner','wall_door','wall_window'].includes(selectedPiece);
  if (isWall) {
    const ws = snapWallPlacement(x, z, selectedPiece, rotY);
    x = ws.x; z = ws.z; rotY = ws.rot;
    // Muros siempre orientados a 0/90/180/270 según la línea 3D que se tocó.
    const angle = Math.atan2(preZ - z, preX - x);
    rotY = Math.round(angle / (Math.PI / 2)) * (Math.PI / 2);
  }
  const floors = ((selectedPiece === 'house' || selectedPiece === 'cabin') && document.querySelector('#floorsSelect')) ? parseInt(document.querySelector('#floorsSelect').value, 10) || 1 : 1;
  rotY = isRoad ? 0 : rotY;
  const rawY = editorHeightAt(x, z);
  const y = snapHeight(rawY, GRID_H);
  const entry = { type: selectedPiece, x, y, z, rot: rotY };
  if ((selectedPiece === 'house' || selectedPiece === 'cabin') && floors > 1) entry.floors = floors;
  if (isDecorType(selectedPiece)) {
    const cfg = getDecorConfig(selectedPiece);
    const models = cfg.models || [];
    if (models.length) {
      const pick = cfg.random ? models[Math.floor(Math.random() * models.length)] : models[0];
      if (pick?.src) entry.modelSrc = pick.src;
      if (pick?.name) entry.modelName = pick.name;
      if (pick?.scale != null) entry.modelScale = +pick.scale || 1;
      if (pick?.rotX != null) entry.modelRotX = +pick.rotX || 0;
      if (pick?.rotY != null) entry.modelRotY = +pick.rotY || 0;
      if (pick?.rotZ != null) entry.modelRotZ = +pick.rotZ || 0;
    }
  }
  const dupIdx = placed.findIndex(p => Math.abs(p.x-x)<0.1 && Math.abs(p.z-z)<0.1 && p.type===selectedPiece);
  if (dupIdx >= 0) placed.splice(dupIdx,1);
  placed.push(entry);
  refreshRoadNeighbors();
  scheduleRebuild();
  document.querySelector('#status').textContent = `Colocado: ${selectedPiece} (${x.toFixed(1)}, ${z.toFixed(1)})`;
}

function erasePieceAtRay() {
  let best = null, bestD = 3;
  for (const p of placedGroup.children) {
    const d = raycaster.ray.distanceToPoint(p.position);
    if (d < bestD) { bestD = d; best = p; }
  }
  if (best) {
    const i = placedGroup.children.indexOf(best);
    const removed = placed[i];
    if (i >= 0) placed.splice(i, 1);
    if (removed && isRoadLike(removed.type)) refreshRoadNeighbors();
    scheduleRebuild();
    document.querySelector('#status').textContent = 'Pieza eliminada';
  }
}

function clearSelection() {
  selected.clear();
  updateSelectionHelpers();
  syncSelectionControls();
}
function updateSelectionHelpers() {
  while (selectionHelpers.children.length) {
    const c = selectionHelpers.children[0];
    selectionHelpers.remove(c);
    c.geometry?.dispose?.();
    c.material?.dispose?.();
  }
  for (const idx of selected) {
    const obj = placedGroup.children[idx];
    if (!obj) continue;
    const box = new THREE.Box3().setFromObject(obj);
    if (box.isEmpty()) continue;
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const h = new THREE.BoxHelper(obj, 0x7fd0ff);
    h.material.depthTest = false;
    h.material.transparent = true;
    h.material.opacity = 0.9;
    selectionHelpers.add(h);
  }
  syncProxyToSelection();
  document.querySelector('#status').textContent = selected.size ? `${selected.size} objeto(s) seleccionados` : 'Sin selección';
}
function syncSelectionControls() {
  const showMove = selected.size > 0 && moveMode;
  tControls.visible = showMove;
  tControls.enabled = showMove;
  if (showMove) tControls.attach(selectProxy);
  else tControls.detach();
}
function syncProxyToSelection() {
  if (!selected.size) { selectProxy.position.set(0,0,0); syncSelectionControls(); return; }
  const c = new THREE.Vector3();
  let n = 0;
  for (const idx of selected) { const o = placedGroup.children[idx]; if (!o) continue; c.add(o.position); n++; }
  if (n) c.divideScalar(n);
  selectProxy.position.copy(c);
  selectProxy.rotation.set(0,0,0);
  selectProxy.scale.set(1,1,1);
  syncSelectionControls();
}
function selectByIndex(idx, additive = false) {
  if (!additive) selected.clear();
  if (idx >= 0 && idx < placedGroup.children.length) {
    if (additive && selected.has(idx)) selected.delete(idx);
    else selected.add(idx);
  }
  updateSelectionHelpers();
}
function getPieceIndexFromRay() {
  const hits = raycaster.intersectObjects(placedGroup.children, true);
  if (!hits.length) return -1;
  let obj = hits[0].object;
  while (obj && obj.parent !== placedGroup) obj = obj.parent;
  if (!obj) return -1;
  return placedGroup.children.indexOf(obj);
}
function syncPlacedFromSelection() {
  const movedRoads = [];
  for (const idx of selected) {
    const o = placedGroup.children[idx];
    const p = placed[idx];
    if (!o || !p) continue;
    const oldX = p.x, oldZ = p.z, oldType = p.type;
    p.x = o.position.x; p.y = o.position.y; p.z = o.position.z;
    if (isRoadLike(oldType)) movedRoads.push({ x: oldX, z: oldZ, type: oldType, nx: p.x, nz: p.z });
  }
  for (const m of movedRoads) {
    refreshRoadNeighbors(m.x, m.z, m.type);
    refreshRoadNeighbors(m.nx, m.nz, m.type);
  }
  scheduleRebuild();
}

function deleteSelected() {
  if (!selected.size) return;
  const indices = Array.from(selected).sort((a,b)=>b-a);
  for (const idx of indices) {
    const removed = placed[idx];
    if (idx >= 0) placed.splice(idx,1);
    if (removed && isRoadLike(removed.type)) refreshRoadNeighbors(removed.x, removed.z, removed.type);
  }
  selected.clear();
  scheduleRebuild();
  updateSelectionHelpers();
  document.querySelector('#status').textContent = `Eliminados ${indices.length} objeto(s)`;
}
function marqueeSelectRect(x1,y1,x2,y2, additive=false) {
  if (!additive) selected.clear();
  const left = Math.min(x1,x2), right = Math.max(x1,x2);
  const top = Math.min(y1,y2), bottom = Math.max(y1,y2);
  const rect = canvas.getBoundingClientRect();
  for (let i=0; i<placedGroup.children.length; i++) {
    const o = placedGroup.children[i];
    const p = o.position.clone().project(camera);
    if (p.z < -1 || p.z > 1) continue;
    const sx = (p.x * 0.5 + 0.5) * rect.width + rect.left;
    const sy = (-p.y * 0.5 + 0.5) * rect.height + rect.top;
    if (sx >= left && sx <= right && sy >= top && sy <= bottom) selected.add(i);
  }
  updateSelectionHelpers();
}

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
function getGroundHit(e) {
  const rect = canvas.getBoundingClientRect();
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const hit = world.raycast(raycaster.ray.origin, raycaster.ray.direction, 5000);
  if (hit?.type === 'terrain') return hit.point;
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(world.waterLevel || 0));
  return raycaster.ray.intersectPlane(plane, new THREE.Vector3());
}

canvas.addEventListener('pointerdown', (e) => {
  if (e.button === 2) {
    // Clic derecho: borrar pieza, o borrar agua si estamos en modo agua/erase-water
    if (mode === 'water' || mode === 'erase-water') {
      const hit = getGroundHit(e);
      if (hit) eraseWaterAt(snapToGrid(hit.x, TERRAIN_CELL), snapToGrid(hit.z, TERRAIN_CELL));
      return;
    }
    if (mode==='place'||mode==='erase'||mode==='path'||mode==='road') erasePieceAtRay();
    return;
  }
  if (e.button !== 0) return;
  if (tControls.dragging || (moveMode && tControls.axis)) return;

  if (mode === 'select') {
    // check if clicking an object
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const idx = getPieceIndexFromRay();
    if (idx >= 0) {
      selectByIndex(idx, e.shiftKey);
      painting = false;
      marquee.active = false;
      return;
    }
    // start marquee
    marquee.active = true;
    marquee.moved = false;
    marquee.startX = e.clientX;
    marquee.startY = e.clientY;
    marquee.additive = e.shiftKey;
    if (marqueeEl) { marqueeEl.style.display = 'none'; }
    return;
  }

  const hit = getGroundHit(e); if (!hit) return;
  painting = true;
  tileStroke.clear();
  tileStrokeActive = true;
  applyAt(hit, e.shiftKey);
});
canvas.addEventListener('pointermove', (e) => {
  const hit = getGroundHit(e);
  if (hit) {
    const hy = editorHeightAt(hit.x, hit.z);
    // Brush ring (terreno)
    brushRing.visible = mode.startsWith('terrain') || mode === 'water' || mode === 'erase-water' || mode === 'grass' || isDecorBrushMode();
    if (brushRing.visible) {
      brushRing.position.set(hit.x, hy + 0.15, hit.z);
      brushRing.scale.setScalar(+document.querySelector('#brushSize').value || 4);
    }
    // Ghost grid (snap cel para piezas/viento)
    updateBrushGhost(hit.x, hit.z, hy);
    updateTileGridCursor(hit.x, hit.z);
  } else {
    brushRing.visible = false;
    brushGhostGrid.visible = false;
  }

  if (mode === 'select' && marquee.active) {
    const dx = e.clientX - marquee.startX;
    const dy = e.clientY - marquee.startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) marquee.moved = true;
    if (marquee.moved && marqueeEl) {
      const left = Math.min(marquee.startX, e.clientX);
      const top = Math.min(marquee.startY, e.clientY);
      const w = Math.abs(dx), h = Math.abs(dy);
      marqueeEl.style.display = 'block';
      marqueeEl.style.left = left + 'px';
      marqueeEl.style.top = top + 'px';
      marqueeEl.style.width = w + 'px';
      marqueeEl.style.height = h + 'px';
    }
    return;
  }

  if (painting && hit) {
    const now = performance.now();
    if (now - lastPaintAt > 40) { lastPaintAt = now; applyAt(hit, e.shiftKey); }
  }
});
window.addEventListener('pointerup', (e) => {
  if (mode === 'select' && marquee.active) {
    if (marquee.moved) {
      marqueeSelectRect(marquee.startX, marquee.startY, e.clientX, e.clientY, marquee.additive);
    } else if (!marquee.additive) {
      // click on empty space clears selection
      clearSelection();
    }
    marquee.active = false;
    if (marqueeEl) marqueeEl.style.display = 'none';
  }
  painting = false;
  // Al soltar, aplica el pincel definitivo (preview sostenido sobre grid).
  const upHit = getGroundHit(e);
  if (upHit) applyAt(upHit, e.shiftKey);
  tileStrokeActive = false;
});

function placeGrassAt(cx, cz) {
  const radius = Math.max(1.5, (+document.querySelector('#brushSize').value || 4) * 0.5);
  const density = Math.max(1, +document.querySelector('#brushDensity')?.value || 5);
  const count = Math.max(1, Math.round(radius * 0.8 * (density / 5)));
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * radius;
    const x = snap(cx + Math.cos(a) * r, 1);
    const z = snap(cz + Math.sin(a) * r, 1);
    if (placed.some(p => p.type === 'grass' && Math.hypot(p.x - x, p.z - z) < 0.8)) continue;
    const entry = { type: 'grass', x, y: editorHeightAt(x, z), z, rot: Math.random() * Math.PI * 2, scale: +(0.7 + Math.random() * 0.8).toFixed(2) };
    placed.push(entry);
  }
  scheduleRebuild();
  document.querySelector('#status').textContent = `Césped colocado (${placed.filter(p=>p.type==='grass').length})`;
}

function placeDecorAt(cx, cz) {
  const radius = Math.max(1, (+document.querySelector('#brushSize').value || 4));
  const density = Math.max(1, +document.querySelector('#brushDensity')?.value || 5);
  const count = Math.max(1, Math.round((radius * radius * 0.12) * (density / 5)));
  const type = selectedPiece;
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * radius;
    const x = snap(cx + Math.cos(a) * r, 1);
    const z = snap(cz + Math.sin(a) * r, 1);
    const minDist = type.startsWith('tree') ? 1.8 : (type.startsWith('rock') ? 1.2 : 0.9);
    if (placed.some(p => p.type === type && Math.hypot(p.x - x, p.z - z) < minDist)) continue;
    const entry = { type, x, y: editorHeightAt(x, z), z, rot: Math.random() * Math.PI * 2, scale: +(0.75 + Math.random() * 0.7).toFixed(2) };
    if (isDecorType(type)) {
      const cfg = getDecorConfig(type);
      const models = cfg.models || [];
      if (models.length) {
        const pick = cfg.random ? models[Math.floor(Math.random() * models.length)] : models[0];
        if (pick?.src) entry.modelSrc = pick.src;
        if (pick?.name) entry.modelName = pick.name;
        if (pick?.scale != null) entry.modelScale = +pick.scale || 1;
        if (pick?.rotX != null) entry.modelRotX = +pick.rotX || 0;
        if (pick?.rotY != null) entry.modelRotY = +pick.rotY || 0;
        if (pick?.rotZ != null) entry.modelRotZ = +pick.rotZ || 0;
      }
    }
    placed.push(entry);
  }
  scheduleRebuild();
  document.querySelector('#status').textContent = `Decoración: ${type} (${placed.filter(p=>p.type===type).length})`;
}

function applyAt(hit, shift) {
  if (mode === 'tiles') {
    if (!tileStrokeActive) return;
    if (shift) { pickTileAt(hit.x, hit.z); painting = false; tileStrokeActive = false; return; }
    applyTiles(hit.x, hit.z);
    return;
  }
  if (mode === 'place') {
    if (isDecorType(selectedPiece)) { placeDecorAt(hit.x, hit.z); }
    else { placePieceAt(hit.x, hit.z); painting = false; }
  }
  else if (mode === 'path' || mode === 'road') { selectedPiece = mode; placePieceAt(hit.x, hit.z); }
  else if (mode === 'erase') { erasePieceAtRay(); painting = false; }
  else if (mode === 'water') {
    addWaterPatch(snap(hit.x, 2), snap(hit.z, 2));
  }
  else if (mode === 'erase-water') {
    eraseWaterAt(snapToGrid(hit.x, TERRAIN_CELL), snapToGrid(hit.z, TERRAIN_CELL));
  }
  else if (mode === 'wind') {
    placeWindAt(snapToGrid(hit.x, GRID_SIZE), snapToGrid(hit.z, GRID_SIZE));
    painting = false;
  }
  else if (mode === 'grass') { placeGrassAt(hit.x, hit.z); }
  // El terreno antiguo (subir/bajar/aplanar por celdas) ya no existe: solo teselas.
}

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

async function loadCustomMap(dataOverride = null) {
  let data = dataOverride || null;
  if (!data) {
    for (const url of ['/maps/custom-map.json', './maps/custom-map.json', '/maps/san-borondon.json']) {
      try { const res = await fetch(url + '?t=' + Date.now()); if (res.ok) { data = await res.json(); break; } } catch {}
    }
  }
  if (!data) {
    baseCustomData = {};
    placed.length = 0;
    selected.clear();
    makeStarterTiles();
    rebuildTileGridPlane();
    syncTileLabels();
    syncWorldModular();
    await rebuildNow();
    document.querySelector('#status').textContent = 'Mundo nuevo: isla de teselas inicial';
    return;
  }
  const norm = normalizeMapData(data);
  baseCustomData = { ...norm.raw, id: norm.id, name: norm.name, theme: norm.theme, size: norm.size };
  const globalVeg = norm.waterVegetation;
  const vegInput = document.querySelector('#waterVegetation');
  if (vegInput) vegInput.value = Math.round(globalVeg * 100);

  // El editor y el juego se basan en el mismo modelo canónico (Libro de la Verdad Absoluta)
  placed.length = 0;
  selected.clear();
  for (const p of norm.pieces) {
    placed.push({ ...p });
  }
  rotY = 0;
  document.querySelector('#rotSelect').value = '0';

  heightOverrides.clear();
  cellSmooth.clear();
  for (const [k, y] of norm.terrain.heights.entries()) {
    heightOverrides.set(k, y);
  }
  for (const [k, s] of norm.terrain.smooths.entries()) {
    cellSmooth.set(k, s);
  }

  waterCells.clear();
  waterVegCells.clear();
  for (const [k, w] of norm.waterCells.entries()) {
    waterCells.set(k, w.y);
    waterVegCells.set(k, w.veg);
  }

  // Terreno modular (teselas) y nivel del agua: los mismos valores que usa el juego.
  tileCells.clear();
  let converted = false;
  if (norm.modular) {
    Object.assign(modularState, { tile: norm.modular.tile, level: norm.modular.level, baseY: norm.modular.baseY, outside: norm.modular.outside });
    for (const [k, c] of norm.modular.cells) tileCells.set(k, { ...c });
  } else if (data && (norm.terrain.heights.size || norm.pieces.length || norm.raw?.biome)) {
    // Mapa antiguo: su relieve se importa a teselas (el editor solo edita teselas).
    if (Number.isFinite(norm.waterLevel)) world.setWaterLevelNow?.(norm.waterLevel);
    convertLegacyToTiles(norm);
    converted = true;
  } else {
    makeStarterTiles();
  }
  rebuildTileGridPlane();
  syncTileLabels();
  const outsideEl = document.querySelector('#tileOutside');
  if (outsideEl) outsideEl.value = modularState.outside;
  syncWorldModular();
  if (Number.isFinite(norm.waterLevel)) {
    world.setWaterLevelNow?.(norm.waterLevel);
    if (waterLevelInput) waterLevelInput.value = snapH(norm.waterLevel);
  }

  // Cargar vientos del mapa guardado
  winds.length = 0;
  for (const id of windGizmos.keys()) removeWindGizmo(id);
  if (Array.isArray(norm.winds)) {
    for (const w of norm.winds) {
      winds.push({ ...w });
      placed.push({ ...w });
    }
  }

  await rebuildNow();
  refreshWindGizmos();
  document.querySelector('#status').textContent = converted
    ? `Mapa antiguo importado a ${tileCells.size} teselas (guárdalo para conservar la conversión)`
    : `Cargadas ${placed.length} piezas, ${tileCells.size} teselas, ${winds.length} vientos`;
}
document.querySelector('#waterVegetation')?.addEventListener('change', scheduleRebuild);
// Arranca en modo Teselas con su panel visible.
document.querySelector('#modePalette button[data-mode="tiles"]')?.click();
loadCustomMap();
loadDecorModelConfig();

function buildSavePayload() {
  const heights = [];
  for (const [k, y] of heightOverrides.entries()) {
    const [gx, gz] = k.split(',').map(Number);
    heights.push([gx, gz, +y.toFixed(2)]);
  }
  const smooths = [];
  for (const [k, s] of cellSmooth.entries()) {
    if (s > 0.001) {
      const [gx, gz] = k.split(',').map(Number);
      smooths.push([gx, gz, +(+s).toFixed(2)]);
    }
  }
  const globalVeg = clamp((+document.querySelector('#waterVegetation')?.value || 0) / 100, 0, 1);
  const waterCellsArr = [];
  for (const [k, y] of waterCells.entries()) {
    const [gx, gz] = k.split(',').map(Number);
    const veg = clamp(waterVegCells.get(k) ?? globalVeg, 0, 1);
    waterCellsArr.push([gx, gz, +(+y).toFixed(2), +veg.toFixed(2)]);
  }
  return {
    ...baseCustomData,
    base: baseCustomData.base || baseCustomData.id || 'san-borondon',
    theme: baseCustomData.theme || 'temperate',
    size: baseCustomData.size || 360,
    seed: baseCustomData.seed || 20261119,
    pieces: placed.map(p => ({ ...p })),
    // El terreno antiguo por celdas ya no se edita ni se guarda: solo teselas.
    terrain: { cell: TERRAIN_CELL, heights: [] },
    waterVegetation: +globalVeg.toFixed(2),
    waterCells: waterCellsArr,
    winds: winds.map(w => ({ ...w })),
    // Mismo nivel de agua que se ve en el editor (antes el juego usaba otro).
    waterLevel: snapH(Number.isFinite(world.waterLevelTarget) ? world.waterLevelTarget : (world.waterLevel ?? 0)),
    modular: modularPayload(),
  };
}

document.querySelector('#saveMap').onclick = async () => {
  const payload = JSON.stringify(buildSavePayload(), null, 2);
  document.querySelector('#mapText').value = payload;
  const mapId = (baseCustomData.id && baseCustomData.id !== 'custom-map') ? String(baseCustomData.id).replace(/[^a-z0-9_-]/gi, '') : 'custom-map';
  const fileName = `${mapId || 'custom-map'}.json`;
  const paths = [`public/maps/${fileName}`, `dist/maps/${fileName}`, `maps/${fileName}`];
  let ok = 0;
  for (const p of paths) {
    try { await window.opennite?.app?.writeFile?.(p, payload); ok++; } catch {}
  }
  if (!ok) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
    a.download = fileName;
    a.click();
  }
  document.querySelector('#status').textContent = `Guardado ${fileName}: ${placed.length} piezas, ${heightOverrides.size} celdas terreno, ${tileCells.size} teselas`;
};

document.querySelector('#loadMap').onclick = async () => {
  let raw = null;
  try { raw = await window.opennite?.app?.openMapFile?.(); } catch {}
  if (typeof raw !== 'string' || !raw.trim()) return;
  try {
    const data = JSON.parse(raw);
    await loadCustomMap(data);
    document.querySelector('#status').textContent = `Mapa cargado: ${data.pieces?.length ?? 0} piezas`;
  } catch (e) {
    document.querySelector('#status').textContent = 'JSON inválido: ' + e.message;
  }
};

document.querySelector('#clearMap').onclick = () => {
  placed.length = 0;
  selected.clear();
  scheduleRebuild();
  document.querySelector('#status').textContent = 'Piezas limpiadas';
};
document.querySelector('#clearTerrain').onclick = () => {
  tileCells.clear();
  syncWorldModular();
  heightOverrides.clear();
  clearWaterPatches();
  repositionPlacedToTerrain();
  scheduleRebuild();
  document.querySelector('#status').textContent = 'Teselas y agua borradas';
};

document.querySelector('#selDeleteBtn')?.addEventListener('click', deleteSelected);
document.querySelector('#selAllBtn')?.addEventListener('click', () => { selected.clear(); for (let i=0;i<placedGroup.children.length;i++) selected.add(i); updateSelectionHelpers(); });
document.querySelector('#selNoneBtn')?.addEventListener('click', clearSelection);
document.querySelector('#selMoveBtn')?.addEventListener('click', () => {
  moveMode = !moveMode;
  document.querySelector('#selMoveBtn').classList.toggle('active', moveMode);
  syncSelectionControls();
  document.querySelector('#status').textContent = moveMode ? 'Modo mover: arrastra el gizmo' : 'Modo selección';
});

window.addEventListener('keydown', (e) => {
  const tag = (e.target?.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
  if (e.key === 'Delete' || e.key === 'Backspace') { if (mode === 'select' && selected.size) { e.preventDefault(); deleteSelected(); } }
  if (e.key === 'g' || e.key === 'G') { if (mode === 'select') { e.preventDefault(); moveMode = !moveMode; document.querySelector('#selMoveBtn')?.classList.toggle('active', moveMode); syncSelectionControls(); } }
  if (e.key === 'Escape') { if (moveMode) { moveMode = false; syncSelectionControls(); } else clearSelection(); }
});

const clock = new THREE.Clock();
function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(0.05, clock.getDelta());
  orbit.update();
  world.update(camera.position);
  world.tick(dt);
  loot.update(dt, world._waterTime || 0);
  for (const h of selectionHelpers.children) h.update?.();
  renderer.render(scene, camera);
}
tick();
window.addEventListener('resize', () => {
  camera.aspect = canvas.clientWidth / canvas.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
});
renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
