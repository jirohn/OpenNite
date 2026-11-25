import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clamp, fbm, hash2, hashString, lerp, makeRandom, noise2, rayAABB, smoothstep } from '../core/utils.js';
import { buildWaterSurfaces, createWaterLevels } from '../core/water-surface.mjs';
import { getCartoonGradient, saturateColor } from '../core/cartoon.mjs';
import { ZeldaGrassSystem, createWindGizmo } from './grass.mjs';
import { WorldDebug } from './debug.js';
import { BUILD_PIECES, KIT_BASE_PATH, KIT_CATALOG, KIT_FLOOR_H, KIT_MODULE, KIT_SLAB_H, KIT_WALL_H, KIT_WALL_VIS_Y, cloneKitPiece, isGlassMaterial, kitPieceGameplayColliders, loadBuildingKit, rotLocalBoxToWorld, tintKitPiece } from './kit-pieces.js';
import {
  GRID_SIZE,
  FLOOR_HEIGHT,
  GRID_HEIGHT_STEP,
  ROAD_CELL_SIZE,
  snapToGrid,
  snapHeight,
  snapFloor,
  normalizeMapData,
  buildRoadNetwork,
  evaluateTerrainHeight,
} from '../core/map-system.mjs';
import { modularHeightAt, modularMinNear, normalizeModularTerrain } from '../core/modular-terrain.mjs';
import { buildModularTerrainMesh } from '../core/modular-terrain-mesh.mjs';
import { EgdTerrain, EGD_TILE_TYPES } from '../core/egd-terrain.mjs';
import { egdWaterCells, egdPieceToEntity } from '../core/egd-map.mjs';
import { egdBuildEntityObject } from '../core/egd-objects.mjs';

/** Altura fuera del mundo de EGD (el vacío): se cae al agua/vacío como en el motor. */
const EGD_VOID_Y = -30;


const CHUNK_SIZE = 256;
const CHUNK_SEGMENTS = 24;
const COLLIDER_CELL = 96;

const THEMES = {
  temperate: {
    grass: 0x54ab34, grass2: 0x76c944, high: 0x98a876, rock: 0x7e847c, sand: 0xf1df9e,
    water: 0x1db7cc, wall: 0xe0d6c2, wall2: 0xc8bc9e, roof: 0xa4523c, wood: 0x825c38,
    metal: 0x6e7a88, glass: 0xa6e0ee, concrete: 0xa2a49f, accent: 0xe88a38, dark: 0x3e454b,
    tree: 0x2e763e, tree2: 0x4fa04a, sky: 0x8ec8f2, sun: 1.6,
  },
  desert: {
    grass: 0xd2a460, grass2: 0xe4c278, high: 0xc99658, rock: 0xa8784d, sand: 0xf2d69e,
    water: 0x3ab0b8, wall: 0xe2c698, wall2: 0xc6a472, roof: 0x9e6240, wood: 0x7e5838,
    metal: 0x80776b, glass: 0xb5d4cf, concrete: 0xc5b498, accent: 0xe07840, dark: 0x4f443b,
    tree: 0x7a8e56, tree2: 0x99a660, sky: 0xdfcb9a, sun: 2.5,
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

const THEME_COLOR_KEYS = ['grass', 'grass2', 'high', 'rock', 'sand', 'water', 'wall', 'wall2', 'roof', 'wood', 'metal', 'glass', 'concrete', 'accent', 'dark', 'tree', 'tree2', 'sky'];
function saturateTheme(theme) {
  const out = { ...theme };
  for (const key of THEME_COLOR_KEYS) {
    if (Number.isFinite(theme[key])) out[key] = saturateColor(theme[key], 0.32).getHex();
  }
  return out;
}

/** Color del sub-bioma que aparece en zonas del mismo mapa. */
const SUBBIOME = {
  temperate: 0x2f5d38,
  desert: 0x93663c,
  snow: 0x7593a4,
  autumn: 0x6d422b,
};

/**
 * Paleta cerrada del terreno. El fragment shader vuelve a snapear el color
 * interpolado al color más cercano: no hay degradados ni texturas, solo
 * manchas planas de dibujo animado.
 */
const TERRAIN_PALETTES = {
  temperate: [0xfff1cf, 0x4fa343, 0x71bd52, 0x367f37, 0x8a6242, 0x7b7770, 0x553b30, 0x2f2b2a, 0xf2f7fb],
  desert: [0xfff1cf, 0x86a24a, 0xa9bb60, 0x62853d, 0x9a6a3e, 0x8c8070, 0x5b3c2e, 0x332b28, 0xf2f7fb],
  snow: [0xf3f8fb, 0x5c9b55, 0x7abb67, 0x3f7742, 0x806f5c, 0x8994a0, 0x5b4b45, 0x34383c, 0xffffff],
  autumn: [0xfff1cf, 0x74933f, 0x97ad52, 0x50763a, 0x8a5c3a, 0x81786e, 0x5a3c2c, 0x302a28, 0xf2f7fb],
};

function terrainPalette(theme) {
  return (TERRAIN_PALETTES[theme] || TERRAIN_PALETTES.temperate).map((hex) => new THREE.Color(hex));
}

/** Textura normal tileable de agua: detalle real que se desplaza con las ondas. */
function makeWaterDetailTexture() {
  const size = 128;
  const data = new Uint8Array(size * size * 4);
  const tau = Math.PI * 2;
  const height = (u, v) => (
    Math.sin(u * tau * 3 + Math.sin(v * tau * 2) * 0.6) * 0.34
    + Math.sin(v * tau * 5 - Math.cos(u * tau * 2) * 0.4) * 0.25
    + Math.sin((u + v) * tau * 4) * 0.18
    + Math.sin((u - v) * tau * 7) * 0.1
  );
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const dx = (height((x + 1) / size, v) - height((x - 1 + size) / size, v)) * 3.2;
      const dz = (height(u, (y + 1) / size) - height(u, (y - 1 + size) / size)) * 3.2;
      const inv = 1 / Math.sqrt(dx * dx + 1 + dz * dz);
      const i = (y * size + x) * 4;
      data[i] = Math.round((-dx * inv * 0.5 + 0.5) * 255);
      data[i + 1] = Math.round((inv * 0.5 + 0.5) * 255);
      data[i + 2] = Math.round((-dz * inv * 0.5 + 0.5) * 255);
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

const WATER_DETAIL_UNIFORMS = `
uniform sampler2D tDetail;
uniform float uDetailScale;
`;

const WATER_DETAIL_NORMAL = `
  vec2 detailUv = vWorld.xz * uDetailScale;
  vec3 detailA = texture2D(tDetail, detailUv + vec2(uTime * 0.028, -uTime * 0.019)).rgb * 2.0 - 1.0;
  vec3 detailB = texture2D(tDetail, detailUv * 1.73 + vec2(-uTime * 0.021, uTime * 0.033)).rgb * 2.0 - 1.0;
  n = normalize(n + vec3(detailA.x * 0.58 + detailB.x * 0.32, 0.0, detailA.z * 0.58 + detailB.z * 0.32));
  float detailLight = detailA.y * 0.5 + 0.5;
`;

/** Profundidad del terreno bajo el agua, muestreada desde un heightmap 16-bit. */
const WATER_DEPTH_UNIFORMS = `
uniform sampler2D tDepth;
uniform vec2 uDepthExtent;
uniform vec2 uDepthRes;
uniform float uDepthMin;
uniform float uDepthRange;
uniform float uSurfaceY;
uniform float uSeaLevel;
uniform float uIsSea;
`;

const WATER_DEPTH_FUNCS = `
  float decodeDepth(vec2 uv) {
    vec4 e = texture2D(tDepth, uv);
    return (e.r + e.g / 255.0) * uDepthRange + uDepthMin;
  }
  float bedAt(vec2 xz) {
    vec2 uv = clamp((xz + uDepthExtent) / (2.0 * uDepthExtent), vec2(0.002), vec2(0.998));
    vec2 p = uv * uDepthRes - 0.5;
    vec2 f = fract(p);
    vec2 b = (floor(p) + 0.5) / uDepthRes;
    float h00 = decodeDepth(b);
    float h10 = decodeDepth(b + vec2(1.0 / uDepthRes.x, 0.0));
    float h01 = decodeDepth(b + vec2(0.0, 1.0 / uDepthRes.y));
    float h11 = decodeDepth(b + vec2(1.0 / uDepthRes.x, 1.0 / uDepthRes.y));
    return mix(mix(h00, h10, f.x), mix(h01, h11, f.x), f.y);
  }
`;

const WATER_DEPTH_COLOR = `
  float waterDepth = max(0.0, uSurfaceY - bedAt(vWorld.xz));
  float shoreT = 1.0 - smoothstep(0.0, 4.0, waterDepth);
  float seaBlend = uIsSea > 0.5 ? 1.0 : (1.0 - smoothstep(0.5, 10.0, uSurfaceY - uSeaLevel));
  float lakeDeepT = smoothstep(0.3, 4.5, waterDepth);
  float seaDeepT = smoothstep(1.0, 24.0, waterDepth);
  float deepT = mix(lakeDeepT, seaDeepT, seaBlend);

  // Paleta Zelda: Tears of the Kingdom (turquesa laguna cristalina y zafiro profundo)
  vec3 seaShallow = vec3(0.16, 0.84, 0.92);
  vec3 seaDeep = vec3(0.015, 0.16, 0.38);
  vec3 lakeShallow = vec3(0.24, 0.88, 0.68);
  vec3 lakeDeep = vec3(0.02, 0.36, 0.42);
  vec3 shallowCol = mix(lakeShallow, seaShallow, seaBlend);
  vec3 deepCol = mix(lakeDeep, seaDeep, seaBlend);
  vec3 baseCol = mix(shallowCol, deepCol, deepT);

  // Espuma de orilla dinámica estilizada Zelda TotK
  float foamWave = sin(uTime * 3.4 - waterDepth * 7.5) * 0.5 + 0.5;
  float foamNoise = sin(vWorld.x * 0.8 + uTime * 2.0) * cos(vWorld.z * 0.8 - uTime * 1.6) * 0.08;
  float foamEdge = smoothstep(0.55, 0.02, waterDepth + foamNoise);
  float shoreFoam = foamEdge * (0.65 + foamWave * 0.35);

  // Líneas de ondas / caústicas estilizadas cel-shaded
  float waveA = sin(vWorld.x * 0.28 + vWorld.z * 0.22 + uTime * 1.8);
  float waveB = cos(vWorld.x * 0.18 - vWorld.z * 0.30 - uTime * 1.4);
  float causticRibbon = smoothstep(0.76, 0.88, waveA * waveB) * (1.0 - smoothstep(1.5, 14.0, waterDepth));
`;

/** Material toon estilizado del terreno estilo Zelda TotK: vertex colors limpios con toon ramp. */
function makeTerrainMaterial(palette) {
  const mat = new THREE.MeshToonMaterial({
    color: 0xffffff,
    vertexColors: true,
    gradientMap: getCartoonGradient(),
    flatShading: false,
  });
  mat.customProgramCacheKey = () => 'opennite-terrain-totk-v3';
  return mat;
}

/** Objetos del Stylized Nature MegaKit usados en San Borondon (unidades â‰ˆ metros). */
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

/** Texturas 2D generadas por cÃ³digo: detalle real sin assets de terceros. */
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
    // Detalle de terreno / hormigÃ³n: gris neutro que multiplica el vertex color.
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

/** Texturas de calzada generadas por cÃ³digo (tierra, adoquines y tablones). */
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

/** Ãrboles completos (tronco + copa en varias capas) en una sola geometrÃ­a. */
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
    // Copa redonda de varios volÃºmenes.
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
    const norm = normalizeMapData(map);
    this.map = norm;
    this.settings = settings;
    this.seed = (norm.seed || 1) >>> 0;
    this.size = norm.size || 360;
    this.half = this.size / 2;
    this.theme = saturateTheme(THEMES[norm.theme] || THEMES.temperate);
    this.subBiomeColor = new THREE.Color(SUBBIOME[norm.theme] || SUBBIOME.temperate);
    this.chunks = new Map();
    this.chunkQueue = new Map();
    this.colliders = [];
    this.colliderGrid = new Map();
    this.terrainFlats = []; // {x,z,hw,hd,rot,y,blend} - zonas aplanadas para edificios/caminos
    this.heightOverrides = norm.terrain?.heights || new Map();
    this.pieceRounding = 0.5; // redondeo de bordes expuestos de bloques painterosos (0-1), default 50%
    this.heightSmooths = norm.terrain?.smooths || new Map();
    this.heightOverrideCell = norm.terrain?.cell || GRID_SIZE;
    // Terreno modular por teselas (null si el mapa no lo usa). Ver core/modular-terrain.mjs.
    this.modular = norm.modular || null;
    this.modularMesh = null;
    // Terreno de Easy Game Developer (mapas egd-map). Ver core/egd-terrain.mjs.
    this.egdWorld = null;
    this.egdTerrain = null;
    this.islandFlat = !!norm.islandFlat || norm.base === 'test'; // editor: isla plana a 0, solo agua.
    this.terrainStyle = norm.terrainStyle || 'blocky'; // blocky | smooth | ramp | stairs
    this.terrainGridStep = norm.terrainGridStep || 2;
    this.roadNetwork = new Map();
    this.waterPatches = []; // {x,z,radius} lagos/agua pintada en editor
    this.waterCells = norm.waterCells || new Map();
    this.waterVegetation = norm.waterVegetation ?? 0.6;
    this.waterVegCells = new Map(); // "gx,gz" -> 0..1 (cantidad por celda)
    this.seaweedMesh = null;
    this._seaweedUniforms = null;
    this.waterMaterials = []; // materiales de agua para animar uTime
    this.waterMeshes = []; // superficies/cascadas que se ocultan en el pase de refracción
    this.bubbleSystems = []; // burbujas 3D al entrar la camara/el personaje en el agua
    this.splashDrops = []; // gotas 3D al salir del agua
    this.ripples = [];
    this._rippleData = [];
    this._waterTime = 0;
    this.waterfalls = [];
    this.waterfallMesh = null;
    this.waterfallFoamMesh = null;
    this.waterfallParticles = null;
    /** Debug overlay: colores de colisionadores/ejes (activado con F5). */
    this.debug = null;
    this.lootSpots = [];
    this.chestSpots = [];
    this.weaponSpawnSpots = [];
    this.spawnPoints = [];
    this.pois = [];
    this.jumpPads = [];
    this.roadSegments = [];
    this.roadCircles = [];
    this.doors = [];
    this.glassPanels = [];
    this.disposables = [];
    this._customModelCache = new Map();
    this.renderDistance = 320;
    this.detailDistance = 180;
    this._detailGroups = [];
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

    // San Borondon es un mapa procedural pequeÃ±o; el antiguo mapa GLB sigue
    // soportado por si queda instalado en algÃºn equipo.
    this.training = map.type === 'training';
    this.procedural = map.type !== 'glb' && !this.training;
    this.gridSize = map.gridSize || 4;
    this.gridSnap = map.gridSnap !== false;
    this.useKitAssets = this.procedural && map.useKitAssets !== false;
    this.kitBase = map.modelBase || './models/quaternius/glTF/';
    this.propBase = map.propBase || './models/quaternius/props/glTF/';
    this.kitModels = {};
    this.propModels = {};
    this.propRequests = [];
    // Kit modular de construcciÃ³n (paredes/suelos/techos/escaleras) y piezas sandbox.
    this.buildKitBase = map.buildKitBase || KIT_BASE_PATH;
    this.buildKitModels = {};
    this.buildKitReady = null;

    if (this.procedural) {
      this.waterLevel = map.waterLevel ?? 0;
      this.waterLevelTarget = this.waterLevel;
      this.waterLevelAuto = !!map.waterLevelAuto;
      this.waterLevelMin = map.waterLevelMin ?? -20;
      this.waterLevelMax = map.waterLevelMax ?? 12;
      this.waterLevelDuration = Math.max(0.5, map.waterLevelDuration ?? 6);
      this.waterLevelPhase = map.waterLevelPhase ?? 0;
      this.biome = map.biome || {};
      this.mountainHeight = this.biome.mountainHeight ?? 26;
      const q = this.settings.get('quality') || 'medium';
      this.chunkSegments = { low: 10, medium: 14, high: 18, ultra: 24 }[q] || 14;
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
    if (this.training) return this.loadTraining();
    if (this.procedural) return this.loadIsland();
    return this.loadGlb();
  }

  async loadTraining() {
    this.waterLevel = -100;
    const groundSize = Math.max(120, Math.min(this.size || 240, 320));
    const g = new THREE.Mesh(
      new THREE.PlaneGeometry(groundSize, groundSize),
      new THREE.MeshStandardMaterial({ color: 0x5f6672, roughness: 0.95, metalness: 0.05 })
    );
    g.rotation.x = -Math.PI / 2;
    g.receiveShadow = true;
    this.root.add(g);
    this.disposables.push(g.geometry, g.material);

    const grid = new THREE.GridHelper(groundSize, groundSize / 4, 0x8ea0b5, 0x707a86);
    grid.position.y = 0.01;
    this.root.add(grid);
    this.disposables.push(grid.geometry, grid.material);

    const mkMat = (c, o = 0.95, r = 0.7, m = 0.05) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m, transparent: o < 1, opacity: o });
    const addBlock = (x, y, z, w, h, d, mat, collide = true) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.position.set(x, y + h / 2, z);
      mesh.castShadow = true; mesh.receiveShadow = true;
      this.root.add(mesh);
      this.disposables.push(mesh.geometry, mesh.material);
      if (collide) this.addCollider(x - w / 2, x + w / 2, y, y + h, z - d / 2, z + d / 2);
      return mesh;
    };

    const wallMat = mkMat(0x8a96a3, 0.92, 0.85);
    const blockMat = mkMat(0x728096, 0.95, 0.8);
    const accentMat = mkMat(0x4fa8ff, 0.35, 0.2, 0.1);
    const hs = groundSize / 2 - 2, wh = 4, wt = 1;
    addBlock(0, 0, -hs, groundSize, wh, wt, wallMat);
    addBlock(0, 0, hs, groundSize, wh, wt, wallMat);
    addBlock(-hs, 0, 0, wt, wh, groundSize, wallMat);
    addBlock(hs, 0, 0, wt, wh, groundSize, wallMat);

    const blocks = [
      [-18,0,-18,4,2,4],[-10,0,-18,4,2,4],[-2,0,-18,4,4,4],[6,0,-18,8,2,2],[16,0,-18,4,2,4],
      [-20,0,-6,2,3,10],[-8,0,-4,6,2,2],[4,0,-6,2,4,8],[14,0,-4,8,2,2],[22,0,-6,2,3,10],
      [-16,0,8,6,2,6],[-4,0,10,4,4,2],[6,0,8,6,2,6],[18,0,10,4,2,8],
      [-10,0,22,10,2,2],[8,0,22,10,2,2],[0,0,28,4,2,4],
    ];
    for (const [x, y, z, w, h, d] of blocks) addBlock(x, y, z, w, h, d, blockMat);

    for (let i = 0; i < 4; i++) addBlock(-28 + i * 2, 0, 14 - i * 2, 2, 0.6 * (i + 1), 2, mkMat(0x93a1b0));
    for (let i = 0; i < 4; i++) addBlock(28 - i * 2, 0, 14 - i * 2, 2, 0.6 * (i + 1), 2, mkMat(0x93a1b0));

    for (const [x, z] of [[-20, -24], [20, -24], [0, -30], [-28, 0], [28, 0]]) {
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.08, 24), accentMat.clone());
      pad.position.set(x, 0.04, z); pad.receiveShadow = true; this.root.add(pad);
      this.disposables.push(pad.geometry, pad.material);
    }

    this.spawnPoints = [
      { x: 0, y: 0, z: 34 }, { x: -6, y: 0, z: 34 }, { x: 6, y: 0, z: 34 }, { x: -12, y: 0, z: 30 }, { x: 12, y: 0, z: 30 },
      { x: 0, y: 0, z: 26 }, { x: -18, y: 0, z: 20 }, { x: 18, y: 0, z: 20 }
    ];
    this.lootSpots = [];
    this.chestSpots = [];
    this.weaponSpawnSpots = [];
    this.pois = [];
    this.loaded = true;
  }

  /** Isla pequeÃ±a hecha con terreno propio y objetos del Stylized Nature MegaKit. */
  async loadIsland() {
    let customData = this.map;
    let customPieces = Array.isArray(customData?.pieces) ? customData.pieces : null;
    if ((!customPieces || !customPieces.length) && (this.map.id === 'custom-map' || this.map.id === 'test-map')) {
      const fetched = await this.fetchCustomPieces();
      if (fetched) {
        customData = normalizeMapData(fetched);
        customPieces = customData.pieces;
      }
    }
    this.customPieces = customPieces && customPieces.length ? customPieces : null;
    this._applyCustomTerrainData(customData);
    this.roadNetwork = buildRoadNetwork(this.customPieces || [], (x, z) => this.rawHeightAt(x, z));
    console.info('[World] map loaded:', { id: this.map.id, pieces: this.customPieces?.length || 0, heightOverrides: this.heightOverrides.size, roads: this.roadNetwork.size, modularCells: this.modular?.cells.size || 0 });
    if ((this.customPieces && this.customPieces.length) || this.modular || this.egdWorld) {
      // Alta resoluciÃ³n para celdas de 2u y suavizado por tile
      this.chunkSegments = 128;
      // Mapa limpio del editor: terreno + agua + piezas personalizadas + naturaleza zonificada.
      this.setupWater();
      this._buildWaterPatches();
      const range = Math.ceil(this.half / CHUNK_SIZE) + 1;
      if (!this.egdWorld) {
        for (let cx = -range; cx <= range; cx++) {
          for (let cz = -range; cz <= range; cz++) this.createChunk(cx, cz);
        }
      }
      this._buildModularTerrain();
      this._showEgdTerrain();
      // Mapa pequeÃ±o ya precargado: evitar streaming/churn de chunks en runtime.
      this.staticChunks = true;
      if (this.useKitAssets) {
        await Promise.all([this.loadKitModels(), this.loadBuildKit()]);
        // Solo se colocan las piezas guardadas en el mapa: no se genera
        // vegetación, cofres ni loot aleatorio. El agua sí lleva su algas.
        await this.placeCustomPieces(this.customPieces || []);
        this.placeUnderwaterVegetation();
        this.placePropObjects();
      } else {
        await this.loadBuildKit();
        await this.placeCustomPieces(this.customPieces || []);
      }
      this.generateLootForCustomMap(this.customPieces || []);
    } else {
      this.generateRoads();
      this.generateSanBorondonLandmarks();
      this.setupWater();
      this._buildWaterPatches();
      this.setupJumpPads();

      const range = Math.ceil(this.half / CHUNK_SIZE) + 1;
      for (let cx = -range; cx <= range; cx++) {
        for (let cz = -range; cz <= range; cz++) this.createChunk(cx, cz);
      }
      this.staticChunks = true;

      if (this.useKitAssets) {
        await Promise.all([this.loadKitModels(), this.loadBuildKit()]);
        this.placeUnderwaterVegetation();
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
        console.warn('No se pudo cargar el kit de construcciÃ³n:', e);
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
    const def = KIT_CATALOG[kitName];
    if (def?.role === 'window') {
      obj.traverse((o) => { if (o.isMesh) { const m = o.material; const mats = Array.isArray(m) ? m : [m]; if (mats.some(isGlassMaterial)) o.visible = false; } });
    }
    const tall = def && (def.role === 'wall' || def.role === 'door' || def.role === 'window' || def.role === 'stairs' || def.role === 'column');
    const sy = tall ? KIT_WALL_VIS_Y : 1;
    obj.position.set(lx, ly, lz);
    obj.rotation.y = ry;
    if (sy !== 1) obj.scale.set(1, sy, 1);
    parent.add(obj);
    if (collide) {
      const bx = wx ?? lx, by = wy ?? ly, bz = wz ?? lz, br = wrot ?? ry;
      const cols = kitPieceGameplayColliders(kitName, bx, by, bz, br, sy);
      for (const c of cols) this.addCollider(c.minX, c.maxX, c.minY, c.maxY, c.minZ, c.maxZ, c.role ? { role: c.role, windowSillY: c.windowSillY, windowTopY: c.windowTopY } : null);
      if (def?.role === 'door') this.registerDoor(kitName, bx, by, bz, br, sy);
      if (def?.role === 'window') this.registerWindowGlass(kitName, bx, by, bz, br, sy);
    }
    return obj;
  }

  getNatureZone(x, z) {
    if (!this.procedural) return 'terrain';
    const y = this.heightAt(x, z);
    const coast = y - (this.waterLevel || 0);
    // Distancia normalizada a "costa" (donde el terreno estÃ¡ cerca del nivel del agua).
    const shore = coast < 3.2;
    const n = noise2(x * 0.018 + 40, z * 0.018 - 25, this.seed + 881);
    const n2 = noise2(x * 0.006 - 15, z * 0.006 + 60, this.seed + 177);
    if (shore) return 'beach';
    // Bosques en zonas interiores con patrÃ³n orgÃ¡nico; evitar picos muy altos/rocosos.
    const interior = coast > 3.5 && coast < 18;
    const forestMask = n * 0.65 + n2 * 0.35;
    if (interior && forestMask > 0.46) return 'forest';
    // PequeÃ±os claros y praderas en terreno general
    return forestMask > 0.62 ? 'forest' : 'terrain';
  }

  /** Coloca naturaleza Quaternius por zonas: bosque, terreno general y playa. */
  placeNatureZones() {
    const density = Math.min(1, Math.max(0, this.settings.get('vegetation') ?? 1));
    if (density <= 0) return;
    const shadows = !!this.settings.get('shadows');
    const dummy = new THREE.Object3D();
    const materials = new Set();
    const has = (name) => this.kitModels?.[name]?.length;
    const pick = (list) => list.filter(has);
    const rnd = makeRandom(this.seed ^ 0x51a7c);

    // VersiÃ³n ligera para carga/runtime: conteos y muestreos acotados.
    const d = Math.max(0.3, density);
    const zones = {
      beach: {
        tries: 300, density: 0.5,
        models: [
          { names: pick(['Rock_Medium_1','Rock_Medium_2','Pebble_Round_1']), count: Math.round(24 * d), scale: [0.5, 1.1], y: 0.05 },
          { names: pick(['Grass_Common_Short','Grass_Wispy_Tall']), count: Math.round(36 * d), scale: [0.7, 1.15], y: 0 },
        ],
      },
      forest: {
        tries: 650, density: 0.9,
        models: [
          { names: pick(['CommonTree_1','CommonTree_2']), count: Math.round(55 * d), scale: [0.85, 1.2], y: 0, shadow: true },
          { names: pick(['Pine_1','Pine_2']), count: Math.round(35 * d), scale: [0.8, 1.15], y: 0, shadow: true },
          { names: pick(['Bush_Common','Bush_Common_Flowers']), count: Math.round(28 * d), scale: [0.6, 1.05], y: 0 },
          { names: pick(['Grass_Common_Short','Grass_Wispy_Tall','Fern_1']), count: Math.round(55 * d), scale: [0.6, 1.2], y: 0 },
          { names: pick(['Rock_Medium_1','Rock_Medium_2']), count: Math.round(14 * d), scale: [0.45, 0.85], y: 0.05 },
        ],
      },
      terrain: {
        tries: 450, density: 0.45,
        models: [
          { names: pick(['CommonTree_1','Pine_1']), count: Math.round(16 * d), scale: [0.8, 1.1], y: 0, shadow: true },
          { names: pick(['Bush_Common']), count: Math.round(18 * d), scale: [0.6, 1.0], y: 0 },
          { names: pick(['Grass_Common_Short','Grass_Wispy_Tall']), count: Math.round(40 * d), scale: [0.6, 1.15], y: 0 },
          { names: pick(['Rock_Medium_1','Rock_Medium_3']), count: Math.round(16 * d), scale: [0.5, 1.0], y: 0.06 },
        ],
      },
    };

    // Precomputar posiciones candidatas por zona (coste acotado).
    const buckets = { beach: [], forest: [], terrain: [] };
    const totalTries = Math.floor((zones.beach.tries + zones.forest.tries + zones.terrain.tries) * d);
    for (let i = 0; i < totalTries; i++) {
      const a = rnd() * Math.PI * 2;
      const r = this.half * (0.05 + Math.sqrt(rnd()) * 0.9);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (Math.abs(x) > this.half - 6 || Math.abs(z) > this.half - 6) continue;
      const zone = this.getNatureZone(x, z);
      const cap = zones[zone].tries;
      if (buckets[zone].length >= cap) continue;
      const y = this.heightAt(x, z);
      const wy = this.waterYAt ? this.waterYAt(x, z) : (this.waterLevel ?? -100);
      if (wy > -20 && y < wy + 0.4) continue;
      if (this.nearRoad(x, z, 2.2)) continue;
      buckets[zone].push({ x, y, z });
    }

    const placeGroup = (zoneName, groupDef) => {
      const { names, count, scale, y: yOff = 0 } = groupDef;
      if (!names || !names.length || count <= 0) return;
      const pts = buckets[zoneName];
      if (!pts.length) return;
      const target = Math.max(0, Math.round(count * (zones[zoneName].density || 1)));
      if (!target) return;
      for (let m = 0; m < names.length; m++) {
        const name = names[m];
        const parts = this.kitModels[name];
        if (!parts?.length) continue;
        const share = Math.max(1, Math.ceil(target / names.length));
        const meshes = parts.map(({ geometry, material }) => {
          const mesh = new THREE.InstancedMesh(geometry, material, share);
          mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
          mesh.castShadow = shadows && groupDef.shadow === true;
          mesh.receiveShadow = shadows;
          this.root.add(mesh);
          this.disposables.push(geometry);
          materials.add(material);
          return mesh;
        });
        let placed = 0;
        for (let i = 0; i < share; i++) {
          const p = pts[(rnd() * pts.length) | 0];
          let ok = !!p;
          let px = 0, py = 0, pz = 0;
          if (ok) {
            px = p.x + (rnd() - 0.5) * 1.4;
            pz = p.z + (rnd() - 0.5) * 1.4;
            py = this.heightAt(px, pz);
            const wy = this.waterYAt ? this.waterYAt(px, pz) : (this.waterLevel ?? -100);
            if (wy > -20 && py < wy + 0.3) ok = false;
            else if (this.collidesAt(px, pz, py, groupDef.shadow ? 1.4 : 0.8)) ok = false;
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
        if (placed === 0) { /* zona sin espacio */ }
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

  /** Raycast bajo el agua + algas instanciadas que se balancean al pasar. */
  placeUnderwaterVegetation() {
    if (this.seaweedMesh) {
      this.root.remove(this.seaweedMesh);
      this.seaweedMesh.geometry.dispose();
      this.seaweedMesh.material.dispose();
      this.seaweedMesh = null;
    }
    const density = this.settings?.get('vegetation') ?? 1;
    if (density <= 0 || !this.waterCells?.size) return;
    if (this.egdWorld) return; // los mapas de EGD no llevan algas (igual que en el motor)

    const rnd = makeRandom((this.seed ^ 0x5ea7eed) >>> 0);
    const down = new THREE.Vector3(0, -1, 0);
    const candidates = [];
    const maxPlants = 900;
    for (const [key, waterRaw] of this.waterCells) {
      const waterY = Number(waterRaw);
      if (!Number.isFinite(waterY) || waterY <= -20) continue;
      const amount = clamp(this.waterVegCells.get(key) ?? this.waterVegetation, 0, 1) * density;
      if (amount <= 0.02) continue;
      const comma = key.indexOf(',');
      const gx = Number(key.slice(0, comma)), gz = Number(key.slice(comma + 1));
      const cell = this.heightOverrideCell || 2;
      const count = Math.max(1, Math.round(amount * 4));
      for (let i = 0; i < count; i++) {
        const x = gx * cell + (rnd() - 0.5) * cell * 0.85;
        const z = gz * cell + (rnd() - 0.5) * cell * 0.85;
        const bedApprox = this.heightAt(x, z);
        if (!Number.isFinite(bedApprox) || bedApprox > waterY - 0.35) continue;
        const hit = this.raycast(new THREE.Vector3(x, waterY + 0.15, z), down, waterY - bedApprox + 4);
        if (hit && hit.type !== 'terrain') continue;
        const bedY = hit?.type === 'terrain' ? hit.point.y : bedApprox;
        if (bedY > waterY - 0.35 || bedY < waterY - 45) continue;
        candidates.push({
          x, y: bedY, z,
          phase: rnd() * Math.PI * 2,
          scale: 0.7 + rnd() * 1.5,
        });
      }
    }
    const total = Math.min(candidates.length, maxPlants);
    if (!total) return;

    // Un alga = una sola tira SVG en 3D, a doble cara, con 13 filas x 6
    // columnas: contorno verde oscuro, interior verde claro y agujeros.
    const rows = 13, cols = 6;
    const positions = [], uvs = [], colors = [], indices = [];
    const edgeColor = new THREE.Color(0x0e4a20);
    const midColor = new THREE.Color(0x2f9134);
    const coreColor = new THREE.Color(0x8ae45a);
    for (let r = 0; r <= rows; r++) {
      const t = r / rows;
      const width = (1 - t) * 0.22 + 0.016;
      const meander = Math.sin(t * Math.PI * 3.2) * 0.055 * (0.35 + t)
        + Math.sin(t * Math.PI * 7.3) * 0.018;
      for (let c = 0; c <= cols; c++) {
        const u = c / cols;
        const x = meander + (u - 0.5) * 2 * width;
        const z = Math.sin(t * Math.PI * 4 + u * Math.PI) * 0.022 * t;
        positions.push(x, t, z);
        uvs.push(u, t);
        const edge = Math.min(u, 1 - u);
        const col = edge < 0.13 ? edgeColor : edge < 0.27 ? midColor : coreColor;
        colors.push(col.r, col.g, col.b);
      }
    }
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const hole = (r > 1 && r < rows - 2 && ((r * 3 + c * 2) % 7 === 0))
          || (r > 3 && r < 10 && c === 2 && r % 4 === 0);
        if (hole) continue;
        const a = r * (cols + 1) + c;
        const b = a + 1;
        const d = a + cols + 1;
        const e = d + 1;
        indices.push(a, d, b, b, d, e);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const phases = new Float32Array(total);
    for (let i = 0; i < total; i++) phases[i] = candidates[i].phase;
    geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));

    this._seaweedUniforms = {
      time: { value: this._waterTime || 0 },
      player: { value: new THREE.Vector2(0, 0) },
      motion: { value: 0 },
    };
    const mat = new THREE.MeshToonMaterial({
      color: 0xffffff,
      vertexColors: true,
      gradientMap: getCartoonGradient(),
      side: THREE.DoubleSide,
    });
    mat.customProgramCacheKey = () => 'opennite-seaweed-v2';
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uSeaweedTime = this._seaweedUniforms.time;
      shader.uniforms.uPlayerXZ = this._seaweedUniforms.player;
      shader.uniforms.uSeaweedMotion = this._seaweedUniforms.motion;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
attribute float aPhase;
uniform float uSeaweedTime;
uniform vec2 uPlayerXZ;
uniform float uSeaweedMotion;
varying float vSeaweedNear;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
vec4 seaweedBase = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
float playerDist = distance(seaweedBase.xz, uPlayerXZ);
vSeaweedNear = 1.0 - smoothstep(1.5, 7.0, playerDist);
float t = clamp(position.y, 0.0, 1.0);
float segBase = smoothstep(0.0, 0.38, t);
float segMid = smoothstep(0.28, 0.72, t);
float segTip = smoothstep(0.62, 1.0, t);
float p1 = sin(uSeaweedTime * 1.9 + aPhase + seaweedBase.x * 0.18);
float p2 = sin(uSeaweedTime * 2.7 + aPhase * 1.37 + seaweedBase.z * 0.21);
float p3 = sin(uSeaweedTime * 3.6 + aPhase * 0.63);
float amp = (0.12 + vSeaweedNear * 0.62) * uSeaweedMotion;
float sway = p1 * segBase * 0.18 + p2 * segMid * 0.36 + p3 * segTip * 0.64;
transformed.x += sway * amp;
transformed.z += (p1 * segBase * 0.06 + p2 * segMid * 0.13 + p3 * segTip * 0.26) * amp * cos(aPhase);
float rise = 1.0 + (0.1 * sin(uSeaweedTime * 1.2 + aPhase) - 0.05) * uSeaweedMotion;
transformed.y *= rise;`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vSeaweedNear;')
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= 0.86 + vSeaweedNear * 0.28;');
    };

    const mesh = new THREE.InstancedMesh(geo, mat, total);
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    for (let i = 0; i < total; i++) {
      const p = candidates[i];
      dummy.position.set(p.x, p.y - 0.05, p.z);
      dummy.rotation.set(0, rnd() * Math.PI * 2, 0);
      dummy.scale.set(0.7 + p.scale * 0.4, 1.2 + p.scale * 1.3, 0.7 + p.scale * 0.4);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      color.setHSL(0.32 + rnd() * 0.05, 0.28, 0.78 + rnd() * 0.18);
      mesh.setColorAt(i, color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.frustumCulled = false;
    mesh.receiveShadow = false;
    mesh.renderOrder = 1;
    this.root.add(mesh);
    this.seaweedMesh = mesh;
    this.disposables.push(geo, mat);
  }

  /** Coloca cabaÃ±as de madera (piezas de kit) en zonas de bosque. */
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
      // comprobar terreno razonablemente plano en huella pequeÃ±a (4x4u)
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

  /** Construye una cabaÃ±a de madera con piezas del kit (mÃ³dulo 2u, planta 2.5u). */
  _buildKitCabin(parent, wx, wy, wz, rot, floors = 1, terrainMinY = null) {
    const woodWall = 0xc2a06a;
    const woodDark = 0x8a6336;
    const roofColor = 0x7a4a2a;
    const cos = Math.cos(rot), sin = Math.sin(rot);
    const w2 = (lx, lz) => ({ x: wx + lx * cos + lz * sin, z: wz - lx * sin + lz * cos });
    const part = (kitName, lx, ly, lz, ry = 0, tint = null, collide = true) => {
      const wp = w2(lx, lz);
      return this._placeKitPart(parent, kitName, lx, ly, lz, ry, tint, collide, wp.x, wy + ly, wp.z, rot + ry);
    };
    // Huella 4x4u (2 mÃ³dulos). Centro en (0,0) local.
    const offsets = [[-1,-1], [1,-1], [-1,1], [1,1]];
    // Suelo base
    for (const [ox, oz] of offsets) part('floor', ox, 0, oz, 0, woodDark, true);
    for (let f = 0; f < floors; f++) {
      const by = f * KIT_FLOOR_H + KIT_SLAB_H;
      // Paredes perÃ­metro (cada lado 4u = 2 mÃ³dulos). Piezas de muro miden 2u en Z por defecto:
      // para alinearlas a lo largo de X se rotan 90Â° (PI/2), a lo largo de Z rotaciÃ³n 0.
      // Norte (z=-2), corre en X
      part('wall_window_square', -1, by, -2, Math.PI / 2, woodWall, true);
      part('wall_window_square',  1, by, -2, Math.PI / 2, woodWall, true);
      // Sur (z=+2) con puerta amplia, corre en X
      part('wall_doorway_wide', 0, by, 2, Math.PI / 2, woodWall, true);
      // Oeste (x=-2), corre en Z
      part('wall', -2, by, -1, 0, woodWall, true);
      part('wall_window_square', -2, by, 1, 0, woodWall, true);
      // Este (x=2), corre en Z
      part('wall_window_square', 2, by, -1, Math.PI, woodWall, true);
      part('wall', 2, by, 1, Math.PI, woodWall, true);
      // Losa/techo de planta o tejado
      const topY = by + KIT_WALL_H;
      for (const [ox, oz] of offsets) part('roof_flat_center', ox, topY, oz, 0, f === floors - 1 ? roofColor : woodDark, true);
    }
    // Cimiento sÃ³lido para asentar la cabaÃ±a al terreno.
    const minY = (terrainMinY != null && Number.isFinite(terrainMinY)) ? terrainMinY : (wy - 1);
    const fDepth = Math.max(0.7, (wy - minY) + 1.2);
    const base = new THREE.Mesh(new THREE.BoxGeometry(4.6, fDepth, 4.6), new THREE.MeshStandardMaterial({ color: 0x6b5a42, roughness: 0.96 }));
    base.position.set(0, -fDepth / 2 - 0.03, 0);
    base.receiveShadow = true; base.castShadow = true;
    parent.add(base);
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(4.3, 0.14, 4.3), new THREE.MeshStandardMaterial({ color: 0x7d6546, roughness: 0.92 }));
    plinth.position.set(0, -0.1, 0);
    plinth.receiveShadow = true; plinth.castShadow = true;
    parent.add(plinth);
  }

  /**
   * Loot del mapa editable: únicamente lo que el usuario ha colocado.
   * No se generan cofres, armas ni spawns aleatorios ni relleno por POI.
   */
  generateLootForCustomMap(pieces) {
    const loot = [];
    const spawns = [];
    const chests = [];
    const weaponSpawns = [];
    for (const p of (Array.isArray(pieces) ? pieces : [])) {
      if (!p || !Number.isFinite(+p.x) || !Number.isFinite(+p.z)) continue;
      const x = +p.x, z = +p.z;
      const y = this.heightAt(x, z);
      const point = (yOff) => new THREE.Vector3(x, y + yOff, z);
      switch (p.type) {
        case 'chest':
          chests.push(point(0));
          break;
        case 'loot_spawn':
          loot.push(point(0.9));
          break;
        case 'weapon_spawn':
          weaponSpawns.push(point(0.9));
          break;
        case 'spawn':
          spawns.push(point(1.5));
          break;
        default:
          break;
      }
    }
    this.lootSpots = loot;
    this.spawnPoints = spawns;
    this.chestSpots = chests;
    this.weaponSpawnSpots = weaponSpawns;
  }

  _applyCustomTerrainData(data) {
    // Se limpian los mismos Map para que referencias externas (editor de mapas)
    // sigan apuntando al estado real delWorld tras cada reconstrucción.
    this.heightOverrides.clear();
    this.heightSmooths.clear();
    this.waterPatches.length = 0;
    this.waterCells.clear();
    this.waterVegCells.clear();
    this.waterVegetation = clamp(Number(data?.waterVegetation ?? 0.55), 0, 1);
    this._waterLevels = null;
    this.modular = (data && typeof data === 'object' && !Array.isArray(data)) ? normalizeModularTerrain(data.modular) : null;
    // Mapa de Easy Game Developer: su terreno sustituye a todos los demás.
    this._setEgdWorld(data?.egd?.world || null);
    if (this.egdWorld) this.modular = null;
    if (!data || typeof data !== 'object' || Array.isArray(data)) return;
    const t = data.terrain;
    if (t && typeof t === 'object') {
      const cell = Number(t.cell) || GRID_SIZE;
      this.heightOverrideCell = cell;
      if (t.heights instanceof Map) {
        for (const [k, y] of t.heights.entries()) this.heightOverrides.set(k, snapHeight(y));
      } else {
        const list = Array.isArray(t.heights) ? t.heights : [];
        for (const e of list) {
          if (!Array.isArray(e) || e.length < 3) continue;
          const gx = Math.round(e[0]), gz = Math.round(e[1]), y = Number(e[2]);
          if (Number.isFinite(y)) this.heightOverrides.set(`${gx},${gz}`, snapHeight(y));
        }
      }
      if (t.smooths instanceof Map) {
        for (const [k, s] of t.smooths.entries()) this.heightSmooths.set(k, clamp(s, 0, 1));
      } else {
        const smooths = Array.isArray(t.smooths) ? t.smooths : [];
        for (const e of smooths) {
          if (!Array.isArray(e) || e.length < 3) continue;
          const gx = Math.round(e[0]), gz = Math.round(e[1]), s = clamp(Number(e[2]), 0, 1);
          if (s > 0) this.heightSmooths.set(`${gx},${gz}`, s);
        }
      }
    }
    if (Array.isArray(data.waterPatches)) {
      this.waterPatches = data.waterPatches
        .filter((w) => w && Number.isFinite(w.x) && Number.isFinite(w.z))
        .map((w) => ({ x: +w.x, z: +w.z, radius: Math.max(2, +w.radius || 8), y: Number.isFinite(+w.y) ? +w.y : (this.waterLevel ?? 0) }));
    }
    if (data.waterCells instanceof Map) {
      for (const [k, v] of data.waterCells.entries()) {
        const wy = typeof v === 'object' ? v.y : v;
        const veg = typeof v === 'object' ? v.veg : this.waterVegetation;
        this.waterCells.set(k, snapHeight(wy));
        this.waterVegCells.set(k, clamp(veg ?? this.waterVegetation, 0, 1));
      }
    } else if (Array.isArray(data.waterCells || t?.waterCells)) {
      const wcs = data.waterCells || t?.waterCells;
      for (const e of wcs) {
        if (!Array.isArray(e) || e.length < 3) continue;
        const key = Math.round(e[0]) + ',' + Math.round(e[1]);
        this.waterCells.set(key, snapHeight(+e[2]));
        const veg = e.length >= 4 ? Number(e[3]) : this.waterVegetation;
        if (Number.isFinite(veg)) this.waterVegCells.set(key, clamp(veg, 0, 1));
      }
    } else {
      // Lagos antiguos: los convertimos a celdas para usar el mismo campo continuo.
      const cell = this.heightOverrideCell || 2;
      for (const w of this.waterPatches) {
        const r = Math.ceil(w.radius / cell);
        const cgx = Math.round(w.x / cell), cgz = Math.round(w.z / cell);
        for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dz * dz > r * r) continue;
          const key = (cgx + dx) + ',' + (cgz + dz);
          this.waterCells.set(key, w.y);
          this.waterVegCells.set(key, this.waterVegetation);
        }
      }
    }
    if (this.egdWorld) {
      // Las teselas de agua de EGD son el agua del mapa (mismo nivel que en EGD).
      this.heightOverrideCell = GRID_SIZE;
      // Las que están al nivel del mar ya las cubre el mar; EGD no tiene algas.
      const sea = Number.isFinite(this.waterLevel) ? this.waterLevel : -100;
      for (const [k, y] of egdWaterCells(this.egdWorld, GRID_SIZE)) {
        if (Math.abs(y - sea) < 0.05) continue;
        this.waterCells.set(k, y);
        this.waterVegCells.set(k, 0);
      }
    }
    if (this.waterCells.size) {
      this._waterLevels = createWaterLevels(this.waterCells, {
        cell: this.heightOverrideCell || 2,
        seaLevel: Number.isFinite(this.waterLevel) ? this.waterLevel : 0,
      });
    }
  }

  spawnRipple(x, y, z, strength = 1) {
    if (!this._rippleData) this._rippleData = [];
    const now = this._waterTime || 0;
    this._rippleData.push({ x, z, birth: now, strength: clamp(strength, 0.2, 2) });
    if (this._rippleData.length > 8) this._rippleData.shift();
    this._syncRipplesToMaterials();
  }

  _syncRipplesToMaterials() {
    const arr = this._rippleData || [];
    const mats = this.waterMaterials || [];
    for (const mat of mats) {
      const u = mat.uniforms?.uRipples?.value;
      if (!u) continue;
      for (let i = 0; i < u.length; i++) {
        const r = arr[i];
        if (r) u[i].set(r.x, r.z, r.birth, r.strength);
        else u[i].set(0, 0, -1000, 0);
      }
    }
  }

  _updateRipples(dt) {
    if (!this._rippleData) return;
    const now = this._waterTime || 0;
    this._rippleData = this._rippleData.filter((r) => now - r.birth < 2.8);
    this._syncRipplesToMaterials();
  }

  hasWater() {
    return (this.waterLevel > -20) || (this.waterCells?.size || 0) > 0 || (this.waterPatches?.length || 0) > 0;
  }

  /** Oculta todas las superficies de agua para el pase de refracción. */
  setWaterVisible(visible) {
    for (const m of this.waterMeshes || []) m.visible = visible;
  }

  /** Conecta el render target con los shaders de agua para deformar lo que hay detrás. */
  setRefractionTexture(texture, width, height) {
    for (const mat of this.waterMaterials || []) {
      const u = mat.uniforms;
      if (!u?.tScene) continue;
      u.tScene.value = texture;
      u.uRefract.value = texture ? 1 : 0;
      if (u.uScreen) u.uScreen.value.set(width, height);
    }
  }

  /** Conecta el pase espejo solo con la superficie del nivel correspondiente. */
  setReflectionTexture(texture, matrix, enabled, planeY) {
    const quality = Number(this.settings?.get('waterQuality') || 0);
    const strength = quality >= 2 ? 1 : 0.7;
    for (const mat of this.waterMaterials || []) {
      const u = mat.uniforms;
      if (!u?.tReflect) continue;
      u.tReflect.value = texture || null;
      if (u.uTextureMatrix && matrix) u.uTextureMatrix.value.copy(matrix);
      const surfaceY = u.uPlaneY?.value;
      const matches = !Number.isFinite(surfaceY) || !Number.isFinite(planeY)
        || Math.abs(surfaceY - planeY) < 0.6;
      u.uReflectReal.value = enabled && texture && matches ? 1 : 0;
      u.uReflectionStrength.value = matches ? strength : 0;
    }
  }

  /** Nivel de agua plano bajo el jugador/cámara para el pase espejo. */
  getReflectionPlaneY(pos) {
    const px = pos?.x || 0, pz = pos?.z || 0;
    const levels = this._waterLevels;
    if (levels) {
      const local = levels.levelAt(px, pz);
      if (Number.isFinite(local) && local > -20 && this.heightAt(px, pz) < local - 0.05) return local;
      let best = Infinity, bestD = Infinity;
      for (const [key, y] of levels.map) {
        const comma = key.indexOf(',');
        if (comma < 0) continue;
        const gx = Number(key.slice(0, comma)), gz = Number(key.slice(comma + 1));
        const wx = gx * levels.cell, wz = gz * levels.cell;
        const d2 = (wx - px) ** 2 + (wz - pz) ** 2;
        if (d2 < bestD) { bestD = d2; best = y; }
      }
      return Number.isFinite(best) ? best : levels.seaLevel;
    }
    return this.waterLevel > -20 ? this.waterLevel : -Infinity;
  }

  _makeLakeWaterMaterial() {
    const MAX_R = 8;
    const ripples = Array.from({ length: MAX_R }, () => new THREE.Vector4(0, 0, -1000, 0)); // x,z,birth,strength
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: this._toonWaterColor(new THREE.Color(this.theme?.water || 0x2f7189)) },
        uSun: { value: new THREE.Color(0xfff2dd) },
        uSunDir: { value: (this.sunDirection || new THREE.Vector3(0.4, 1, 0.2)).clone() },
        uOpacity: { value: 0.62 },
        uQuality: { value: 1 },
        uReflect: { value: 1 },
        tDetail: { value: this.waterDetailTexture },
        uDetailScale: { value: 0.085 },
        tScene: { value: null },
        uRefract: { value: 0 },
        uScreen: { value: new THREE.Vector2(1, 1) },
        tReflect: { value: null },
        uTextureMatrix: { value: new THREE.Matrix4() },
        uReflectReal: { value: 0 },
        uReflectionStrength: { value: 0 },
        uPlaneY: { value: this.waterLevel },
        uRipples: { value: ripples },
        uRippleCount: { value: MAX_R },
        ...this._waterDepthUniforms(this.waterLevel, 0),
      },
      vertexShader: `
        varying vec3 vWorld;
        varying vec3 vNormalW;
        uniform float uTime;
        uniform vec4 uRipples[8];
        void main() {
          vec3 p = position;
          float a = p.x * 0.085 + uTime * 1.3;
          float b = p.z * 0.092 - uTime * 1.1;
          float c = (p.x + p.z) * 0.055 + uTime * 0.9;
          float d = (p.x - p.z) * 0.14 - uTime * 1.8;
          float wave = sin(a) * 0.10 + sin(b) * 0.09 + sin(c) * 0.12 + sin(d) * 0.05;
          float rdx = 0.0; float rdz = 0.0;
          for (int i = 0; i < 8; i++) {
            vec4 rp = uRipples[i];
            float age = uTime - rp.z;
            if (age < 0.0 || age > 2.8) continue;
            vec2 dir = p.xz - rp.xy;
            float dist = length(dir) + 0.001;
            // Onda tipo gota: un anillo que sale del punto y se expande.
            float speed = 3.4;
            float radius = age * speed;
            float ring = exp(-pow((dist - radius) * 1.7, 2.0));
            float decay = exp(-age * 1.15) * exp(-dist * 0.06);
            float freq = 6.0;
            float phase = (dist - radius) * freq;
            float amp = rp.w * 0.16 * ring * decay;
            wave += sin(phase) * amp;
            float dPhase = cos(phase) * amp * freq;
            rdx += dPhase * dir.x / dist;
            rdz += dPhase * dir.y / dist;
          }
          p.y += wave;
          float dx = cos(a) * 0.0085 + cos(c) * 0.0066 + cos(d) * 0.007 + rdx;
          float dz = cos(b) * 0.00828 + cos(c) * 0.0066 - cos(d) * 0.007 + rdz;
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
        uniform float uReflect;
        uniform sampler2D tScene;
        uniform float uRefract;
        uniform vec2 uScreen;
        uniform sampler2D tReflect;
        uniform mat4 uTextureMatrix;
        uniform float uReflectReal;
        uniform float uReflectionStrength;
        uniform vec4 uRipples[8];
        ${WATER_DETAIL_UNIFORMS}
        ${WATER_DEPTH_UNIFORMS}
        ${WATER_DEPTH_FUNCS}
        void main() {
          vec3 view = normalize(cameraPosition - vWorld);
          vec3 sun = normalize(uSunDir);
          vec3 n = normalize(vNormalW);
          ${WATER_DETAIL_NORMAL}
          ${WATER_DEPTH_COLOR}
          float r1 = sin(vWorld.x * 0.8 + uTime * 4.2) * cos(vWorld.z * 0.7 - uTime * 3.4);
          float r2 = sin((vWorld.x - vWorld.z) * 0.55 - uTime * 4.6);
          n = normalize(n + vec3(r1 * 0.05, 0.0, r2 * 0.05));
          for (int i = 0; i < 8; i++) {
            vec4 rp = uRipples[i];
            float age = uTime - rp.z;
            if (age < 0.0 || age > 2.8) continue;
            vec2 dir = vWorld.xz - rp.xy;
            float dist = length(dir) + 0.001;
            float radius = age * 5.8;
            float ring = exp(-pow((dist - radius) * 1.7, 2.0));
            float decay = exp(-age * 1.8) * exp(-dist * 0.06);
            float phase = (dist - radius) * 6.0;
            float nAmp = rp.w * 0.09 * ring * decay * cos(phase);
            n = normalize(n + vec3(nAmp * dir.x / dist, 0.0, nAmp * dir.y / dist));
          }
          float fres = pow(1.0 - max(dot(view, n), 0.0), 3.0);
          float diff = max(dot(n, sun), 0.0);
          vec3 halfDir = normalize(sun + view);
          float spec = pow(max(dot(n, halfDir), 0.0), 140.0);
          float bands = sin(vWorld.x * 0.18 + uTime * 3.2) * sin(vWorld.z * 0.16 - uTime * 2.6) * 0.5 + 0.5;
          // Superficie realista: mezcla continua, detalle normal y brillo de textura.
          float shimmer = clamp(bands * 0.18 + diff * 0.22 + fres * 0.2 + detailLight * 0.4, 0.0, 1.0);
          vec3 col = mix(baseCol * 0.45, baseCol * 1.3, shimmer);
          col += uSun * spec * (0.9 + detailLight * 0.9);
          col += vec3(0.55, 0.85, 1.0) * pow(detailLight, 3.0) * 0.12;
          vec3 reflDir = reflect(-view, n);
          float skyAmt = smoothstep(-0.15, 0.7, reflDir.y);
          vec3 reflCol = mix(baseCol * 0.6, vec3(0.58, 0.79, 1.0) + uSun * 0.22, skyAmt);
          col = mix(col, reflCol, clamp(fres * 0.6 * uReflect, 0.0, 0.72));
          if (uReflectReal > 0.5) {
            // Reflejo planar real: se proyecta la escena espejada sobre la superficie.
            vec2 distortion = vec2(n.x, n.z) * (0.014 + fres * 0.012)
              + vec2(sin(vWorld.x * 0.7 + uTime * 1.7), cos(vWorld.z * 0.65 - uTime * 1.4)) * 0.003;
            vec4 reflectPos = vec4(vWorld + vec3(distortion.x * 4.0, 0.0, distortion.y * 4.0), 1.0);
            vec4 proj = uTextureMatrix * reflectPos;
            vec2 ruv = proj.xy / max(proj.w, 0.001);
            // Mirror vertical: la imagen espejada se voltea en Y antes de
            // proyectarse sobre la superficie del agua.
            ruv.y = 1.0 - ruv.y;
            vec2 uvClamped = clamp(ruv, vec2(0.002), vec2(0.998));
            vec3 realRefl = texture2D(tReflect, uvClamped).rgb;
            float edge = smoothstep(0.0, 0.05, uvClamped.x) * smoothstep(1.0, 0.95, uvClamped.x)
              * smoothstep(0.0, 0.05, uvClamped.y) * smoothstep(1.0, 0.95, uvClamped.y);
            reflCol = mix(reflCol, realRefl, 0.94 * edge);
            col = mix(col, reflCol, clamp((0.5 + fres * 0.45) * uReflect * uReflectionStrength, 0.0, 0.94));
          }
          if (uRefract > 0.5) {
            // Refracción en pantalla: la normal deforma lo que hay debajo del agua.
            vec2 uv = gl_FragCoord.xy / max(uScreen, vec2(1.0));
            vec2 warp = vec2(n.x, n.z) * (0.022 + fres * 0.014);
            vec3 behind = texture2D(tScene, clamp(uv + warp, 0.002, 0.998)).rgb;
            vec3 tint = mix(vec3(1.0), baseCol * 1.7, 0.2);
            col = mix(col, behind * tint + vec3(0.01, 0.045, 0.07), 0.62);
          }
          // Opacidad ~0.6 en aguas profundas y >=0.45 en la orilla: el agua
          // nunca se vuelve casi invisible (transparencia máxima ~50%).
          float alpha = clamp((uOpacity + fres * 0.20 - diff * 0.04) * mix(0.72, 1.0, 1.0 - shoreT), 0.42, 0.96);
          gl_FragColor = vec4(col, alpha);
        }`,
    });
    this.waterMaterials.push(mat);
    return mat;
  }

  /** [0,1] -> 2 pasos planos: sombra o luz, sin degradados suaves. */
  _toonStep(v) {
    return v < 0.5 ? 0.0 : 1.0;
  }

  /** Color saturado y cuantizado para el agua cartoon. */
  _toonWaterColor(base, shadowFactor = 0.62, lightFactor = 1.32, mix = 0) {
    const hsl = { h: 0, s: 0, l: 0 };
    base.getHSL(hsl);
    const c = base.clone();
    c.setHSL(hsl.h, Math.min(1, hsl.s * 1.35 + 0.12), hsl.l * (mix < 0.5 ? shadowFactor : lightFactor));
    return c;
  }

  /** Material de la cara lateral: cascada blanca, transparente y con muchas estrías. */
  _makeWaterfallMaterial() {
    // El agua que cae apenas conserva el tinto del tema: blanco roto, no cian.
    const fallColor = new THREE.Color(this.theme?.water || 0x2f7189).lerp(new THREE.Color(0xf4fbff), 0.9);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: fallColor },
        uSun: { value: new THREE.Color(0xfff2dd) },
        uOpacity: { value: 0.4 },
      },
      vertexShader: `
        attribute vec2 aDir;
        varying vec2 vUv;
        varying vec3 vWorld;
        varying vec3 vSide;
        uniform float uTime;
        void main() {
          vUv = uv;
          vec3 p = position;
          vec3 side = normalize(vec3(-aDir.y, 0.0, aDir.x));
          // La deformación se desvanece en los extremos para no abrir huecos.
          float env = sin(clamp(uv.y, 0.0, 1.0) * 3.14159265);
          float wobble = sin(uv.y * 26.0 - uTime * 10.0 + p.x * 0.7 + p.z * 0.7) * 0.16
            + sin(uv.y * 47.0 - uTime * 14.0 + p.x * 1.3 - p.z * 0.9) * 0.07
            + sin(uv.x * 18.0 + uv.y * 9.0 - uTime * 6.0) * 0.04;
          p += side * wobble * env * (0.5 + uv.y * 0.8);
          p.y += sin(uv.y * 58.0 - uTime * 18.0 + p.x * 0.5) * 0.035 * env;
          vSide = side;
          vWorld = p;
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: `
        varying vec2 vUv;
        varying vec3 vWorld;
        varying vec3 vSide;
        uniform float uTime;
        uniform vec3 uColor;
        uniform vec3 uSun;
        uniform float uOpacity;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        void main() {
          float seed = hash(floor(vWorld.xz * 1.3));
          float drift = sin(vWorld.x * 2.1 + vWorld.z * 1.7 + uTime * 1.4) * 0.5 + 0.5;
          // Tres escalas de rayas horizontales dibujan la caída del agua.
          float f1 = sin(vUv.y * 150.0 - uTime * 22.0 + seed * 6.283 + vWorld.x * 0.35) * 0.5 + 0.5;
          float f2 = sin(vUv.y * 94.0  - uTime * 16.0 + vWorld.z * 0.45 + drift) * 0.5 + 0.5;
          float f3 = sin(vUv.y * 232.0 - uTime * 31.0 + seed * 2.0) * 0.5 + 0.5;
          float streaks = clamp(
            step(0.56, f1) * 0.55 +
            step(0.64, f2) * 0.35 +
            step(0.76, f3) * 0.28, 0.0, 1.0);
          float bottom = smoothstep(0.72, 1.0, vUv.y);
          float foam = max(streaks, bottom * 0.92);
          // Dos tonos muy cercanos: blanco roto y blanco, sin azul intenso.
          vec3 col = mix(uColor * 0.94, vec3(1.0), foam);
          float rim = pow(1.0 - abs(dot(normalize(vSide), normalize(cameraPosition - vWorld))), 2.0);
          col += uSun * rim * 0.06;
          float alpha = clamp(uOpacity + streaks * 0.24 + bottom * 0.16, 0.24, 0.90);
          gl_FragColor = vec4(col, alpha);
        }`,
    });
    this.waterMaterials.push(mat);
    return mat;
  }

  _buildWaterPatches() {
    const levels = this._waterLevels;
    if (!levels) return;
    this._buildLevelWater(levels);
  }

  /** Superficies planas por nivel + caras de cascada en los cambios de altura. */
  _buildLevelWater(levels) {
    const pad = 60;
    const quality = this.settings.get('waterQuality') ?? 1;
    const { surfaces, fallEdges } = buildWaterSurfaces({
      levels,
      heightAt: (x, z) => this.heightAt(x, z),
      minX: -this.half - pad, maxX: this.half + pad,
      minZ: -this.half - pad, maxZ: this.half + pad,
      step: 2,
      offset: 0.06,
      subdiv: quality === 0 ? 3 : quality === 1 ? 4 : 6,
    });
    for (const s of surfaces) {
      if (!s.indices.length) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(s.positions, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(s.uvs, 2));
      geo.setIndex(s.indices);
      geo.computeBoundingSphere();
      const mat = this._makeLakeWaterMaterial();
      mat.uniforms.uPlaneY.value = s.level;
      mat.uniforms.uSurfaceY.value = s.level;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.receiveShadow = true;
      mesh.renderOrder = 2;
      this.root.add(mesh);
      this.waterMeshes.push(mesh);
      this.disposables.push(geo, mat);
    }
    this.continuousWaterMaterials = (this.waterMaterials || []).filter((m) => m.uniforms?.uPlaneY);

    // Los saltos entre niveles y las caídas que bajan directamente al mar
    // generan cascada/espuma/burbujas. El resto de `shore` solo cierra cantos.
    const waterfalls = fallEdges.filter((e) => (
      (e.type === 'level' && e.top - e.bottom >= 0.25)
      || (e.type === 'shore' && Math.abs(e.bottom - this.waterLevel) < 0.02 && e.top - e.bottom >= 1)
    ));
    this._waterfallEdges = waterfalls;
    this.waterfalls = waterfalls.map((e) => ({
      x: (e.x0 + e.x1) * 0.5,
      z: (e.z0 + e.z1) * 0.5,
      dx: e.x1 - e.x0,
      dz: e.z1 - e.z0,
      top: e.top + 0.06,
      bottom: e.bottom + 0.06,
    }));
    if (fallEdges.length) this._buildWaterfallSheets(fallEdges);
    if (waterfalls.length) this._buildWaterfallFoam(waterfalls);
  }

  /** Un shape lateral por arista: de la línea superior al borde del nivel inferior. */
  _buildWaterfallSheets(edges) {
    const positions = [], uvs = [], dirs = [], indices = [];
    for (const edge of edges) {
      const dx = edge.x1 - edge.x0, dz = edge.z1 - edge.z0;
      const len = Math.hypot(dx, dz) || 1;
      const tx = dx / len, tz = dz / len;
      // Solapar extremos: las esquinas donde se juntan dos caras dejaban un
      // triángulo vacío al mirar en diagonal.
      const ext = Math.min(0.06, len * 0.04);
      const ax = edge.x0 - tx * ext, az = edge.z0 - tz * ext;
      const bx = edge.x1 + tx * ext, bz = edge.z1 + tz * ext;
      const drop = Math.max(0.25, edge.top - edge.bottom);
      const rows = Math.max(5, Math.ceil(drop / 2.5));
      const cols = Math.max(1, Math.ceil(len / 1.5));
      const base = positions.length / 3;
      for (let r = 0; r <= rows; r++) {
        const v = r / rows;
        const y = edge.top - drop * v;
        for (let c = 0; c <= cols; c++) {
          const u = c / cols;
          positions.push(ax + (bx - ax) * u, y, az + (bz - az) * u);
          uvs.push(u, v);
          dirs.push(tx, tz);
        }
      }
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const a = base + r * (cols + 1) + c;
          const b = a + 1;
          const d = a + cols + 1;
          const e = d + 1;
          indices.push(a, d, b, b, d, e);
        }
      }
    }
    if (!indices.length) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setAttribute('aDir', new THREE.Float32BufferAttribute(dirs, 2));
    geo.setIndex(indices);
    geo.computeBoundingSphere();
    const mat = this._makeWaterfallMaterial();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 3;
    this.root.add(mesh);
    this.waterMeshes.push(mesh);
    this.disposables.push(geo, mat);
    this.waterfallMesh = mesh;
  }

  /** Nubes de espuma blanca permanentes en la base de cada cascada. */
  _buildWaterfallFoam(edges) {
    const perEdge = 14;
    const max = edges.length * perEdge;
    const geo = new THREE.IcosahedronGeometry(1, 1);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xc8eeff,
      emissiveIntensity: 0.3,
      roughness: 1,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, max);
    mesh.frustumCulled = false;
    mesh.renderOrder = 4;
    const dummy = new THREE.Object3D();
    const particles = [];
    for (const edge of edges) {
      const dx = edge.x1 - edge.x0, dz = edge.z1 - edge.z0;
      const len = Math.hypot(dx, dz) || 1;
      const tx = dx / len, tz = dz / len;
      for (let i = 0; i < perEdge; i++) {
        const along = (Math.random() - 0.5) * len * 1.15;
        const across = (Math.random() - 0.5) * 1.9;
        const p = {
          x: (edge.x0 + edge.x1) * 0.5 + tx * along - tz * across,
          y: edge.bottom + 0.12 + Math.random() * 0.55,
          z: (edge.z0 + edge.z1) * 0.5 + tz * along + tx * across,
          r: 0.18 + Math.random() * 0.5,
          phase: Math.random() * Math.PI * 2,
        };
        particles.push(p);
        dummy.position.set(p.x, p.y, p.z);
        dummy.scale.set(p.r * 1.25, p.r * 0.65, p.r * 1.1);
        dummy.rotation.set(0, p.phase, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(particles.length - 1, dummy.matrix);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    this.root.add(mesh);
    this.waterMeshes.push(mesh);
    this.disposables.push(geo, mat);
    this._foamMesh = this.waterfallFoamMesh = mesh;
    this._foamParticles = this.waterfallParticles = particles;
    this._foamDummy = dummy;
    this._waterfallBubbleTimer = 0.8;
  }

  /** Animación de la espuma y burbujas ascendentes generadas por la caída. */
  _updateWaterfallFoam(dt) {
    const parts = this._foamParticles;
    if (!parts?.length || !this._foamMesh) return;
    const t = (this._foamTime || 0) + dt;
    this._foamTime = t;
    const dummy = this._foamDummy;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      const pulse = 0.78 + Math.sin(t * 3.6 + p.phase) * 0.28;
      dummy.position.set(
        p.x + Math.sin(t * 1.9 + p.phase) * 0.14,
        p.y + Math.sin(t * 2.8 + p.phase) * 0.08,
        p.z + Math.cos(t * 2.2 + p.phase) * 0.14,
      );
      dummy.scale.set(p.r * pulse * 1.25, p.r * pulse * 0.65, p.r * pulse * 1.1);
      dummy.rotation.set(0, p.phase + t * 0.28, 0);
      dummy.updateMatrix();
      this._foamMesh.setMatrixAt(i, dummy.matrix);
    }
    this._foamMesh.instanceMatrix.needsUpdate = true;

    this._waterfallBubbleTimer -= dt;
    if (this._waterfallBubbleTimer > 0 || !this._waterfallEdges?.length) return;
    this._waterfallBubbleTimer = 0.85;
    for (const edge of this._waterfallEdges) {
      const origin = {
        x: (edge.x0 + edge.x1) * 0.5,
        y: edge.bottom + 0.1,
        z: (edge.z0 + edge.z1) * 0.5,
      };
      this.spawnUnderwaterBubbles(origin, edge.bottom, 1.2, 20);
    }
  }
  /** Gotas 3D que caen al agua/suelo al salir, generando ondas al tocar el agua. */
  spawnWaterSplashDrops(origin, count = 20) {
    if (!origin || !this.root) return;
    if (!this.splashDrops) this.splashDrops = [];
    const MAX = 80;
    if (!this.splashMesh) {
      // Gota 3D con forma de lágrima: distinta de la burbuja esférica y del color del agua.
      const profile = [
        new THREE.Vector2(0.0, -1.0),
        new THREE.Vector2(0.32, -0.82),
        new THREE.Vector2(0.50, -0.42),
        new THREE.Vector2(0.52, 0.0),
        new THREE.Vector2(0.40, 0.45),
        new THREE.Vector2(0.20, 0.78),
        new THREE.Vector2(0.0, 1.0),
      ];
      const geo = new THREE.LatheGeometry(profile, 8);
      const waterColor = new THREE.Color(this.theme?.water || 0x2f7189);
      const mat = new THREE.MeshStandardMaterial({
        color: waterColor.clone().multiplyScalar(1.35),
        emissive: waterColor.clone().multiplyScalar(0.25),
        emissiveIntensity: 0.18,
        roughness: 0.12, metalness: 0, transparent: true, opacity: 0.82,
        depthWrite: false, side: THREE.DoubleSide,
      });
      const mesh = new THREE.InstancedMesh(geo, mat, MAX);
      mesh.frustumCulled = false;
      mesh.renderOrder = 4;
      const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
      for (let i = 0; i < MAX; i++) mesh.setMatrixAt(i, hidden);
      mesh.instanceMatrix.needsUpdate = true;
      this.root.add(mesh);
      this.splashMesh = mesh;
      this.splashGeo = geo;
      this.splashMat = mat;
      this._splashDummy = new THREE.Object3D();
      this._splashHidden = hidden;
    }
    const surface = this.waterYAt(origin.x, origin.z);
    const baseY = Number.isFinite(surface) && surface > -20 ? surface : origin.y;
    for (let i = 0; i < count && this.splashDrops.length < MAX; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1.4 + Math.random() * 3.2;
      this.splashDrops.push({
        x: origin.x + (Math.random() - 0.5) * 1.1,
        y: baseY + 0.15 + Math.random() * 0.35,
        z: origin.z + (Math.random() - 0.5) * 1.1,
        vx: Math.cos(a) * sp * 0.5,
        vy: 2.6 + Math.random() * 3.4,
        vz: Math.sin(a) * sp * 0.5,
        r: 0.035 + Math.random() * 0.055,
        alive: true,
      });
    }
  }

  _updateSplashDrops(dt) {
    if (!this.splashDrops?.length || !this.splashMesh) return;
    const dummy = this._splashDummy;
    const hidden = this._splashHidden;
    const MAX = this.splashMesh.count;
    let active = 0;
    for (let i = 0; i < this.splashDrops.length; i++) {
      const d = this.splashDrops[i];
      if (d.alive) {
        d.vy -= 13.5 * dt;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        d.z += d.vz * dt;
        const waterY = this.waterYAt(d.x, d.z);
        const groundY = this.heightAt ? this.heightAt(d.x, d.z) : -Infinity;
        if (Number.isFinite(waterY) && waterY > -20 && d.y <= waterY && d.vy < 0) {
          d.alive = false;
          try { this.spawnRipple(d.x, waterY, d.z, 0.35 + Math.min(0.5, Math.abs(d.vy) * 0.06)); } catch {}
        } else if (d.y <= groundY + 0.03 && d.vy < 0) {
          d.alive = false;
        }
      }
      if (!d.alive) {
        this.splashMesh.setMatrixAt(i, hidden);
        continue;
      }
      active++;
      dummy.position.set(d.x, d.y, d.z);
      const stretch = 1 + Math.min(0.6, Math.abs(d.vy) * 0.04);
      dummy.scale.set(d.r, d.r * stretch, d.r);
      dummy.rotation.set(d.x * 0.3, d.z * 0.3, 0);
      dummy.updateMatrix();
      this.splashMesh.setMatrixAt(i, dummy.matrix);
    }
    this.splashMesh.instanceMatrix.needsUpdate = true;
    if (!active) {
      this.splashDrops.length = 0;
      this.splashMesh.visible = false;
    } else {
      this.splashMesh.visible = true;
    }
  }

  /** Burbujas 3D que suben desde la camara hasta la superficie al entrar al agua. */
  spawnUnderwaterBubbles(origin, surfaceY, duration = 2, count = 180) {
    if (!origin || !this.root) return;
    const surface = Number.isFinite(surfaceY) ? surfaceY : (this.waterLevel ?? 0);
    count = Math.max(1, Math.floor(Number(count) || 180)); // agrupadas en pequeñas columnas
    const geo = new THREE.SphereGeometry(1, 8, 6);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xe8f7ff, emissive: 0x4a9fd8, emissiveIntensity: 0.4,
      roughness: 0.12, metalness: 0, transparent: true, opacity: 0.55,
      depthWrite: false, side: THREE.DoubleSide,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.frustumCulled = false;
    mesh.renderOrder = 3;
    const clusters = [];
    const clusterCount = Math.min(5, count);
    for (let c = 0; c < clusterCount; c++) {
      const a = Math.random() * Math.PI * 2;
      const rad = 0.12 + Math.random() * 0.55;
      clusters.push({ x: origin.x + Math.cos(a) * rad, z: origin.z + Math.sin(a) * rad });
    }
    const bubbles = [];
    for (let i = 0; i < count; i++) {
      const cluster = clusters[i % clusterCount];
      const a = Math.random() * Math.PI * 2;
      const spread = 0.08 + Math.random() * 0.34;
      const sizeRoll = Math.random();
      const r = sizeRoll < 0.68 ? 0.018 + Math.random() * 0.042
        : sizeRoll < 0.94 ? 0.06 + Math.random() * 0.045
          : 0.11 + Math.random() * 0.055;
      bubbles.push({
        // Columnas pegadas entre sí, con tamaños/velocidades muy variados.
        x: cluster.x + Math.cos(a) * spread,
        y: Math.min(surface - 0.16, origin.y + 0.3 - Math.random() * 1.35),
        z: cluster.z + Math.sin(a) * spread,
        r,
        vy: 1.4 + Math.random() * 3.2 + (r > 0.1 ? 0.4 : 0),
        w: Math.random() * Math.PI * 2,
        sway: 0.12 + Math.random() * 0.42,
        pulse: 0.06 + Math.random() * 0.12,
        alive: true,
      });
    }
    this.root.add(mesh);
    // La duración que se pide es la que se cumple: el estallido de entrada al
    // agua puede durar exactamente 1 s y desaparecer sin arrastre.
    this.bubbleSystems.push({ mesh, bubbles, geo, mat, life: Math.max(0.15, Number(duration) || 2), surface });
  }

  _updateBubbles(dt) {
    if (!this.bubbleSystems?.length) return;
    const dummy = this._bubbleDummy || (this._bubbleDummy = new THREE.Object3D());
    const hidden = this._bubbleHidden || (this._bubbleHidden = new THREE.Matrix4().makeScale(0, 0, 0));
    for (let s = this.bubbleSystems.length - 1; s >= 0; s--) {
      const sys = this.bubbleSystems[s];
      sys.life -= dt;
      let alive = 0;
      for (let i = 0; i < sys.bubbles.length; i++) {
        const b = sys.bubbles[i];
        if (!b.alive) { sys.mesh.setMatrixAt(i, hidden); continue; }
        b.w += dt * (5.0 + (b.r || 0.04) * 13);
        b.y += b.vy * dt;
        const sway = b.sway ?? 0.3;
        b.x += Math.sin(b.w) * sway * dt;
        b.z += Math.cos(b.w * 0.83) * sway * dt;
        if (b.y >= sys.surface) {
          b.alive = false;
          if (Math.random() < 0.25) { try { this.spawnRipple(b.x, sys.surface, b.z, 0.25); } catch {} }
          sys.mesh.setMatrixAt(i, hidden);
          continue;
        }
        alive++;
        const fade = Math.min(1, Math.max(0, sys.life * 2));
        dummy.position.set(b.x, b.y, b.z);
        dummy.scale.setScalar(b.r * fade * (1 + Math.sin(b.w * 2) * (b.pulse ?? 0.08)));
        dummy.updateMatrix();
        sys.mesh.setMatrixAt(i, dummy.matrix);
      }
      sys.mesh.instanceMatrix.needsUpdate = true;
      if (!alive || sys.life <= 0) {
        this.root.remove(sys.mesh);
        sys.geo.dispose(); sys.mat.dispose();
        this.bubbleSystems.splice(s, 1);
      }
    }
  }

  /** Nivel de agua de la celda, aunque el terreno sobresalga (para costa/playa). */
  _waterLevelForTerrain(x, z) {
    const levels = this._waterLevels;
    if (levels) {
      const wy = levels.levelAt(x, z);
      if (Number.isFinite(wy) && wy > levels.seaLevel + 0.01) return wy;
    }
    return this.waterLevel;
  }

  waterYAt(x, z) {
    const ground = this.heightAt(x, z);
    const levels = this._waterLevels;
    if (levels) {
      const wy = levels.levelAt(x, z);
      // Agua plana: solo existe donde cubre el terreno y nunca por debajo
      // del mar (esa altura se elimina para no crear dos niveles).
      if (Number.isFinite(wy) && wy > levels.seaLevel + 0.01 && ground < wy - 0.05) return wy;
    }
    // El océano global convive con los lagos: si no hay celda de lago aquí,
    // el mar también es agua válida siempre que el terreno esté por debajo.
    const sea = this.waterLevel ?? -100;
    if (sea > -20 && ground < sea - 0.05) return sea;
    return -Infinity;
  }

  isWaterfallAt(x, z, y) {
    const falls = this.waterfalls;
    if (!falls?.length) return false;
    for (const f of falls) {
      if (y < f.bottom - 0.2 || y > f.top + 0.6) continue;
      const half = (this.heightOverrideCell || 2) * 0.55;
      if (f.dx !== 0) {
        if (Math.abs(x - f.x) < 1.0 && Math.abs(z - f.z) < half) return true;
      } else {
        if (Math.abs(z - f.z) < 1.0 && Math.abs(x - f.x) < half) return true;
      }
    }
    return false;
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
    if (Array.isArray(data)) return { pieces: data };
    return data && typeof data === 'object' ? data : null;
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

  async _loadCustomModel(src) {
    if (!src) return null;
    if (this._customModelCache.has(src)) {
      const cached = this._customModelCache.get(src);
      return cached ? cached.clone(true) : null;
    }
    try {
      const lower = String(src).toLowerCase();
      const isFbx = lower.includes('.fbx') || lower.startsWith('data:model/fbx');
      const isGlb = lower.includes('.glb') || lower.startsWith('data:model/gltf-binary') || lower.startsWith('data:application/octet-stream');
      let obj = null;
      if (isFbx) {
        const { FBXLoader } = await import('three/addons/loaders/FBXLoader.js');
        const loader = new FBXLoader();
        obj = await new Promise((res, rej) => loader.load(src, res, undefined, rej));
      } else {
        const loader = new GLTFLoader();
        const gltf = await new Promise((res, rej) => loader.load(src, res, undefined, rej));
        obj = gltf?.scene || gltf?.scenes?.[0] || null;
      }
      if (obj) {
        obj.traverse((o) => {
          if (o.isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
            if (o.material) {
              const mats = Array.isArray(o.material) ? o.material : [o.material];
              for (const m of mats) { if (m && 'envMapIntensity' in m) m.envMapIntensity = Math.max(m.envMapIntensity ?? 1, 0.8); }
            }
          }
        });
        // Normalizar: base en Y=0, centrado XZ, preservar escala original del modelo
        const box = new THREE.Box3().setFromObject(obj);
        const wrap = new THREE.Group();
        if (!box.isEmpty()) {
          const center = box.getCenter(new THREE.Vector3());
          obj.position.x -= center.x;
          obj.position.z -= center.z;
          obj.position.y -= box.min.y;
        }
        wrap.add(obj);
        wrap.userData.__normalizedCustomModel = true;
        this._customModelCache.set(src, wrap);
        return wrap.clone(true);
      }
    } catch (e) { console.warn('[world] custom model load failed', src, e); }
    this._customModelCache.set(src, null);
    return null;
  }

  async placeCustomPieces(pieces) {
    this._detailGroups = this._detailGroups.filter(g => g?.name !== 'custom-map-pieces');
    const group = new THREE.Group();
    group.name = 'custom-map-pieces';
    this._detailGroups.push(group);
    const pieceGroups = [];
    const customSrcs = [...new Set((pieces || []).map(p => p?.modelSrc).filter(Boolean))];
    const customModels = new Map();
    await Promise.all(customSrcs.map(async (src) => { customModels.set(src, await this._loadCustomModel(src)); }));
    const cloneCustom = (src) => { const m = customModels.get(src); return m ? m.clone(true) : null; };
    const applyCustomTransform = (obj, p, fallbackScale = 1) => {
      const s = (p.scale || fallbackScale) * (p.modelScale || 1);
      obj.scale.setScalar(s);
      const rx = (+p.modelRotX || 0) * Math.PI / 180;
      const ry = (+p.modelRotY || 0) * Math.PI / 180;
      const rz = (+p.modelRotZ || 0) * Math.PI / 180;
      if (rx || ry || rz) obj.rotation.set(rx, ry, rz);
      return s;
    };
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
    // Marcadores invisibles para los puntos lógicos (cofres, armas, spawn):
    // el loot real lo dibuja LootManager, pero el editor debe poder seleccionarlos.
    const logicalMarkerGeo = new THREE.BoxGeometry(1.3, 1.3, 1.3);
    const logicalMarkerMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
    this.disposables.push(logicalMarkerGeo, logicalMarkerMat);

    // Carreteras: mismo dibujo por dirección que el editor y superficie en
    // rampa (nunca un escalón que se hunde o flota sobre el terreno).
    const roadKey4 = (rx, rz) => `${Math.round(rx / 4)},${Math.round(rz / 4)}`;
    const roadEntryKey = (type, rx, rz) => `${type}|${roadKey4(rx, rz)}`;
    const roadSet = new Map();
    for (const p of (pieces || [])) {
      if (!p || (p.type !== 'road' && p.type !== 'path')) continue;
      const rx = +p.x || 0, rz = +p.z || 0;
      roadSet.set(roadEntryKey(p.type, rx, rz), { x: rx, z: rz, type: p.type });
    }
    const roadCenterCache = new Map();
    const roadCenterY = (rx, rz, key) => {
      if (!roadCenterCache.has(key)) roadCenterCache.set(key, this.heightAt(rx, rz));
      return roadCenterCache.get(key);
    };
    const ROAD_DIRS = {
      n: { dx: 0, dz: -4 }, s: { dx: 0, dz: 4 },
      e: { dx: 4, dz: 0 }, w: { dx: -4, dz: 0 },
    };
    const roadConnections = (p, rx, rz) => {
      const out = {};
      for (const [name, d] of Object.entries(ROAD_DIRS)) {
        out[name] = roadSet.get(roadEntryKey(p.type, rx + d.dx, rz + d.dz)) || null;
      }
      return out;
    };
    const roadSurfaceY = (p, conn, rx, rz, lx, lz) => {
      const key = roadEntryKey(p.type, rx, rz);
      const cy = roadCenterY(rx, rz, key);
      // Usar la altura de la malla evita que la calzada se cuele entre vértices
      // del terreno cuando la función analítica no es lineal.
      const terrain = this.surfaceHeightAt(rx + lx, rz + lz);
      const blend = (neighbor, dist) => neighbor
        ? lerp(cy, roadCenterY(neighbor.x, neighbor.z, roadEntryKey(neighbor.type, neighbor.x, neighbor.z)), Math.min(0.5, dist / 4))
        : null;
      let hz = terrain, hx = terrain;
      if (lz < 0 && conn.n) hz = blend(conn.n, -lz);
      else if (lz > 0 && conn.s) hz = blend(conn.s, lz);
      if (lx < 0 && conn.w) hx = blend(conn.w, -lx);
      else if (lx > 0 && conn.e) hx = blend(conn.e, lx);
      const hasX = !!(conn.w || conn.e), hasZ = !!(conn.n || conn.s);
      const ramp = hasX && hasZ ? (hx + hz) * 0.5 : hasX ? hx : hasZ ? hz : terrain;
      // La calzada siempre por encima del terreno: jamás se oculta bajo él.
      return Math.max(terrain, ramp);
    };

    // Los edificios se nivelan primero: así las rampas de carretera se calculan
    // con el terreno definitivo, aunque una casa aparezca después en el array.
    const isBuildingType = (type) => type === 'house' || type === 'cabin' || type === 'tower' || type === 'container';
    const buildingLevels = new Map();
    const computeBuildingLevel = (p, x, z, rot, y) => {
      const fp = p.type === 'house' ? [8.5, 6.5] : p.type === 'cabin' ? [4.5, 4.5] : p.type === 'tower' ? [6, 6] : [7, 3];
      const k = ((Math.round((rot || 0) / (Math.PI / 2)) % 4) + 4) % 4;
      const fw = k % 2 ? fp[1] : fp[0], fd = k % 2 ? fp[0] : fp[1];
      let maxT = -Infinity, terrainMinY = Infinity;
      for (let dx = -fw / 2; dx <= fw / 2; dx += 0.5) {
        for (let dz = -fd / 2; dz <= fd / 2; dz += 0.5) {
          const ty = this.heightAt(x + dx, z + dz);
          if (ty > maxT) maxT = ty;
          if (ty < terrainMinY) terrainMinY = ty;
        }
      }
      const leveled = Math.ceil(maxT * 2) / 2;
      y = Math.max(y, leveled);
      if (y - maxT > 3) y = leveled;
      y = Math.round(y * 2) / 2;
      this.addTerrainFlat(x, z, fw / 2 + 0.8, fd / 2 + 0.8, rot, y, 4.5, 2);
      return { y, terrainMinY: Math.min(terrainMinY, y) };
    };
    for (let pi = 0; pi < pieces.length; pi++) {
      const p = pieces[pi];
      if (!p || !isBuildingType(p.type)) continue;
      const x = +p.x || 0, z = +p.z || 0, rot = +p.rot || 0;
      const baseY = (p.y != null && Number.isFinite(+p.y)) ? +p.y : this.surfaceHeightAt(x, z);
      buildingLevels.set(pi, computeBuildingLevel(p, x, z, rot, baseY));
    }
    this._hCache = new Map();
    roadCenterCache.clear();

    // Misma paleta y marcas que el editor (base + brazos + línea central).
    const roadMats = {
      road: new THREE.MeshStandardMaterial({ color: 0xc9d4d8, roughness: 1 }),
      roadMark: new THREE.MeshStandardMaterial({ color: 0xe0d4a8, roughness: 0.8 }),
      path: new THREE.MeshStandardMaterial({ color: 0xadb6b8, roughness: 1 }),
      pathMark: new THREE.MeshStandardMaterial({ color: 0xc2b688, roughness: 0.8 }),
    };
    for (const m of Object.values(roadMats)) {
      m.userData.roadOwned = true;
      this.disposables.push(m);
    }
    // Malla subdividida: cada vértice sigue el terreno y la rampa hacia los
    // tiles vecinos, por lo que nunca aparece como escalón ni se hunde.
    const roadGrid = (p, conn, rx, rz, baseY, x0, x1, z0, z1, topOffset, step = 0.5) => {
      const nx = Math.max(1, Math.ceil((x1 - x0) / step));
      const nz = Math.max(1, Math.ceil((z1 - z0) / step));
      const positions = [], uvs = [], indices = [];
      for (let iz = 0; iz <= nz; iz++) {
        const lz = z0 + (z1 - z0) * iz / nz;
        for (let ix = 0; ix <= nx; ix++) {
          const lx = x0 + (x1 - x0) * ix / nx;
          positions.push(lx, roadSurfaceY(p, conn, rx, rz, lx, lz) - baseY + topOffset, lz);
          uvs.push(ix / nx, iz / nz);
        }
      }
      for (let iz = 0; iz < nz; iz++) {
        for (let ix = 0; ix < nx; ix++) {
          const a = iz * (nx + 1) + ix;
          const b = a + 1;
          const d = a + nx + 1;
          const e = d + 1;
          indices.push(a, d, b, b, d, e);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      geo.userData.roadOwned = true;
      this.disposables.push(geo);
      return geo;
    };
    const addRoadMesh = (parent, geo, mat) => {
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = false;
      m.receiveShadow = true;
      parent.add(m);
      return m;
    };

    const cosS = (rot) => Math.cos(rot), sinS = (rot) => Math.sin(rot);

    for (let pi = 0; pi < pieces.length; pi++) {
      const p = pieces[pi];
      // Un grupo por pieza (incluso las lógicas) mantiene el índice del editor
      // alineado con el array de piezas guardadas.
      const g = new THREE.Group();
      pieceGroups.push(g);
      if (!p || !p.type) { group.add(g); continue; }
      if (p.type === 'egd_object') { this._placeEgdObject(p, g); group.add(g); continue; }
      const x = +p.x || 0, z = +p.z || 0;
      let rot = +p.rot || 0;
      // Determinar altura base: edificios ya nivelados en el pre-paso; caminos siguen el terreno.
      let y = (p.y != null && Number.isFinite(+p.y)) ? +p.y : this.surfaceHeightAt(x, z);
      let terrainMinY = y;
      const isBuilding = isBuildingType(p.type);
      if (isBuilding) {
        const level = buildingLevels.get(pi);
        y = level.y;
        terrainMinY = level.terrainMinY;
      } else if (p.type === 'road' || p.type === 'path') {
        // La superficie en rampa se genera abajo con la altura real del terreno
        // y de los tiles vecinos. No se aplana ni se redondea a escalones.
        y = this.surfaceHeightAt(x, z);
        rot = 0;
      }
      const bed = this.heightAt(x, z);
      const wy = this.waterYAt ? this.waterYAt(x, z) : (this.waterLevel ?? -100);
      const inWater = wy > -20 && bed < wy - 0.05;
      if (inWater && /^(tree|tree_|grass|bush|fern|flower|plant|shrub)/i.test(p.type || '')) { group.add(g); continue; }
      if (inWater && /rock|pebble|boulder/i.test(p.type || '')) y = bed;
      g.position.set(x, y, z);
      g.rotation.y = rot;
      const floors = Math.max(1, Math.min(3, Math.round(+p.floors || 1)));
      const isStructure = ['house','cabin','tower','container','wall','wall_corner','column','wall_door','wall_window','floor','roof','stairs','road','path'].includes(p.type);
      const isLogical = ['chest','weapon_spawn','spawn','loot_spawn'].includes(p.type);
      if (isLogical) {
        const marker = new THREE.Mesh(logicalMarkerGeo, logicalMarkerMat);
        marker.position.y = 0.65;
        g.add(marker);
        group.add(g);
        continue;
      }
      if (p.modelSrc && !isStructure) {
        const custom = cloneCustom(p.modelSrc);
        if (custom) {
          const s = applyCustomTransform(custom, p, 1);
          g.add(custom);
          // Colliders aproximados por tipo
          if (/^tree|^pine|^palm/i.test(p.type)) addBoxCollider(x, y, z, 1.2, 5 * s, 1.2, rot);
          else if (/rock|pebble|boulder/i.test(p.type)) { const cs = p.type === 'rock_big' ? 3.8*s : p.type === 'rock_small' ? 0.9*s : 2.2*s; const ch = p.type === 'rock_big' ? 2.6*s : p.type === 'rock_small' ? 0.6*s : 1.6*s; addBoxCollider(x, y, z, cs, ch, cs, rot); }
          else if (/crate|barrel|bench|lamp|fence/i.test(p.type)) { addBoxCollider(x, y, z, 1.2*s, 1.2*s, 1.2*s, rot); }
          // grass/bush/plant/flower: sin collider
          group.add(g);
          continue;
        }
      }

      if (p.type === 'house') {
        this._buildCustomHouse(g, x, y, z, rot, floors, terrainMinY);
      } else if (p.type === 'cabin') {
        this._buildKitCabin(g, x, y, z, rot, floors, terrainMinY);
      } else if (p.type === 'wall' || p.type === 'wall_corner' || p.type === 'column' || p.type === 'wall_door' || p.type === 'wall_window' || p.type === 'floor' || p.type === 'roof' || p.type === 'stairs') {
        // Pieza individual de kit (alineada al mÃ³dulo). Se coloca con su base en y.
        const kitName = BUILD_PIECES[p.type]?.kit || (p.type === 'wall' ? 'wall' : p.type === 'wall_corner' ? 'wall_corner' : p.type === 'column' ? 'column' : p.type === 'floor' ? 'floor' : p.type === 'roof' ? 'roof_flat_center' : p.type === 'stairs' ? 'stairs_closed' : 'wall');
        const obj = this._cloneBuildKit(kitName);
        if (obj) {
          const def = KIT_CATALOG[kitName];
          if (def?.role === 'window') obj.traverse((o) => { if (o.isMesh) { const m = o.material; const mats = Array.isArray(m) ? m : [m]; if (mats.some(isGlassMaterial)) o.visible = false; } });
          const tall = def && (def.role === 'wall' || def.role === 'door' || def.role === 'window' || def.role === 'stairs' || def.role === 'column');
          const sy = tall ? KIT_WALL_VIS_Y : 1;
          if (sy !== 1) obj.scale.set(1, sy, 1);
          g.add(obj);
          const cols = kitPieceGameplayColliders(kitName, x, y, z, rot, sy);
          for (const c of cols) this.addCollider(c.minX, c.maxX, c.minY, c.maxY, c.minZ, c.maxZ, c.role ? { role: c.role, windowSillY: c.windowSillY, windowTopY: c.windowTopY } : null);
          if (def?.role === 'door') this.registerDoor(kitName, x, y, z, rot, sy);
          if (def?.role === 'window') this.registerWindowGlass(kitName, x, y, z, rot, sy);
        } else {
          // fallback primitivo alineado a mÃ³dulo 2u
          if (p.type === 'wall') {
            addMesh(g, new THREE.BoxGeometry(0.2, KIT_WALL_H, 2), new THREE.MeshStandardMaterial({ color: 0xc2b08a, roughness: 0.85 }), 0, KIT_WALL_H / 2, 0);
            addBoxCollider(x, y, z, 0.3, KIT_WALL_H, 2, rot);
          } else if (p.type === 'wall_door') {
            addMesh(g, new THREE.BoxGeometry(0.2, KIT_WALL_H, 2), new THREE.MeshStandardMaterial({ color: 0xc2b08a, roughness: 0.85 }), 0, KIT_WALL_H / 2, 0);
            // hueco de puerta en fallback: postes + dintel
            const openW = 1.1, openH = 2.05, post = (2 - openW) / 2;
            // construir como piezas separadas locales con colisionadores simples segÃºn rot
            const rotAABB = (w, d, r) => { const k = ((Math.round((r || 0) / (Math.PI / 2)) % 4) + 4) % 4; return k % 2 ? { w: d, d: w } : { w, d }; };
            const addLocalCol = (lx, ly, lz, w, h, d) => {
              const cos = Math.cos(rot), sin = Math.sin(rot);
              const wx = x + lx * cos + lz * sin;
              const wz = z - lx * sin + lz * cos;
              const r = rotAABB(w, d, rot);
              this.addCollider(wx - r.w / 2, wx + r.w / 2, y + ly, y + ly + h, wz - r.d / 2, wz + r.d / 2);
            };
            addLocalCol(0, 0, -(openW / 2 + post / 2), 0.3, KIT_WALL_H, post);
            addLocalCol(0, 0,  (openW / 2 + post / 2), 0.3, KIT_WALL_H, post);
            addLocalCol(0, openH, 0, 0.3, KIT_WALL_H - openH, openW);
          } else if (p.type === 'wall_window') {
            addMesh(g, new THREE.BoxGeometry(0.2, KIT_WALL_H, 2), new THREE.MeshStandardMaterial({ color: 0xc2b08a, roughness: 0.85 }), 0, KIT_WALL_H / 2, 0);
            // Marco + cristal rompible
            const glassW = 1.2, sill = 0.9, top = 2.05;
            const post = (2 - glassW) / 2;
            const cos = Math.cos(rot), sin = Math.sin(rot);
            const rotAABB2 = (w,d,r)=>{ const k=((Math.round((r||0)/(Math.PI/2))%4)+4)%4; return k%2?{w:d,d:w}:{w,d}; };
            const addLC = (lx,ly,lz,w,h,d,meta=null)=>{ const wx=x+lx*cos+lz*sin, wz=z-lx*sin+lz*cos, rr=rotAABB2(w,d,rot); this.addCollider(wx-rr.w/2,wx+rr.w/2,y+ly,y+ly+h,wz-rr.d/2,wz+rr.d/2,meta); };
            addLC(0,0,-(glassW/2+post/2),0.3,KIT_WALL_H,post,{role:'windowFrame'});
            addLC(0,0, (glassW/2+post/2),0.3,KIT_WALL_H,post,{role:'windowFrame'});
            addLC(0,0,0,0.3,sill,glassW,{role:'windowFrame'});
            addLC(0,top,0,0.3,KIT_WALL_H-top,glassW,{role:'windowFrame'});
            this.registerWindowGlass('wall_window_square', x, y, z, rot, 1);
          } else if (p.type === 'column') {
            addMesh(g, new THREE.CylinderGeometry(0.25, 0.25, KIT_WALL_H, 8), new THREE.MeshStandardMaterial({ color: 0xc2b08a, roughness: 0.85 }), 0, KIT_WALL_H / 2, 0);
            addBoxCollider(x, y, z, 0.5, KIT_WALL_H, 0.5, rot);
          } else if (p.type === 'wall_corner') {
            addMesh(g, new THREE.BoxGeometry(2, KIT_WALL_H, 2), new THREE.MeshStandardMaterial({ color: 0xc2b08a, roughness: 0.85 }), 0, KIT_WALL_H / 2, 0);
            addBoxCollider(x, y, z, 2, KIT_WALL_H, 2, rot);
          } else if (p.type === 'floor' || p.type === 'roof') {
            addMesh(g, new THREE.BoxGeometry(2, 0.1, 2), new THREE.MeshStandardMaterial({ color: 0x8a7a5e, roughness: 0.9 }), 0, 0.05, 0);
          } else if (p.type === 'stairs') {
            addMesh(g, new THREE.BoxGeometry(1.3, KIT_FLOOR_H, 4), new THREE.MeshStandardMaterial({ color: 0x7b5738, roughness: 0.8 }), 0, KIT_FLOOR_H / 2, 0);
            addBoxCollider(x, y, z, 1.3, KIT_FLOOR_H, 4, rot);
          }
        }
      } else if (p.type === 'tree' || p.type.startsWith('tree_')) {
        const variants = {
          tree_pine: ['Pine_1','Pine_2','Pine_4'],
          tree_round: ['CommonTree_1','CommonTree_2','CommonTree_3'],
          tree_palm: ['CoconutPalm_1','CoconutPalm_2','CoconutPalm_3'],
          tree_tall: ['Pine_1','CommonTree_1','Pine_2'],
          tree_birch: ['CommonTree_2','CommonTree_1','CommonTree_3'],
          tree_dead: ['CommonTree_3','CommonTree_1','Pine_4'],
          tree_willow: ['CommonTree_1','CommonTree_2','CommonTree_3'],
          tree_autumn: ['CommonTree_1','CommonTree_2','CommonTree_3'],
        };
        const pool = variants[p.type] || ['CommonTree_1','CommonTree_2','CommonTree_3','Pine_1','Pine_2'];
        const custom = p.modelSrc ? cloneCustom(p.modelSrc) : null;
        if (custom) {
          applyCustomTransform(custom, p, 1);
          g.add(custom);
        } else {
          const modelName = p.model || pool[Math.abs(((x*73856093)^(z*19349663))|0) % pool.length];
          const tree = this._cloneNatureModel(modelName) || this._cloneNatureModel(pool[0]) || this._cloneNatureModel('CommonTree_1');
          const tintTree = (root, leafHex, trunkHex) => {
            if (!root) return;
            root.traverse((o) => {
              if (!o.isMesh) return;
              const mats = Array.isArray(o.material) ? o.material : [o.material];
              const next = mats.map((m) => {
                if (!m) return m;
                const mc = m.clone();
                const n = (m.name || o.name || '').toLowerCase();
                if (leafHex && (n.includes('leaf') || n.includes('leaves') || n.includes('foliage'))) mc.color?.setHex(leafHex);
                else if (trunkHex && (n.includes('trunk') || n.includes('bark') || n.includes('wood'))) mc.color?.setHex(trunkHex);
                else if (leafHex && mc.color && mc.color.g > mc.color.r * 0.8) mc.color.lerp(new THREE.Color(leafHex), 0.7);
                return mc;
              });
              o.material = Array.isArray(o.material) ? next : next[0];
            });
          };
          if (tree) {
            let s = p.scale || 1;
            if (p.type === 'tree_tall') s *= 1.15;
            if (p.type === 'tree_birch') { s *= 0.95; tintTree(tree, 0x7fc75a, 0xe1dccf); }
            if (p.type === 'tree_dead') { s *= 0.95; tintTree(tree, 0x6b5a48, 0x6b5a48); }
            if (p.type === 'tree_willow') { s *= 1.1; tintTree(tree, 0x72a85a, 0x7a5a3a); }
            if (p.type === 'tree_autumn') { tintTree(tree, 0xd9772b, 0x7a5738); }
            tree.scale.setScalar(s);
            g.add(tree);
          } else {
            addMesh(g, new THREE.CylinderGeometry(0.3, 0.4, 4, 8), new THREE.MeshStandardMaterial({ color: 0x7b5738 }), 0, 2, 0);
            addMesh(g, new THREE.SphereGeometry(2.5, 8, 8), new THREE.MeshStandardMaterial({ color: 0x2f6b3e, roughness: 0.9 }), 0, 5.5, 0);
          }
        }
        addBoxCollider(x, y, z, 1.2, 5 * (p.scale || 1), 1.2, rot);
      } else if (p.type === 'rock' || p.type === 'rock_big' || p.type === 'rock_small') {
        const custom = p.modelSrc ? cloneCustom(p.modelSrc) : null;
        if (custom) {
          applyCustomTransform(custom, p, 1);
          g.add(custom);
        } else {
          const pool = p.type === 'rock_small'
            ? ['Pebble_Round_1', 'Pebble_Square_1', 'Rock_Medium_3']
            : ['Rock_Medium_1', 'Rock_Medium_2', 'Rock_Medium_3'];
          const modelName = p.model || pool[Math.abs(((x * 83492791) ^ (z * 19349663)) | 0) % pool.length];
          const rock = this._cloneNatureModel(modelName) || this._cloneNatureModel('Rock_Medium_1');
          if (rock) {
            let s = p.scale || 1;
            if (p.type === 'rock_big') s *= 1.8;
            if (p.type === 'rock_small') s *= 0.45;
            rock.scale.setScalar(s);
            g.add(rock);
          } else {
            const size = p.type === 'rock_big' ? 2.6 : p.type === 'rock_small' ? 0.55 : 1.5;
            addMesh(g, new THREE.DodecahedronGeometry(size), new THREE.MeshStandardMaterial({ color: 0x777b74, roughness: 0.95 }), 0, size * 0.55, 0);
          }
        }
        const colS = p.type === 'rock_big' ? 3.8 : p.type === 'rock_small' ? 0.9 : 2.2;
        const colH = p.type === 'rock_big' ? 2.6 : p.type === 'rock_small' ? 0.6 : 1.6;
        addBoxCollider(x, y, z, colS, colH, colS, rot);
      } else if (p.type === 'grass') {
        const custom = p.modelSrc ? cloneCustom(p.modelSrc) : null;
        if (custom) {
          applyCustomTransform(custom, p, 1);
          g.add(custom);
        } else {
          const gm = new THREE.MeshStandardMaterial({ color: 0x4f8a3e, roughness: 1 });
          const count = 5;
          for (let i = 0; i < count; i++) {
            const a = (i / count) * Math.PI * 2 + (Math.abs(((x*13+i*7)|0)^(z*17)) % 10) * 0.04;
            const r = 0.08 + ((Math.abs((x*31+i*11)|0) % 10) / 100);
            const h = 0.25 + ((Math.abs((z*29+i*13)|0) % 20) / 100);
            addMesh(g, new THREE.ConeGeometry(r, h, 5), gm, Math.cos(a) * 0.15, h / 2, Math.sin(a) * 0.15);
          }
          const s = p.scale || 1;
          g.scale.setScalar(s);
        }
      } else if (p.type === 'road' || p.type === 'path') {
        const isRoad = p.type === 'road';
        const conn = roadConnections(p, x, z);
        const halfW = isRoad ? 0.6 : 0.8;
        const stoneMat = isRoad ? roadMats.road : roadMats.path;
        const markMat = isRoad ? roadMats.roadMark : roadMats.pathMark;
        const arms = [];
        if (conn.n) arms.push(['n', -halfW, halfW, -2, 0]);
        if (conn.s) arms.push(['s', -halfW, halfW, 0, 2]);
        if (conn.e) arms.push(['e', 0, 2, -halfW, halfW]);
        if (conn.w) arms.push(['w', -2, 0, -halfW, halfW]);
        if (!arms.length) arms.push(['n', -halfW, halfW, -2, 0], ['s', -halfW, halfW, 0, 2]);

        // Base 4x4 de piedra y brazos hacia los vecinos, con la misma forma del
        // editor pero apoyada en la rampa calculada arriba.
        addRoadMesh(g, roadGrid(p, conn, x, z, y, -2, 2, -2, 2, 0.12), stoneMat);
        for (const [, x0, x1, z0, z1] of arms) {
          addRoadMesh(g, roadGrid(p, conn, x, z, y, x0, x1, z0, z1, 0.128), stoneMat);
        }
        if (isRoad) {
          // Línea central de cada brazo, como en el editor.
          for (const [dir] of arms) {
            let mx0, mx1, mz0, mz1;
            if (dir === 'e' || dir === 'w') {
              const cx = dir === 'e' ? 1 : -1;
              mx0 = cx - 0.9; mx1 = cx + 0.9; mz0 = -0.07; mz1 = 0.07;
            } else {
              const cz = dir === 's' ? 1 : -1;
              mx0 = -0.07; mx1 = 0.07; mz0 = cz - 0.9; mz1 = cz + 0.9;
            }
            addRoadMesh(g, roadGrid(p, conn, x, z, y, mx0, mx1, mz0, mz1, 0.14, 0.25), markMat);
          }
        }
        const capGeo = new THREE.CircleGeometry(isRoad ? 0.45 : 0.55, 12);
        capGeo.rotateX(-Math.PI / 2);
        capGeo.userData.roadOwned = true;
        this.disposables.push(capGeo);
        const cap = addRoadMesh(g, capGeo, stoneMat);
        cap.position.y = roadSurfaceY(p, conn, x, z, 0, 0) - y + 0.13;

        // Estilo profesional: piedra con pequeños baches facetados y extremidades
        // de madera (esferas/carritos) a los lados de las conexiones.
        const roadDecoMat = new THREE.MeshStandardMaterial({ color: 0xc3cdd2, roughness: 1 });
        const woodDecoMat = new THREE.MeshStandardMaterial({ color: 0x6c5337, roughness: 0.85 });
        this.disposables.push(roadDecoMat, woodDecoMat);
        const bumpGeo = new THREE.ConeGeometry(0.14, 0.2, 5);
        const spikeGeo = new THREE.CylinderGeometry(0.07, 0.18, 0.32, 7);
        spikeGeo.rotateX(-Math.PI / 2);
        const ballGeo = new THREE.SphereGeometry(0.17, 8, 6);
        this.disposables.push(bumpGeo, spikeGeo, ballGeo);
        const decoAt = (geo, mat, px, py, pz, sx = 1, sy = 1, sz = 1) => {
          const m = new THREE.Mesh(geo, mat);
          m.scale.set(sx, sy, sz);
          m.position.set(px, py, pz);
          m.castShadow = true;
          m.receiveShadow = true;
          g.add(m);
          this.disposables.push(m);
        };
        const surfaceAt = (lx, lz) => roadSurfaceY(p, conn, x, z, lx, lz) - y;
        for (let lx = -2; lx <= 2.001; lx += 1.25) {
          for (let lz = -2; lz <= 2.001; lz += 1.25) {
            const det = (Math.abs(lx) < 0.5 && Math.abs(lz) < 0.5) ? 1 : 0;
            const bump = det + 0.5 + 0.3 * Math.sin((lx * 7 + lz * 13 + x * 3 + z * 5) * 0.8) + 0.2 * Math.cos((lx - lz) * 5);
            const scale = Math.max(0.55, Math.min(0.95, 0.7 + 0.15 * ((Math.abs(lx * 0.35 + lz * 0.22 + x * 0.02 + z * 0.03) % 1))));
            decoAt(bumpGeo, roadDecoMat, lx, surfaceAt(lx, lz) + 0.2 + bump * 0.08, lz, scale, scale, scale);
          }
        }
        if (isRoad) {
          const sideNormal = { n: [-1, 0], s: [1, 0], e: [0, 1], w: [0, -1] };
          const dirVec = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
          for (const [dir, x0, x1, z0, z1] of arms) {
            const cx = (x0 + x1) / 2, cz2 = (z0 + z1) / 2;
            const [nx, nz] = sideNormal[dir] || [0, 0];
            const [dx, dz] = dirVec[dir] || [0, 0];
            const s = halfW + 0.16;
            for (let t = -1.5; t <= 1.5 + 1e-6; t += 1.1) {
              const px = cx + nx * s + dx * t, pz = cz2 + nz * s + dz * t;
              const baseH = surfaceAt(px, pz) + 0.14;
              decoAt(spikeGeo, woodDecoMat, px, baseH, pz, 0.72, 0.8 + 0.2 * Math.abs(t / 1.5), 0.72);
              if (Math.abs(t) <= 0.8) decoAt(ballGeo, woodDecoMat, px + dx * 0.25, baseH + 0.08, pz + dz * 0.25, 0.92, 0.95, 0.92);
            }
          }
        }
        // Registrar para que la naturaleza evite colocarse sobre caminos.
        if (this.roadCircles) this.roadCircles.push({ x, z, radius: 2.1 });
      } else if (p.type === 'tower') {
        addMesh(g, new THREE.CylinderGeometry(2.6, 2.8, 2, 8), new THREE.MeshStandardMaterial({ color: 0xc2b08a, roughness: 0.85 }), 0, 1, 0);
        addMesh(g, new THREE.CylinderGeometry(2, 2.5, 12, 8), new THREE.MeshStandardMaterial({ color: 0xd4c4a8, roughness: 0.85 }), 0, 8, 0);
        addMesh(g, new THREE.CylinderGeometry(2.6, 2.6, 0.4, 8), new THREE.MeshStandardMaterial({ color: 0x8c4f3c, roughness: 0.8 }), 0, 14.2, 0);
        addBoxCollider(x, y, z, 5.6, 14.4, 5.6, rot);
      } else if (p.type === 'container') {
        addMesh(g, new THREE.BoxGeometry(6.2, 0.3, 2.6), new THREE.MeshStandardMaterial({ color: 0xc2b08a, roughness: 0.85 }), 0, 0.15, 0);
        addMesh(g, new THREE.BoxGeometry(6, 2.4, 2.4), new THREE.MeshStandardMaterial({ color: 0xe2843c, roughness: 0.6, metalness: 0.3 }), 0, 1.5, 0);
        addBoxCollider(x, y, z, 6.2, 2.8, 2.6, rot);
      } else if (p.type === 'crate') {
        const body = addMesh(g, new THREE.BoxGeometry(0.9, 0.9, 0.9), new THREE.MeshStandardMaterial({ color: 0x8a6336, roughness: 0.85 }), 0, 0.45, 0);
        addMesh(g, new THREE.BoxGeometry(0.95, 0.08, 0.95), new THREE.MeshStandardMaterial({ color: 0x6f4c28, roughness: 0.9 }), 0, 0.92, 0);
        addBoxCollider(x, y, z, 0.95, 0.95, 0.95, rot);
      } else if (p.type === 'barrel') {
        addMesh(g, new THREE.CylinderGeometry(0.38, 0.42, 1.1, 12), new THREE.MeshStandardMaterial({ color: 0x7a4a2a, roughness: 0.8, metalness: 0.05 }), 0, 0.55, 0);
        addMesh(g, new THREE.TorusGeometry(0.4, 0.03, 6, 16), new THREE.MeshStandardMaterial({ color: 0x44484f, roughness: 0.5, metalness: 0.6 }), 0, 0.28, 0, Math.PI / 2, 0, 0);
        addMesh(g, new THREE.TorusGeometry(0.39, 0.03, 6, 16), new THREE.MeshStandardMaterial({ color: 0x44484f, roughness: 0.5, metalness: 0.6 }), 0, 0.78, 0, Math.PI / 2, 0, 0);
        addBoxCollider(x, y, z, 0.9, 1.1, 0.9, rot);
      } else if (p.type === 'lamp') {
        addMesh(g, new THREE.CylinderGeometry(0.06, 0.08, 2.4, 8), new THREE.MeshStandardMaterial({ color: 0x3f4650, roughness: 0.6, metalness: 0.5 }), 0, 1.2, 0);
        addMesh(g, new THREE.BoxGeometry(0.5, 0.08, 0.1), new THREE.MeshStandardMaterial({ color: 0x3f4650, roughness: 0.6, metalness: 0.5 }), 0.18, 2.25, 0);
        addMesh(g, new THREE.SphereGeometry(0.16, 10, 10), new THREE.MeshStandardMaterial({ color: 0xfff0b8, emissive: 0xffd36a, emissiveIntensity: 0.35, roughness: 0.4 }), 0.38, 2.12, 0);
        addBoxCollider(x, y, z, 0.35, 2.4, 0.35, rot);
      } else if (p.type === 'bench') {
        addMesh(g, new THREE.BoxGeometry(1.8, 0.12, 0.5), new THREE.MeshStandardMaterial({ color: 0x7b5738, roughness: 0.85 }), 0, 0.48, 0);
        addMesh(g, new THREE.BoxGeometry(1.8, 0.5, 0.1), new THREE.MeshStandardMaterial({ color: 0x6f4c28, roughness: 0.85 }), 0, 0.78, -0.2);
        addMesh(g, new THREE.BoxGeometry(0.1, 0.45, 0.45), new THREE.MeshStandardMaterial({ color: 0x4a5563, roughness: 0.6, metalness: 0.4 }), -0.75, 0.22, 0);
        addMesh(g, new THREE.BoxGeometry(0.1, 0.45, 0.45), new THREE.MeshStandardMaterial({ color: 0x4a5563, roughness: 0.6, metalness: 0.4 }), 0.75, 0.22, 0);
        addBoxCollider(x, y, z, 1.9, 1.0, 0.6, rot);
      } else if (p.type === 'fence' || p.type === 'wall') {
        // valla/muro bajo modular (si no se resolviÃ³ como pieza de kit)
        addMesh(g, new THREE.BoxGeometry(0.12, 1.0, 2), new THREE.MeshStandardMaterial({ color: 0x8a6336, roughness: 0.85 }), 0, 0.5, 0);
        addMesh(g, new THREE.BoxGeometry(0.14, 0.12, 2), new THREE.MeshStandardMaterial({ color: 0x7b5738, roughness: 0.8 }), 0, 0.95, 0);
        addBoxCollider(x, y, z, 0.25, 1.0, 2, rot);
      } else if (p.type === 'bush') {
        const custom = p.modelSrc ? cloneCustom(p.modelSrc) : null;
        if (custom) {
          applyCustomTransform(custom, p, 1);
          g.add(custom);
        } else {
          const modelName = p.model || (['Bush_Common', 'Bush_Common_Flowers', 'Fern_1'][Math.abs(((x * 934931) ^ (z * 73856093)) | 0) % 3]);
          const bush = this._cloneNatureModel(modelName) || this._cloneNatureModel('Bush_Common');
          if (bush) {
            const s = p.scale || 0.9;
            bush.scale.setScalar(s);
            g.add(bush);
          } else {
            addMesh(g, new THREE.SphereGeometry(0.8, 8, 8), new THREE.MeshStandardMaterial({ color: 0x3f7a3f, roughness: 0.95 }), 0, 0.55, 0);
          }
        }
      } else {
        const custom = p.modelSrc ? cloneCustom(p.modelSrc) : null;
        if (custom) {
          const s = applyCustomTransform(custom, p, 1);
          g.add(custom);
          addBoxCollider(x, y, z, Math.max(0.5, 1*s), Math.max(0.5, 1*s), Math.max(0.5, 1*s), rot);
        } else {
          continue;
        }
      }
      group.add(g);
    }
    this.root.add(group);
    const result = { root: group, list: pieceGroups };
    this.customPieceGroup = result;
    return result;
  }

  /** Casa modular compuesta con piezas del kit (mÃ³dulo 2u, altura de planta 2.5u). Huella 8x6u. */
  _buildCustomHouse(g, wx, wy, wz, rot, floors, terrainMinY = null) {
    const floorsN = Math.max(1, Math.min(3, Math.round(floors || 1)));
    const cos = Math.cos(rot), sin = Math.sin(rot);
    const w2 = (lx, lz) => ({ x: wx + lx * cos + lz * sin, z: wz - lx * sin + lz * cos });
    const part = (kitName, lx, ly, lz, ry = 0, tint = null, collide = true) => {
      const wp = w2(lx, lz);
      const obj = this._placeKitPart(g, kitName, lx, ly, lz, ry, tint, collide, wp.x, wy + ly, wp.z, rot + ry);
      return obj;
    };
    const wallTint = 0xe8dcc6;
    const wallTint2 = 0xd8ccb3;
    const floorTint = 0x9a8a70;
    const roofTint = 0x5b7fa6; // tejado azulado, mÃ¡s legible estilo Fortnite

    // Cimiento sÃ³lido: rellena el desnivel del terreno para que la casa encaje.
    const minY = (terrainMinY != null && Number.isFinite(terrainMinY)) ? terrainMinY : (wy - 1);
    const fDepth = Math.max(0.8, (wy - minY) + 1.5);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x8f8268, roughness: 0.96 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(8.8, fDepth, 6.8), baseMat);
    base.position.set(0, -fDepth / 2 - 0.03, 0);
    base.receiveShadow = true; base.castShadow = true;
    g.add(base);
    // ZÃ³calo superior limpio
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(8.5, 0.18, 6.5), new THREE.MeshStandardMaterial({ color: 0xa3957b, roughness: 0.92 }));
    plinth.position.set(0, -0.12, 0);
    plinth.receiveShadow = true; plinth.castShadow = true;
    g.add(plinth);

    // Huella 8 (X: -3,-1,1,3) x 6 (Z: -2,0,2) mÃ³dulos de 2u
    const xs = [-3, -1, 1, 3];
    const zs = [-2, 0, 2];

    // Suelo de planta baja
    for (const ox of xs) for (const oz of zs) part('floor', ox, 0, oz, 0, floorTint, true);

    for (let f = 0; f < floorsN; f++) {
      const by = f * KIT_FLOOR_H + KIT_SLAB_H; // base de muros sobre losa
      // Paredes: pieza por defecto 2u de largo en Z; para correr a lo largo de X rotar 90Â°.
      // Pared trasera (z = +3), corre en X
      part('wall_window_square', -3, by, 3, Math.PI / 2, wallTint, true);
      part('wall_window_square', -1, by, 3, Math.PI / 2, wallTint, true);
      part('wall_window_square',  1, by, 3, Math.PI / 2, wallTint, true);
      part('wall_window_square',  3, by, 3, Math.PI / 2, wallTint, true);
      // Pared frontal (z = -3), corre en X (planta baja con puerta amplia y visible)
      if (f === 0) {
        part('wall_window_square', -3, by, -3, Math.PI / 2, wallTint, true);
        part('wall_doorway_wide',   0, by, -3, Math.PI / 2, wallTint, true); // 4u de ancho = entrada amplia
        part('wall_window_square',  3, by, -3, Math.PI / 2, wallTint, true);
      } else {
        part('wall_window_square', -3, by, -3, Math.PI / 2, wallTint, true);
        part('wall_window_square', -1, by, -3, Math.PI / 2, wallTint, true);
        part('wall_window_square',  1, by, -3, Math.PI / 2, wallTint, true);
        part('wall_window_square',  3, by, -3, Math.PI / 2, wallTint, true);
      }
      // Lados (x = -4 y +4), corren en Z
      part('wall_window_square', -4, by, -2, 0, wallTint2, true);
      part('wall',               -4, by,  0, 0, wallTint2, true);
      part('wall_window_square', -4, by,  2, 0, wallTint2, true);
      part('wall_window_square',  4, by, -2, Math.PI, wallTint2, true);
      part('wall',                4, by,  0, Math.PI, wallTint2, true);
      part('wall_window_square',  4, by,  2, Math.PI, wallTint2, true);

      const topY = by + KIT_WALL_H;
      // Trim de planta (lectura visual tipo Fortnite)
      const trimMat = new THREE.MeshStandardMaterial({ color: 0x3f4f61, roughness: 0.7, metalness: 0.05 });
      const trimH = 0.12;
      const trimY = topY - trimH - 0.02;
      const t1 = new THREE.Mesh(new THREE.BoxGeometry(8.3, trimH, 0.12), trimMat); t1.position.set(0, trimY, -3.06); t1.castShadow = true; t1.receiveShadow = true; g.add(t1);
      const t2 = new THREE.Mesh(new THREE.BoxGeometry(8.3, trimH, 0.12), trimMat); t2.position.set(0, trimY, 3.06); t2.castShadow = true; t2.receiveShadow = true; g.add(t2);
      const t3 = new THREE.Mesh(new THREE.BoxGeometry(0.12, trimH, 6.2), trimMat); t3.position.set(-4.06, trimY, 0); t3.castShadow = true; t3.receiveShadow = true; g.add(t3);
      const t4 = new THREE.Mesh(new THREE.BoxGeometry(0.12, trimH, 6.2), trimMat); t4.position.set(4.06, trimY, 0); t4.castShadow = true; t4.receiveShadow = true; g.add(t4);
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
        // Escalera sube en direcciÃ³n -Z a +Z (profundidad 4u cubre z=-2..2)
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
      if (placed === 0) console.warn(`El kit ${variant.model} no encontrÃ³ ubicaciones vÃ¡lidas.`);
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
    if (box.isEmpty()) throw new Error('El GLB no contiene geometrÃ­a vÃ¡lida');

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
    this.waterDetailTexture = makeWaterDetailTexture();
    this.textures.push(this.waterDetailTexture);
    this.terrainPalette = terrainPalette(this.map.theme);
    const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.88, metalness: 0.03, ...extra });
    return {
      wall: std(t.wall, { map: brickTex }), wall2: std(t.wall2, { map: brickTex }),
      roof: std(t.roof, { map: tileTex }), wood: std(t.wood, { map: woodTex }),
      metal: std(t.metal, { map: metalTex, metalness: 0.55, roughness: 0.45 }),
      glass: std(t.glass, { metalness: 0.3, roughness: 0.15, transparent: true, opacity: 0.72 }),
      concrete: std(t.concrete, { map: concreteTex }),
      accent: std(t.accent, { map: metalTex, roughness: 0.6 }),
      dark: std(t.dark), road: std(0x3c4045, { roughness: 0.96 }),
      terrain: makeTerrainMaterial(this.terrainPalette),
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
    // Sol elevado y cálido: define la dirección de luz/sombras.
    const phi = THREE.MathUtils.degToRad(50);
    const theta = THREE.MathUtils.degToRad(130);
    this.sunDirection = new THREE.Vector3().setFromSphericalCoords(1, phi, theta);

    // Cielo cartoon de dos bandas planas, sin dispersión atmosférica.
    const top = new THREE.Color(this.theme.sky);
    const bottom = top.clone().lerp(new THREE.Color(0xffffff), 0.62);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTop: { value: top },
        uBottom: { value: bottom },
      },
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 uTop;
        uniform vec3 uBottom;
        varying vec3 vDir;
        void main() {
          float h = normalize(vDir).y;
          gl_FragColor = vec4(mix(uBottom, uTop, step(0.06, h)), 1.0);
        }`,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), mat);
    this.sky.scale.setScalar(450000);
    this.sky.frustumCulled = false;
    this.root.add(this.sky);
    this.disposables.push(this.sky.geometry, mat);
    this.scene.fog = new THREE.Fog(this.theme.sky, 650, 2600);
    this.scene.background = new THREE.Color(this.theme.sky);
  }

  updateSkyForPosition(pos) {
    this.sky.position.set(pos.x, 0, pos.z);
  }

  setupLights() {
    this.hemi = new THREE.HemisphereLight(this.theme.sky, this.theme.grass, 0.35 * this.theme.sun);
    this.root.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff6d8, 0.85 * this.theme.sun);
    this.sun.position.copy(this.sunDirection).multiplyScalar(500);
    this.sun.target.position.set(0, 0, 0);
    this.root.add(this.sun, this.sun.target);
    const size = this.settings.get('shadows') ? this.settings.get('shadowMapSize') : 1024;
    this.sun.shadow.mapSize.set(size, size);
    this.sun.shadow.camera.near = 0.5;
    this.sun.shadow.camera.far = 1200;
    // Isla pequeÃ±a: frustum fijo cubre el mapa y evita actualizar sombra cada frame.
    const cover = Math.min(420, Math.max(260, (this.half || 180) + 80));
    Object.assign(this.sun.shadow.camera, { left: -cover, right: cover, top: cover, bottom: -cover });
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.02;
    this.sun.castShadow = !!this.settings.get('shadows');
    this.sun.shadow.autoUpdate = !!this.settings.get('shadows');
    this.sun.shadow.needsUpdate = !!this.settings.get('shadows');
    this._staticSun = (this.half || 180) <= 260; // mapas pequeÃ±os: luz/sombra estÃ¡tica
    if (this._staticSun) {
      this.sun.position.set(this.sunDirection.x * 500, this.sunDirection.y * 500 + 300, this.sunDirection.z * 500);
      this.sun.target.position.set(0, 0, 0);
      this.sun.target.updateMatrixWorld();
      this.sun.shadow.needsUpdate = true;
    }
    this.fill = new THREE.DirectionalLight(0xc6dcff, 0.25);
    this.fill.position.set(-200, 300, -100);
    this.root.add(this.fill);
  }

  updateLightForPosition(pos) {
    if (this._staticSun) return;
    this.sun.position.set(pos.x + this.sunDirection.x * 500, this.sunDirection.y * 500 + 300, pos.z + this.sunDirection.z * 500);
    this.sun.target.position.set(pos.x, 0, pos.z);
    this.sun.target.updateMatrixWorld();
  }

  /** Heightmap RG de 16 bits para que el shader sepa la profundidad del agua. */
  _buildWaterDepthTexture() {
    if (this.waterDepthTexture) return this.waterDepthTexture;
    const res = 256;
    const extent = this.half + 520;
    const min = -90;
    const range = 230;
    const data = new Uint8Array(res * res * 4);
    for (let z = 0; z < res; z++) {
      const wz = ((z + 0.5) / res * 2 - 1) * extent;
      for (let x = 0; x < res; x++) {
        const wx = ((x + 0.5) / res * 2 - 1) * extent;
        const h = Number.isFinite(this.heightAt(wx, wz)) ? this.heightAt(wx, wz) : min;
        const v = Math.max(0, Math.min(1, (h - min) / range));
        const scaled = v * 255;
        const i = (z * res + x) * 4;
        data[i] = Math.floor(scaled);
        data[i + 1] = Math.round((scaled - Math.floor(scaled)) * 255);
        data[i + 2] = 0;
        data[i + 3] = 255;
      }
    }
    const tex = new THREE.DataTexture(data, res, res, THREE.RGBAFormat);
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    this.waterDepthTexture = tex;
    this.waterDepthExtent = extent;
    this.disposables.push(tex);
    return tex;
  }

  _waterDepthUniforms(surfaceY, isSea = 0) {
    this._buildWaterDepthTexture();
    return {
      tDepth: { value: this.waterDepthTexture },
      uDepthExtent: { value: new THREE.Vector2(this.waterDepthExtent, this.waterDepthExtent) },
      uDepthRes: { value: new THREE.Vector2(256, 256) },
      uDepthMin: { value: -90 },
      uDepthRange: { value: 230 },
      uSurfaceY: { value: surfaceY },
      uSeaLevel: { value: this.waterLevel },
      uIsSea: { value: isSea },
    };
  }

  /** Nivel de agua manual y tide automático (lerp por rangos de tiempo). */
  setWaterLevel(y) {
    const v = Math.max(-20, Math.min(20, Number.isFinite(+y) ? +y : this.waterLevel));
    this.waterLevelTarget = v;
    if (!this.waterLevelAuto) this.setWaterLevelNow(v);
    else this.setupWater();
  }
  setWaterLevelNow(y) {
    this.waterLevel = Math.max(-20, Math.min(20, Number.isFinite(+y) ? +y : this.waterLevel));
    if (this.water) this.water.position.y = this.waterLevel;
    this.setupWater();
    this.waterLevelTarget = this.waterLevel;
  }
  setWaterLevelAuto(on, opts = {}) {
    this.waterLevelAuto = !!on;
    if (opts.min != null) this.waterLevelMin = opts.min;
    if (opts.max != null) this.waterLevelMax = opts.max;
    if (opts.duration != null) this.waterLevelDuration = Math.max(0.5, opts.duration);
    this.setupWater();
    if (!this.waterLevelAuto) this._updateWaterTide(0);
  }
  _updateWaterTide(dt) {
    if (!this.waterLevelAuto) return;
    this.waterLevelPhase = (this.waterLevelPhase + dt / Math.max(0.5, this.waterLevelDuration)) % 2;
    let t = Math.abs(this.waterLevelPhase);
    t = t > 1 ? 2 - t : t;
    t = clamp(smoothstep(t), 0, 1);
    const target = lerp(this.waterLevelMin, this.waterLevelMax, t);
    if (Math.abs(target - this.waterLevel) > 0.01) {
      this.setWaterLevelNow(target);
    }
  }

  setupWater() {
    if (this.waterLevel < -20) return;
    // El mar global convive con los lagos del editor: los lagos están por encima
    // del nivel del mar y se dibujan en su propia superficie, pero el océano
    // que rodea la isla debe seguir existiendo siempre.
    const quality = this.settings.get('waterQuality') ?? 1;
    const segments = quality === 0 ? 96 : quality === 1 ? 176 : 288;
    const geo = new THREE.PlaneGeometry(this.size + 800, this.size + 800, segments, segments);
    geo.rotateX(-Math.PI / 2);
    const MAX_R = 8;
    const ripples = Array.from({ length: MAX_R }, () => new THREE.Vector4(0, 0, -1000, 0));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(this.theme.water) },
        uSun: { value: new THREE.Color(0xfff2dd) },
        uSunDir: { value: this.sunDirection.clone() },
        uOpacity: { value: quality === 0 ? 0.60 : 0.64 },
        uQuality: { value: quality },
        uReflect: { value: 1 },
        tDetail: { value: this.waterDetailTexture },
        uDetailScale: { value: 0.045 },
        tScene: { value: null },
        uRefract: { value: 0 },
        uScreen: { value: new THREE.Vector2(1, 1) },
        tReflect: { value: null },
        uTextureMatrix: { value: new THREE.Matrix4() },
        uReflectReal: { value: 0 },
        uReflectionStrength: { value: 0 },
        uPlaneY: { value: this.waterLevel },
        uRipples: { value: ripples },
        ...this._waterDepthUniforms(this.waterLevel, 1),
      },
      vertexShader: `
        varying vec3 vWorld;
        varying vec3 vNormalW;
        uniform float uTime;
        uniform vec4 uRipples[8];
        void main() {
          vec3 p = position;
          float a = p.x * 0.045 + uTime * 1.1;
          float b = p.z * 0.061 - uTime * 0.9;
          float c = (p.x + p.z) * 0.028 + uTime * 0.7;
          float d = (p.x - p.z) * 0.11 - uTime * 1.7;
          float wave = sin(a) * 0.22 + sin(b) * 0.16 + sin(c) * 0.28 + sin(d) * 0.08;
          float rdx = 0.0; float rdz = 0.0;
          for (int i = 0; i < 8; i++) {
            vec4 rp = uRipples[i];
            float age = uTime - rp.z;
            if (age < 0.0 || age > 2.8) continue;
            vec2 dir = p.xz - rp.xy;
            float dist = length(dir) + 0.001;
            // Onda tipo gota: un anillo que sale del punto y se expande.
            float speed = 3.4;
            float radius = age * speed;
            float ring = exp(-pow((dist - radius) * 1.7, 2.0));
            float decay = exp(-age * 1.15) * exp(-dist * 0.06);
            float freq = 6.0;
            float phase = (dist - radius) * freq;
            float amp = rp.w * 0.16 * ring * decay;
            wave += sin(phase) * amp;
            float dPhase = cos(phase) * amp * freq;
            rdx += dPhase * dir.x / dist;
            rdz += dPhase * dir.y / dist;
          }
          p.y += wave;
          float dx = cos(a) * 0.0099 + cos(c) * 0.00784 + cos(d) * 0.0088 + rdx;
          float dz = cos(b) * 0.00976 + cos(c) * 0.00784 - cos(d) * 0.0088 + rdz;
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
        uniform float uReflect;
        uniform sampler2D tScene;
        uniform float uRefract;
        uniform vec2 uScreen;
        uniform sampler2D tReflect;
        uniform mat4 uTextureMatrix;
        uniform float uReflectReal;
        uniform float uReflectionStrength;
        uniform vec4 uRipples[8];
        ${WATER_DETAIL_UNIFORMS}
        ${WATER_DEPTH_UNIFORMS}
        ${WATER_DEPTH_FUNCS}
        void main() {
          vec3 view = normalize(cameraPosition - vWorld);
          vec3 sun = normalize(uSunDir);
          vec3 n = normalize(vNormalW);
          ${WATER_DETAIL_NORMAL}
          ${WATER_DEPTH_COLOR}
          float r1 = sin(vWorld.x * 0.42 + uTime * 2.3) * cos(vWorld.z * 0.37 - uTime * 1.8);
          float r2 = sin((vWorld.x - vWorld.z) * 0.31 - uTime * 2.6);
          n = normalize(n + vec3(r1 * 0.06, 0.0, r2 * 0.06));
          for (int i = 0; i < 8; i++) {
            vec4 rp = uRipples[i];
            float age = uTime - rp.z;
            if (age < 0.0 || age > 2.8) continue;
            vec2 dir = vWorld.xz - rp.xy;
            float dist = length(dir) + 0.001;
            float radius = age * 5.8;
            float ring = exp(-pow((dist - radius) * 1.7, 2.0));
            float decay = exp(-age * 1.8) * exp(-dist * 0.06);
            float phase = (dist - radius) * 6.0;
            float nAmp = rp.w * 0.09 * ring * decay * cos(phase);
            n = normalize(n + vec3(nAmp * dir.x / dist, 0.0, nAmp * dir.y / dist));
          }
          float fres = pow(1.0 - max(dot(view, n), 0.0), 3.0);
          float diff = max(dot(n, sun), 0.0);
          vec3 halfDir = normalize(sun + view);
          float spec = pow(max(dot(n, halfDir), 0.0), 120.0);
          float bands = sin(vWorld.x * 0.09 + uTime * 1.4) * sin(vWorld.z * 0.08 - uTime * 1.1) * 0.5 + 0.5;
          float shimmer = clamp(bands * 0.16 + diff * 0.2 + fres * 0.22 + detailLight * 0.42, 0.0, 1.0);
          vec3 col = mix(baseCol * 0.45, baseCol * 1.3, shimmer);
          col += uSun * spec * (0.85 + detailLight * 0.9);
          col += vec3(0.55, 0.85, 1.0) * pow(detailLight, 3.0) * 0.12;
          // Estilo Zelda TotK: caústicas y espuma de orilla animada
          col = mix(col, vec3(0.92, 1.0, 1.0), causticRibbon * 0.38);
          col = mix(col, vec3(0.98, 1.0, 1.0), shoreFoam * 0.85);
          vec3 reflDir = reflect(-view, n);
          float skyAmt = smoothstep(-0.15, 0.7, reflDir.y);
          vec3 reflCol = mix(baseCol * 0.6, vec3(0.58, 0.79, 1.0) + uSun * 0.22, skyAmt);
          col = mix(col, reflCol, clamp(fres * 0.6 * uReflect, 0.0, 0.72));
          if (uReflectReal > 0.5) {
            // Reflejo planar real: se proyecta la escena espejada sobre la superficie.
            vec2 distortion = vec2(n.x, n.z) * (0.014 + fres * 0.012)
              + vec2(sin(vWorld.x * 0.7 + uTime * 1.7), cos(vWorld.z * 0.65 - uTime * 1.4)) * 0.003;
            vec4 reflectPos = vec4(vWorld + vec3(distortion.x * 4.0, 0.0, distortion.y * 4.0), 1.0);
            vec4 proj = uTextureMatrix * reflectPos;
            vec2 ruv = proj.xy / max(proj.w, 0.001);
            // Mirror vertical: la imagen espejada se voltea en Y antes de
            // proyectarse sobre la superficie del agua.
            ruv.y = 1.0 - ruv.y;
            vec2 uvClamped = clamp(ruv, vec2(0.002), vec2(0.998));
            vec3 realRefl = texture2D(tReflect, uvClamped).rgb;
            float edge = smoothstep(0.0, 0.05, uvClamped.x) * smoothstep(1.0, 0.95, uvClamped.x)
              * smoothstep(0.0, 0.05, uvClamped.y) * smoothstep(1.0, 0.95, uvClamped.y);
            reflCol = mix(reflCol, realRefl, 0.94 * edge);
            col = mix(col, reflCol, clamp((0.5 + fres * 0.45) * uReflect * uReflectionStrength, 0.0, 0.94));
          }
          if (uRefract > 0.5) {
            vec2 uv = gl_FragCoord.xy / max(uScreen, vec2(1.0));
            vec2 warp = vec2(n.x, n.z) * (0.022 + fres * 0.014);
            vec3 behind = texture2D(tScene, clamp(uv + warp, 0.002, 0.998)).rgb;
            vec3 tint = mix(vec3(1.0), baseCol * 1.7, 0.2);
            col = mix(col, behind * tint + vec3(0.01, 0.045, 0.07), 0.62);
          }
          // Opacidad ~0.6 en aguas profundas y >=0.45 en la orilla: el agua
          // nunca se vuelve casi invisible (transparencia máxima ~50%).
          float alpha = clamp((uOpacity + fres * 0.20 - diff * 0.04) * mix(0.72, 1.0, 1.0 - shoreT), 0.42, 0.96);
          gl_FragColor = vec4(col, alpha);
        }`,
    });
    this.water = new THREE.Mesh(geo, mat);
    this.water.position.y = this.waterLevel;
    this.water.receiveShadow = false;
    this.water.renderOrder = 2;
    this.root.add(this.water);
    this.waterMeshes.push(this.water);
    this.disposables.push(geo, mat);
    this.waterMaterials.push(mat);
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

  /** Aplica SNPADO cuadrado, rampa o escalones según `terrainStyle`. */
  _applyTerrainStyle(h) {
    const step = this.terrainGridStep || 2;
    if (this.terrainStyle === 'smooth') return Math.round(h * 4) / 4;
    if (this.terrainStyle === 'ramp') {
      const base = Math.floor(h / step) * step;
      const t = clamp((h - base) / step, 0, 1);
      return base + t * step;
    }
    if (this.terrainStyle === 'stairs') {
      const base = Math.floor(h / step) * step;
      const t = clamp((h - base) / step, 0, 1);
      return base + Math.floor(t * 8) * (step / 8);
    }
    return Math.round(h / step) * step;
  }

  rawHeightAt(x, z) {
    if (this.training) return 0;
    if (this.islandFlat) return 0;
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
    const blockVary = hash2(Math.round(x / 2), Math.round(z / 2), this.seed + 577) - 0.5;
    // Estilo cartoon/LEGO: facetado, sin montaÃ±as de un solo vÃ©rtice, amplitud
    // reducida y un bloquevariable alineado a la rejilla.
    let h = (b.baseHeight ?? 10) + (n - 0.5) * (b.amplitude ?? 7) * 2
      + (broad - 0.5) * 6
      + ridge * ridge * (b.roughness ?? 2.2) * 1.4 + detail * 0.8;
    h += blockVary * 1.8;
    const wobble = noise2(x * 0.0042, z * 0.0042, this.seed + 909);
    h += (wobble - 0.5) * 0.5;

    const mountainField = fbm(x * f * 0.6 + 120, z * f * 0.6 - 85, this.seed + 3337, 3);
    const peak = Math.pow(clamp((mountainField - 0.48) / 0.28, 0, 1), 1.0);
    h += peak * (this.mountainHeight > 0 ? Math.min(this.mountainHeight, 14) : 0);

    // Snapeado facetado del terreno: evita tops puntuales y mantiene varianza.
    return this._applyTerrainStyle(Math.round(h * 4) / 4);

    if (this.map.island) {
      const angle = Math.atan2(z, x);
      // Costa irregular: lÃ³bulos, cabos y ensenadas en vez de un cÃ­rculo perfecto.
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

      // Hundimiento progresivo del terreno a partir de la lÃ­nea de costa.
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

  _applyTerrainFlats(x, z, h) {
    const flats = this.terrainFlats;
    if (!flats || !flats.length) return h;
    let bestPri = -1;
    for (let i = 0; i < flats.length; i++) {
      const p = flats[i].priority || 1;
      if (p > bestPri) bestPri = p;
    }
    let sumW = 0, sumY = 0, maxT = 0;
    for (let i = 0; i < flats.length; i++) {
      const f = flats[i];
      if ((f.priority || 1) !== bestPri) continue;
      const dx = x - f.x, dz = z - f.z;
      const lx = Math.abs(dx * f.cos + dz * f.sin);
      const lz = Math.abs(-dx * f.sin + dz * f.cos);
      const blend = f.blend || 2.5;
      const hx = f.hw + blend, hz = f.hd + blend;
      if (lx > hx || lz > hz) continue;
      const tx = clamp((hx - lx) / blend, 0, 1);
      const tz = clamp((hz - lz) / blend, 0, 1);
      const t = smoothstep(Math.min(tx, tz));
      if (t <= 0) continue;
      const w = t * t; // weight stronger near center
      sumW += w; sumY += f.y * w;
      if (t > maxT) maxT = t;
    }
    if (sumW > 0 && maxT > 0) h = lerp(h, sumY / sumW, maxT);
    return h;
  }

  addTerrainFlat(x, z, hw, hd, rot, y, blend = 3, priority = 1) {
    const f = { x, z, hw, hd, rot: rot || 0, y, blend, priority, cos: Math.cos(rot || 0), sin: Math.sin(rot || 0) };
    this.terrainFlats.push(f);
    if (this._hCache) this._hCache.clear();
    this._applyFlatToExistingChunks(f);
    return f;
  }

  _applyFlatToExistingChunks(f) {
    const blend = f.blend || 2.5;
    const maxR = Math.hypot(f.hw + blend, f.hd + blend) + CHUNK_SIZE;
    for (const chunk of this.chunks.values()) {
      const ccx = (chunk.cx + 0.5) * CHUNK_SIZE;
      const ccz = (chunk.cz + 0.5) * CHUNK_SIZE;
      if (Math.abs(ccx - f.x) > maxR || Math.abs(ccz - f.z) > maxR) continue;
      this._patchChunkFlat(chunk, f);
    }
  }

  _patchChunkFlat(chunk, f) {
    const geo = chunk.geometry;
    if (!geo?.attributes?.position) return;
    const pos = geo.attributes.position.array;
    const seg = chunk.seg || CHUNK_SEGMENTS;
    const stride = seg + 1;
    const blend = f.blend || 2.5;
    const hx = f.hw + blend, hz = f.hd + blend;
    let changed = false;
    for (let iz = 0; iz <= seg; iz++) {
      for (let ix = 0; ix <= seg; ix++) {
        const vi = (iz * stride + ix) * 3;
        const wx = pos[vi], wz = pos[vi + 2];
        const dx = wx - f.x, dz = wz - f.z;
        const lx = Math.abs(dx * f.cos + dz * f.sin);
        const lz = Math.abs(-dx * f.sin + dz * f.cos);
        if (lx > hx || lz > hz) continue;
        // Bajo el terreno modular el heightfield sigue hundido (lo cubre la malla modular).
        if (this.modular && modularMinNear(this.modular, wx, wz, 3.2) !== null) continue;
        // Recompute full height (raw + POI + all flats) for correct overlap/priority handling.
        const h = this.heightAt(wx, wz);
        if (Math.abs(h - pos[vi + 1]) > 0.001) { pos[vi + 1] = h; changed = true; }
      }
    }
    if (changed) {
      geo.attributes.position.needsUpdate = true;
      geo.computeVertexNormals();
      geo.computeBoundingSphere();
    }
  }

  _heightOverrideAt(x, z) {
    const m = this.heightOverrides;
    if (!m || m.size === 0) return null;
    const cs = this.heightOverrideCell || 2;
    const gx = x / cs, gz = z / cs;
    const x0 = Math.floor(gx), z0 = Math.floor(gz);
    const x1 = x0 + 1, z1 = z0 + 1;
    const v00 = m.get(x0 + ',' + z0), v10 = m.get(x1 + ',' + z0), v01 = m.get(x0 + ',' + z1), v11 = m.get(x1 + ',' + z1);
    if (v00 === undefined && v10 === undefined && v01 === undefined && v11 === undefined) return null;
    const base = this.rawHeightAt(x, z);
    const h00 = v00 === undefined ? base : v00;
    const h10 = v10 === undefined ? base : v10;
    const h01 = v01 === undefined ? base : v01;
    const h11 = v11 === undefined ? base : v11;
    const tx = gx - x0, tz = gz - z0;
    const a = h00 + (h10 - h00) * tx;
    const b = h01 + (h11 - h01) * tx;
    return a + (b - a) * tz;
  }

  /** Redondea los bordes expuestos de bloques painterosos usando overrides de editor. */
  _roundBlockOverride(x, z, ov) {
    const r = this.pieceRounding || 0;
    if (r <= 0.001) return ov;
    const c = ov;
    const samples = [
      [-4, 0, 1], [4, 0, 1], [0, -4, 1], [0, 4, 1],
      [-2, -2, 1.5], [2, -2, 1.5], [-2, 2, 1.5], [2, 2, 1.5],
      [-4, -2, 1.8], [4, -2, 1.8], [-4, 2, 1.8], [4, 2, 1.8],
      [-2, -4, 1.8], [2, -4, 1.8], [-2, 4, 1.8], [2, 4, 1.8],
    ];
    let weight = 0, depth = 0;
    for (const [ox, oz, w] of samples) {
      const nx = x + ox, nz = z + oz;
      const hasOv = this._heightOverrideAt(nx, nz) !== undefined;
      const base = this._applyTerrainFlats(this.rawHeightAt(nx, nz), this.rawHeightAt(nx, nz));
      const h = hasOv ? this._heightOverrideAt(nx, nz) : base;
      const drop = c - h;
      if (drop > 0.25 && !hasOv) { weight += w; depth += Math.min(drop, 0.5) * w; }
    }
    if (weight < 0.5) return ov;
    const avgDepth = depth / weight;
    return c - avgDepth * r;
  }

  heightAt(x, z) {
    if (this.training) return 0;
    // Mapa de Easy Game Developer: la misma altura que en el motor.
    if (this.egdTerrain) {
      const h = this.egdTerrain.heightAt(x, z);
      return Number.isFinite(h) ? h : EGD_VOID_Y;
    }
    // Terreno modular: altura exacta (sin caché cuantizada, los bordes son verticales).
    if (this.modular) {
      const mh = modularHeightAt(this.modular, x, z);
      if (mh !== null) return mh;
    }
    // Cache por frame (cuantizado) para acelerar consultas repetidas/LOS.
    const qx = (x * 2) | 0, qz = (z * 2) | 0;
    const cache = this._hCache;
    const key = qx + ',' + qz;
    if (cache) {
      const v = cache.get(key);
      if (v !== undefined) return v;
    }
    const h = evaluateTerrainHeight({
      x,
      z,
      rawHeightFn: (wx, wz) => this.rawHeightAt(wx, wz),
      heightOverrides: this.heightOverrides,
      cell: this.heightOverrideCell || GRID_SIZE,
      roadNetwork: this.roadNetwork,
      terrainFlats: this.terrainFlats,
      pois: this.pois,
      waterLevel: this.waterLevel,
      modular: this.modular,
    });
    if (cache) cache.set(key, h);
    return h;
  }

  /** Altura de la superficie visual del terreno (interpolada desde la malla del chunk). */
  surfaceHeightAt(x, z) {
    if (!this.procedural) return this.rawHeightAt(x, z);
    if (this.egdTerrain) {
      let h = this.egdTerrain.heightAt(x, z);
      if (!Number.isFinite(h)) h = EGD_VOID_Y;
      // Puentes y caminos elevados de EGD: superficie más alta bajo el punto.
      for (const sf of this.egdTerrain.pathSurfaces(x, z)) if (sf.y > h) h = sf.y;
      return h;
    }
    if (this.modular) {
      const mh = modularHeightAt(this.modular, x, z);
      if (mh !== null) return mh;
    }
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const chunk = this.chunks.get(`${cx},${cz}`);
    if (!chunk || !chunk.geometry || !chunk.seg) return this.heightAt(x, z);
    const seg = chunk.seg;
    const lx = (x - cx * CHUNK_SIZE) / CHUNK_SIZE;
    const lz = (z - cz * CHUNK_SIZE) / CHUNK_SIZE;
    const gx = clamp(lx * seg, 0, seg - 1e-6);
    const gz = clamp(lz * seg, 0, seg - 1e-6);
    const ix = Math.floor(gx);
    const iz = Math.floor(gz);
    const u = gx - ix;
    const v = gz - iz;
    const stride = seg + 1;
    const pos = chunk.geometry.attributes.position.array;
    const ia = (iz * stride + ix) * 3 + 1;
    const ib = (iz * stride + ix + 1) * 3 + 1;
    const ic = ((iz + 1) * stride + ix) * 3 + 1;
    const id = ((iz + 1) * stride + ix + 1) * 3 + 1;
    const ya = pos[ia], yb = pos[ib], yc = pos[ic], yd = pos[id];
    if (u + v <= 1) return ya + u * (yb - ya) + v * (yc - ya);
    const u1 = 1 - u, v1 = 1 - v;
    return yd + u1 * (yc - yd) + v1 * (yb - yd);
  }

  /** Suelo efectivo al caer: terreno + tejados/plataformas crossed. */
  groundAt(x, z, prevY, nextY) {
    let ground = this.surfaceHeightAt(x, z);
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
    // Isla default: terreno borrado, solo agua visible.
    if (this.islandFlat) return null;
    const centerX = (cx + 0.5) * CHUNK_SIZE;
    const centerZ = (cz + 0.5) * CHUNK_SIZE;
    if (Math.abs(centerX) > this.half + CHUNK_SIZE || Math.abs(centerZ) > this.half + CHUNK_SIZE) return null;

    const seg = this.chunkSegments || CHUNK_SEGMENTS;
    const vertexCount = (seg + 1) * (seg + 1);
    const positions = new Float32Array(vertexCount * 3);
    const colors = new Float32Array(vertexCount * 3);
    const uvs = new Float32Array(vertexCount * 2);
    const indices = [];
    const pal = this.terrainPalette || terrainPalette(this.map.theme);
    const [cSand, cGrass, cGrassLight, cGrassDark, cDirt, cRock, cVolcanic, cVolcanicRock, cSnow] = pal;
    const tmp = new THREE.Color();

    let i = 0;
    for (let iz = 0; iz <= seg; iz++) {
      for (let ix = 0; ix <= seg; ix++) {
        const wx = centerX + (ix / seg - 0.5) * CHUNK_SIZE;
        const wz = centerZ + (iz / seg - 0.5) * CHUNK_SIZE;
        // Bajo las teselas modulares el heightfield se hunde para no asomar
        // entre acantilados (la malla modular cubre esa zona).
        const sunk = this.modular ? modularMinNear(this.modular, wx, wz, 3.2) : null;
        const y = sunk !== null ? sunk - 0.6 : this.heightAt(wx, wz);
        positions[i * 3] = wx;
        positions[i * 3 + 1] = y;
        positions[i * 3 + 2] = wz;

        const step = 4;
        const sx = this.heightAt(wx + step, wz) - this.heightAt(wx - step, wz);
        const sz = this.heightAt(wx, wz + step) - this.heightAt(wx, wz - step);
        const slope = Math.sqrt(sx * sx + sz * sz) / (step * 2);

        const localWaterY = this._waterLevelForTerrain(wx, wz);
        const coast = localWaterY > -20 ? y - localWaterY : Infinity;
        const grassN = noise2(wx * 0.007, wz * 0.007, this.seed + 31);
        const patch = noise2(wx * 0.019 + 17, wz * 0.019 - 9, this.seed + 771);
        const volcanicN = noise2(wx * 0.011 - 23, wz * 0.011 + 41, this.seed + 2203);
        const highStart = Math.max(18, (this.biome.baseHeight ?? 10) + (this.biome.amplitude ?? 9) * 0.9);
        if (this.map.theme === 'snow' && y > 55) tmp.copy(cSnow);
        else if (coast < 3.2) tmp.copy(cSand); // arena blanca en toda la costa
        else if (y > highStart + 8) {
          // Tierra y roca volcánica en los picos muy altos.
          tmp.copy(volcanicN > 0.6 || slope > 0.58 ? cVolcanicRock : cVolcanic);
        } else if (slope > 0.62) tmp.copy(cRock); // riscos y acantilados
        else if (patch > 0.74) tmp.copy(cDirt);
        else if (grassN < 0.34) tmp.copy(cGrassDark);
        else if (grassN > 0.66) tmp.copy(cGrassLight);
        else tmp.copy(cGrass);

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

    const chunk = { key, cx, cz, group, geometry: geo, seg };
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
    this._playerPos = playerPos;
    // Cache de alturas por frame (consultas repetidas/LOS).
    if (this.procedural) this._hCache = new Map();
    // Mapa pequeÃ±o precargado: saltar streaming/churn de chunks por frame.
    if (this.procedural && !this.staticChunks) {
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
    this._updateBubbles(dt);
    this._updateWaterfallFoam(dt);
    this._updateSplashDrops(dt);
    this._waterTime = (this._waterTime || 0) + dt;
    this._updateWaterTide(dt);
    if (this.water) this.water.material.uniforms.uTime.value += dt;
    if (this.waterMaterials) for (const m of this.waterMaterials) { if (m.uniforms?.uTime) m.uniforms.uTime.value += dt; }
    if (this._seaweedUniforms) {
      this._seaweedUniforms.time.value = this._waterTime;
      const p = this._playerPos;
      if (p) this._seaweedUniforms.player.value.set(p.x, p.z);
      // Solo la fuerza del movimiento del jugador agita las algas; al parar,
      // la amplitud decae poco a poco hasta quedar quietas.
      const motion = this._seaweedUniforms.motion;
      const target = clamp((this.playerState?.speed || 0) / 6, 0, 1);
      const k = target > motion.value ? 12 : 2.2;
      motion.value += (target - motion.value) * Math.min(1, dt * k);
    }
    this._updateDoors(dt);
    this._updateGlassDebris(dt);
    this._updateRipples(dt);
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

  applyViewDistances(renderDist, detailDist) {
    this.renderDistance = Math.max(120, Number(renderDist) || 320);
    this.detailDistance = Math.min(this.renderDistance, Math.max(60, Number(detailDist) || 180));
    if (this.scene?.fog) {
      this.scene.fog.near = Math.max(40, this.renderDistance * 0.35);
      this.scene.fog.far = this.renderDistance + 150;
    }
    // Terrain/water chunks: simple visibility by distance
    if (this.terrain) this.terrain.visible = true;
    if (this.water) this.water.visible = true;
  }

  updateDetailVisibility(pos) {
    if (!pos) return;
    const dd = this.detailDistance || 180;
    const rd = this.renderDistance || 320;
    const dd2 = dd * dd;
    const rd2 = rd * rd;
    for (const g of this._detailGroups) {
      if (!g || !g.children) continue;
      for (const c of g.children) {
        if (!c) continue;
        const dx = (c.position?.x || 0) - pos.x;
        const dz = (c.position?.z || 0) - pos.z;
        const d2 = dx * dx + dz * dz;
        // detailDistance controls decor/objects; renderDistance is overall cap
        c.visible = d2 <= dd2 && d2 <= rd2;
      }
    }
  }

  // ---------------------- Puertas / Cristales ----------------------

  _pieceKey(type, x, y, z, rotY = 0) {
    return `${type}:${x.toFixed(2)}:${y.toFixed(2)}:${z.toFixed(2)}:${(+rotY).toFixed(3)}`;
  }

  registerDoor(kitName, x, y, z, rotY = 0, sy = 1) {
    const def = KIT_CATALOG[kitName];
    if (!def || def.role !== 'door') return null;
    const key = this._pieceKey(kitName, x, y, z, rotY);
    if (this.doors.find(d => d.key === key)) return this.doors.find(d => d.key === key);
    const [sx, sy0, sz] = def.size;
    const fullH = sy0 * (sy || 1);
    const openW = Math.min(sz - 0.2, Math.max(1.4, sz * 0.76));
    const openH = Math.min(fullH - 0.12, Math.max(2.2, fullH * 0.82));
    const door = {
      key, kitName, x, y, z, rotY, sy, openW, openH,
      open: false, targetOpen: false, progress: 0, hold: 0,
      mesh: null, pivot: null, blocker: null, autoClose: 0,
    };
    const blocker = rotLocalBoxToWorld({ sx: Math.max(0.24, sx), sz: openW, minY: 0, maxY: openH, cx: 0, cz: 0 }, x, y, z, rotY, 0.24);
    if (blocker) {
      this.addCollider(blocker.minX, blocker.maxX, blocker.minY, blocker.maxY, blocker.minZ, blocker.maxZ, { role: 'doorPanel', doorKey: key, enabled: true });
      door.blockerRef = this.colliders[this.colliders.length - 1];
    }
    if (!this._doorMat) {
      this._doorMat = new THREE.MeshStandardMaterial({ color: 0x8b6a45, roughness: 0.72, metalness: 0.05 });
      this._doorGeo = new THREE.BoxGeometry(1, 1, 1);
      this.disposables.push(this._doorMat, this._doorGeo);
    }
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);
    pivot.rotation.y = rotY;
    const panel = new THREE.Mesh(this._doorGeo, this._doorMat);
    panel.castShadow = true; panel.receiveShadow = true;
    panel.scale.set(0.08, openH - 0.04, openW - 0.06);
    panel.position.set(0, openH / 2, openW / 2 - 0.03);
    const hinge = new THREE.Group();
    hinge.position.set(0, 0, -openW / 2 + 0.03);
    hinge.add(panel);
    pivot.add(hinge);
    this.root.add(pivot);
    door.mesh = panel;
    door.pivot = pivot;
    door.hinge = hinge;
    this.doors.push(door);
    return door;
  }

  _ensureGlassInstanced(extra = 1) {
    if (!this._glassMat) {
      this._glassMat = new THREE.MeshBasicMaterial({ color: 0xbfdfff, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false });
      this._glassGeo = new THREE.PlaneGeometry(1, 1);
      this.disposables.push(this._glassMat, this._glassGeo);
    }
    const capNeeded = (this.glassPanels?.length || 0) + extra;
    if (this._glassInst && this._glassInstCap >= capNeeded) return;
    const newCap = Math.max(64, capNeeded, (this._glassInstCap || 0) * 2);
    const old = this._glassInst;
    const inst = new THREE.InstancedMesh(this._glassGeo, this._glassMat, newCap);
    inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    inst.castShadow = false; inst.receiveShadow = false;
    inst.frustumCulled = false;
    inst.count = 0;
    const dummy = new THREE.Object3D();
    dummy.scale.set(0,0,0); dummy.updateMatrix();
    for (let i=0;i<newCap;i++) inst.setMatrixAt(i, dummy.matrix);
    if (old) {
      const tmp = new THREE.Matrix4();
      for (let i=0;i<(old.count||0);i++){ old.getMatrixAt(i,tmp); inst.setMatrixAt(i,tmp); }
      inst.count = old.count || 0;
      this.root.remove(old);
      old.dispose?.();
    } else {
      this.root.add(inst);
    }
    inst.instanceMatrix.needsUpdate = true;
    this._glassInst = inst;
    this._glassInstCap = newCap;
  }

  registerWindowGlass(kitName, x, y, z, rotY = 0, sy = 1) {
    const def = KIT_CATALOG[kitName];
    if (!def || def.role !== 'window') return null;
    const key = this._pieceKey(kitName, x, y, z, rotY);
    if (this.glassPanels.find(g => g.key === key)) return this.glassPanels.find(g => g.key === key);
    const [sx, sy0, sz] = def.size;
    const fullH = sy0 * (sy || 1);
    const glassW = Math.max(0.5, sz * 0.62);
    const sill = Math.max(0.65, fullH * 0.28);
    const top = Math.max(sill + 0.5, fullH * 0.82);
    const glassH = Math.max(0.3, top - sill);
    this._ensureGlassInstanced(1);
    const idx = this._glassInst.count++;
    const dummy = new THREE.Object3D();
    dummy.position.set(x, y + sill + glassH / 2, z);
    dummy.rotation.y = rotY + Math.PI / 2;
    dummy.scale.set(glassW, glassH, 1);
    dummy.updateMatrix();
    this._glassInst.setMatrixAt(idx, dummy.matrix);
    this._glassInst.instanceMatrix.needsUpdate = true;
    const glass = {
      key, kitName, x, y, z, rotY, sy, broken: false,
      mesh: null, instIdx: idx, colliderRef: null, glassW, glassH, sill, top,
    };
    const c = rotLocalBoxToWorld({ sx: Math.max(0.12, sx), sz: glassW, minY: sill, maxY: top, cx: 0, cz: 0 }, x, y, z, rotY, 0.12);
    if (c) {
      this.addCollider(c.minX, c.maxX, c.minY, c.maxY, c.minZ, c.maxZ, { role: 'windowGlass', glassKey: key, enabled: true });
      glass.colliderRef = this.colliders[this.colliders.length - 1];
    }
    this.glassPanels.push(glass);
    return glass;
  }

  breakGlass(glassOrKey, impactPoint = null) {
    const g = typeof glassOrKey === 'string' ? this.glassPanels.find(x => x.key === glassOrKey) : glassOrKey;
    if (!g || g.broken) return false;
    g.broken = true;
    if (g.colliderRef) g.colliderRef.enabled = false;
    if (g.instIdx != null && this._glassInst) {
      const dummy = new THREE.Object3D();
      dummy.scale.set(0,0,0); dummy.updateMatrix();
      this._glassInst.setMatrixAt(g.instIdx, dummy.matrix);
      this._glassInst.instanceMatrix.needsUpdate = true;
    } else if (g.mesh) {
      g.mesh.visible = false;
    }
    const p = impactPoint || new THREE.Vector3(g.x, g.y + (g.sill + g.top) / 2, g.z);
    if (!this._glassDebrisMat) { this._glassDebrisMat = new THREE.MeshBasicMaterial({ color: 0xcfefff, transparent: true, opacity: 0.8, side: THREE.DoubleSide }); this._glassDebrisGeo = new THREE.PlaneGeometry(1,1); this.disposables.push(this._glassDebrisMat,this._glassDebrisGeo); }
    if (!this._glassDebris) this._glassDebris = [];
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(this._glassDebrisGeo, this._glassDebrisMat);
      const sc = 0.05 + Math.random()*0.08;
      m.scale.set(sc,sc,sc);
      m.position.copy(p);
      m.userData.vel = new THREE.Vector3((Math.random()-0.5)*4, Math.random()*3+1, (Math.random()-0.5)*4);
      m.userData.life = 0.8 + Math.random()*0.6;
      m.userData.rot = new THREE.Vector3(Math.random()*6,Math.random()*6,Math.random()*6);
      this.root.add(m);
      this._glassDebris.push(m);
    }
    return true;
  }
  findNearestDoor(pos, maxDist = 2.8) {
    let best = null, bestD = maxDist * maxDist;
    for (const d of this.doors) {
      const dx = pos.x - d.x, dz = pos.z - d.z;
      const dy = Math.max(0, Math.abs(pos.y - (d.y + d.openH * 0.5)) - d.openH * 0.5);
      const distSq = dx*dx + dz*dz + dy*dy;
      if (distSq < bestD) { bestD = distSq; best = d; }
    }
    return best;
  }

  findNearestGlass(pos, maxDist = 2.2) {
    let best = null, bestD = maxDist * maxDist;
    for (const g of this.glassPanels) {
      if (g.broken) continue;
      const cx = g.x, cy = g.y + (g.sill + g.top) * 0.5, cz = g.z;
      const dx = pos.x - cx, dy = pos.y + 0.9 - cy, dz = pos.z - cz;
      const d2 = dx*dx + dy*dy + dz*dz;
      if (d2 < bestD) { bestD = d2; best = g; }
    }
    return best;
  }

  setDoorOpen(door, open) {
    if (!door) return;
    door.targetOpen = !!open;
  }

  toggleDoor(door) {
    if (!door) return false;
    this.setDoorOpen(door, !door.targetOpen);
    return door.targetOpen;
  }

  _updateDoors(dt) {
    const ps = this.playerState || null;
    for (const d of this.doors) {
      // Auto-cerrar después de un tiempo si está abierta
      if (d.targetOpen) {
        d.autoClose -= dt;
        if (d.autoClose <= 0 && ps) {
          const dx = ps.pos.x - d.x, dz = ps.pos.z - d.z;
          const far = dx*dx + dz*dz > 5.5 * 5.5;
          if (far) d.targetOpen = false;
        }
      } else {
        d.autoClose = 2.5;
      }

      const target = d.targetOpen ? 1 : 0;
      const speed = 3.4;
      const prev = d.progress;
      if (d.progress < target) d.progress = Math.min(target, d.progress + dt * speed);
      else if (d.progress > target) d.progress = Math.max(target, d.progress - dt * speed);
      if (d.hinge) d.hinge.rotation.y = -d.progress * Math.PI * 0.72;
      if (d.blockerRef) {
        // bloquea cuando mayormente cerrada
        d.blockerRef.enabled = d.progress < 0.55;
      }
    }
  }

  _updateGlassDebris(dt) {
    if (!this._glassDebris) return;
    for (let i = this._glassDebris.length - 1; i >= 0; i--) {
      const m = this._glassDebris[i];
      m.userData.life -= dt;
      m.position.addScaledVector(m.userData.vel, dt);
      m.userData.vel.y -= 9.8 * dt;
      m.rotation.x += m.userData.rot.x * dt;
      m.rotation.y += m.userData.rot.y * dt;
      if (m.material) m.material.opacity = Math.max(0, m.userData.life);
      if (m.userData.life <= 0) {
        this.root.remove(m);
        m.geometry?.dispose?.();
        m.material?.dispose?.();
        this._glassDebris.splice(i, 1);
      }
    }
  }

  // ---------------------- Estructuras ----------------------

  addCollider(minX, maxX, minY, maxY, minZ, maxZ, meta = null) {
    const c = { minX, maxX, minY, maxY, minZ, maxZ, enabled: true };
    if (meta && typeof meta === 'object') Object.assign(c, meta);
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
    // Dintel (se aÃ±ade arriba, no bloquea la puerta)
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

    // CabaÃ±as aisladas y botÃ­n disperso
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

    // Unir geometrÃ­as por material: muy pocos draw calls.
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

  /** Pueblos densos, puerto, faro y ruinas a escala de isla pequeÃ±a. */
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

    /** Molino de viento: torre, tejado cÃ³nico y cuatro aspas con vela de lona. */
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

    /** Huerta de surcos con cultivos, vallado y espantapÃ¡jaros. */
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

    /** Casco de un barco encallado en la costa, con mÃ¡stil roto y botÃ­n. */
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

    /** Cementerio pequeÃ±o: tumbas alineadas, cruces y muro de piedra. */
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
      // NÃºcleo de pescadores: almacenes, casas y mercado junto a los muelles.
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

    const town = byName('CaserÃ­o');
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

    // Puntos de interÃ©s nuevos: huerta junto al caserÃ­o, cementerio junto a la
    // ermita, molino en la colina y un naufragio en la primera lÃ­nea de costa.
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

    // Casas sueltas en montaÃ±as con loot garantizado.
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

    // CabaÃ±as aisladas, almacenes y botÃ­n disperso por el interior.
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

    /** DesvÃ­a los puntos de control que caen en el mar hacia el interior. */
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
    const qid = (this._colQueryId = (this._colQueryId || 0) + 1);
    const out = this._colQueryOut || (this._colQueryOut = []);
    out.length = 0;
    const x0 = Math.floor((x - radius) / COLLIDER_CELL);
    const x1 = Math.floor((x + radius) / COLLIDER_CELL);
    const z0 = Math.floor((z - radius) / COLLIDER_CELL);
    const z1 = Math.floor((z + radius) / COLLIDER_CELL);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const list = this.colliderGrid.get(`${cx},${cz}`);
        if (!list) continue;
        for (let i = 0; i < list.length; i++) {
          const c = list[i];
          if (c.enabled === false) continue;
          if (c._qid !== qid) { c._qid = qid; out.push(c); }
        }
      }
    }
    return out;
  }

  /** Resuelve colisiÃ³n horizontal de un cilindro contra cajas estÃ¡ticas. */
  resolveCollision(position, radius = 0.45, height = 1.8) {
    const foot = position.y;
    const ps = this.playerState;
    const head = foot + height;
    for (const c of this.collidersNear(position.x, position.z, radius + 2)) {
      // Si el jugador estÃ¡ apoyado sobre la superficie del collider, no empujar lateralmente (evita colisiÃ³n fantasma en suelos).
      if (head < c.minY || foot >= c.maxY - 0.06) continue;
      const closestX = clamp(position.x, c.minX, c.maxX);
      const closestZ = clamp(position.z, c.minZ, c.maxZ);
      let dx = position.x - closestX;
      let dz = position.z - closestZ;
      let dist = Math.hypot(dx, dz);
      if (dist >= radius) continue;
      if (c.role === 'windowGlass' && c.glassKey) {
        const airborne = ps && !ps.grounded && !ps.swimming;
        const fast = ps && Math.hypot(ps.vx || 0, ps.vz || 0, ps.vy || 0) > 1.5;
        if (airborne || fast) {
          this.breakGlass(c.glassKey, new THREE.Vector3(closestX, clamp(position.y + 1.0, c.minY, c.maxY), closestZ));
          continue;
        }
      }
      if (dist < 1e-6) {
        // Dentro de la caja: empujar hacia la cara mÃ¡s cercana.
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
    let hitCollider = null;

    for (const c of this.collidersNear(origin.x, origin.z, 80)) {
      const t = rayAABB(origin, dir, { x: c.minX, y: c.minY, z: c.minZ }, { x: c.maxX, y: c.maxY, z: c.maxZ }, best);
      if (t > 0 && t < best) { best = t; type = c.role === 'windowGlass' ? 'glass' : 'structure'; hitCollider = c; }
    }

    // Terreno: marcha adaptativa + bisecciÃ³n.
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
    return { distance: best, point, type, collider: hitCollider, glassKey: hitCollider?.glassKey || null };
  }

  /** Libera las superficies de agua antes de volver a crearlas (editor WYSIWYG). */
  _clearWaterSurfaces() {
    for (const mesh of (this.waterMeshes || [])) {
      mesh.removeFromParent();
      mesh.geometry?.dispose?.();
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of mats) mat?.dispose?.();
    }
    this.waterMeshes = [];
    this.waterMaterials = [];
    this.continuousWaterMaterials = [];
    this.water = null;
    this.waterfallMesh = null;
    this.waterfallFoamMesh = null;
    this.waterfallParticles = null;
    this._foamMesh = null;
    this.waterfalls = [];
    this._waterfallEdges = [];
    if (this.waterDepthTexture) {
      this.waterDepthTexture.dispose();
      this.waterDepthTexture = null;
    }
  }

  _clearTerrainChunks() {
    this._clearModularTerrain();
    if (this.egdTerrain) this.egdTerrain.group.removeFromParent();
    for (const key of [...this.chunks.keys()]) this.removeChunk(key);
    this.chunkQueue.clear();
    this._hCache = new Map();
  }

  /** Estado que puede generar `placeCustomPieces` al reconstruir el mapa. */
  _resetCustomPieces() {
    if (this.customPieceGroup?.root) {
      // Las carreteras generan geometría propia en cada reconstrucción: se
      // libera aquí para que el editor no acumule GPU memory al pintar.
      const owned = new Set();
      this.customPieceGroup.root.traverse((o) => {
        if (!o.isMesh) return;
        if (o.geometry?.userData?.roadOwned) owned.add(o.geometry);
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) if (m?.userData?.roadOwned) owned.add(m);
      });
      for (const res of owned) res.dispose?.();
      if (owned.size) this.disposables = this.disposables.filter((d) => !owned.has(d));
      this.customPieceGroup.root.removeFromParent();
    }
    this.customPieceGroup = null;
    this._detailGroups = this._detailGroups.filter(g => g?.name !== 'custom-map-pieces');
    this.colliders.length = 0;
    this.colliderGrid.clear();
    this.terrainFlats.length = 0;
    this.roadCircles.length = 0;
    for (const door of (this.doors || [])) door.pivot?.removeFromParent();
    this.doors.length = 0;
    this.glassPanels.length = 0;
    if (this._glassInst) this._glassInst.count = 0;
  }

  /**
   * Terreno de Easy Game Developer: se crea con el mismo código del motor
   * (EgdTerrain), así que forma, rampas, bordes redondeados, caminos y hierba
   * son idénticos. Solo cambian materiales y colores (estilo OpenNite).
   */
  _setEgdWorld(world) {
    if (this.egdTerrain) {
      this.egdTerrain.group.removeFromParent();
      this.egdTerrain.dispose();
      this.egdTerrain = null;
    }
    this.egdWorld = world || null;
    if (!this.egdWorld) return;
    this.egdTerrain = new EgdTerrain(this.egdWorld);
    this.egdTerrain.group.name = 'egd-terrain';
    // El agua la dibuja OpenNite (mismo nivel); se ocultan las láminas de agua de EGD.
    const waterTop = new THREE.Color(EGD_TILE_TYPES.water.top);
    const waterSide = new THREE.Color(EGD_TILE_TYPES.water.side);
    this.egdTerrain.group.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = o.castShadow && !!this.settings.get('shadows');
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      if (mats.some((m) => m?.transparent && m.color && (m.color.equals(waterTop) || m.color.equals(waterSide)))) o.visible = false;
    });
    console.info('[World] egd terrain:', { size: this.egdWorld.size, tileSize: this.egdWorld.tileSize, style: this.egdWorld.style, meshes: this.egdTerrain.meshes.length });
  }

  /**
   * Objeto de EGD (casa modular, decorado, primitiva, compuesto) con su misma
   * forma. Colisiones: cada caja sólida de las piezas modulares; en decorados,
   * el tronco o la caja del objeto.
   */
  _placeEgdObject(p, g) {
    const e = egdPieceToEntity(p);
    const obj = e ? egdBuildEntityObject(e) : null;
    if (!obj) return;
    g.add(obj);
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3();
    const addBox = (b, shrink = 0) => {
      if (b.isEmpty()) return;
      this.addCollider(b.min.x + shrink, b.max.x - shrink, b.min.y, b.max.y, b.min.z + shrink, b.max.z - shrink, { role: 'egdObject' });
    };
    if (e.type === 'build') {
      obj.traverse((m) => {
        if (!m.isMesh || m.userData.solid === false) return;
        box.setFromObject(m);
        addBox(box);
      });
      return;
    }
    if (e.type === 'prop' && /^(flower|bush|lamp)$/.test(e.prop)) return;
    box.setFromObject(obj);
    if (e.type === 'prop' && /^(tree|pine|palm|drago)$/.test(e.prop)) {
      // Solo el tronco bloquea.
      const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
      const r = 0.25 * (Array.isArray(e.scale) ? +e.scale[0] || 1 : 1);
      this.addCollider(cx - r, cx + r, box.min.y, box.max.y, cz - r, cz + r, { role: 'egdObject' });
      return;
    }
    addBox(box, 0.05);
  }

  _showEgdTerrain() {
    if (this.egdTerrain && !this.egdTerrain.group.parent) this.root.add(this.egdTerrain.group);
  }

  /** Construye la malla y los colisionadores del terreno modular (juego y editor). */
  _buildModularTerrain() {
    this._clearModularTerrain();
    if (!this.modular) return null;
    const built = buildModularTerrainMesh(this.modular, {
      seed: this.seed,
      shadows: !!this.settings.get('shadows'),
      outsideHeight: (x, z) => evaluateTerrainHeight({
        x, z,
        rawHeightFn: (wx, wz) => this.rawHeightAt(wx, wz),
        heightOverrides: this.heightOverrides,
        cell: this.heightOverrideCell || GRID_SIZE,
        waterLevel: this.waterLevel,
      }),
    });
    built.worldColliders = [];
    for (const c of built.colliders) {
      this.addCollider(c.minX, c.maxX, c.minY, c.maxY, c.minZ, c.maxZ, { role: c.role });
      built.worldColliders.push(this.colliders[this.colliders.length - 1]);
    }
    this.root.add(built.group);
    this.modularMesh = built;
    console.info('[World] modular terrain:', built.stats);
    return built;
  }

  _clearModularTerrain() {
    if (!this.modularMesh) return;
    this.modularMesh.dispose();
    const owned = new Set(this.modularMesh.worldColliders || []);
    if (owned.size) {
      const keep = this.colliders.filter((c) => !owned.has(c));
      this.colliders.length = 0;
      this.colliders.push(...keep);
      for (const [k, list] of this.colliderGrid) this.colliderGrid.set(k, list.filter((c) => !owned.has(c)));
    }
    this.modularMesh = null;
  }

  /**
   * Reconstruye el mapa completo con el pipeline del juego: terreno, agua,
   * modelos reales y puntos de loot. Lo usa el editor para verse idéntico.
   */
  async rebuildCustomMap(data) {
    this._clearWaterSurfaces();
    this._clearTerrainChunks();
    this._resetCustomPieces();
    const norm = normalizeMapData(data);
    this._applyCustomTerrainData(norm);
    const pieces = norm.pieces;
    this.customPieces = pieces.length ? pieces : null;
    this.roadNetwork = buildRoadNetwork(pieces, (rx, rz) => this.rawHeightAt(rx, rz));
    this.chunkSegments = 128;
    this.setupWater();
    this._buildWaterPatches();
    const range = Math.ceil(this.half / CHUNK_SIZE) + 1;
    if (!this.egdWorld) {
      for (let cx = -range; cx <= range; cx++) {
        for (let cz = -range; cz <= range; cz++) this.createChunk(cx, cz);
      }
    }
    this._buildModularTerrain();
    this._showEgdTerrain();
    this.staticChunks = true;
    if (this.useKitAssets) {
      await Promise.all([this.loadKitModels(), this.loadBuildKit()]);
      await this.placeCustomPieces(pieces);
      this.placeUnderwaterVegetation();
    } else {
      await this.loadBuildKit();
      await this.placeCustomPieces(pieces);
    }
    this.generateLootForCustomMap(pieces);
    this.loaded = true;
    return this.customPieceGroup;
  }

  dispose() {
    for (const key of [...this.chunks.keys()]) this.removeChunk(key);
    this.root.removeFromParent();
    for (const d of this.disposables) d.dispose?.();
    this.colliders.length = 0;
    this.colliderGrid.clear();
  }
}


