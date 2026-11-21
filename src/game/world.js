import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clamp, fbm, hash2, hashString, lerp, makeRandom, noise2, rayAABB, smoothstep } from '../core/utils.js';
import { WorldDebug } from './debug.js';
import { BUILD_PIECES, KIT_BASE_PATH, KIT_CATALOG, KIT_FLOOR_H, KIT_MODULE, KIT_SLAB_H, KIT_WALL_H, cloneKitPiece, kitPieceGameplayCollider, loadBuildingKit, tintKitPiece } from './kit-pieces.js';


const CHUNK_SIZE = 256;
const CHUNK_SEGMENTS = 24;
const COLLIDER_CELL = 96;

const THEMES = {
  temperate: {
    grass: 0x4f7c45, grass2: 0x74a35a, high: 0x8d9b76, rock: 0x777b74, sand: 0xb5a47e,
    water: 0x2f7189, wall: 0xcfc7b2, wall2: 0xa89f8c, roof: 0x8c4f3c, wood: 0x7b5738,
    metal: 0x68727c, glass: 0x9fd3e0, concrete: 0x9a9c98, accent: 0xe2843c, dark: 0x3b4147,
    tree: 0x2f6b3e, tree2: 0x4b8a4c, sky: 0x8fc4e8, sun: 1.6,
  },
  desert: {
    grass: 0xc49a60, grass2: 0xd8b478, high: 0xb98b58, rock: 0x9c6f49, sand: 0xe2c48d,
    water: 0x4a9aa0, wall: 0xd9bb8d, wall2: 0xb89768, roof: 0x8e5a3d, wood: 0x745135,
    metal: 0x777066, glass: 0xa9c9c4, concrete: 0xb8a98d, accent: 0xd76f3a, dark: 0x4a4038,
    tree: 0x6d8050, tree2: 0x8a9558, sky: 0xd6c08f, sun: 2.5,
  },
  snow: {
    grass: 0xd8e6ec, grass2: 0xeef6fa, high: 0xf6fbff, rock: 0x8798a6, sand: 0xc4d6de,
    water: 0x7fc0d8, wall: 0xdbe5ea, wall2: 0xb4c2cd, roof: 0x6a7a8a, wood: 0x6d5a4a,
    metal: 0x8b98a3, glass: 0xc8e8f2, concrete: 0xc7d0d6, accent: 0x4a9fd8, dark: 0x46545f,
    tree: 0x2d5a52, tree2: 0x426d64, sky: 0xa9cfe6, sun: 1.1,
  },
  autumn: {
    grass: 0x8a6a3d, grass2: 0xa97a43, high: 0xb88659, rock: 0x92583f, sand: 0xc99a69,
    water: 0x4d7b7e, wall: 0xc9a884, wall2: 0xa88462, roof: 0x8a4232, wood: 0x6a432d,
    metal: 0x786b64, glass: 0xd2b892, concrete: 0xb59a80, accent: 0xe06636, dark: 0x4b3a34,
    tree: 0x8f522f, tree2: 0xb37436, sky: 0xe0a878, sun: 2.0,
  },
};

/** Color del sub-bioma que aparece en zonas del mismo mapa. */
const SUBBIOME = {
  temperate: 0x2f5d38,
  desert: 0x93663c,
  snow: 0x7593a4,
  autumn: 0x6d422b,
};

/** Objetos del Stylized Nature MegaKit usados en San Borondon (unidades ≈ metros). */
const KIT_VARIANTS = [
  { model: 'CommonTree_1', count: 20, minRadius: 0.08, maxRadius: 0.68, scale: 1, shadow: true },
  { model: 'CommonTree_2', count: 18, minRadius: 0.08, maxRadius: 0.68, scale: 1, shadow: true },
  { model: 'CommonTree_3', count: 12, minRadius: 0.1, maxRadius: 0.62, scale: 0.92, shadow: true },
  { model: 'Pine_1', count: 17, minRadius: 0.1, maxRadius: 0.7, scale: 1, shadow: true },
  { model: 'Pine_2', count: 14, minRadius: 0.12, maxRadius: 0.7, scale: 0.95, shadow: true },
  { model: 'Pine_4', count: 10, minRadius: 0.12, maxRadius: 0.58, scale: 0.85, shadow: true },
  { model: 'Rock_Medium_1', count: 24, maxRadius: 0.74, scale: 0.85, allowPoi: true, shadow: true, yOffset: 0.12 },
  { model: 'Rock_Medium_2', count: 20, maxRadius: 0.74, scale: 0.8, allowPoi: true, shadow: true, yOffset: 0.08 },
  { model: 'Rock_Medium_3', count: 16, maxRadius: 0.72, scale: 0.78, allowPoi: true, shadow: true, yOffset: 0.16 },
  { model: 'Bush_Common', count: 46, maxRadius: 0.7, scale: 0.9, shadow: false, flat: true, allowPoi: true },
  { model: 'Bush_Common_Flowers', count: 32, maxRadius: 0.68, scale: 0.9, shadow: false, flat: true, allowPoi: true },
  { model: 'Fern_1', count: 24, maxRadius: 0.66, scale: 0.48, shadow: false, flat: true, allowPoi: true },
  { model: 'Grass_Common_Short', count: 260, maxRadius: 0.78, scale: 1, shadow: false, flat: true, allowPoi: true, clearance: 0.35 },
  { model: 'Grass_Wispy_Tall', count: 180, maxRadius: 0.76, scale: 0.95, shadow: false, flat: true, allowPoi: true, clearance: 0.35 },
  { model: 'Flower_3_Group', count: 70, maxRadius: 0.72, scale: 1, shadow: false, flat: true, allowPoi: true, clearance: 0.35 },
  { model: 'Flower_4_Group', count: 60, maxRadius: 0.72, scale: 1, shadow: false, flat: true, allowPoi: true, clearance: 0.35 },
  { model: 'Clover_1', count: 90, maxRadius: 0.76, scale: 1, shadow: false, flat: true, allowPoi: true, clearance: 0.3 },
  { model: 'Pebble_Round_1', count: 54, maxRadius: 0.78, scale: 1.1, shadow: false, allowPoi: true, clearance: 0.4, yOffset: 0.03 },
  { model: 'Pebble_Square_1', count: 44, maxRadius: 0.78, scale: 1.1, shadow: false, allowPoi: true, clearance: 0.4, yOffset: 0.03 },
  { model: 'Mushroom_Common', count: 22, maxRadius: 0.64, scale: 1, shadow: false, clearance: 0.6 },
];

/** Props del Fantasy Props MegaKit (CC0) usados en pueblos, puertos y caminos. */
const PROP_NAMES = [
  'Bag', 'Barrel', 'Barrel_Apples', 'Bench', 'Bucket_Wooden_1', 'Crate_Metal',
  'Crate_Wooden', 'FarmCrate_Apple', 'FarmCrate_Empty', 'Lantern_Wall',
  'Shelf_Simple', 'Stall_Cart_Empty', 'Stall_Empty', 'Table_Large', 'Torch_Metal',
];

/** Texturas 2D generadas por código: detalle real sin assets de terceros. */
function makeSurfaceTexture(kind, seed, repeat = 4, anisotropy = 4) {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const c = canvas.getContext('2d');
  const rnd = makeRandom(seed >>> 0);

  if (kind === 'brick') {
    c.fillStyle = '#8f8a80';
    c.fillRect(0, 0, size, size);
    for (let row = 0; row < 8; row++) {
      const y = row * 16;
      const offset = (row % 2) * 16;
      for (let col = -1; col < 5; col++) {
        const x = col * 32 + offset;
        const v = 176 + Math.floor(rnd() * 42);
        c.fillStyle = `rgb(${v},${Math.floor(v * 0.96)},${Math.floor(v * 0.87)})`;
        c.fillRect(x + 1, y + 1, 30, 14);
      }
    }
  } else if (kind === 'tile') {
    c.fillStyle = '#5c3529';
    c.fillRect(0, 0, size, size);
    for (let row = 0; row < 10; row++) {
      for (let col = 0; col < 6; col++) {
        const v = 120 + Math.floor(rnd() * 45);
        c.fillStyle = `rgb(${v},${Math.floor(v * 0.63)},${Math.floor(v * 0.48)})`;
        c.fillRect(col * 22 + ((row % 2) * 11) + 1, row * 13 + 1, 20, 11);
      }
    }
  } else if (kind === 'wood') {
    c.fillStyle = '#5d422b';
    c.fillRect(0, 0, size, size);
    for (let i = 0; i < 8; i++) {
      const v = 105 + Math.floor(rnd() * 45);
      c.fillStyle = `rgb(${v},${Math.floor(v * 0.72)},${Math.floor(v * 0.49)})`;
      c.fillRect(i * 16 + 1, 0, 14, size);
      c.strokeStyle = 'rgba(35,22,12,0.35)';
      c.lineWidth = 1;
      for (let g = 0; g < 4; g++) {
        const gx = i * 16 + 3 + rnd() * 10;
        c.beginPath();
        c.moveTo(gx, 0);
        c.bezierCurveTo(gx + 3, 42, gx - 3, 86, gx + 1, size);
        c.stroke();
      }
    }
  } else if (kind === 'metal') {
    c.fillStyle = '#838b93';
    c.fillRect(0, 0, size, size);
    for (let i = 0; i < 220; i++) {
      const v = 110 + Math.floor(rnd() * 90);
      c.fillStyle = `rgba(${v},${v},${v},0.3)`;
      c.fillRect(0, rnd() * size, size, 1);
    }
    c.fillStyle = 'rgba(30,35,40,0.35)';
    for (const x of [8, 64, 120]) c.fillRect(x, 0, 2, size);
  } else {
    // Detalle de terreno / hormigón: gris neutro que multiplica el vertex color.
    c.fillStyle = '#e6e6e6';
    c.fillRect(0, 0, size, size);
    for (let i = 0; i < 2600; i++) {
      const v = 190 + Math.floor(rnd() * 66);
      c.fillStyle = `rgba(${v},${v},${v},0.55)`;
      c.fillRect(rnd() * size, rnd() * size, 1 + rnd() * 3, 1 + rnd() * 3);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = anisotropy;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Texturas de calzada generadas por código (tierra, adoquines y tablones). */
function makeRoadTexture(kind, seed, anisotropy = 4) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const c = canvas.getContext('2d');
  const rnd = makeRandom(seed >>> 0);

  if (kind === 'cobble') {
    c.fillStyle = '#484742';
    c.fillRect(0, 0, canvas.width, canvas.height);
    for (let row = 0; row < 14; row++) {
      for (let col = -1; col < 6; col++) {
        const x = col * 24 + (row % 2) * 12 + 1;
        const y = row * 19 + 1;
        const v = 126 + Math.floor(rnd() * 48);
        c.fillStyle = `rgb(${v},${v - 4},${v - 12})`;
        c.beginPath();
        c.roundRect(x, y, 21, 16, 5);
        c.fill();
      }
    }
  } else if (kind === 'plank') {
    c.fillStyle = '#4a3422';
    c.fillRect(0, 0, canvas.width, canvas.height);
    for (let row = 0; row < 8; row++) {
      const v = 112 + Math.floor(rnd() * 42);
      c.fillStyle = `rgb(${v},${Math.floor(v * 0.7)},${Math.floor(v * 0.45)})`;
      c.fillRect(0, row * 32 + 2, canvas.width, 27);
      c.strokeStyle = 'rgba(28,18,10,0.55)';
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(0, row * 32 + 2);
      c.lineTo(canvas.width, row * 32 + 2);
      c.stroke();
      for (const x of [12, 112]) {
        c.fillStyle = 'rgba(35,32,28,0.65)';
        c.fillRect(x, row * 32 + 8, 3, 3);
      }
    }
  } else {
    c.fillStyle = '#7f7054';
    c.fillRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < 4200; i++) {
      const v = 90 + Math.floor(rnd() * 110);
      c.fillStyle = `rgba(${v},${Math.floor(v * 0.92)},${Math.floor(v * 0.74)},0.42)`;
      c.fillRect(rnd() * canvas.width, rnd() * canvas.height, 1 + rnd() * 3, 1 + rnd() * 2);
    }
    // Rodadas de carretilla que hacen legible el sentido del camino.
    for (const x of [28, 100]) {
      c.fillStyle = 'rgba(63,52,37,0.38)';
      c.fillRect(x - 7, 0, 14, canvas.height);
      c.fillStyle = 'rgba(176,157,119,0.20)';
      c.fillRect(x - 2, 0, 4, canvas.height);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = anisotropy;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function paintGeometry(geo, color) {
  // mergeGeometries exige que todas las piezas sean todas indexadas o ninguna.
  if (geo.index) geo = geo.toNonIndexed();
  const col = new THREE.Color(color);
  const count = geo.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = col.r;
    colors[i * 3 + 1] = col.g;
    colors[i * 3 + 2] = col.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

/** Árboles completos (tronco + copa en varias capas) en una sola geometría. */
function makeTreeGeometry(style, trunkColor, leafColor, leafColor2) {
  const parts = [];
  const trunk = paintGeometry(new THREE.CylinderGeometry(0.13, 0.25, 2.4, 7).translate(0, 1.2, 0), trunkColor);
  parts.push(trunk);

  if (style === 'pine') {
    for (let i = 0; i < 3; i++) {
      const r = 1.85 - i * 0.42;
      const h = 2.35 - i * 0.2;
      parts.push(paintGeometry(
        new THREE.ConeGeometry(r, h, 9).translate(0, 2.55 + i * 1.18, 0),
        i % 2 ? leafColor : leafColor2,
      ));
    }
    // Ramas inferiores visibles.
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const branch = new THREE.ConeGeometry(0.24, 1.5, 5);
      branch.rotateZ(Math.PI / 2 - 0.35);
      branch.rotateY(a);
      branch.translate(Math.cos(a) * 0.75, 2.45, Math.sin(a) * 0.75);
      parts.push(paintGeometry(branch, leafColor2));
    }
  } else if (style === 'palm') {
    // Tronco ligeramente curvado por segmentos.
    let px = 0, py = 0, pz = 0;
    for (let i = 0; i < 6; i++) {
      const seg = new THREE.CylinderGeometry(0.11 - i * 0.008, 0.15 - i * 0.008, 0.85, 7);
      seg.translate(px, 0.42, pz);
      parts.push(paintGeometry(seg, i % 2 ? trunkColor : 0x8a6240));
      py += 0.83;
      px += 0.055;
      pz += 0.02;
    }
    const topX = px, topY = py;
    parts.push(paintGeometry(new THREE.IcosahedronGeometry(0.36, 0).translate(topX, topY, pz), 0x6b8f43));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const frond = new THREE.ConeGeometry(0.3, 3.1, 5);
      frond.rotateZ(Math.PI / 2 + 0.28);
      frond.rotateY(a);
      frond.translate(topX + Math.cos(a) * 1.45, topY - 0.42, pz + Math.sin(a) * 1.45);
      parts.push(paintGeometry(frond, i % 2 ? leafColor : leafColor2));
    }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      const nut = new THREE.IcosahedronGeometry(0.14, 0);
      nut.translate(topX + Math.cos(a) * 0.26, topY - 0.25, pz + Math.sin(a) * 0.26);
      parts.push(paintGeometry(nut, 0x7b5a33));
    }
  } else {
    // Copa redonda de varios volúmenes.
    const blobs = [
      [0, 3.45, 0, 1.55], [-0.95, 3.05, 0.25, 1.15], [0.9, 3.15, -0.3, 1.2],
      [0.1, 4.45, -0.35, 1.1], [-0.25, 3.5, 0.95, 1.0],
    ];
    blobs.forEach(([x, y, z, r], i) => {
      parts.push(paintGeometry(new THREE.IcosahedronGeometry(r, 1).translate(x, y, z), i % 2 ? leafColor : leafColor2));
    });
  }
  return mergeGeometries(parts, false);
}

export class World {
  constructor(scene, map, settings) {
    this.scene = scene;
    this.map = map;
    this.settings = settings;
    this.seed = (map.seed || 1) >>> 0;
    this.size = map.size || 360;
    this.half = this.size / 2;
    this.theme = THEMES[map.theme] || THEMES.temperate;
    this.subBiomeColor = new THREE.Color(SUBBIOME[map.theme] || SUBBIOME.temperate);
    this.chunks = new Map();
    this.chunkQueue = new Map();
    this.colliders = [];
    this.colliderGrid = new Map();
    /** Debug overlay: colores de colisionadores/ejes (activado con F5). */
    this.debug = null;
    this.lootSpots = [];
    this.spawnPoints = [];
    this.pois = [];
    this.jumpPads = [];
    this.roadSegments = [];
    this.roadCircles = [];
    this.disposables = [];
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.structures = new THREE.Group();
    this.root.add(this.structures);

    this.textures = [];
    this.materials = {};
    this.sharedGeo = {};
    this.loaded = false;
    this.model = null;
    this.file = map.file || `${map.id}.glb`;
    this.scale = Number(map.scale) || 1;

    // San Borondon es un mapa procedural pequeño; el antiguo mapa GLB sigue
    // soportado por si queda instalado en algún equipo.
    this.procedural = map.type !== 'glb';
    this.gridSize = map.gridSize || 4;
    this.gridSnap = map.gridSnap !== false;
    this.useKitAssets = this.procedural && map.useKitAssets !== false;
    this.kitBase = map.modelBase || './models/quaternius/glTF/';
    this.propBase = map.propBase || './models/quaternius/props/glTF/';
    this.kitModels = {};
    this.propModels = {};
    this.propRequests = [];
    // Kit modular de construcción (paredes/suelos/techos/escaleras) y piezas sandbox.
    this.buildKitBase = map.buildKitBase || KIT_BASE_PATH;
    this.buildKitModels = {};
    this.buildKitReady = null;

    if (this.procedural) {
      this.waterLevel = map.waterLevel ?? 0;
      this.biome = map.biome || {};
      this.mountainHeight = this.biome.mountainHeight ?? 26;
      this.chunkSegments = 40;
      this.poiFlatHeights = new Map();
      for (const poi of map.pois || []) {
        this.poiFlatHeights.set(poi.name, Math.max(this.rawHeightAt(poi.x, poi.z), this.waterLevel + 2.4));
      }
      this.pois = (map.pois || []).map((poi) => ({ ...poi }));
      this.materials = this.createMaterials();
      this.disposables.push(...Object.values(this.materials), ...this.textures);
    } else {
      this.waterLevel = -100;
      this.biome = {};
    }

    this.setupSky();
    this.setupLights();
    this.setupClouds();
  }

  async load() {
    if (this.procedural) return this.loadIsland();
    return this.loadGlb();
  }

  /** Isla pequeña hecha con terreno propio y objetos del Stylized Nature MegaKit. */
  async loadIsland() {
    const customPieces = await this.fetchCustomPieces();
    if (customPieces && customPieces.length) {
      // Mapa limpio del editor: terreno + agua + piezas personalizadas + naturaleza zonificada.
      this.setupWater();
      const range = Math.ceil(this.half / CHUNK_SIZE) + 1;
      for (let cx = -range; cx <= range; cx++) {
        for (let cz = -range; cz <= range; cz++) this.createChunk(cx, cz);
      }
      if (this.useKitAssets) {
        await Promise.all([this.loadKitModels(), this.loadBuildKit()]);
        // Colocar primero piezas (crea colisionadores) y luego naturaleza para evitar solapes.
        this.placeCustomPieces(customPieces);
        this.placeNatureZones();
        this.placePropObjects();
      } else {
        await this.loadBuildKit();
        this.placeCustomPieces(customPieces);
      }
    } else {
      this.generateRoads();
      this.generateSanBorondonLandmarks();
      this.setupWater();
      this.setupJumpPads();

      const range = Math.ceil(this.half / CHUNK_SIZE) + 1;
      for (let cx = -range; cx <= range; cx++) {
        for (let cz = -range; cz <= range; cz++) this.createChunk(cx, cz);
      }

      if (this.useKitAssets) {
        await Promise.all([this.loadKitModels(), this.loadBuildKit()]);
        this.placeNatureZones();
        this.placeForestCabins();
        this.placePropObjects();
      } else {
        await this.loadBuildKit();
      }
    }
    this.loaded = true;
  }

  async loadBuildKit(names = null) {
    if (this.buildKitReady) return this.buildKitReady;
    this.buildKitReady = (async () => {
      try {
        const models = await loadBuildingKit(this.buildKitBase, names);
        this.buildKitModels = { ...this.buildKitModels, ...models };
      } catch (e) {
        console.warn('No se pudo cargar el kit de construcción:', e);
      }
      return this.buildKitModels;
    })();
    return this.buildKitReady;
  }

  _cloneBuildKit(name, tint = null) {
    const t = this.buildKitModels?.[name];
    if (!t) return null;
    const c = cloneKitPiece(t);
    if (tint != null) tintKitPiece(c, tint);
    return c;
  }

  _placeKitPart(parent, kitName, lx, ly, lz, ry = 0, tint = null, collide = true, wx = null, wy = null, wz = null, wrot = 0) {
    const obj = this._cloneBuildKit(kitName, tint);
    if (!obj) return null;
    obj.position.set(lx, ly, lz);
    obj.rotation.y = ry;
    parent.add(obj);
    if (collide) {
      const bx = wx ?? lx, by = wy ?? ly, bz = wz ?? lz, br = wrot ?? ry;
      const c = kitPieceGameplayCollider(kitName, bx, by, bz, br);
      if (c) this.addCollider(c.minX, c.maxX, c.minY, c.maxY, c.minZ, c.maxZ);
    }
    return obj;
  }

  getNatureZone(x, z) {
    if (!this.procedural) return 'terrain';
    const y = this.heightAt(x, z);
    const coast = y - (this.waterLevel || 0);
    // Distancia normalizada a "costa" (donde el terreno está cerca del nivel del agua).
    const shore = coast < 3.2;
    const n = noise2(x * 0.018 + 40, z * 0.018 - 25, this.seed + 881);
    const n2 = noise2(x * 0.006 - 15, z * 0.006 + 60, this.seed + 177);
    if (shore) return 'beach';
    // Bosques en zonas interiores con patrón orgánico; evitar picos muy altos/rocosos.
    const interior = coast > 3.5 && coast < 18;
    const forestMask = n * 0.65 + n2 * 0.35;
    if (interior && forestMask > 0.46) return 'forest';
    // Pequeños claros y praderas en terreno general
    return forestMask > 0.62 ? 'forest' : 'terrain';
  }

  /** Coloca naturaleza Quaternius por zonas: bosque, terreno general y playa. */
  placeNatureZones() {
    const density = this.settings.get('vegetation') ?? 1;
    if (density <= 0) return;
    const shadows = !!this.settings.get('shadows');
    const dummy = new THREE.Object3D();
    const materials = new Set();
    const has = (name) => this.kitModels?.[name]?.length;
    const pick = (list) => list.filter(has);
    const rnd = makeRandom(this.seed ^ 0x51a7c);

    const zones = {
      beach: {
        tries: 1200, density: 0.55,
        models: [
          { names: pick(['Rock_Medium_1','Rock_Medium_2','Rock_Medium_3','Pebble_Round_1','Pebble_Square_1']), count: 90, scale: [0.5, 1.2], y: 0.05 },
          { names: pick(['Grass_Common_Short','Grass_Wispy_Tall']), count: 140, scale: [0.7, 1.2], y: 0 },
          { names: pick(['Bush_Common']), count: 24, scale: [0.6, 1.0], y: 0 },
        ],
      },
      forest: {
        tries: 2200, density: 1.0,
        models: [
          { names: pick(['CommonTree_1','CommonTree_2','CommonTree_3']), count: 170, scale: [0.85, 1.25], y: 0, shadow: true },
          { names: pick(['Pine_1','Pine_2','Pine_4']), count: 120, scale: [0.8, 1.2], y: 0, shadow: true },
          { names: pick(['Bush_Common','Bush_Common_Flowers']), count: 110, scale: [0.6, 1.1], y: 0 },
          { names: pick(['Grass_Common_Short','Grass_Wispy_Tall','Fern_1']), count: 260, scale: [0.6, 1.3], y: 0 },
          { names: pick(['Mushroom_Common','Clover_1','Flower_3_Group','Flower_4_Group']), count: 90, scale: [0.7, 1.2], y: 0 },
          { names: pick(['Rock_Medium_1','Rock_Medium_2','Rock_Medium_3','Pebble_Round_1']), count: 60, scale: [0.4, 0.9], y: 0.05 },
        ],
      },
      terrain: {
        tries: 1600, density: 0.5,
        models: [
          { names: pick(['CommonTree_1','CommonTree_2','Pine_1','Pine_2']), count: 60, scale: [0.8, 1.15], y: 0, shadow: true },
          { names: pick(['Bush_Common']), count: 70, scale: [0.6, 1.0], y: 0 },
          { names: pick(['Grass_Common_Short','Grass_Wispy_Tall','Fern_1']), count: 180, scale: [0.6, 1.2], y: 0 },
          { names: pick(['Rock_Medium_1','Rock_Medium_2','Rock_Medium_3']), count: 70, scale: [0.5, 1.1], y: 0.06 },
          { names: pick(['Flower_3_Group','Flower_4_Group','Clover_1']), count: 50, scale: [0.7, 1.1], y: 0 },
        ],
      },
    };

    // Precomputar posiciones candidatas por zona para distribuir bien.
    const buckets = { beach: [], forest: [], terrain: [] };
    const totalTries = Math.floor((zones.beach.tries + zones.forest.tries + zones.terrain.tries) * density);
    for (let i = 0; i < totalTries; i++) {
      const a = rnd() * Math.PI * 2;
      const r = this.half * (0.05 + Math.sqrt(rnd()) * 0.9);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (Math.abs(x) > this.half - 6 || Math.abs(z) > this.half - 6) continue;
      const y = this.heightAt(x, z);
      if (y < this.waterLevel + 0.4) continue;
      if (this.nearRoad(x, z, 2.5)) continue;
      const zone = this.getNatureZone(x, z);
      if (buckets[zone].length < zones[zone].tries) buckets[zone].push({ x, y, z });
    }

    const placeGroup = (zoneName, groupDef) => {
      const { names, count, scale, y: yOff = 0 } = groupDef;
      if (!names || !names.length) return;
      const pts = buckets[zoneName];
      if (!pts.length) return;
      const target = Math.max(0, Math.round(count * density * (zones[zoneName].density || 1)));
      if (!target) return;
      // repartir por modelos del grupo
      for (let m = 0; m < names.length; m++) {
        const name = names[m];
        const parts = this.kitModels[name];
        if (!parts?.length) continue;
        const share = Math.ceil(target / names.length);
        const meshes = parts.map(({ geometry, material }) => {
          const mesh = new THREE.InstancedMesh(geometry, material, share);
          mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
          mesh.frustumCulled = false;
          mesh.castShadow = shadows && groupDef.shadow !== false;
          mesh.receiveShadow = shadows;
          this.root.add(mesh);
          this.disposables.push(geometry);
          materials.add(material);
          return mesh;
        });
        let placed = 0;
        for (let i = 0; i < share; i++) {
          let ok = false; let px = 0, py = 0, pz = 0;
          for (let t = 0; t < 8 && !ok; t++) {
            const p = pts[(rnd() * pts.length) | 0];
            if (!p) continue;
            // evitar solape con colisionadores grandes (casas/cabañas)
            if (this.collidesAt(p.x, p.z, p.y, 1.2)) continue;
            px = p.x + (rnd() - 0.5) * 1.6; pz = p.z + (rnd() - 0.5) * 1.6;
            py = this.heightAt(px, pz);
            if (py < this.waterLevel + 0.3) continue;
            if (this.getNatureZone(px, pz) !== zoneName) continue;
            ok = true;
          }
          if (!ok) { dummy.position.set(0, -1000, 0); dummy.scale.setScalar(0.0001); }
          else {
            const s = scale[0] + rnd() * (scale[1] - scale[0]);
            dummy.position.set(px, py + yOff, pz);
            dummy.rotation.set(0, rnd() * Math.PI * 2, 0);
            dummy.scale.set(s, s * (0.9 + rnd() * 0.2), s);
            placed++;
          }
          dummy.updateMatrix();
          for (const mesh of meshes) mesh.setMatrixAt(i, dummy.matrix);
        }
        for (const mesh of meshes) mesh.instanceMatrix.needsUpdate = true;
        if (placed === 0) { /* zona sin espacio, ok */ }
      }
    };

    for (const z of ['beach', 'forest', 'terrain']) {
      for (const g of zones[z].models) placeGroup(z, g);
    }
    for (const mat of materials) {
      this.disposables.push(mat);
      if (mat.map) this.disposables.push(mat.map);
      if (mat.normalMap) this.disposables.push(mat.normalMap);
    }
  }

  /** Coloca cabañas de madera (piezas de kit) en zonas de bosque. */
  placeForestCabins() {
    if (!this.buildKitModels || !Object.keys(this.buildKitModels).length) return;
    const rnd = makeRandom(this.seed ^ 0xCAB1);
    const wanted = 6;
    let placed = 0;
    for (let tries = 0; tries < 400 && placed < wanted; tries++) {
      const a = rnd() * Math.PI * 2;
      const r = this.half * (0.18 + Math.sqrt(rnd()) * 0.55);
      const x = Math.round((Math.cos(a) * r) / KIT_MODULE) * KIT_MODULE;
      const z = Math.round((Math.sin(a) * r) / KIT_MODULE) * KIT_MODULE;
      if (Math.abs(x) > this.half - 12 || Math.abs(z) > this.half - 12) continue;
      if (this.getNatureZone(x, z) !== 'forest') continue;
      const y = this.heightAt(x, z);
      if (y < this.waterLevel + 2.5) continue;
      if (this.nearRoad(x, z, 5)) continue;
      if (this.nearPOI(x, z, 1.1)) continue;
      // comprobar terreno razonablemente plano en huella pequeña (4x4u)
      let flat = true;
      for (const [ox, oz] of [[-2,-2],[2,-2],[-2,2],[2,2],[0,0]]) {
        if (Math.abs(this.heightAt(x + ox, z + oz) - y) > 0.9) { flat = false; break; }
      }
      if (!flat) continue;
      if (this.collidesAt(x, z, y, 3.5)) continue;
      const rot = Math.round(rnd() * 4) * (Math.PI / 2);
      const g = new THREE.Group();
      g.position.set(x, y, z);
      g.rotation.y = rot;
      g.name = 'forest-cabin';
      this._buildKitCabin(g, x, y, z, rot, 1);
      this.root.add(g);
      placed++;
    }
  }

  /** Construye una cabaña de madera con piezas del kit (módulo 2u, planta 2.5u). */
  _buildKitCabin(parent, wx, wy, wz, rot, floors = 1) {
    const woodWall = 0xc2a06a;
    const woodDark = 0x8a6336;
    const roofColor = 0x7a4a2a;
    const cos = Math.cos(rot), sin = Math.sin(rot);
    const w2 = (lx, lz) => ({ x: wx + lx * cos + lz * sin, z: wz - lx * sin + lz * cos });
    const part = (kitName, lx, ly, lz, ry = 0, tint = null, collide = true) => {
      const wp = w2(lx, lz);
      return this._placeKitPart(parent, kitName, lx, ly, lz, ry, tint, collide, wp.x, wy + ly, wp.z, rot + ry);
    };
    // Huella 4x4u (2 módulos). Centro en (0,0) local.
    const offsets = [[-1,-1], [1,-1], [-1,1], [1,1]];
    // Suelo base
    for (const [ox, oz] of offsets) part('floor', ox, 0, oz, 0, woodDark, true);
    for (let f = 0; f < floors; f++) {
      const by = f * KIT_FLOOR_H + KIT_SLAB_H;
      // Paredes perímetro (cada lado 4u = 2 módulos)
      // Norte (z=-2, mirando +Z hacia dentro? paredes alineadas en borde): piezas de 2u a lo largo de X en z=-2
      part('wall_window_square', -1, by, -2, 0, woodWall, true);
      part('wall_window_square',  1, by, -2, 0, woodWall, true);
      // Sur (z=+2) con puerta en el centro
      part('wall', -1, by, 2, Math.PI, woodWall, true);
      part('wall_doorway_round', 1, by, 2, Math.PI, woodWall, true);
      // Oeste (x=-2) a lo largo de Z
      part('wall', -2, by, -1, Math.PI / 2, woodWall, true);
      part('wall_window_square', -2, by, 1, Math.PI / 2, woodWall, true);
      // Este (x=2)
      part('wall_window_square', 2, by, -1, -Math.PI / 2, woodWall, true);
      part('wall', 2, by, 1, -Math.PI / 2, woodWall, true);
      // Losa/techo de planta o tejado
      const topY = by + KIT_WALL_H;
      for (const [ox, oz] of offsets) part('roof_flat_center', ox, topY, oz, 0, f === floors - 1 ? roofColor : woodDark, true);
    }
    // base de apoyo pequeña para terreno irregular
    const base = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.3, 4.4), new THREE.MeshStandardMaterial({ color: 0x6b4c2a, roughness: 0.95 }));
    base.position.set(0, -0.15, 0);
    base.receiveShadow = true; base.castShadow = true;
    parent.add(base);
  }

  async fetchCustomPieces() {
    let data = null;
    for (const url of ['./maps/custom-map.json', '/maps/custom-map.json']) {
      try {
        const res = await fetch(url + '?t=' + Date.now());
        if (res.ok) { data = await res.json(); break; }
      } catch {}
    }
    if (!data) return null;
    const pieces = Array.isArray(data) ? data : data.pieces;
    return Array.isArray(pieces) && pieces.length ? pieces : null;
  }

  _cloneNatureModel(name) {
    const parts = this.kitModels?.[name];
    if (!parts?.length) return null;
    const g = new THREE.Group();
    for (const { geometry, material } of parts) {
      const m = new THREE.Mesh(geometry, material);
      m.castShadow = true; m.receiveShadow = true;
      g.add(m);
    }
    return g;
  }

  placeCustomPieces(pieces) {
    const group = new THREE.Group();
    group.name = 'custom-map-pieces';
    const rotAABB = (w, d, rot) => {
      const k = ((Math.round((rot || 0) / (Math.PI / 2)) % 4) + 4) % 4;
      return k % 2 ? { w: d, d: w } : { w, d };
    };
    const addBoxCollider = (x, yBase, z, w, h, d, rot) => {
      const r = rotAABB(w, d, rot);
      this.addCollider(x - r.w / 2, x + r.w / 2, yBase, yBase + h, z - r.d / 2, z + r.d / 2);
    };
    const addMesh = (parent, geo, mat, px, py, pz, rx=0, ry=0, rz=0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(px, py, pz);
      m.rotation.set(rx, ry, rz);
      m.castShadow = true; m.receiveShadow = true;
      parent.add(m);
      return m;
    };

    const cosS = (rot) => Math.cos(rot), sinS = (rot) => Math.sin(rot);

    for (const p of pieces) {
      if (!p || !p.type) continue;
      const x = +p.x || 0, z = +p.z || 0, rot = +p.rot || 0;
      const y = (p.y != null ? +p.y : this.heightAt(x, z)) || 0;
      const g = new THREE.Group();
      g.position.set(x, y, z);
      g.rotation.y = rot;
      const floors = Math.max(1, Math.min(3, Math.round(+p.floors || 1)));

      if (p.type === 'house') {
        this._buildCustomHouse(g, x, y, z, rot, floors);
      } else if (p.type === 'cabin') {
        this._buildKitCabin(g, x, y, z, rot, floors);
      } else if (p.type === 'wall' || p.type === 'wall_door' || p.type === 'wall_window' || p.type === 'floor' || p.type === 'roof' || p.type === 'stairs') {
        // Pieza individual de kit (alineada al módulo). Se coloca con su base en y.
        const kitName = BUILD_PIECES[p.type]?.kit || (p.type === 'wall' ? 'wall' : p.type === 'floor' ? 'floor' : p.type === 'roof' ? 'roof_flat_center' : p.type === 'stairs' ? 'stairs_closed' : 'wall');
        const obj = this._cloneBuildKit(kitName);
        if (obj) {
          g.add(obj);
          const c = kitPieceGameplayCollider(kitName, x, y, z, rot);
          if (c) this.addCollider(c.minX, c.maxX, c.minY, c.maxY, c.minZ, c.maxZ);
        } else {
          // fallback primitivo alineado a módulo 2u
          if (p.type === 'wall' || p.type === 'wall_door' || p.type === 'wall_window') {
            addMesh(g, new THREE.BoxGeometry(0.2, KIT_WALL_H, 2), new THREE.MeshStandardMaterial({ color: 0xc2b08a, roughness: 0.85 }), 0, KIT_WALL_H / 2, 0);
            addBoxCollider(x, y, z, 0.3, KIT_WALL_H, 2, rot);
          } else if (p.type === 'floor' || p.type === 'roof') {
            addMesh(g, new THREE.BoxGeometry(2, 0.1, 2), new THREE.MeshStandardMaterial({ color: 0x8a7a5e, roughness: 0.9 }), 0, 0.05, 0);
          } else if (p.type === 'stairs') {
            addMesh(g, new THREE.BoxGeometry(1.3, 2.5, 4), new THREE.MeshStandardMaterial({ color: 0x7b5738, roughness: 0.8 }), 0, 1.25, 0);
            addBoxCollider(x, y, z, 1.3, 2.5, 4, rot);
          }
        }
      } else if (p.type === 'tree') {
        const modelName = p.model || (['CommonTree_1','CommonTree_2','CommonTree_3','Pine_1','Pine_2'][Math.abs(((x*73856093)^(z*19349663))|0) % 5]);
        const tree = this._cloneNatureModel(modelName) || this._cloneNatureModel('CommonTree_1');
        if (tree) {
          const s = p.scale || 1;
          tree.scale.setScalar(s);
          g.add(tree);
        } else {
          addMesh(g, new THREE.CylinderGeometry(0.3, 0.4, 4, 8), new THREE.MeshStandardMaterial({ color: 0x7b5738 }), 0, 2, 0);
          addMesh(g, new THREE.SphereGeometry(2.5, 8, 8), new THREE.MeshStandardMaterial({ color: 0x2f6b3e, roughness: 0.9 }), 0, 5.5, 0);
        }
        addBoxCollider(x, y, z, 1.2, 5, 1.2, rot);
      } else if (p.type === 'rock') {
        const modelName = p.model || (['Rock_Medium_1','Rock_Medium_2','Rock_Medium_3'][Math.abs(((x*83492791)^(z*19349663))|0) % 3]);
        const rock = this._cloneNatureModel(modelName) || this._cloneNatureModel('Rock_Medium_1');
        if (rock) {
          const s = p.scale || 1;
          rock.scale.setScalar(s);
          g.add(rock);
        } else {
          addMesh(g, new THREE.DodecahedronGeometry(1.5), new THREE.MeshStandardMaterial({ color: 0x777b74, roughness: 0.95 }), 0, 0.8, 0);
        }
        addBoxCollider(x, y, z, 2.2, 1.6, 2.2, rot);
      } else if (p.type === 'road') {
        // Baldosa 4x4u (2x2 módulos) alineada a grid 2
        const roadMat = new THREE.MeshStandardMaterial({ color: 0x5a5a5a, roughness: 0.95 });
        addMesh(g, new THREE.BoxGeometry(4, 0.12, 4), roadMat, 0, 0.06, 0);
        // Registrar para que la naturaleza evite colocarse sobre caminos
        if (this.roadCircles) this.roadCircles.push({ x, z, radius: 1.9 });
      } else if (p.type === 'tower') {
        addMesh(g, new THREE.CylinderGeometry(2.6, 2.8, 2, 8), new THREE.MeshStandardMaterial({ color: 0xc2b08a, roughness: 0.85 }), 0, 1, 0);
        addMesh(g, new THREE.CylinderGeometry(2, 2.5, 12, 8), new THREE.MeshStandardMaterial({ color: 0xd4c4a8, roughness: 0.85 }), 0, 8, 0);
        addMesh(g, new THREE.CylinderGeometry(2.6, 2.6, 0.4, 8), new THREE.MeshStandardMaterial({ color: 0x8c4f3c, roughness: 0.8 }), 0, 14.2, 0);
        addBoxCollider(x, y, z, 5.6, 14.4, 5.6, rot);
      } else if (p.type === 'container') {
        addMesh(g, new THREE.BoxGeometry(6.2, 0.3, 2.6), new THREE.MeshStandardMaterial({ color: 0xc2b08a, roughness: 0.85 }), 0, 0.15, 0);
        addMesh(g, new THREE.BoxGeometry(6, 2.4, 2.4), new THREE.MeshStandardMaterial({ color: 0xe2843c, roughness: 0.6, metalness: 0.3 }), 0, 1.5, 0);
        addBoxCollider(x, y, z, 6.2, 2.8, 2.6, rot);
      } else {
        continue;
      }
      group.add(g);
    }
    if (group.children.length) this.root.add(group);
  }

  /** Casa modular compuesta con piezas del kit (módulo 2u, altura de planta 2.5u). Huella 8x6u. */
  _buildCustomHouse(g, wx, wy, wz, rot, floors) {
    const floorsN = Math.max(1, Math.min(3, Math.round(floors || 1)));
    const cos = Math.cos(rot), sin = Math.sin(rot);
    const w2 = (lx, lz) => ({ x: wx + lx * cos + lz * sin, z: wz - lx * sin + lz * cos });
    const part = (kitName, lx, ly, lz, ry = 0, tint = null, collide = true) => {
      const wp = w2(lx, lz);
      const obj = this._placeKitPart(g, kitName, lx, ly, lz, ry, tint, collide, wp.x, wy + ly, wp.z, rot + ry);
      return obj;
    };
    const wallTint = 0xd4c4a8;
    const wallTint2 = 0xc2b08a;
    const floorTint = 0x8a7a5e;
    const roofTint = 0x8c4f3c;

    // Cimiento/plataforma (losa simple para asentar en terreno irregular)
    const base = new THREE.Mesh(new THREE.BoxGeometry(8.4, 0.4, 6.4), new THREE.MeshStandardMaterial({ color: 0x9a8b70, roughness: 0.95 }));
    base.position.set(0, -0.2, 0);
    base.receiveShadow = true; base.castShadow = true;
    g.add(base);

    // Huella 8 (X: -3,-1,1,3) x 6 (Z: -2,0,2) módulos de 2u
    const xs = [-3, -1, 1, 3];
    const zs = [-2, 0, 2];

    // Suelo de planta baja
    for (const ox of xs) for (const oz of zs) part('floor', ox, 0, oz, 0, floorTint, true);

    for (let f = 0; f < floorsN; f++) {
      const by = f * KIT_FLOOR_H + KIT_SLAB_H; // base de muros sobre losa
      // Pared trasera (z = +3, borde norte, mirando hacia -Z dentro) - 4 módulos de 2u a lo largo de X
      part('wall_window_square', -3, by, 3, 0, wallTint, true);
      part('wall_window_square', -1, by, 3, 0, wallTint, true);
      part('wall_window_square',  1, by, 3, 0, wallTint, true);
      part('wall_window_square',  3, by, 3, 0, wallTint, true);
      // Pared frontal (z = -3, mirando hacia +Z dentro)
      if (f === 0) {
        part('wall_window_square', -3, by, -3, Math.PI, wallTint, true);
        part('wall_doorway_round', -1, by, -3, Math.PI, wallTint, true);
        part('wall',                1, by, -3, Math.PI, wallTint, true);
        part('wall_window_square',  3, by, -3, Math.PI, wallTint, true);
      } else {
        part('wall_window_square', -3, by, -3, Math.PI, wallTint, true);
        part('wall_window_square', -1, by, -3, Math.PI, wallTint, true);
        part('wall_window_square',  1, by, -3, Math.PI, wallTint, true);
        part('wall_window_square',  3, by, -3, Math.PI, wallTint, true);
      }
      // Lados (x = -4 y +4) a lo largo de Z, 3 módulos
      part('wall_window_square', -4, by, -2, Math.PI / 2, wallTint2, true);
      part('wall',               -4, by,  0, Math.PI / 2, wallTint2, true);
      part('wall_window_square', -4, by,  2, Math.PI / 2, wallTint2, true);
      part('wall_window_square',  4, by, -2, -Math.PI / 2, wallTint2, true);
      part('wall',                4, by,  0, -Math.PI / 2, wallTint2, true);
      part('wall_window_square',  4, by,  2, -Math.PI / 2, wallTint2, true);

      const topY = by + KIT_WALL_H;
      // Techo/losa superior de planta
      if (f < floorsN - 1) {
        for (const ox of xs) for (const oz of zs) part('floor', ox, topY, oz, 0, floorTint, true);
      } else {
        for (const ox of xs) for (const oz of zs) part('roof_flat_center', ox, topY, oz, 0, roofTint, true);
      }
    }

    // Escaleras interiores para plantas superiores (kit stairs: 4u fondo, 2.5 alto) colocadas a un lado
    if (floorsN >= 2) {
      const stairX = 3; // junto al lateral este
      for (let f = 0; f < floorsN - 1; f++) {
        const sy = f * KIT_FLOOR_H + KIT_SLAB_H;
        // Escalera sube en dirección -Z a +Z (profundidad 4u cubre z=-2..2)
        part('stairs_closed', stairX, sy, 0, 0, 0x7b5738, true);
        // Relleno de hueco de escalera en losa superior (losas restantes ya puestas; stair ocupa parte central)
      }
    }
  }

  async loadKitModels() {
    const loader = new GLTFLoader();
    const loadParts = async (url) => {
      try {
        const gltf = await loader.loadAsync(url);
        gltf.scene.updateMatrixWorld(true);
        const parts = [];
        gltf.scene.traverse((o) => {
          if (!o.isMesh) return;
          const geometry = o.geometry.clone();
          geometry.applyMatrix4(o.matrixWorld);
          parts.push({ geometry, material: o.material });
        });
        return parts;
      } catch (error) {
        console.warn(`No se pudo cargar el modelo ${url}:`, error);
        return [];
      }
    };
    const names = [...new Set(KIT_VARIANTS.map((v) => v.model))];
    await Promise.all(names.map(async (name) => {
      this.kitModels[name] = await loadParts(`${this.kitBase}${name}.gltf`);
    }));
    if (this.propRequests.length) {
      await Promise.all(PROP_NAMES.map(async (name) => {
        this.propModels[name] = await loadParts(`${this.propBase}${name}.gltf`);
      }));
    }
  }

  /** Coloca los props CC0 en los puntos exactos pedidos por los landmarks. */
  placePropObjects() {
    const shadows = !!this.settings.get('shadows');
    const dummy = new THREE.Object3D();
    const byModel = new Map();
    for (const request of this.propRequests) {
      if (!byModel.has(request.model)) byModel.set(request.model, []);
      byModel.get(request.model).push(request);
    }
    for (const [name, requests] of byModel) {
      const parts = this.propModels[name];
      if (!parts?.length) continue;
      const materials = new Set();
      for (const { geometry, material } of parts) {
        const mesh = new THREE.InstancedMesh(geometry, material, requests.length);
        mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
        mesh.frustumCulled = false;
        mesh.castShadow = shadows;
        mesh.receiveShadow = shadows;
        requests.forEach((r, i) => {
          dummy.position.set(r.x, r.y ?? this.heightAt(r.x, r.z), r.z);
          dummy.rotation.set(0, r.rot ?? 0, 0);
          dummy.scale.setScalar(r.scale ?? 1);
          dummy.updateMatrix();
          mesh.setMatrixAt(i, dummy.matrix);
        });
        mesh.instanceMatrix.needsUpdate = true;
        this.root.add(mesh);
        this.disposables.push(geometry);
        materials.add(material);
      }
      for (const mat of materials) {
        this.disposables.push(mat);
        if (mat.map) this.disposables.push(mat.map);
        if (mat.normalMap) this.disposables.push(mat.normalMap);
      }
    }
  }

  placeKitObjects() {
    const density = this.settings.get('vegetation') ?? 1;
    const shadows = !!this.settings.get('shadows');
    const dummy = new THREE.Object3D();
    const materials = new Set();

    for (const variant of KIT_VARIANTS) {
      const parts = this.kitModels[variant.model];
      if (!parts?.length) continue;
      const count = Math.max(0, Math.round(variant.count * density));
      if (!count) continue;

      const meshes = parts.map(({ geometry, material }) => {
        const mesh = new THREE.InstancedMesh(geometry, material, count);
        mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
        mesh.frustumCulled = false;
        mesh.castShadow = shadows && variant.shadow !== false;
        mesh.receiveShadow = shadows && variant.shadow !== false;
        this.root.add(mesh);
        this.disposables.push(geometry);
        materials.add(material);
        return mesh;
      });

      const rnd = makeRandom(this.seed ^ hashString(variant.model));
      const minR = this.half * (variant.minRadius ?? 0.05);
      const maxR = this.half * (variant.maxRadius ?? 0.7);
      let placed = 0;
      for (let i = 0; i < count; i++) {
        let x = 0;
        let z = 0;
        let y = 0;
        let ok = false;
        for (let tries = 0; tries < 10 && !ok; tries++) {
          const a = rnd() * Math.PI * 2;
          const r = minR + Math.sqrt(rnd()) * (maxR - minR);
          x = Math.cos(a) * r;
          z = Math.sin(a) * r;
          y = this.heightAt(x, z);
          if (y < this.waterLevel + (variant.waterMargin ?? 1.2)) continue;
          if (!variant.allowPoi && this.nearPOI(x, z, variant.poiFactor ?? 1)) continue;
          if (this.nearRoad(x, z, (variant.clearance ?? 1.4) + 0.6)) continue;
          if (this.collidesAt(x, z, y, variant.clearance ?? 1.4)) continue;
          ok = true;
        }
        if (!ok) {
          dummy.position.set(0, -1000, 0);
          dummy.scale.setScalar(0.0001);
        } else {
          const s = variant.scale * (0.82 + rnd() * 0.36);
          dummy.position.set(x, y + (variant.yOffset ?? 0), z);
          dummy.rotation.set(0, rnd() * Math.PI * 2, 0);
          dummy.scale.set(s, s * (variant.flat ? 0.75 : 1), s);
          placed++;
        }
        dummy.updateMatrix();
        for (const mesh of meshes) mesh.setMatrixAt(i, dummy.matrix);
      }
      for (const mesh of meshes) mesh.instanceMatrix.needsUpdate = true;
      if (placed === 0) console.warn(`El kit ${variant.model} no encontró ubicaciones válidas.`);
    }
    for (const mat of materials) {
      this.disposables.push(mat);
      if (mat.map) this.disposables.push(mat.map);
      if (mat.normalMap) this.disposables.push(mat.normalMap);
    }
  }

  collidesAt(x, z, y, radius = 1) {
    for (const c of this.collidersNear(x, z, radius + 2)) {
      if (c.maxY < y + 0.5) continue;
      if (x + radius > c.minX && x - radius < c.maxX && z + radius > c.minZ && z - radius < c.maxZ) return true;
    }
    return false;
  }

  /** Carga del mapa GLB heredado (se mantiene por compatibilidad). */
  async loadGlb() {
    const bundledUrl = `./maps/${this.file}`;
    const installedUrl = `./installed-maps/${this.file}`;
    const tryFetch = async (url, installed = false) => {
      try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const type = res.headers.get('content-type') || '';
        // El servidor devuelve index.html para archivos ausentes.
        if (installed && !/gltf-binary|octet-stream/.test(type)) return null;
        return res;
      } catch { return null; }
    };
    const res = (await tryFetch(installedUrl, true)) || (await tryFetch(bundledUrl));
    if (!res) throw new Error(`No se pudo descargar el mapa ${this.file}`);

    const buffer = await res.arrayBuffer();
    const loader = new GLTFLoader();
    const gltf = await loader.parseAsync(buffer, '');
    const model = gltf.scene;
    model.name = 'map-model';
    model.scale.setScalar(this.scale);
    model.updateMatrixWorld(true);

    // Algunos GLB tienen accessors con cotas centinela; se ignoran cajas gigantes.
    const box = new THREE.Box3();
    const tmp = new THREE.Box3();
    const tmpSize = new THREE.Vector3();
    const validBox = (b) => {
      b.getSize(tmpSize);
      return tmpSize.x < 1000 && tmpSize.y < 1000 && tmpSize.z < 1000;
    };
    model.traverse((o) => {
      if (!o.isMesh) return;
      tmp.setFromObject(o);
      if (validBox(tmp)) box.union(tmp);
    });
    if (box.isEmpty()) throw new Error('El GLB no contiene geometría válida');

    const center = box.getCenter(new THREE.Vector3());
    model.position.set(-center.x, -box.min.y, -center.z);
    model.updateMatrixWorld(true);
    this.structures.add(model);
    this.model = model;

    const size = box.getSize(new THREE.Vector3());
    this.size = Math.max(240, Math.ceil(Math.max(size.x, size.z) * 1.05));
    this.half = this.size / 2;

    model.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      const b = new THREE.Box3().setFromObject(o);
      if (!validBox(b)) return;
      const s = b.getSize(new THREE.Vector3());
      // Losas finas y grandes son el suelo: no bloquean al jugador.
      if (s.y < 1.2 && s.x * s.z > 60) return;
      if (s.x < 0.25 && s.z < 0.25) return;
      this.addCollider(b.min.x - 0.1, b.max.x + 0.1, b.min.y, b.max.y + 0.1, b.min.z - 0.1, b.max.z + 0.1);
    });

    const spots = [];
    const loot = [];
    const p = new THREE.Vector3();
    model.traverse((o) => {
      if (!o.name) return;
      const n = o.name.toLowerCase();
      o.getWorldPosition(p);
      if (Math.abs(p.x) > this.half || Math.abs(p.z) > this.half) return;
      const pos = { x: p.x, y: 0, z: p.z };
      if (/loot|crate|supply|operator|vehicle/.test(n)) {
        spots.push(pos);
        loot.push(pos);
      } else if (/pavement|runway|hangar|tower|shop/.test(n)) {
        spots.push(pos);
      }
    });
    const dedupe = (arr) => {
      const seen = new Set();
      return arr.filter((v) => {
        const key = `${Math.round(v.x / 8)},${Math.round(v.z / 8)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    };
    this.spawnPoints = dedupe(spots);
    this.lootSpots = dedupe(loot);
    if (this.spawnPoints.length < 4) this.spawnPoints = this.makeFallbackSpots();
    if (this.lootSpots.length < 4) this.lootSpots = this.spawnPoints.slice();

    this.pois = [
      this.poiFromNode(model, /control-tower/, 'Torre de control', 55),
      this.poiFromNode(model, /hangar/, 'Hangar', 60),
      this.poiFromNode(model, /shop-bay-awning/, 'Zona comercial', 65),
      this.poiFromNode(model, /supply-drop/, 'Suministro', 45),
    ].filter(Boolean);

    this.loaded = true;
  }

  poiFromNode(model, pattern, name, radius) {
    let found = null;
    model.traverse((o) => {
      if (!found && pattern.test(o.name || '')) found = o;
    });
    if (!found) return null;
    const p = new THREE.Vector3();
    found.getWorldPosition(p);
    return { name, x: p.x, z: p.z, radius, type: 'landmark' };
  }

  makeFallbackSpots() {
    const out = [];
    const r = this.half * 0.55;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      out.push({ x: Math.cos(a) * r, y: 0, z: Math.sin(a) * r });
    }
    return out;
  }

  createMaterials() {
    const t = this.theme;
    const aniso = this.settings.get('anisotropy') || 4;
    const tex = (kind, seed, repeat) => {
      const texture = makeSurfaceTexture(kind, this.seed + seed, repeat, aniso);
      this.textures.push(texture);
      return texture;
    };
    const brickTex = tex('brick', 11, 3);
    const tileTex = tex('tile', 23, 3);
    const woodTex = tex('wood', 37, 2);
    const metalTex = tex('metal', 53, 3);
    const concreteTex = tex('concrete', 67, 3);
    const groundTex = tex('concrete', 83, 7);
    const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.88, metalness: 0.03, ...extra });
    return {
      wall: std(t.wall, { map: brickTex }), wall2: std(t.wall2, { map: brickTex }),
      roof: std(t.roof, { map: tileTex }), wood: std(t.wood, { map: woodTex }),
      metal: std(t.metal, { map: metalTex, metalness: 0.55, roughness: 0.45 }),
      glass: std(t.glass, { metalness: 0.3, roughness: 0.15, transparent: true, opacity: 0.72 }),
      concrete: std(t.concrete, { map: concreteTex }),
      accent: std(t.accent, { map: metalTex, roughness: 0.6 }),
      dark: std(t.dark), road: std(0x3c4045, { roughness: 0.96 }),
      terrain: new THREE.MeshStandardMaterial({ vertexColors: true, map: groundTex, roughness: 0.98, metalness: 0 }),
      tree: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, flatShading: true }),
      rock: std(t.rock, { flatShading: true }),
      bush: std(t.tree2, { flatShading: true }),
      // Detalle de los nuevos POI: tierras de cultivo, hierba alta y piedra funeraria.
      soil: std(0x5b412c, { map: groundTex, roughness: 1 }),
      crop: std(0x7f9c46, { roughness: 0.95 }),
      grave: std(0x9a9b95, { map: concreteTex, roughness: 0.92 }),
    };
  }

  setupSky() {
    this.sky = new Sky();
    this.sky.scale.setScalar(450000);
    const u = this.sky.material.uniforms;
    u.turbidity.value = 2.4;
    u.rayleigh.value = 3.4;
    u.mieCoefficient.value = 0.0036;
    u.mieDirectionalG.value = 0.8;
    // Sol elevado y cálido: cielo abierto, sombras fáciles de ver.
    const phi = THREE.MathUtils.degToRad(50);
    const theta = THREE.MathUtils.degToRad(130);
    this.sunDirection = new THREE.Vector3().setFromSphericalCoords(1, phi, theta);
    u.sunPosition.value.copy(this.sunDirection);
    this.root.add(this.sky);
    this.scene.fog = new THREE.Fog(this.theme.sky, 650, 2600);
    this.scene.background = new THREE.Color(this.theme.sky);
  }

  updateSkyForPosition(pos) {
    this.sky.position.set(pos.x, 0, pos.z);
  }

  setupLights() {
    this.hemi = new THREE.HemisphereLight(this.theme.sky, this.theme.grass, 1.15 * this.theme.sun);
    this.root.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffe2b0, 3.0 * this.theme.sun);
    this.sun.position.copy(this.sunDirection).multiplyScalar(500);
    this.sun.target.position.set(0, 0, 0);
    this.root.add(this.sun, this.sun.target);
    const size = this.settings.get('shadows') ? this.settings.get('shadowMapSize') : 1024;
    this.sun.shadow.mapSize.set(size, size);
    this.sun.shadow.camera.near = 0.5;
    this.sun.shadow.camera.far = 800;
    const s = 330;
    Object.assign(this.sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s });
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.02;
    this.sun.castShadow = !!this.settings.get('shadows');
    this.fill = new THREE.DirectionalLight(0xb8d4ff, 0.42);
    this.fill.position.set(-200, 300, -100);
    this.root.add(this.fill);
  }

  updateLightForPosition(pos) {
    this.sun.position.set(pos.x + this.sunDirection.x * 500, this.sunDirection.y * 500 + 300, pos.z + this.sunDirection.z * 500);
    this.sun.target.position.set(pos.x, 0, pos.z);
    this.sun.target.updateMatrixWorld();
  }

  setupWater() {
    if (this.waterLevel < -20) return;
    const quality = this.settings.get('waterQuality') ?? 1;
    const segments = quality === 0 ? 32 : quality === 1 ? 72 : 128;
    const geo = new THREE.PlaneGeometry(this.size + 800, this.size + 800, segments, segments);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(this.theme.water) },
        uSun: { value: new THREE.Color(0xfff2dd) },
        uSunDir: { value: this.sunDirection.clone() },
        uOpacity: { value: quality === 0 ? 0.6 : 0.68 },
        uQuality: { value: quality },
      },
      vertexShader: `
        varying vec3 vWorld;
        varying vec3 vNormalW;
        uniform float uTime;
        void main() {
          vec3 p = position;
          float a = p.x * 0.045 + uTime * 1.1;
          float b = p.z * 0.061 - uTime * 0.9;
          float c = (p.x + p.z) * 0.028 + uTime * 0.7;
          float d = (p.x - p.z) * 0.11 - uTime * 1.7;
          p.y += sin(a) * 0.20 + sin(b) * 0.16 + sin(c) * 0.22 + sin(d) * 0.07;
          float dx = cos(a) * 0.009 + cos(c) * 0.00616 + cos(d) * 0.0077;
          float dz = cos(b) * 0.00976 + cos(c) * 0.00616 - cos(d) * 0.0077;
          vNormalW = normalize(vec3(-dx, 1.0, -dz));
          vec4 wp = modelMatrix * vec4(p, 1.0);
          vWorld = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: `
        varying vec3 vWorld;
        varying vec3 vNormalW;
        uniform vec3 uColor;
        uniform vec3 uSun;
        uniform vec3 uSunDir;
        uniform float uTime;
        uniform float uOpacity;
        uniform float uQuality;
        void main() {
          vec3 view = normalize(cameraPosition - vWorld);
          vec3 sun = normalize(uSunDir);
          vec3 n = normalize(vNormalW);
          float r1 = sin(vWorld.x * 0.42 + uTime * 2.3) * cos(vWorld.z * 0.37 - uTime * 1.8);
          float r2 = sin((vWorld.x - vWorld.z) * 0.31 - uTime * 2.6);
          n = normalize(n + vec3(r1 * 0.09, 0.0, r2 * 0.09) * (0.35 + uQuality * 0.35));
          float fres = pow(1.0 - max(dot(view, n), 0.0), 3.0);
          float diff = max(dot(n, sun), 0.0);
          vec3 halfDir = normalize(sun + view);
          float spec = pow(max(dot(n, halfDir), 0.0), 90.0);
          float bands = sin(vWorld.x * 0.09 + uTime * 1.4) * sin(vWorld.z * 0.08 - uTime * 1.1) * 0.5 + 0.5;
          vec3 col = mix(uColor * 0.48, uColor * 1.24, clamp(bands * 0.45 + diff * 0.34 + fres * 0.35, 0.0, 1.0));
          col += uSun * spec * 0.9;
          col += uSun * pow(max(r1 * r2, 0.0), 18.0) * 0.12;
          float alpha = clamp(uOpacity + fres * 0.22 - diff * 0.06, 0.34, 0.94);
          gl_FragColor = vec4(col, alpha);
        }`,
    });
    this.water = new THREE.Mesh(geo, mat);
    this.water.position.y = this.waterLevel;
    this.water.renderOrder = 2;
    this.root.add(this.water);
    this.disposables.push(geo, mat);
  }

  setupClouds() {
    if (this.settings.get('effects') < 0.2) return;
    const geo = new THREE.IcosahedronGeometry(1, 1);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff, transparent: true, opacity: 0.42, roughness: 1,
      depthWrite: false, flatShading: true,
    });
    const count = 90;
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    const rnd = makeRandom(this.seed + 777);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const x = (rnd() - 0.5) * this.size * 1.2;
      const z = (rnd() - 0.5) * this.size * 1.2;
      dummy.position.set(x, 420 + rnd() * 180, z);
      dummy.scale.set(40 + rnd() * 75, 9 + rnd() * 14, 26 + rnd() * 50);
      dummy.rotation.y = rnd() * Math.PI;
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    this.clouds = mesh;
    this.root.add(mesh);
    this.disposables.push(geo, mat);
  }

  /** Bombas de fuerza: plataformas que lanzan al jugador muy alto. */
  setupJumpPads() {
    const rnd = makeRandom(this.seed + 9182);
    const pads = [];
    const addPad = (x, z) => {
      const y = this.heightAt(x, z);
      if (y < this.waterLevel + 2) return;
      pads.push({ x, y, z, radius: 3.6, power: 22 + rnd() * 4 });
    };
    for (const poi of this.map.pois || []) {
      const count = (poi.type === 'town' || poi.type === 'harbor') ? 2 : 1;
      for (let i = 0; i < count; i++) {
        const a = rnd() * Math.PI * 2;
        const r = poi.radius * (0.5 + rnd() * 0.35);
        addPad(poi.x + Math.cos(a) * r, poi.z + Math.sin(a) * r);
      }
    }
    const scattered = this.procedural ? 6 : 14;
    for (let i = 0; i < scattered; i++) {
      const a = rnd() * Math.PI * 2;
      const r = this.half * (0.15 + rnd() * 0.55);
      addPad(Math.cos(a) * r, Math.sin(a) * r);
    }
    this.jumpPads = pads;
    this.padPulse = 0;
    if (!pads.length) return;

    const baseGeo = new THREE.CylinderGeometry(3.35, 3.6, 0.26, 24).translate(0, 0.13, 0);
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x1c4657, emissive: 0x12b8d8, emissiveIntensity: 1.4, metalness: 0.6, roughness: 0.3,
    });
    const base = new THREE.InstancedMesh(baseGeo, baseMat, pads.length);
    const ringGeo = new THREE.TorusGeometry(2.5, 0.12, 8, 32).rotateX(Math.PI / 2).translate(0, 0.55, 0);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x7ff6ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const ring = new THREE.InstancedMesh(ringGeo, ringMat, pads.length);
    const beamGeo = new THREE.CylinderGeometry(0.15, 1.5, 6, 12, 1, true).translate(0, 3.1, 0);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0x35d8ff, transparent: true, opacity: 0.13, blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide, depthWrite: false,
    });
    const beam = new THREE.InstancedMesh(beamGeo, beamMat, pads.length);
    const dummy = new THREE.Object3D();
    pads.forEach((p, i) => {
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      base.setMatrixAt(i, dummy.matrix);
      beam.setMatrixAt(i, dummy.matrix);
      dummy.position.y = p.y + 0.1;
      dummy.updateMatrix();
      ring.setMatrixAt(i, dummy.matrix);
    });
    for (const mesh of [base, ring, beam]) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.frustumCulled = false;
      this.root.add(mesh);
      this.disposables.push(mesh.geometry, mesh.material);
    }
    this.jumpPadRingMesh = ring;
    this.jumpPadDummy = new THREE.Object3D();
  }

  getJumpPad(position) {
    for (const pad of this.jumpPads || []) {
      const dx = position.x - pad.x;
      const dz = position.z - pad.z;
      if (dx * dx + dz * dz < pad.radius * pad.radius) return pad;
    }
    return null;
  }

  // ---------------------- Terreno ----------------------

  rawHeightAt(x, z) {
    if (!this.procedural) {
      if (Math.abs(x) > this.half || Math.abs(z) > this.half) return -100;
      return 0;
    }
    const b = this.biome;
    const f = b.frequency || 0.012;
    const n = fbm(x * f, z * f, this.seed, 5);
    const broad = fbm(x * f * 0.38 + 30, z * f * 0.38 - 20, this.seed + 991, 3);
    const ridge = 1 - Math.abs(fbm(x * f * 1.6, z * f * 1.6, this.seed + 451, 3) * 2 - 1);
    const detail = noise2(x * 0.035, z * 0.035, this.seed + 77) - 0.5;
    let h = (b.baseHeight ?? 10) + (n - 0.5) * (b.amplitude ?? 9) * 2
      + (broad - 0.5) * (b.amplitude ?? 9) * 1.1
      + ridge * ridge * (b.roughness ?? 3.5) * 1.8 + detail * 1.6;
    // Pequeño ruido orgánico en el terreno (no un lamblog perfecto).
    const wobble = noise2(x * 0.0042, z * 0.0042, this.seed + 909);
    h += (wobble - 0.5) * 0.9;

    const mountainField = fbm(x * f * 0.6 + 120, z * f * 0.6 - 85, this.seed + 3337, 3);
    const peak = Math.pow(clamp((mountainField - 0.48) / 0.28, 0, 1), 1.4);
    h += peak * this.mountainHeight;

    if (this.map.island) {
      const angle = Math.atan2(z, x);
      // Costa irregular: lóbulos, cabos y ensenadas en vez de un círculo perfecto.
      const coastNoise = fbm(x * 0.0042 + 61, z * 0.0042 - 37, this.seed + 7777, 3);
      const coastNoise2 = fbm(x * 0.009 + 11, z * 0.009 + 23, this.seed + 8123, 2);
      const lobes = 0.14 * Math.sin(angle * 3 + 0.9)
        + 0.1 * Math.sin(angle * 5.2 - 1.5)
        + 0.07 * Math.sin(angle * 7.8 + 2.1)
        + 0.045 * Math.sin(angle * 11.0 - 0.6)
        + (coastNoise - 0.5) * 0.42
        + (coastNoise2 - 0.5) * 0.18;
      const coastR = this.half * clamp(1.0 + lobes, 0.68, 1.18);
      const r = Math.hypot(x, z) / coastR;

      // Hundimiento progresivo del terreno a partir de la línea de costa.
      const t = smoothstep(clamp((r - 0.8) / 0.2, 0, 1));
      h = lerp(h, this.waterLevel - 20, t);

      // Playas llanas donde el ruido costero es bajo; acantilados donde es alto.
      const shore = smoothstep(clamp((r - 0.66) / 0.1, 0, 1))
        * (1 - smoothstep(clamp((r - 0.92) / 0.08, 0, 1)));
      if (shore > 0) {
        const cliff = smoothstep(clamp((coastNoise - 0.52) / 0.16, 0, 1));
        const limit = this.waterLevel + lerp(1.3, 11, cliff) + detail * 0.8;
        if (h > limit) h = lerp(h, limit, shore);
      }

      // Los enclaves del mapa siempre quedan sobre tierra firme.
      for (const poi of this.map.pois || []) {
        const dx = x - poi.x;
        const dz = z - poi.z;
        const d = Math.hypot(dx, dz);
        const rr = (poi.radius || 20) * 0.78;
        if (d < rr) {
          const k = smoothstep(1 - d / rr);
          h = Math.max(h, lerp(h, this.waterLevel + 2.6, k));
        }
      }
    }
    return h;
  }

  heightAt(x, z) {
    if (!this.procedural) return this.rawHeightAt(x, z);
    let h = this.rawHeightAt(x, z);
    for (const poi of this.map.pois || []) {
      const dx = x - poi.x;
      const dz = z - poi.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist >= poi.radius) continue;
      const flat = Math.max(this.poiFlatHeights.get(poi.name) ?? h, this.waterLevel + 1.8);
      const t = smoothstep(clamp((dist - poi.radius * 0.52) / (poi.radius * 0.48), 0, 1));
      h = lerp(flat, h, t);
    }
    return h;
  }

  /** Suelo efectivo al caer: terreno + tejados/plataformas crossed. */
  groundAt(x, z, prevY, nextY) {
    let ground = this.heightAt(x, z);
    const low = Math.min(prevY, nextY) - 0.15;
    const high = Math.max(prevY, nextY) + 0.15;
    for (const c of this.collidersNear(x, z, 1.2)) {
      if (x < c.minX || x > c.maxX || z < c.minZ || z > c.maxZ) continue;
      if (c.maxY >= low && c.maxY <= high && c.maxY > ground) ground = c.maxY;
    }
    return ground;
  }

  createChunk(cx, cz) {
    const key = `${cx},${cz}`;
    const centerX = (cx + 0.5) * CHUNK_SIZE;
    const centerZ = (cz + 0.5) * CHUNK_SIZE;
    if (Math.abs(centerX) > this.half + CHUNK_SIZE || Math.abs(centerZ) > this.half + CHUNK_SIZE) return null;

    const seg = this.chunkSegments || CHUNK_SEGMENTS;
    const vertexCount = (seg + 1) * (seg + 1);
    const positions = new Float32Array(vertexCount * 3);
    const colors = new Float32Array(vertexCount * 3);
    const uvs = new Float32Array(vertexCount * 2);
    const indices = [];
    const cLow = new THREE.Color(this.theme.grass);
    const cHigh = new THREE.Color(this.theme.grass2);
    const cRock = new THREE.Color(this.theme.rock);
    const cSand = new THREE.Color(this.theme.sand);
    const cSnow = new THREE.Color(0xf2f7fb);
    // Parches de hierba pisada y tierra: rompen el aspecto de alfombra plana.
    const cDirt = new THREE.Color(this.theme.sand).lerp(new THREE.Color(this.theme.rock), 0.35);
    const cDark = new THREE.Color(this.theme.tree).lerp(new THREE.Color(this.theme.grass), 0.3);
    const tmp = new THREE.Color();

    let i = 0;
    for (let iz = 0; iz <= seg; iz++) {
      for (let ix = 0; ix <= seg; ix++) {
        const wx = centerX + (ix / seg - 0.5) * CHUNK_SIZE;
        const wz = centerZ + (iz / seg - 0.5) * CHUNK_SIZE;
        const y = this.heightAt(wx, wz);
        positions[i * 3] = wx;
        positions[i * 3 + 1] = y;
        positions[i * 3 + 2] = wz;

        const step = 4;
        const sx = this.heightAt(wx + step, wz) - this.heightAt(wx - step, wz);
        const sz = this.heightAt(wx, wz + step) - this.heightAt(wx, wz - step);
        const slope = Math.sqrt(sx * sx + sz * sz) / (step * 2);

        const sub = noise2(wx * 0.0009, wz * 0.0009, this.seed + 5150);
        if (y < this.waterLevel + 3) tmp.copy(cSand);
        else {
          tmp.copy(cLow).lerp(cHigh, clamp(noise2(wx * 0.007, wz * 0.007, this.seed + 31), 0, 1));
          if (sub > 0.55) tmp.lerp(this.subBiomeColor, clamp((sub - 0.55) * 1.8, 0, 0.75));
          const patch = noise2(wx * 0.019 + 17, wz * 0.019 - 9, this.seed + 771);
          const patchWide = noise2(wx * 0.0045, wz * 0.0045, this.seed + 1299);
          if (patch > 0.62) tmp.lerp(cDirt, clamp((patch - 0.62) * 1.9, 0, 0.42));
          else if (patchWide < 0.36) tmp.lerp(cDark, clamp((0.36 - patchWide) * 1.1, 0, 0.3));
        }
        if (this.map.theme === 'snow' && y > 55) tmp.lerp(cSnow, clamp((y - 55) / 45, 0, 1));
        else if (y > (this.biome.baseHeight || 16) + (this.biome.amplitude || 34) * 0.75) tmp.lerp(this.map.theme === 'desert' ? cSand : cRock, 0.75);
        if (slope > 0.55) tmp.lerp(cRock, clamp((slope - 0.55) * 1.2, 0, 0.9));

        colors[i * 3] = tmp.r;
        colors[i * 3 + 1] = tmp.g;
        colors[i * 3 + 2] = tmp.b;
        uvs[i * 2] = ix / seg;
        uvs[i * 2 + 1] = iz / seg;
        i++;
      }
    }
    for (let iz = 0; iz < seg; iz++) {
      for (let ix = 0; ix < seg; ix++) {
        const a = iz * (seg + 1) + ix;
        const b = a + 1;
        const c = a + seg + 1;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    const terrain = new THREE.Mesh(geo, this.materials.terrain);
    terrain.receiveShadow = !!this.settings.get('shadows');
    terrain.frustumCulled = true;

    const group = new THREE.Group();
    group.add(terrain);
    this.addVegetation(group, cx, cz, centerX, centerZ);

    const chunk = { key, cx, cz, group, geometry: geo };
    this.chunks.set(key, chunk);
    this.root.add(group);
    return chunk;
  }

  addVegetation(group, cx, cz, centerX, centerZ) {
    // San Borondon coloca los modelos del kit de una sola vez en loadIsland().
    if (this.useKitAssets) return;
    const rnd = makeRandom((this.seed ^ Math.imul(cx + 512, 73856093) ^ Math.imul(cz + 512, 19349663)) >>> 0);
    const density = this.settings.get('vegetation');
    if (density <= 0) return;
    const area = CHUNK_SIZE * CHUNK_SIZE;
    const sub = noise2(centerX * 0.0009, centerZ * 0.0009, this.seed + 5150);
    const treeCount = Math.floor((area / 1500) * (this.biome.treeDensity || 0.3) * density * (0.5 + sub * 1.1));
    const rockCount = Math.floor((area / 2600) * (this.biome.rockDensity || 0.2) * density);
    const bushCount = Math.floor((area / 2300) * (this.biome.grassDensity || 0.3) * density);
    const dummy = new THREE.Object3D();

    const makeInstances = (geo, mat, count, builder, colorFn) => {
      if (count <= 0) return null;
      const mesh = new THREE.InstancedMesh(geo, mat, count);
      for (let i = 0; i < count; i++) {
        let placed = false;
        for (let tries = 0; tries < 8 && !placed; tries++) {
          const x = centerX + (rnd() - 0.5) * CHUNK_SIZE;
          const z = centerZ + (rnd() - 0.5) * CHUNK_SIZE;
          const y = this.heightAt(x, z);
          if (y < this.waterLevel + 1.2) continue;
          if (this.nearPOI(x, z, 0.92)) continue;
          builder(dummy, x, y, z, rnd);
          dummy.updateMatrix();
          mesh.setMatrixAt(i, dummy.matrix);
          if (colorFn) mesh.setColorAt(i, colorFn(dummy));
          placed = true;
        }
        if (!placed) {
          dummy.position.set(0, -1000, 0);
          dummy.scale.setScalar(0.001);
          dummy.updateMatrix();
          mesh.setMatrixAt(i, dummy.matrix);
          if (colorFn) mesh.setColorAt(i, new THREE.Color(1, 1, 1));
        }
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      group.add(mesh);
      return mesh;
    };

    const treeGeo = this.map.island
      ? this.sharedGeo.treePalm
      : this.map.theme !== 'desert' ? this.sharedGeo.treePine : this.sharedGeo.treeRound;
    makeInstances(treeGeo, this.materials.tree, treeCount, (d, x, y, z, r) => {
      const s = 0.72 + r() * 0.85;
      d.position.set(x, y, z);
      d.rotation.set(0, r() * 6.28, 0);
      d.scale.set(s, s * (0.82 + r() * 0.5), s);
      d.userData.tint = 0.86 + r() * 0.28;
    }, (d) => {
      const t = d.userData.tint || 1;
      return new THREE.Color(t, t, t);
    });
    makeInstances(this.sharedGeo.rock, this.materials.rock, rockCount, (d, x, y, z, r) => {
      const s = 0.6 + r() * 2.2;
      d.position.set(x, y + s * 0.25, z);
      d.rotation.set(r(), r() * 6.28, r() * 0.4);
      d.scale.set(s * (0.8 + r()), s * 0.6, s * (0.8 + r()));
    });
    makeInstances(this.sharedGeo.bush, this.materials.bush, bushCount, (d, x, y, z, r) => {
      const s = 0.5 + r() * 1.1;
      d.position.set(x, y, z);
      d.rotation.set(0, r() * 6.28, 0);
      d.scale.set(s, s * 0.65, s);
    });
  }

  nearPOI(x, z, factor = 1) {
    for (const poi of this.map.pois || []) {
      const dx = x - poi.x;
      const dz = z - poi.z;
      if (dx * dx + dz * dz < (poi.radius * factor) ** 2) return true;
    }
    return false;
  }

  /** True si el punto cae sobre una calzada (con margen opcional). */
  nearRoad(x, z, margin = 0) {
    for (const circle of this.roadCircles) {
      const r = circle.radius + margin;
      const dx = x - circle.x;
      const dz = z - circle.z;
      if (dx * dx + dz * dz < r * r) return true;
    }
    for (const s of this.roadSegments) {
      const dx = s.x2 - s.x1;
      const dz = s.z2 - s.z1;
      const len2 = dx * dx + dz * dz;
      if (len2 < 0.001) continue;
      const t = clamp(((x - s.x1) * dx + (z - s.z1) * dz) / len2, 0, 1);
      const px = s.x1 + dx * t;
      const pz = s.z1 + dz * t;
      const r = s.width * 0.5 + margin;
      const ox = x - px;
      const oz = z - pz;
      if (ox * ox + oz * oz < r * r) return true;
    }
    return false;
  }

  removeChunk(key) {
    const chunk = this.chunks.get(key);
    if (!chunk) return;
    this.root.remove(chunk.group);
    chunk.geometry.dispose();
    this.chunks.delete(key);
  }

  update(playerPos) {
    if (this.procedural) {
      const pcx = Math.floor(playerPos.x / CHUNK_SIZE);
      const pcz = Math.floor(playerPos.z / CHUNK_SIZE);
      const range = this.settings.get('viewDistance') || 4;
      const wanted = [];
      for (let dz = -range; dz <= range; dz++) {
        for (let dx = -range; dx <= range; dx++) {
          if (dx * dx + dz * dz > (range + 0.5) ** 2) continue;
          const cx = pcx + dx;
          const cz = pcz + dz;
          const key = `${cx},${cz}`;
          if (!this.chunks.has(key) && !this.chunkQueue.has(key)) wanted.push({ cx, cz, key });
        }
      }
      wanted.sort((a, b) => ((a.cx - pcx) ** 2 + (a.cz - pcz) ** 2) - ((b.cx - pcx) ** 2 + (b.cz - pcz) ** 2));
      let created = 0;
      for (const item of wanted) {
        if (created >= 3) break;
        if (this.createChunk(item.cx, item.cz)) created++;
      }
      for (const key of [...this.chunks.keys()]) {
        const [cx, cz] = key.split(',').map(Number);
        if (Math.abs(cx - pcx) > range + 1 || Math.abs(cz - pcz) > range + 1) this.removeChunk(key);
      }
    }
    this.updateSkyForPosition(playerPos);
    this.updateLightForPosition(playerPos);
    if (this.water) this.water.position.set(Math.round(playerPos.x / 100) * 100, this.waterLevel, Math.round(playerPos.z / 100) * 100);
    if (this.clouds) this.clouds.position.set(playerPos.x, 0, playerPos.z);
  }

  tick(dt) {
    this.debug?.update(dt);
    if (this.water) this.water.material.uniforms.uTime.value += dt;
    if (this.clouds) this.clouds.rotation.y += dt * 0.0008;
    if (this.jumpPadRingMesh && this.jumpPads?.length) {
      this.padPulse += dt * 3;
      const d = this.jumpPadDummy;
      for (let i = 0; i < this.jumpPads.length; i++) {
        const p = this.jumpPads[i];
        const s = 0.88 + Math.sin(this.padPulse - i * 0.7) * 0.13;
        d.position.set(p.x, p.y + 0.15, p.z);
        d.rotation.set(0, this.padPulse * 0.4 + i, 0);
        d.scale.set(s, s, s);
        d.updateMatrix();
        this.jumpPadRingMesh.setMatrixAt(i, d.matrix);
      }
      this.jumpPadRingMesh.instanceMatrix.needsUpdate = true;
    }
  }

  // ---------------------- Estructuras ----------------------

  addCollider(minX, maxX, minY, maxY, minZ, maxZ) {
    const c = { minX, maxX, minY, maxY, minZ, maxZ };
    this.colliders.push(c);
    const x0 = Math.floor(minX / COLLIDER_CELL);
    const x1 = Math.floor(maxX / COLLIDER_CELL);
    const z0 = Math.floor(minZ / COLLIDER_CELL);
    const z1 = Math.floor(maxZ / COLLIDER_CELL);
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        const key = `${x},${z}`;
        if (!this.colliderGrid.has(key)) this.colliderGrid.set(key, []);
        this.colliderGrid.get(key).push(c);
      }
    }
  }

  addGeo(bucket, geo, x, y, z, rotY = 0, sx = 1, sy = 1, sz = 1, rotX = 0) {
    if (rotY) geo.rotateY(rotY);
    if (rotX) geo.rotateX(rotX);
    if (sx !== 1 || sy !== 1 || sz !== 1) geo.scale(sx, sy, sz);
    geo.translate(x, y, z);
    if (!bucket.has(this._matKey)) bucket.set(this._matKey, []);
    bucket.get(this._matKey).push(geo.index ? geo.toNonIndexed() : geo);
  }

  box(ctx, x, y, z, w, h, d, mat = 'wall', rotY = 0, collide = false, rotX = 0) {
    this._matKey = mat;
    const geo = new THREE.BoxGeometry(w, h, d);
    this.addGeo(ctx.buckets, geo, x, y, z, rotY, 1, 1, 1, rotX);
    if (collide) {
      const c = Math.abs(Math.cos(rotY));
      const s = Math.abs(Math.sin(rotY));
      const ex = (c * w + s * d) / 2;
      const ez = (s * w + c * d) / 2;
      this.addCollider(x - ex, x + ex, y - h / 2, y + h / 2, z - ez, z + ez);
    }
  }

  triangle(ctx, x, y, z, base, height, mat = 'wall', rotY = 0, collide = true) {
    this._matKey = mat;
    const geo = new THREE.BufferGeometry();
    const verts = new Float32Array([-base / 2, 0, 0, base / 2, 0, 0, 0, height, 0]);
    const uvs = new Float32Array([0, 0, 1, 0, 0.5, 1]);
    geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setIndex([0, 1, 2]);
    geo.computeVertexNormals();
    this.addGeo(ctx.buckets, geo, x, y, z, rotY);
    if (collide) this.addCollider(x - base / 2, x + base / 2, y, y + height, z - 0.15, z + 0.15);
  }
  cylinder(ctx, x, y, z, r, h, mat = 'metal', collide = false) {
    this._matKey = mat;
    const geo = new THREE.CylinderGeometry(r, r, h, 10);
    this.addGeo(ctx.buckets, geo, x, y, z, 0);
    if (collide) this.addCollider(x - r, x + r, y - h / 2, y + h / 2, z - r, z + r);
  }

  makeBuilding(ctx, x, z, w, d, h, opts = {}) {
    const y = this.heightAt(x, z);
    const t = 0.28;
    const wallMat = opts.wallMat || 'wall';
    const roofMat = opts.roofMat || 'roof';
    // Suelo
    this.box(ctx, x, y + 0.12, z, w + 0.4, 0.24, d + 0.4, 'concrete');
    const front = opts.front || 0;
    const cos = Math.cos(front);
    const sin = Math.sin(front);
    const place = (lx, lz, ww, dd, mat, rot = front, collide = true) => {
      const wx = x + lx * cos + lz * sin;
      const wz = z - lx * sin + lz * cos;
      this.box(ctx, wx, y + h / 2 + 0.2, wz, ww, h, dd, mat, rot, collide);
    };
    const doorW = 1.6;
    const doorH = 2.35;
    const side = Math.max(0.4, (w - doorW) / 2);
    // Pared frontal con hueco de puerta
    place(-(doorW + side) / 2, -d / 2, side, t, wallMat);
    place((doorW + side) / 2, -d / 2, side, t, wallMat);
    // Dintel (se añade arriba, no bloquea la puerta)
    this._matKey = wallMat;
    {
      const lx = 0, lz = -d / 2;
      const wx = x + lx * cos + lz * sin;
      const wz = z - lx * sin + lz * cos;
      this.box(ctx, wx, y + doorH + (h - doorH) / 2 + 0.2, wz, doorW, h - doorH, t, wallMat, front);
    }
    // Pared trasera y laterales
    place(0, d / 2, w, t, wallMat);
    place(-w / 2, 0, t, d, wallMat);
    place(w / 2, 0, t, d, wallMat);
    // Ventanas (frontal y trasera)
    if (opts.windows !== false) {
      for (const lzSign of [-1, 1]) {
        for (const lx of [-w * 0.27, w * 0.27]) {
          const wx = x + lx * cos + (lzSign * d / 2) * sin;
          const wz = z - lx * sin + (lzSign * d / 2) * cos;
          this.box(ctx, wx, y + 1.75, wz, 1.15, 1.1, 0.08, 'glass', front);
        }
      }
    }
    // Paredes triangulares de los hastiales (gable ends)
    if (opts.gable !== false) {
      const slope = 0.45;
      const triH = (w / 2) * slope;
      for (const lzSign of [-1, 1]) {
        const lx = 0, lz = lzSign * d / 2;
        const wx = x + lx * cos + lz * sin;
        const wz = z - lx * sin + lz * cos;
        this.triangle(ctx, wx, y + h + 0.2, wz, w + 0.4, triH, wallMat, front, true);
      }
    }
    // Techo
    if (opts.gable !== false) {
      const slope = 0.45;
      const panelD = Math.hypot(d / 2, (w / 2) * slope);
      const rx = Math.atan2((w / 2) * slope, d / 2);
      for (const sign of [-1, 1]) {
        const lz = sign * d / 4;
        const wx = x + lz * sin;
        const wz = z + lz * cos;
        this.box(ctx, wx, y + h + 0.4 + (w / 2) * slope / 2, wz, w + 0.6, 0.24, panelD + 0.4, roofMat, front, true, sign * rx);
      }
    } else {
      this.box(ctx, x, y + h + 0.35, z, w + 0.6, 0.3, d + 0.6, roofMat, front, true);
    }
    // Segundo piso opcional
    if (opts.twoFloor) {
      this.box(ctx, x, y + h + 0.25, z, w - 0.1, 0.2, d - 0.1, 'concrete', 0, true);
      this.box(ctx, x, y + h * 1.8, z, w, h * 0.8, d, wallMat, front, true);
      this.box(ctx, x, y + h * 2.2 + 0.2, z, w + 0.6, 0.25, d + 0.6, roofMat, front, true);
    }
    ctx.loot.push(new THREE.Vector3(x, y + 1.2, z));
    ctx.spawns.push(new THREE.Vector3(x, y + 1.5, z));
    return { x, z, y, w, d };
  }

  makeTower(ctx, x, z, h = 22) {
    const y = this.heightAt(x, z);
    this.box(ctx, x, y + h / 2, z, 6, h, 6, 'concrete', 0, true);
    this.box(ctx, x, y + h + 0.3, z, 9, 0.6, 9, 'metal', 0, true);
    this.box(ctx, x, y + h + 2, z, 5, 3.2, 5, 'glass');
    this.box(ctx, x, y + h + 4, z, 6.5, 0.4, 6.5, 'accent');
    this.cylinder(ctx, x, y + h + 9, z, 0.16, 10, 'metal');
    ctx.loot.push(new THREE.Vector3(x, y + h + 1.4, z));
    ctx.spawns.push(new THREE.Vector3(x, y + h + 1.4, z));
  }

  makeContainer(ctx, x, z, level = 0, rot = 0, color = 'accent') {
    const y = this.heightAt(x, z) + level * 2.7 + 1.35;
    this.box(ctx, x, y, z, 7.5, 2.6, 3.1, color, rot, true);
    if (level === 0) ctx.loot.push(new THREE.Vector3(x, y + 1.8, z));
  }

  makeCrane(ctx, x, z) {
    const y = this.heightAt(x, z);
    this.box(ctx, x, y + 16, z, 1.6, 32, 1.6, 'accent', 0, true);
    this.box(ctx, x + 12, y + 31, z, 27, 1.2, 1.6, 'metal');
    this.box(ctx, x + 21, y + 25, z, 0.12, 12, 0.12, 'dark');
    this.box(ctx, x + 21, y + 19, z, 3, 2, 3, 'metal');
  }

  makeDam(ctx, poi) {
    const y = this.heightAt(poi.x, poi.z);
    const rot = 0.35;
    this.box(ctx, poi.x, y + 13, poi.z, 130, 26, 16, 'concrete', rot, true);
    for (let i = -2; i <= 2; i++) {
      const x = poi.x + i * 25;
      this.cylinder(ctx, x, y + 29, poi.z, 2.2, 7, 'concrete', true);
      this.box(ctx, x, y + 33, poi.z, 5.5, 1, 5.5, 'dark');
    }
    for (let i = -4; i <= 4; i++) {
      const x = poi.x + i * 13;
      ctx.loot.push(new THREE.Vector3(x, y + 27, poi.z));
      ctx.spawns.push(new THREE.Vector3(x, y + 27, poi.z));
    }
  }

  makeRuins(ctx, poi, rnd) {
    const n = 14;
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2;
      const r = rnd() * poi.radius * 0.8;
      const x = poi.x + Math.cos(a) * r;
      const z = poi.z + Math.sin(a) * r;
      const y = this.heightAt(x, z);
      const h = 1.5 + rnd() * 5;
      if (rnd() > 0.35) this.box(ctx, x, y + h / 2, z, 2 + rnd() * 7, h, 0.7, rnd() > 0.5 ? 'concrete' : 'wall2', rnd() * 3, true);
      else this.cylinder(ctx, x, y + h / 2, z, 0.55, h, 'concrete', true);
      if (rnd() > 0.45) ctx.loot.push(new THREE.Vector3(x + 2, y + 1.2, z + 2));
      ctx.spawns.push(new THREE.Vector3(x, y + 1.5, z));
    }
  }

  makeFence(ctx, x1, z1, x2, z2) {
    const dx = x2 - x1;
    const dz = z2 - z1;
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len < 2) return;
    const rot = Math.atan2(dx, dz);
    const steps = Math.max(2, Math.floor(len / 6));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = lerp(x1, x2, t);
      const z = lerp(z1, z2, t);
      const y = this.heightAt(x, z);
      this.box(ctx, x, y + 1.1, z, 0.18, 2.2, 0.18, 'wood');
    }
    const mx = (x1 + x2) / 2;
    const mz = (z1 + z2) / 2;
    const my = this.heightAt(mx, mz);
    this.box(ctx, mx, my + 1.65, mz, 0.12, 0.12, len, 'wood', rot);
    this.box(ctx, mx, my + 0.8, mz, 0.12, 0.12, len, 'wood', rot);
  }

  generateStructures() {
    const ctx = { buckets: new Map(), loot: [], spawns: [] };
    const roadsBuilt = [];
    for (const poi of this.map.pois || []) {
      const rnd = makeRandom(hashString(`${poi.name}:${this.seed}`));
      const p = { x: poi.x, z: poi.z, radius: poi.radius };
      roadsBuilt.push(p);
      const angle0 = rnd() * Math.PI * 2;
      const place = (count, minR, maxR, fn) => {
        for (let i = 0; i < count; i++) {
          const a = angle0 + (i / count) * Math.PI * 2 + (rnd() - 0.5) * 0.45;
          const r = lerp(minR, maxR, rnd());
          fn(poi.x + Math.cos(a) * r, poi.z + Math.sin(a) * r, rnd);
        }
      };
      switch (poi.type) {
        case 'town':
          place(11, 35, poi.radius * 0.85, (x, z, r) => this.makeBuilding(ctx, x, z, 9 + r() * 6, 8 + r() * 5, 3.2 + r() * 1.6, {
            front: r() * Math.PI * 2, wallMat: r() > 0.5 ? 'wall' : 'wall2', twoFloor: r() > 0.78,
          }));
          this.makeTower(ctx, poi.x + 8, poi.z - 12, 15);
          break;
        case 'village':
          place(8, 28, poi.radius * 0.85, (x, z, r) => this.makeBuilding(ctx, x, z, 7 + r() * 4, 6 + r() * 4, 2.8 + r(), {
            front: r() * Math.PI * 2, wallMat: 'wood', roofMat: 'roof',
          }));
          break;
        case 'harbor':
          for (let i = 0; i < 5; i++) {
            const x = poi.x + (i - 2) * 26;
            const z = poi.z + 40;
            const y = this.heightAt(x, z);
            this.box(ctx, x, y + 1.2, z, 8, 0.5, 55, 'wood', 0, true);
            for (let j = 0; j < 4; j++) this.box(ctx, x + (j - 1.5) * 2, y + 0.5, z + 20, 0.4, 1.5, 0.4, 'wood');
          }
          this.makeCrane(ctx, poi.x - 35, poi.z + 15);
          place(4, 40, 90, (x, z, r) => this.makeBuilding(ctx, x, z, 14 + r() * 8, 11, 5, { wallMat: 'metal', roofMat: 'metal', gable: false }));
          for (let i = 0; i < 8; i++) this.makeContainer(ctx, poi.x + 40 + (i % 3) * 8, poi.z - 10 + Math.floor(i / 3) * 4, i > 5 ? 1 : 0, (i % 2) * 0.2, i % 3 === 0 ? 'accent' : 'metal');
          break;
        case 'dam':
          this.makeDam(ctx, poi);
          this.makeBuilding(ctx, poi.x + 70, poi.z + 30, 14, 12, 6, { wallMat: 'concrete', roofMat: 'metal', gable: false });
          break;
        case 'tower':
          this.makeTower(ctx, poi.x, poi.z, 34);
          place(4, 35, poi.radius * 0.9, (x, z, r) => this.makeBuilding(ctx, x, z, 8, 7, 3, { front: r() * 3, wallMat: 'metal', gable: false }));
          break;
        case 'outpost':
          place(4, 20, poi.radius * 0.75, (x, z, r) => {
            const y = this.heightAt(x, z);
            this.box(ctx, x, y + 1.6, z, 8, 3.2, 8, 'concrete', r() * 0.5, true);
            this.box(ctx, x, y + 3.4, z, 9, 0.4, 9, 'metal', 0);
            ctx.loot.push(new THREE.Vector3(x + 4, y + 1.2, z + 4));
            ctx.spawns.push(new THREE.Vector3(x + 5, y + 1.5, z + 5));
          });
          this.makeTower(ctx, poi.x + 25, poi.z, 12);
          this.makeFence(ctx, poi.x - 60, poi.z - 45, poi.x + 60, poi.z - 45);
          break;
        case 'ruins':
          this.makeRuins(ctx, poi, rnd);
          if (rnd() > 0.4) this.makeTower(ctx, poi.x, poi.z, 18);
          break;
        case 'warehouse':
          for (let i = 0; i < 4; i++) {
            const x = poi.x + (i % 2) * 48 - 24;
            const z = poi.z + Math.floor(i / 2) * 38 - 19;
            this.makeBuilding(ctx, x, z, 32, 22, 7, { wallMat: 'metal', roofMat: 'metal', gable: false, windows: false });
          }
          for (let i = 0; i < 12; i++) this.makeContainer(ctx, poi.x - 70 + (i % 6) * 9, poi.z + 60 + Math.floor(i / 6) * 5, i > 9 ? 1 : 0, rnd() * 0.15, i % 4 === 0 ? 'accent' : 'metal');
          break;
        case 'facility':
          this.makeBuilding(ctx, poi.x, poi.z, 34, 26, 7, { wallMat: 'concrete', roofMat: 'metal', gable: false });
          for (let i = 0; i < 3; i++) {
            const x = poi.x + 45 + i * 14;
            const z = poi.z - 20 + i * 22;
            const y = this.heightAt(x, z);
            this.cylinder(ctx, x, y + 6, z, 5.5, 12, 'metal', true);
            this.cylinder(ctx, x, y + 12.4, z, 5.7, 0.6, 'accent');
            ctx.loot.push(new THREE.Vector3(x + 6, y + 1.2, z + 6));
          }
          this.makeTower(ctx, poi.x - 45, poi.z + 20, 20);
          break;
        default:
          place(6, 25, poi.radius * 0.8, (x, z, r) => this.makeBuilding(ctx, x, z, 10, 9, 3.5, { front: r() * 3 }));
      }

      // Loot y spawns alrededor del POI
      for (let i = 0; i < 10; i++) {
        const a = rnd() * Math.PI * 2;
        const r = rnd() * poi.radius * 0.9;
        const x = poi.x + Math.cos(a) * r;
        const z = poi.z + Math.sin(a) * r;
        ctx.loot.push(new THREE.Vector3(x, this.heightAt(x, z) + 1, z));
        ctx.spawns.push(new THREE.Vector3(x, this.heightAt(x, z) + 1.5, z));
      }
    }

    // Cabañas aisladas y botín disperso
    const rnd = makeRandom(this.seed + 4242);
    for (let i = 0; i < 34; i++) {
      const x = (rnd() - 0.5) * this.size * 0.88;
      const z = (rnd() - 0.5) * this.size * 0.88;
      if (this.nearPOI(x, z, 1.15)) continue;
      if (this.heightAt(x, z) < this.waterLevel + 2) continue;
      if (rnd() > 0.45) this.makeBuilding(ctx, x, z, 7 + rnd() * 4, 6 + rnd() * 3, 3, { wallMat: 'wood', front: rnd() * 6 });
      else {
        const y = this.heightAt(x, z);
        ctx.loot.push(new THREE.Vector3(x, y + 1, z));
        this.box(ctx, x, y + 1, z, 2.5, 2, 2.5, 'metal', rnd() * 3, true);
      }
    }

    // Unir geometrías por material: muy pocos draw calls.
    for (const [matKey, geos] of ctx.buckets) {
      if (!geos.length) continue;
      const merged = mergeGeometries(geos, false);
      for (const g of geos) g.dispose();
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, this.materials[matKey]);
      mesh.castShadow = !!this.settings.get('shadows');
      mesh.receiveShadow = !!this.settings.get('shadows');
      mesh.frustumCulled = false;
      this.structures.add(mesh);
      this.disposables.push(merged);
    }
    this.lootSpots = ctx.loot.filter((v) => Math.abs(v.x) < this.half - 40 && Math.abs(v.z) < this.half - 40);
    this.spawnPoints = ctx.spawns.length ? ctx.spawns : this.lootSpots;
  }

  /** Pueblos densos, puerto, faro y ruinas a escala de isla pequeña. */
  generateSanBorondonLandmarks() {
    const ctx = { buckets: new Map(), loot: [], spawns: [] };
    const rnd = makeRandom(this.seed + 424242);
    const byName = (name) => (this.map.pois || []).find((p) => p.name.includes(name));

    const propScales = {
      Bag: 1.5, Barrel: 1.7, Barrel_Apples: 1.7, Bench: 1.5, Bucket_Wooden_1: 1.8,
      Crate_Metal: 1.8, Crate_Wooden: 1.8, FarmCrate_Apple: 2.1, FarmCrate_Empty: 2.1,
      Lantern_Wall: 1.6, Shelf_Simple: 1.6, Stall_Cart_Empty: 1.5, Stall_Empty: 1.7,
      Table_Large: 1.5, Torch_Metal: 2.1,
    };
    const prop = (model, x, z, rot = 0, scale = null) => {
      if (!this.useKitAssets) return;
      const y = this.heightAt(x, z);
      if (y < this.waterLevel + 0.25) return;
      const s = scale ?? propScales[model] ?? 1;
      this.propRequests.push({
        model, x, z, rot, scale: s,
        y: y + (model === 'Torch_Metal' ? 0.6 * s : 0),
      });
    };
    const addGroundSpots = (x, z, count = 1, spread = 12) => {
      for (let i = 0; i < count; i++) {
        const a = rnd() * Math.PI * 2;
        const r = Math.sqrt(rnd()) * spread;
        const sx = x + Math.cos(a) * r;
        const sz = z + Math.sin(a) * r;
        const sy = this.heightAt(sx, sz);
        if (sy < this.waterLevel + 1.5) continue;
        ctx.loot.push(new THREE.Vector3(sx, sy + 1, sz));
        ctx.spawns.push(new THREE.Vector3(sx, sy + 1.5, sz));
      }
    };
    const hut = (x, z, w, d, h, rot = 0, wallMat = 'wood', roofMat = 'roof', opts = {}) => {
      if (this.heightAt(x, z) < this.waterLevel + 1.8) return;
      if (this.nearRoad(x, z, 2.8)) return;
      this.makeBuilding(ctx, x, z, w, d, h, {
        front: rot, wallMat, roofMat, windows: opts.windows !== false, gable: opts.gable !== false, twoFloor: !!opts.twoFloor,
      });
    };
    const crate = (x, z, model = 'Crate_Wooden') => {
      const y = this.heightAt(x, z);
      if (y < this.waterLevel + 0.4) return;
      prop(model, x, z, rnd() * 0.7 - 0.35);
      ctx.loot.push(new THREE.Vector3(x, y + 1, z));
    };
    const barrel = (x, z, model = 'Barrel') => {
      if (this.heightAt(x, z) < this.waterLevel + 0.4) return;
      prop(model, x, z, rnd() * 3);
    };
    const chapel = (x, z, rot = 0) => {
      if (this.heightAt(x, z) < this.waterLevel + 2) return;
      this.makeBuilding(ctx, x, z, 10, 15, 5.6, { front: rot, wallMat: 'wall', roofMat: 'roof', windows: true });
      const tx = x + Math.sin(rot) * 9;
      const tz = z + Math.cos(rot) * 9;
      const ty = this.heightAt(tx, tz);
      this.box(ctx, tx, ty + 6, tz, 3.6, 12, 3.6, 'wall2', rot, true);
      this.box(ctx, tx, ty + 12.4, tz, 4.4, 0.6, 4.4, 'roof', rot, true);
      this.box(ctx, tx, ty + 14.3, tz, 0.28, 3.2, 0.28, 'metal');
      this.box(ctx, tx, ty + 15, tz, 1.7, 0.28, 0.28, 'metal');
      ctx.loot.push(new THREE.Vector3(tx + 3, ty + 1, tz + 3));
      ctx.spawns.push(new THREE.Vector3(tx + 3.5, ty + 1.5, tz + 3.5));
    };
    const stoneWall = (cx, cz, radius, startA, endA) => {
      const steps = Math.max(4, Math.round(Math.abs(endA - startA) * radius / 5));
      for (let i = 0; i <= steps; i++) {
        const a = lerp(startA, endA, i / steps);
        const x = cx + Math.cos(a) * radius;
        const z = cz + Math.sin(a) * radius;
        if (this.heightAt(x, z) < this.waterLevel + 0.5) continue;
        const y = this.heightAt(x, z);
        this.box(ctx, x, y + 1.55, z, 4.6, 3.1, 1, 'wall2', -a - Math.PI / 2, true);
      }
    };
    const market = (x, z, rot = 0) => {
      if (this.heightAt(x, z) < this.waterLevel + 0.6) return;
      prop('Stall_Empty', x, z, rot);
      const nx = Math.cos(rot + Math.PI / 2);
      const nz = Math.sin(rot + Math.PI / 2);
      crate(x + nx * 2.4, z + nz * 2.4, 'FarmCrate_Apple');
      barrel(x - nx * 2.6, z - nz * 2.6);
      ctx.loot.push(new THREE.Vector3(x + nx * 3, this.heightAt(x, z) + 1, z + nz * 3));
    };

    const rotPoint = (x, z, lx, lz, rot) => ({
      x: x + lx * Math.cos(rot) + lz * Math.sin(rot),
      z: z - lx * Math.sin(rot) + lz * Math.cos(rot),
    });

    /** Molino de viento: torre, tejado cónico y cuatro aspas con vela de lona. */
    const windmill = (x, z, rot = 0) => {
      const y = this.heightAt(x, z);
      if (y < this.waterLevel + 2) return;
      this.cylinder(ctx, x, y + 3.2, z, 2.8, 6.4, 'wall2', true);
      this.cylinder(ctx, x, y + 6.5, z, 3.1, 0.5, 'wood', true);
      this._matKey = 'roof';
      this.addGeo(ctx.buckets, new THREE.ConeGeometry(3.2, 2.8, 8), x, y + 8.1, z, rot);
      const hub = rotPoint(x, z, 0, -3.1, rot);
      this.box(ctx, hub.x, y + 6.7, hub.z, 0.9, 0.9, 0.5, 'metal', rot);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.25;
        const arm = new THREE.BoxGeometry(0.36, 6.4, 0.22);
        arm.translate(0, 3.2, 0);
        arm.rotateZ(a);
        this._matKey = 'wood';
        this.addGeo(ctx.buckets, arm, hub.x, y + 6.7, hub.z, rot);
        const sail = new THREE.BoxGeometry(1.25, 4.4, 0.08);
        sail.translate(0.55, 3.4, 0.16);
        sail.rotateZ(a);
        this._matKey = 'wall';
        this.addGeo(ctx.buckets, sail, hub.x, y + 6.7, hub.z, rot);
      }
      for (let i = 0; i < 3; i++) crate(x + 3.5 + (i % 2) * 2.5, z + 2 + Math.floor(i / 2) * 2.5);
      ctx.loot.push(new THREE.Vector3(x + 3, y + 1, z + 3));
      ctx.spawns.push(new THREE.Vector3(x + 3.5, y + 1.5, z + 3.5));
    };

    /** Huerta de surcos con cultivos, vallado y espantapájaros. */
    const farmPlot = (x, z, rot = 0, w = 36, d = 28) => {
      if (this.heightAt(x, z) < this.waterLevel + 1) return;
      for (let row = 0; row < 5; row++) {
        const lz = -d / 2 + 3 + row * ((d - 6) / 4);
        for (let col = 0; col < 7; col++) {
          const lx = (col - 3) * (w / 7.5);
          const s = rotPoint(x, z, lx, lz, rot);
          const sy = this.heightAt(s.x, s.z);
          if (sy < this.waterLevel + 0.7) continue;
          this.box(ctx, s.x, sy + 0.1, s.z, w / 8.4, 0.2, 3.4, 'soil', rot);
          for (let k = 0; k < 3; k++) {
            const c = rotPoint(x, z, lx + (k - 1) * 0.85, lz, rot);
            const cy = this.heightAt(c.x, c.z);
            this.box(ctx, c.x, cy + 0.55 + rnd() * 0.25, c.z, 0.75, 1.05 + rnd() * 0.4, 0.75,
              (row + col + k) % 3 === 0 ? 'bush' : 'crop', rot);
          }
        }
      }
      const c1 = rotPoint(x, z, -w / 2 - 1, -d / 2 - 1, rot);
      const c2 = rotPoint(x, z, w / 2 + 1, -d / 2 - 1, rot);
      const c3 = rotPoint(x, z, w / 2 + 1, d / 2 + 1, rot);
      const c4 = rotPoint(x, z, -w / 2 - 1, d / 2 + 1, rot);
      this.makeFence(ctx, c1.x, c1.z, c2.x, c2.z);
      this.makeFence(ctx, c2.x, c2.z, c3.x, c3.z);
      this.makeFence(ctx, c3.x, c3.z, c4.x, c4.z);
      this.makeFence(ctx, c4.x, c4.z, c1.x, c1.z);
      const sc = rotPoint(x, z, w / 2 - 3, d / 2 - 3, rot);
      const sy = this.heightAt(sc.x, sc.z);
      this.box(ctx, sc.x, sy + 1.8, sc.z, 0.22, 3.6, 0.22, 'wood');
      this.box(ctx, sc.x, sy + 2.9, sc.z, 2.6, 0.2, 0.2, 'wood', rot);
      this.box(ctx, sc.x, sy + 3.55, sc.z, 0.85, 0.8, 0.8, 'crop');
      crate(x - w / 2 + 2, z + d / 2 - 2, 'FarmCrate_Apple');
      barrel(x - w / 2 + 4, z + d / 2 - 2, 'Barrel_Apples');
      ctx.loot.push(new THREE.Vector3(sc.x, sy + 1, sc.z));
      ctx.spawns.push(new THREE.Vector3(sc.x + 2, sy + 1.5, sc.z + 2));
    };

    /** Casco de un barco encallado en la costa, con mástil roto y botín. */
    const shipwreck = (x, z, rot = 0) => {
      const y = this.heightAt(x, z);
      if (y < this.waterLevel + 0.2) return;
      const keel = new THREE.BoxGeometry(2.2, 0.45, 17);
      this._matKey = 'wood';
      this.addGeo(ctx.buckets, keel, x, y + 0.65, z, rot);
      for (const side of [-1, 1]) {
        const hull = new THREE.BoxGeometry(0.38, 3.6, 16);
        hull.rotateZ(side * 0.3);
        const p = rotPoint(x, z, side * 2.1, 0, rot);
        this._matKey = 'wood';
        this.addGeo(ctx.buckets, hull, p.x, y + 1.9, p.z, rot);
        for (let i = 0; i < 6; i++) {
          const r = rotPoint(x, z, side * 1.7, -7 + i * 2.8, rot);
          const ry = this.heightAt(r.x, r.z);
          this.box(ctx, r.x, ry + 1.5, r.z, 0.3, 3, 0.3, 'wood', rot);
        }
      }
      for (let i = 0; i < 5; i++) {
        const p = rotPoint(x, z, 0, -6 + i * 3, rot);
        this.box(ctx, p.x, y + 1.4, p.z, 5.2, 0.28, 0.4, 'wood', rot);
      }
      const mast = new THREE.BoxGeometry(0.5, 11, 0.5);
      mast.translate(0, 5.5, 0);
      mast.rotateZ(0.42);
      this._matKey = 'wood';
      this.addGeo(ctx.buckets, mast, x, y + 1.2, z, rot);
      this.box(ctx, x, y + 6.5, z, 6.5, 0.3, 0.3, 'wood', rot + 0.2);
      for (let i = 0; i < 4; i++) crate(x + 3 + (i % 2) * 2, z - 2 + Math.floor(i / 2) * 3, 'Crate_Wooden');
      prop('Barrel', x - 4, z + 3);
      ctx.loot.push(new THREE.Vector3(x + 2, y + 1, z + 2));
      ctx.spawns.push(new THREE.Vector3(x + 3, y + 1.5, z + 3));
    };

    /** Cementerio pequeño: tumbas alineadas, cruces y muro de piedra. */
    const graveyard = (x, z, rot = 0) => {
      const y = this.heightAt(x, z);
      if (y < this.waterLevel + 1) return;
      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 5; col++) {
          const p = rotPoint(x, z, (col - 2) * 3.4, (row - 1.5) * 4.2, rot);
          const gy = this.heightAt(p.x, p.z);
          if (gy < this.waterLevel + 0.5) continue;
          this.box(ctx, p.x, gy + 0.18, p.z, 2, 0.36, 1.1, 'grave', rot);
          this.box(ctx, p.x, gy + 1, p.z, 0.85, 1.5, 0.28, 'grave', rot);
          if ((row + col) % 3 === 0) {
            this.box(ctx, p.x, gy + 1.85, p.z, 0.24, 1, 0.24, 'grave', rot);
            this.box(ctx, p.x, gy + 1.95, p.z, 1.1, 0.24, 0.24, 'grave', rot);
          }
          if ((row + col) % 4 === 0) ctx.loot.push(new THREE.Vector3(p.x + 1.5, gy + 1, p.z + 1.5));
          ctx.spawns.push(new THREE.Vector3(p.x + 1.5, gy + 1.5, p.z + 1.5));
        }
      }
      const c1 = rotPoint(x, z, -10, -11, rot);
      const c2 = rotPoint(x, z, 10, -11, rot);
      const c3 = rotPoint(x, z, 10, 11, rot);
      const c4 = rotPoint(x, z, -10, 11, rot);
      this.makeFence(ctx, c1.x, c1.z, c2.x, c2.z);
      this.makeFence(ctx, c2.x, c2.z, c3.x, c3.z);
      this.makeFence(ctx, c3.x, c3.z, c4.x, c4.z);
      this.makeFence(ctx, c4.x, c4.z, c1.x, c1.z);
      stoneWall(x, z, 14, 0.2, 1.1);
      chapel(x - 14, z + 6, rot);
      prop('Torch_Metal', x + 9, z - 9);
    };

    const harbor = byName('Puerto');
    if (harbor) {
      const len = Math.hypot(harbor.x, harbor.z) || 1;
      const ox = harbor.x / len;
      const oz = harbor.z / len;
      const rot = Math.atan2(ox, oz);
      for (let i = 0; i < 5; i++) {
        const px = harbor.x + ox * (16 + i * 11);
        const pz = harbor.z + oz * (16 + i * 11);
        const py = this.waterLevel + 1.1;
        this.box(ctx, px, py, pz, 10, 0.5, 14, 'wood', rot, true);
        for (const side of [-1, 1]) {
          this.box(ctx, px + side * 4.6 * oz, py - 1.1, pz - side * 4.6 * ox, 0.5, 2.6, 0.5, 'wood');
        }
      }
      // Núcleo de pescadores: almacenes, casas y mercado junto a los muelles.
      this.makeBuilding(ctx, harbor.x - 22, harbor.z + 14, 16, 12, 6, { wallMat: 'metal', roofMat: 'metal', gable: false });
      hut(harbor.x - 16, harbor.z - 6, 10, 8, 3.4, 0.5, 'wood');
      hut(harbor.x - 4, harbor.z + 20, 9, 7, 3.2, -0.3, 'wall2');
      hut(harbor.x - 26, harbor.z - 12, 8, 7, 3, 0.9, 'wood');
      hut(harbor.x - 34, harbor.z + 6, 8, 7, 3, -0.6, 'wall');
      hut(harbor.x - 12, harbor.z + 30, 8, 7, 3, 0.2, 'wood');
      market(harbor.x - 8, harbor.z + 12, 0.4);
      this.makeCrane(ctx, harbor.x - 30, harbor.z + 26);
      for (let i = 0; i < 12; i++) {
        const a = rnd() * Math.PI * 2;
        const r = 8 + rnd() * 22;
        const x = harbor.x + Math.cos(a) * r;
        const z = harbor.z + Math.sin(a) * r;
        if (i % 3 === 0) crate(x, z, i % 6 === 0 ? 'Crate_Metal' : 'Crate_Wooden');
        else barrel(x, z, i % 4 === 0 ? 'Barrel_Apples' : 'Barrel');
      }
      prop('Torch_Metal', harbor.x - 6, harbor.z + 4);
      addGroundSpots(harbor.x, harbor.z, 16, 22);
    }

    const town = byName('Caserío');
    if (town) {
      // Plaza central con pozo y mercado.
      const wy = this.heightAt(town.x, town.z);
      this.cylinder(ctx, town.x, wy + 0.7, town.z, 3, 1.4, 'concrete', true);
      this.cylinder(ctx, town.x, wy + 2.3, town.z, 0.3, 3, 'wood');
      this.box(ctx, town.x, wy + 4, town.z, 0.3, 0.4, 4, 'wood');
      ctx.loot.push(new THREE.Vector3(town.x + 3, wy + 1, town.z + 3));
      market(town.x - 11, town.z + 4, 0.2);
      market(town.x + 9, town.z - 8, 1.4);
      chapel(town.x - 13, town.z - 13, 0.35);
      this.makeTower(ctx, town.x + 17, town.z + 6, 13);

      // Tres anillos de casas apretadas forman calles estrechas y un casco real.
      const rings = [
        { count: 6, radius: 17, w: 8, d: 7 },
        { count: 9, radius: 28, w: 9, d: 7.5 },
        { count: 12, radius: 38, w: 10, d: 8 },
      ];
      const angle0 = rnd() * Math.PI * 2;
      let idx = 0;
      for (const ring of rings) {
        for (let i = 0; i < ring.count; i++) {
          const a = angle0 + (i / ring.count) * Math.PI * 2 + (rnd() - 0.5) * 0.12;
          const x = town.x + Math.cos(a) * ring.radius;
          const z = town.z + Math.sin(a) * ring.radius;
          const twoFloor = idx % 7 === 3;
          const gable = rnd() > 0.25;
          const windows = rnd() > 0.15;
          hut(x, z, ring.w + rnd() * 1.5, ring.d + rnd(), 3.1 + rnd() * 1.1,
            -a + Math.PI / 2 + (rnd() - 0.5) * 0.3,
            idx % 4 === 0 ? 'wall2' : idx % 3 === 0 ? 'wall' : 'wood', 'roof',
            { twoFloor, gable, windows });
          if (idx % 3 === 0) {
            const nx = Math.cos(a + Math.PI / 2);
            const nz = Math.sin(a + Math.PI / 2);
            crate(x + nx * 5, z + nz * 5, idx % 6 === 0 ? 'Crate_Metal' : 'Crate_Wooden');
            barrel(x - nx * 5, z - nz * 5);
          }
          if (idx % 5 === 0) {
            const bx = town.x + Math.cos(a) * (ring.radius - 5);
            const bz = town.z + Math.sin(a) * (ring.radius - 5);
            prop('Bench', bx, bz, -a);
            prop('Torch_Metal', bx + Math.cos(a) * 2, bz + Math.sin(a) * 2);
          }
          idx++;
        }
      }
      stoneWall(town.x, town.z, 47, -1.1, 1.5);
      stoneWall(town.x, town.z, 47, 2.0, 4.1);
      this.makeFence(ctx, town.x - 20, town.z + 43, town.x + 4, town.z + 43);
      addGroundSpots(town.x, town.z, 26, 30);
    }

    const lighthouse = byName('Faro');
    if (lighthouse) {
      const y = this.heightAt(lighthouse.x, lighthouse.z);
      this.cylinder(ctx, lighthouse.x, y + 4, lighthouse.z, 5.5, 8, 'concrete', true);
      this.cylinder(ctx, lighthouse.x, y + 12.5, lighthouse.z, 3, 9, 'metal', true);
      this.cylinder(ctx, lighthouse.x, y + 17.3, lighthouse.z, 3.8, 0.8, 'accent', true);
      this.cylinder(ctx, lighthouse.x, y + 19, lighthouse.z, 2.2, 2.6, 'glass');
      this.cylinder(ctx, lighthouse.x, y + 20.7, lighthouse.z, 2.8, 0.5, 'accent');
      hut(lighthouse.x - 14, lighthouse.z - 8, 9, 7, 3.2, 0.4, 'wall2');
      hut(lighthouse.x + 12, lighthouse.z - 12, 8, 7, 3, -0.5, 'wood');
      stoneWall(lighthouse.x, lighthouse.z, 18, -0.6, 2.4);
      for (let i = 0; i < 4; i++) crate(lighthouse.x + 8 + (i % 2) * 4, lighthouse.z + 6 + Math.floor(i / 2) * 4);
      prop('Torch_Metal', lighthouse.x - 4, lighthouse.z + 7);
      ctx.loot.push(new THREE.Vector3(lighthouse.x + 4, y + 1.2, lighthouse.z + 4));
      ctx.spawns.push(new THREE.Vector3(lighthouse.x + 5, y + 1.5, lighthouse.z + 5));
      addGroundSpots(lighthouse.x, lighthouse.z, 12, 16);
    }

    const ruins = byName('Ermita');
    if (ruins) {
      for (let i = 0; i < 20; i++) {
        const a = rnd() * Math.PI * 2;
        const r = rnd() * ruins.radius * 0.8;
        const x = ruins.x + Math.cos(a) * r;
        const z = ruins.z + Math.sin(a) * r;
        const y = this.heightAt(x, z);
        const h = 1.4 + rnd() * 4.6;
        this.box(ctx, x, y + h / 2, z, 2 + rnd() * 5.5, h, 0.8, rnd() > 0.5 ? 'wall2' : 'concrete', rnd() * Math.PI, true);
        if (rnd() > 0.45) ctx.loot.push(new THREE.Vector3(x + 2, y + 1, z + 2));
        ctx.spawns.push(new THREE.Vector3(x, y + 1.5, z));
      }
      // Arco y columnas de la ermita derruida.
      const ry = this.heightAt(ruins.x, ruins.z);
      for (const side of [-1, 1]) {
        this.cylinder(ctx, ruins.x + side * 3, ry + 3, ruins.z, 0.75, 6, 'concrete', true);
      }
      this.box(ctx, ruins.x, ry + 6.2, ruins.z, 7.5, 0.8, 1.2, 'wall2', 0, true);
      stoneWall(ruins.x, ruins.z, ruins.radius * 0.85, 0.3, 2.7);
      for (let i = 0; i < 4; i++) crate(ruins.x + 7 + (i % 2) * 4, ruins.z - 4 + Math.floor(i / 2) * 4, 'Crate_Wooden');
      prop('Torch_Metal', ruins.x - 6, ruins.z + 5);
      addGroundSpots(ruins.x, ruins.z, 14, 20);
    }

    const camp = byName('Palmeras');
    if (camp) {
      const angle0 = rnd() * Math.PI * 2;
      for (let i = 0; i < 6; i++) {
        const a = angle0 + (i / 6) * Math.PI * 2;
        hut(camp.x + Math.cos(a) * 15, camp.z + Math.sin(a) * 15, 6.5, 5.5, 2.8, a, 'wood');
      }
      const fy = this.heightAt(camp.x, camp.z);
      this.cylinder(ctx, camp.x, fy + 0.35, camp.z, 1.6, 0.7, 'rock', true);
      market(camp.x + 4, camp.z + 2, 1.1);
      for (let i = 0; i < 8; i++) {
        const x = camp.x + (i % 4) * 3.6 - 5;
        const z = camp.z - 8 + Math.floor(i / 4) * 3.6;
        if (i % 3 === 0) crate(x, z, 'FarmCrate_Apple');
        else barrel(x, z);
      }
      prop('Table_Large', camp.x - 7, camp.z + 6, 0.3);
      prop('Bench', camp.x - 7, camp.z + 9, 0.3);
      this.makeFence(ctx, camp.x - 21, camp.z + 19, camp.x + 21, camp.z + 19);
      addGroundSpots(camp.x, camp.z, 16, 18);
    }

    // Puntos de interés nuevos: huerta junto al caserío, cementerio junto a la
    // ermita, molino en la colina y un naufragio en la primera línea de costa.
    if (town) farmPlot(town.x + 46, town.z + 32, 0.35);
    if (ruins) graveyard(ruins.x - 36, ruins.z + 26, 0.4);

    let millSpot = null;
    for (let i = 0; i < 48; i++) {
      const a = rnd() * Math.PI * 2;
      const r = this.half * (0.12 + rnd() * 0.36);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const y = this.heightAt(x, z);
      if (y < this.waterLevel + 4 || this.nearPOI(x, z, 1.35) || this.nearRoad(x, z, 6)) continue;
      if (!millSpot || y > millSpot.y) millSpot = { x, z, y };
    }
    if (millSpot) windmill(millSpot.x, millSpot.z, rnd() * Math.PI);

    let wreckSpot = null;
    for (let i = 0; i < 900; i++) {
      const a = rnd() * Math.PI * 2;
      const r = this.half * (0.62 + rnd() * 0.2);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const y = this.heightAt(x, z);
      if (y < this.waterLevel + 0.5 || y > this.waterLevel + 2.6) continue;
      if (this.nearPOI(x, z, 1.1)) continue;
      wreckSpot = { x, z, a: a + Math.PI / 2 };
      break;
    }
    if (wreckSpot) shipwreck(wreckSpot.x, wreckSpot.z, wreckSpot.a);

    // Casas sueltas en montañas con loot garantizado.
    let mountainHuts = 0;
    for (let i = 0; i < 220 && mountainHuts < 18; i++) {
      const a = rnd() * Math.PI * 2;
      const r = this.half * (0.12 + rnd() * 0.62);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const y = this.heightAt(x, z);
      if (y < this.waterLevel + 7.5) continue;
      if (this.nearPOI(x, z, 0.8)) continue;
      if (this.nearRoad(x, z, 3)) continue;
      const rot = rnd() * Math.PI * 2;
      const w = 6 + rnd() * 4;
      const d = 5 + rnd() * 3.5;
      const h = 2.8 + rnd() * 0.8;
      hut(x, z, w, d, h, rot, rnd() > 0.5 ? 'wood' : 'wall2', 'roof', { windows: true, gable: rnd() > 0.3 });
      crate(x + 2.5, z + 1.5, rnd() > 0.5 ? 'Crate_Wooden' : 'FarmCrate_Apple');
      barrel(x - 2.5, z - 1.5, rnd() > 0.5 ? 'Barrel' : 'Barrel_Apples');
      ctx.loot.push(new THREE.Vector3(x + 1.2, y + 1, z + 1.2));
      ctx.loot.push(new THREE.Vector3(x - 1.8, y + 1, z + 0.8));
      ctx.spawns.push(new THREE.Vector3(x + 3.5, y + 1.5, z + 3.5));
      if (rnd() > 0.5) prop('Torch_Metal', x + 3.2, z - 2.2, rot);
      mountainHuts++;
    }

    // Cabañas aisladas, almacenes y botín disperso por el interior.
    for (let i = 0; i < 20; i++) {
      const a = rnd() * Math.PI * 2;
      const r = this.half * (0.16 + rnd() * 0.48);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (this.nearPOI(x, z, 1.2)) continue;
      if (this.heightAt(x, z) < this.waterLevel + 2) continue;
      if (rnd() > 0.38) hut(x, z, 6 + rnd() * 4, 5 + rnd() * 3, 2.8, rnd() * Math.PI * 2);
      else crate(x, z, rnd() > 0.5 ? 'Crate_Wooden' : 'Crate_Metal');
      if (rnd() > 0.5) barrel(x + 3, z + 2);
    }
    for (let i = 0; i < 70; i++) {
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd()) * this.half * 0.72;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const y = this.heightAt(x, z);
      if (y < this.waterLevel + 1.5) continue;
      ctx.loot.push(new THREE.Vector3(x, y + 1, z));
      ctx.spawns.push(new THREE.Vector3(x, y + 1.5, z));
    }
    // Props sueltos en caminos y claros: detalle constante por toda la isla.
    for (let i = 0; i < 68; i++) {
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd()) * this.half * 0.7;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (this.heightAt(x, z) < this.waterLevel + 1.2) continue;
      const pick = rnd();
      if (pick < 0.35) crate(x, z, 'Crate_Wooden');
      else if (pick < 0.6) barrel(x, z);
      else if (pick < 0.8) prop(rnd() > 0.5 ? 'Bag' : 'Bucket_Wooden_1', x, z, rnd() * 3);
      else prop('Shelf_Simple', x, z, rnd() * 3);
    }

    for (const [matKey, geos] of ctx.buckets) {
      if (!geos.length) continue;
      const merged = mergeGeometries(geos, false);
      for (const g of geos) g.dispose();
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, this.materials[matKey]);
      mesh.castShadow = !!this.settings.get('shadows');
      mesh.receiveShadow = !!this.settings.get('shadows');
      mesh.frustumCulled = false;
      this.structures.add(mesh);
      this.disposables.push(merged);
    }

    const inside = (v) => Math.hypot(v.x, v.z) < this.half * 0.82 && v.y > this.waterLevel + 0.4;
    this.lootSpots = ctx.loot.filter(inside);
    this.spawnPoints = ctx.spawns.filter(inside);
    while (this.spawnPoints.length < 20) {
      const a = rnd() * Math.PI * 2;
      const r = this.half * (0.2 + rnd() * 0.45);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      this.spawnPoints.push({ x, y: this.heightAt(x, z) + 1.5, z });
    }
  }

  generateRoads() {
    this.roadSegments.length = 0;
    this.roadCircles.length = 0;
    const pois = this.map.pois || [];
    const aniso = this.settings.get('anisotropy') || 4;
    const kinds = ['dirt', 'cobble', 'plank'];
    const materials = {};
    const buckets = { dirt: [], cobble: [], plank: [] };

    for (const kind of kinds) {
      const tex = makeRoadTexture(kind, this.seed + hashString(kind), aniso);
      const mat = new THREE.MeshStandardMaterial({
        map: tex, roughness: 0.98, metalness: 0,
        polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -2,
      });
      materials[kind] = mat;
      this.disposables.push(tex, mat);
    }

    /** Cinta de terreno que sigue la altura del suelo y se corta antes del agua. */
    const addRibbon = (points, kind, width, opts = {}) => {
      if (!points || points.length < 2) return;
      const verts = [];
      const uvs = [];
      const idxs = [];
      const used = [];
      let dist = 0;

      for (let i = 0; i < points.length; i++) {
        const p = points[i];
        const prev = points[Math.max(0, i - 1)];
        const next = points[Math.min(points.length - 1, i + 1)];
        let dx = next.x - prev.x;
        let dz = next.z - prev.z;
        const len = Math.hypot(dx, dz);
        if (len < 0.02) continue;
        dx /= len;
        dz /= len;
        if (i > 0) dist += Math.hypot(p.x - prev.x, p.z - prev.z);

        const centerY = this.heightAt(p.x, p.z);
        if (!opts.fixedY && centerY < this.waterLevel + 0.65) continue;
        const nx = -dz;
        const nz = dx;
        const sides = [];
        let valid = true;

        for (const side of [-1, 1]) {
          let half = width * 0.5;
          let ex = p.x + nx * half * side;
          let ez = p.z + nz * half * side;
          if (!opts.fixedY) {
            for (let k = 0; k < 5 && this.heightAt(ex, ez) < this.waterLevel + 0.45; k++) {
              half *= 0.72;
              ex = p.x + nx * half * side;
              ez = p.z + nz * half * side;
            }
          }
          const edgeY = this.heightAt(ex, ez);
          if (!opts.fixedY && edgeY < this.waterLevel + 0.35) { valid = false; break; }
          const y = opts.fixedY ?? (Math.max(centerY, edgeY) + 0.16);
          sides.push({ x: ex, y, z: ez });
        }
        if (!valid || sides.length !== 2) continue;

        for (const edge of sides) {
          verts.push(edge.x, edge.y, edge.z);
          uvs.push(sideOf(edge, sides[0]) === 0 ? 0 : 1, dist / 7);
        }
        used.push({ x: p.x, z: p.z });
      }

      for (let i = 1; i < used.length; i++) {
        this.roadSegments.push({
          x1: used[i - 1].x, z1: used[i - 1].z,
          x2: used[i].x, z2: used[i].z,
          width, kind,
        });
      }
      for (let i = 0; i < used.length - 1; i++) {
        const k = i * 2;
        idxs.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
      }
      if (!idxs.length) return;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex(idxs);
      geo.computeVertexNormals();
      buckets[kind].push(geo);
    };

    // UV lateral: el primer borde siempre es 0 y el segundo 1.
    const sideOf = (edge, first) => (edge === first ? 0 : 1);

    const sampleCurve = (waypoints, density = 0.7) => {
      if (!waypoints || waypoints.length < 2) return [];
      const vecs = waypoints.map((p) => new THREE.Vector3(p.x, 0, p.z));
      const curve = vecs.length === 2
        ? new THREE.LineCurve3(vecs[0], vecs[1])
        : new THREE.CatmullRomCurve3(vecs, false, 'catmullrom', 0.4);
      const steps = Math.max(12, Math.round(curve.getLength() * density));
      return curve.getPoints(steps).map((v) => ({ x: v.x, z: v.z }));
    };

    /** Desvía los puntos de control que caen en el mar hacia el interior. */
    const routeAroundWater = (a, b) => {
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len = Math.hypot(dx, dz) || 1;
      const steps = Math.max(2, Math.round(len / 16));
      const waypoints = [{ x: a.x, z: a.z }];
      for (let i = 1; i < steps; i++) {
        const t = i / steps;
        let x = lerp(a.x, b.x, t);
        let z = lerp(a.z, b.z, t);
        let y = this.heightAt(x, z);
        if (y < this.waterLevel + 2.4) {
          const m = Math.hypot(x, z) || 1;
          const ix = -x / m;
          const iz = -z / m;
          for (let k = 0; k < 9 && y < this.waterLevel + 2.4; k++) {
            x += ix * 5;
            z += iz * 5;
            y = this.heightAt(x, z);
          }
        }
        waypoints.push({ x, z });
      }
      waypoints.push({ x: b.x, z: b.z });
      return waypoints;
    };

    const dryRuns = (points) => {
      const runs = [];
      let run = [];
      for (const p of points) {
        if (this.heightAt(p.x, p.z) > this.waterLevel + 0.75) run.push(p);
        else if (run.length > 1) { runs.push(run); run = []; }
        else run = [];
      }
      if (run.length > 1) runs.push(run);
      return runs;
    };

    const addPath = (a, b, opts = {}) => {
      if (!a || !b) return;
      const waypoints = opts.detour
        ? [{ x: a.x, z: a.z }, ...opts.detour, { x: b.x, z: b.z }]
        : routeAroundWater(a, b);
      const points = sampleCurve(waypoints, opts.density ?? 0.7);
      for (const run of dryRuns(points)) addRibbon(run, opts.kind || 'dirt', opts.width ?? 6, opts);
    };

    const addLoop = (center, radius, opts = {}) => {
      if (!center) return;
      const segments = opts.segments ?? 64;
      const points = [];
      for (let i = 0; i <= segments; i++) {
        const a = (i / segments) * Math.PI * 2 + (opts.startAngle || 0);
        points.push({
          x: center.x + Math.cos(a) * radius,
          z: center.z + Math.sin(a) * radius,
        });
      }
      addRibbon(points, opts.kind || 'cobble', opts.width ?? 4.2, opts);
    };

    const addPlaza = (poi, radius) => {
      if (!poi) return;
      const geo = new THREE.CircleGeometry(radius, 40);
      geo.rotateX(-Math.PI / 2);
      geo.translate(poi.x, this.heightAt(poi.x, poi.z) + 0.18, poi.z);
      buckets.cobble.push(geo);
      this.roadCircles.push({ x: poi.x, z: poi.z, radius });
    };

    // Caminos modulares solo en ngcleos poblacionales (pueblo/puerto).
    const isNucleus = (p) => p && (p.type === 'town' || p.type === 'harbor');
    const links = this.map.roads || [];
    for (const [aIdx, bIdx] of links) {
      const a = pois[aIdx], b = pois[bIdx];
      if (isNucleus(a) && isNucleus(b)) {
        addPath(a, b, { kind: 'dirt', width: 5.8, density: 0.7 });
      }
    }

    const town = pois.find((p) => p.type === 'town');
    if (town) {
      addPlaza(town, 8.5);
      addLoop(town, 18, { kind: 'cobble', width: 4.4, segments: 36 });
      addLoop(town, 30, { kind: 'cobble', width: 4.0, segments: 40 });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.22;
        addPath(
          { x: town.x + Math.cos(a) * 8, z: town.z + Math.sin(a) * 8 },
          { x: town.x + Math.cos(a) * 34, z: town.z + Math.sin(a) * 34 },
          { kind: 'cobble', width: 3.4, density: 0.85 },
        );
      }
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.75;
        addPath(
          { x: town.x + Math.cos(a) * 12, z: town.z + Math.sin(a) * 12 },
          { x: town.x + Math.cos(a + 0.45) * 24, z: town.z + Math.sin(a + 0.45) * 24 },
          { kind: 'cobble', width: 3.0, density: 0.9 },
        );
      }
    }

    const harbor = pois.find((p) => p.type === 'harbor');
    if (harbor) {
      const m = Math.hypot(harbor.x, harbor.z) || 1;
      const ox = harbor.x / m;
      const oz = harbor.z / m;
      const planks = [];
      for (let i = 0; i <= 8; i++) {
        const d = 8 + i * 6;
        planks.push({ x: harbor.x + ox * d, z: harbor.z + oz * d });
      }
      addRibbon(planks, 'plank', 5.0, { fixedY: this.waterLevel + 1.38 });
      addLoop(harbor, 14, { kind: 'dirt', width: 3.8, segments: 36 });
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + 0.5;
        addPath(
          { x: harbor.x + Math.cos(a) * 6, z: harbor.z + Math.sin(a) * 6 },
          { x: harbor.x + Math.cos(a) * 18, z: harbor.z + Math.sin(a) * 18 },
          { kind: 'dirt', width: 3.2, density: 0.9 },
        );
      }
    }

    for (const kind of kinds) {
      const geos = buckets[kind];
      if (!geos.length) continue;
      const merged = mergeGeometries(geos, false);
      for (const g of geos) g.dispose();
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, materials[kind]);
      mesh.receiveShadow = !!this.settings.get('shadows');
      mesh.frustumCulled = false;
      this.root.add(mesh);
      this.disposables.push(merged);
    }
  }

  // ---------------------- Colisiones ----------------------

  collidersNear(x, z, radius = 6) {
    const out = new Set();
    const x0 = Math.floor((x - radius) / COLLIDER_CELL);
    const x1 = Math.floor((x + radius) / COLLIDER_CELL);
    const z0 = Math.floor((z - radius) / COLLIDER_CELL);
    const z1 = Math.floor((z + radius) / COLLIDER_CELL);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const list = this.colliderGrid.get(`${cx},${cz}`);
        if (list) for (const c of list) out.add(c);
      }
    }
    return out;
  }

  /** Resuelve colisión horizontal de un cilindro contra cajas estáticas. */
  resolveCollision(position, radius = 0.45, height = 1.8) {
    const foot = position.y;
    const head = foot + height;
    for (const c of this.collidersNear(position.x, position.z, radius + 2)) {
      if (head < c.minY || foot > c.maxY) continue;
      const closestX = clamp(position.x, c.minX, c.maxX);
      const closestZ = clamp(position.z, c.minZ, c.maxZ);
      let dx = position.x - closestX;
      let dz = position.z - closestZ;
      let dist = Math.hypot(dx, dz);
      if (dist >= radius) continue;
      if (dist < 1e-6) {
        // Dentro de la caja: empujar hacia la cara más cercana.
        const left = position.x - c.minX;
        const right = c.maxX - position.x;
        const back = position.z - c.minZ;
        const front = c.maxZ - position.z;
        const min = Math.min(left, right, back, front);
        if (min === left) position.x = c.minX - radius;
        else if (min === right) position.x = c.maxX + radius;
        else if (min === back) position.z = c.minZ - radius;
        else position.z = c.maxZ + radius;
        continue;
      }
      const push = (radius - dist) / dist;
      position.x += dx * push;
      position.z += dz * push;
    }
  }

  /** Primer impacto de bala contra mundo. Devuelve { distance, point, type }. */
  raycast(origin, dir, maxDist = 800) {
    let best = maxDist;
    let type = null;

    for (const c of this.collidersNear(origin.x, origin.z, 80)) {
      const t = rayAABB(origin, dir, { x: c.minX, y: c.minY, z: c.minZ }, { x: c.maxX, y: c.maxY, z: c.maxZ }, best);
      if (t > 0 && t < best) { best = t; type = 'structure'; }
    }

    // Terreno: marcha adaptativa + bisección.
    let t = 0;
    let prev = 0;
    while (t < best && t < maxDist) {
      const x = origin.x + dir.x * t;
      const y = origin.y + dir.y * t;
      const z = origin.z + dir.z * t;
      if (Math.abs(x) > this.half + 200 || Math.abs(z) > this.half + 200) break;
      if (y <= this.heightAt(x, z)) {
        let lo = prev;
        let hi = t;
        for (let i = 0; i < 10; i++) {
          const mid = (lo + hi) / 2;
          const mx = origin.x + dir.x * mid;
          const my = origin.y + dir.y * mid;
          const mz = origin.z + dir.z * mid;
          if (my <= this.heightAt(mx, mz)) hi = mid; else lo = mid;
        }
        best = hi;
        type = 'terrain';
        break;
      }
      prev = t;
      t += Math.max(0.8, t * 0.012);
    }

    if (!type) return null;
    const point = new THREE.Vector3(origin.x + dir.x * best, origin.y + dir.y * best, origin.z + dir.z * best);
    return { distance: best, point, type };
  }

  dispose() {
    for (const key of [...this.chunks.keys()]) this.removeChunk(key);
    this.root.removeFromParent();
    for (const d of this.disposables) d.dispose?.();
    this.colliders.length = 0;
    this.colliderGrid.clear();
  }
}
