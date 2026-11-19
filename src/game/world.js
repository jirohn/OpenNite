import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clamp, fbm, hash2, hashString, lerp, makeRandom, noise2, rayAABB, smoothstep } from '../core/utils.js';

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
    this.size = map.size || 432;
    this.half = this.size / 2;
    this.waterLevel = -100;
    this.biome = {};
    this.theme = THEMES[map.theme] || THEMES.temperate;
    this.subBiomeColor = new THREE.Color(SUBBIOME[map.theme] || SUBBIOME.temperate);
    this.chunks = new Map();
    this.chunkQueue = new Map();
    this.colliders = [];
    this.colliderGrid = new Map();
    this.lootSpots = [];
    this.spawnPoints = [];
    this.pois = [];
    this.jumpPads = [];
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
    this.scale = Number(map.scale) || 6;

    this.setupSky();
    this.setupLights();
    this.setupClouds();
  }

  /** Descarga y carga el GLB completo: no se genera ningún terreno por código. */
  async load() {
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
    };
  }

  setupSky() {
    this.sky = new Sky();
    this.sky.scale.setScalar(450000);
    const u = this.sky.material.uniforms;
    u.turbidity.value = 6;
    u.rayleigh.value = 1.7;
    u.mieCoefficient.value = 0.006;
    u.mieDirectionalG.value = 0.83;
    const phi = THREE.MathUtils.degToRad(56);
    const theta = THREE.MathUtils.degToRad(148);
    this.sunDirection = new THREE.Vector3().setFromSphericalCoords(1, phi, theta);
    u.sunPosition.value.copy(this.sunDirection);
    this.root.add(this.sky);
    this.scene.fog = new THREE.Fog(this.theme.sky, 500, 2600);
    this.scene.background = new THREE.Color(this.theme.sky);
  }

  updateSkyForPosition(pos) {
    this.sky.position.set(pos.x, 0, pos.z);
  }

  setupLights() {
    this.hemi = new THREE.HemisphereLight(this.theme.sky, this.theme.grass, 1.25 * this.theme.sun);
    this.root.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff2dd, 2.1 * this.theme.sun);
    this.sun.position.copy(this.sunDirection).multiplyScalar(500);
    this.sun.target.position.set(0, 0, 0);
    this.root.add(this.sun, this.sun.target);
    const size = this.settings.get('shadows') ? this.settings.get('shadowMapSize') : 1024;
    this.sun.shadow.mapSize.set(size, size);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 1800;
    const s = 240;
    Object.assign(this.sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s });
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.035;
    this.sun.castShadow = !!this.settings.get('shadows');
    this.fill = new THREE.DirectionalLight(0x9fc2ff, 0.35);
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
    for (let i = 0; i < 14; i++) {
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

  // El mapa es un GLB completo: no se genera terreno por código.
  // El modelo se centra con su base en y=0 y se escala en load().
  rawHeightAt(x, z) {
    if (Math.abs(x) > this.half || Math.abs(z) > this.half) return -100;
    return 0;
  }

  heightAt(x, z) {
    return this.rawHeightAt(x, z);
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

    const seg = CHUNK_SEGMENTS;
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

  removeChunk(key) {
    const chunk = this.chunks.get(key);
    if (!chunk) return;
    this.root.remove(chunk.group);
    chunk.geometry.dispose();
    this.chunks.delete(key);
  }

  update(playerPos) {
    this.updateSkyForPosition(playerPos);
    this.updateLightForPosition(playerPos);
    if (this.water) this.water.position.set(Math.round(playerPos.x / 100) * 100, this.waterLevel, Math.round(playerPos.z / 100) * 100);
    if (this.clouds) this.clouds.position.set(playerPos.x, 0, playerPos.z);
  }

  tick(dt) {
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
    // Ventanas
    if (opts.windows !== false) {
      for (const lx of [-w * 0.27, w * 0.27]) {
        const wx = x + lx * cos + (d / 2) * sin;
        const wz = z - lx * sin + (d / 2) * cos;
        this.box(ctx, wx, y + 1.75, wz, 1.15, 1.1, 0.08, 'glass', front);
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

  generateRoads() {
    const roads = this.map.roads || [];
    const geos = [];
    const pois = this.map.pois || [];
    const texCanvas = document.createElement('canvas');
    texCanvas.width = 64;
    texCanvas.height = 256;
    const c = texCanvas.getContext('2d');
    c.fillStyle = '#3c4045';
    c.fillRect(0, 0, 64, 256);
    c.fillStyle = '#d8c06a';
    c.fillRect(30, 16, 4, 80);
    c.fillStyle = 'rgba(255,255,255,0.08)';
    for (let i = 0; i < 40; i++) c.fillRect(Math.random() * 64, Math.random() * 256, 2, 2);
    const tex = new THREE.CanvasTexture(texCanvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = this.settings.get('anisotropy') || 4;
    this.disposables.push(tex);

    for (const [aIdx, bIdx] of roads) {
      const a = pois[aIdx];
      const b = pois[bIdx];
      if (!a || !b) continue;
      const steps = 56;
      const verts = [];
      const uvs = [];
      const idxs = [];
      const midX = (a.x + b.x) / 2 + (b.z - a.z) * 0.07;
      const midZ = (a.z + b.z) / 2 - (b.x - a.x) * 0.07;
      const points = [];
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const omt = 1 - t;
        points.push({
          x: omt * omt * a.x + 2 * omt * t * midX + t * t * b.x,
          z: omt * omt * a.z + 2 * omt * t * midZ + t * t * b.z,
        });
      }
      let dist = 0;
      for (let i = 0; i <= steps; i++) {
        const p = points[i];
        const prev = points[Math.max(0, i - 1)];
        const next = points[Math.min(steps, i + 1)];
        let dx = next.x - prev.x;
        let dz = next.z - prev.z;
        const len = Math.hypot(dx, dz) || 1;
        dx /= len; dz /= len;
        if (i > 0) dist += Math.hypot(p.x - prev.x, p.z - prev.z);
        const nx = -dz;
        const nz = dx;
        const width = 7;
        for (const side of [-1, 1]) {
          const x = p.x + nx * width * side;
          const z = p.z + nz * width * side;
          verts.push(x, this.heightAt(x, z) + 0.22, z);
          uvs.push(side < 0 ? 0 : 1, dist / 24);
        }
        if (i < steps) {
          const k = i * 2;
          idxs.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex(idxs);
      geo.computeVertexNormals();
      geos.push(geo);
    }
    if (geos.length) {
      const merged = mergeGeometries(geos, false);
      for (const g of geos) g.dispose();
      if (merged) {
        const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2 });
        const mesh = new THREE.Mesh(merged, mat);
        mesh.receiveShadow = !!this.settings.get('shadows');
        mesh.frustumCulled = false;
        this.root.add(mesh);
        this.disposables.push(merged, mat);
      }
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
