import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { World } from '../src/game/world.js';
import { Settings } from '../src/core/settings.js';

const canvas = document.querySelector('#map-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, canvas.clientWidth / canvas.clientHeight, 0.1, 2000);
camera.position.set(0, 80, 120);
camera.lookAt(0, 0, 0);

const orbit = new OrbitControls(camera, canvas);
orbit.target.set(0, 0, 0);
orbit.enableDamping = true;
orbit.maxPolarAngle = Math.PI * 0.48;
orbit.minDistance = 10;
orbit.maxDistance = 500;

const hemi = new THREE.HemisphereLight(0x9fb4cc, 0x3c4044, 1.6);
const sun = new THREE.DirectionalLight(0xffe2b0, 2.5);
sun.position.set(50, 80, 40);
sun.castShadow = true;
scene.add(hemi, sun);

const settings = new Settings();
let mapData = null;
try { const res = await fetch('/maps/san-borondon.json'); mapData = await res.json(); } catch {}
if (!mapData) mapData = { type: 'island', theme: 'temperate', size: 360, seed: 20261119, waterLevel: 0, pois: [] };
mapData.modelBase = '/models/quaternius/glTF/';
mapData.propBase = '/models/quaternius/props/glTF/';
const world = new World(scene, mapData, settings);
// Load synchronously-ish
// Lightweight load: terrain + buildings, skip heavy vegetation models.
// Simple terrain mesh (low-res) for editor performance.
const seg = 64;
const size = world.size;
const half = world.half;
const geo = new THREE.PlaneGeometry(size, size, seg, seg);
const pos = geo.attributes.position;
for (let i = 0; i < pos.count; i++) {
  const x = pos.getX(i);
  const z = pos.getY(i);
  pos.setZ(i, world.heightAt(x, z));
}
geo.rotateX(-Math.PI / 2);
geo.computeVertexNormals();
const terrainMat = new THREE.MeshStandardMaterial({ color: 0x4f7c45, roughness: 0.9, metalness: 0 });
const terrain = new THREE.Mesh(geo, terrainMat);
scene.add(terrain);
// Water plane
const water = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial({ color: 0x2f7189, transparent: true, opacity: 0.6 }));
water.rotation.x = -Math.PI / 2;
water.position.y = world.waterLevel || 0;
scene.add(water);
world.loaded = true;

// Placed objects
const placed = [];
const placedGroup = new THREE.Group();
scene.add(placedGroup);

async function loadCustomMap() {
  let data = null;
  for (const url of ['/maps/custom-map.json', './maps/custom-map.json']) {
    try {
      const res = await fetch(url + '?t=' + Date.now());
      if (res.ok) { data = await res.json(); break; }
    } catch {}
  }
  if (!Array.isArray(data)) data = data?.pieces;
  if (!Array.isArray(data)) return;
  for (const p of data) {
    if (!p || !p.type) continue;
    rotY = p.rot || 0;
    const floors = Math.max(1, Math.min(3, Math.round(+p.floors || 1)));
    const piece = makePiece(p.type, p.x, p.z, floors);
    piece.position.y = p.y ?? world.heightAt(p.x, p.z);
    const entry = { type: p.type, x: p.x, y: piece.position.y, z: p.z, rot: p.rot || 0 };
    if ((p.type === 'house' || p.type === 'cabin') && floors > 1) entry.floors = floors;
    placed.push(entry);
    placedGroup.add(piece);
  }
  rotY = 0;
  document.querySelector('#rotSelect').value = '0';
  document.querySelector('#status').textContent = `Cargadas ${placed.length} piezas`;
}
loadCustomMap();

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let selectedPiece = 'house';
let rotY = 0;

const palette = document.querySelectorAll('.palette button');
palette.forEach(b => b.addEventListener('click', () => {
  palette.forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  selectedPiece = b.dataset.piece;
}));

document.querySelector('#rotSelect').addEventListener('change', (e) => { rotY = parseFloat(e.target.value); });

function addM(parent, geo, mat, px, py, pz, rx=0, ry=0, rz=0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(px, py, pz);
  m.rotation.set(rx, ry, rz);
  m.castShadow = true; m.receiveShadow = true;
  parent.add(m);
  return m;
}

// Constantes alineadas al kit modular Kenney (módulo 2u, muro 2.4, losa 0.1)
const KIT = { module: 2, wallH: 2.4, slab: 0.1, floorH: 2.5 };

function buildHouseVisual(g, floors = 1) {
  floors = Math.max(1, Math.min(3, Math.round(floors || 1)));
  // Huella 8x6u (4x3 módulos) compuesta con piezas de kit (aprox. visual)
  const W = 8, D = 6;
  const totalH = KIT.floorH * floors;
  const matWall = new THREE.MeshStandardMaterial({ color: 0xd4c4a8, roughness: 0.85 });
  const matWall2 = new THREE.MeshStandardMaterial({ color: 0xc2b08a, roughness: 0.85 });
  const matFloor = new THREE.MeshStandardMaterial({ color: 0x8a7a5e, roughness: 0.9 });
  const matRoof = new THREE.MeshStandardMaterial({ color: 0x8c4f3c, roughness: 0.8 });
  const matWood = new THREE.MeshStandardMaterial({ color: 0x7b5738, roughness: 0.8 });
  const matGlass = new THREE.MeshStandardMaterial({ color: 0x9fd3e0, roughness: 0.15, transparent: true, opacity: 0.55 });

  // Cimiento
  addM(g, new THREE.BoxGeometry(W + 0.4, 0.4, D + 0.4), matWall2, 0, -0.2, 0);
  // Suelo base
  addM(g, new THREE.BoxGeometry(W, KIT.slab, D), matFloor, 0, KIT.slab / 2, 0);

  const addWallSeg = (cx, cz, len, dir, yBase, mat, isDoor = false, isWindow = false) => {
    const thick = 0.12;
    const w = dir === 'x' ? len : thick;
    const d = dir === 'z' ? len : thick;
    if (isDoor) {
      // marco simple con hueco (dos laterales + dintel)
      const doorW = 1.0, doorH = 2.0;
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
      const ww = 0.9, wh = 0.9;
      if (dir === 'x') addM(g, new THREE.BoxGeometry(ww, wh, 0.06), matGlass, cx, yBase + 1.4, cz);
      else addM(g, new THREE.BoxGeometry(0.06, wh, ww), matGlass, cx, yBase + 1.4, cz);
    }
  };

  for (let f = 0; f < floors; f++) {
    const by = f * KIT.floorH + KIT.slab;
    // muros perimetrales por módulos de 2u
    addWallSeg(-2, 3, 2, 'x', by, matWall, false, true);
    addWallSeg(0, 3, 2, 'x', by, matWall, false, true);
    addWallSeg(2, 3, 2, 'x', by, matWall, false, true);
    addWallSeg(4 - 2, 3, 2, 'x', by, matWall, false, false); // ajuste simple
    // trasera completa (4 segmentos)
    // frontal
    if (f === 0) {
      addWallSeg(-3, -3, 2, 'x', by, matWall, false, true);
      addWallSeg(-1, -3, 2, 'x', by, matWall, true, false);
      addWallSeg(1, -3, 2, 'x', by, matWall, false, false);
      addWallSeg(3, -3, 2, 'x', by, matWall, false, true);
    } else {
      addWallSeg(-3, -3, 2, 'x', by, matWall, false, true);
      addWallSeg(-1, -3, 2, 'x', by, matWall, false, true);
      addWallSeg(1, -3, 2, 'x', by, matWall, false, true);
      addWallSeg(3, -3, 2, 'x', by, matWall, false, true);
    }
    // laterales
    addWallSeg(-4, -2, 2, 'z', by, matWall2, false, true);
    addWallSeg(-4, 0, 2, 'z', by, matWall2, false, false);
    addWallSeg(-4, 2, 2, 'z', by, matWall2, false, true);
    addWallSeg(4, -2, 2, 'z', by, matWall2, false, true);
    addWallSeg(4, 0, 2, 'z', by, matWall2, false, false);
    addWallSeg(4, 2, 2, 'z', by, matWall2, false, true);

    const topY = by + KIT.wallH;
    if (f < floors - 1) addM(g, new THREE.BoxGeometry(W, KIT.slab, D), matFloor, 0, topY + KIT.slab / 2, 0);
    else addM(g, new THREE.BoxGeometry(W, KIT.slab, D), matRoof, 0, topY + KIT.slab / 2, 0);
  }
  if (floors >= 2) {
    addM(g, new THREE.BoxGeometry(1.2, 2.5, 4), matWood, 3, KIT.slab + 1.25, 0);
  }
}

function buildCabinVisual(g, floors = 1) {
  floors = Math.max(1, Math.min(3, Math.round(floors || 1)));
  const W = 4, D = 4;
  const matWall = new THREE.MeshStandardMaterial({ color: 0xc2a06a, roughness: 0.85 });
  const matDark = new THREE.MeshStandardMaterial({ color: 0x8a6336, roughness: 0.9 });
  const matRoof = new THREE.MeshStandardMaterial({ color: 0x7a4a2a, roughness: 0.85 });
  const matGlass = new THREE.MeshStandardMaterial({ color: 0x9fd3e0, roughness: 0.15, transparent: true, opacity: 0.55 });
  addM(g, new THREE.BoxGeometry(W + 0.4, 0.3, D + 0.4), matDark, 0, -0.15, 0);
  addM(g, new THREE.BoxGeometry(W, KIT.slab, D), matDark, 0, KIT.slab / 2, 0);
  for (let f = 0; f < floors; f++) {
    const by = f * KIT.floorH + KIT.slab;
    // paredes 4u por lado (2 módulos)
    addM(g, new THREE.BoxGeometry(2, KIT.wallH, 0.12), matWall, -1, by + KIT.wallH / 2, -2);
    addM(g, new THREE.BoxGeometry(2, KIT.wallH, 0.12), matWall, 1, by + KIT.wallH / 2, -2);
    addM(g, new THREE.BoxGeometry(2, KIT.wallH, 0.12), matWall, -1, by + KIT.wallH / 2, 2);
    addM(g, new THREE.BoxGeometry(2, KIT.wallH, 0.12), matWall, 1, by + KIT.wallH / 2, 2);
    addM(g, new THREE.BoxGeometry(0.12, KIT.wallH, 2), matWall, -2, by + KIT.wallH / 2, -1);
    addM(g, new THREE.BoxGeometry(0.12, KIT.wallH, 2), matWall, -2, by + KIT.wallH / 2, 1);
    addM(g, new THREE.BoxGeometry(0.12, KIT.wallH, 2), matWall, 2, by + KIT.wallH / 2, -1);
    addM(g, new THREE.BoxGeometry(0.12, KIT.wallH, 2), matWall, 2, by + KIT.wallH / 2, 1);
    // hueco puerta frontal simple (visual)
    addM(g, new THREE.BoxGeometry(0.9, 1.9, 0.06), new THREE.MeshStandardMaterial({ color: 0x5c3d22 }), 1, by + 0.95, -2.02);
    // ventanas
    addM(g, new THREE.BoxGeometry(0.7, 0.7, 0.05), matGlass, -1, by + 1.4, -2.02);
    addM(g, new THREE.BoxGeometry(0.7, 0.7, 0.05), matGlass, -1, by + 1.4, 2.02);
    const topY = by + KIT.wallH;
    addM(g, new THREE.BoxGeometry(W, KIT.slab, D), f === floors - 1 ? matRoof : matDark, 0, topY + KIT.slab / 2, 0);
  }
}

function makePiece(type, x, z, floors = 1) {
  const y = world.heightAt(x, z);
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  if (type === 'house') {
    buildHouseVisual(g, floors);
  } else if (type === 'cabin') {
    buildCabinVisual(g, floors);
  } else if (type === 'tower') {
    const mat = new THREE.MeshStandardMaterial({ color: 0xd4c4a8, roughness: 0.85 });
    const base = new THREE.MeshStandardMaterial({ color: 0xc2b08a, roughness: 0.85 });
    addM(g, new THREE.CylinderGeometry(2.6, 2.8, 2, 8), base, 0, 1, 0);
    addM(g, new THREE.CylinderGeometry(2, 2.5, 12, 8), mat, 0, 8, 0);
    addM(g, new THREE.CylinderGeometry(2.6, 2.6, 0.4, 8), new THREE.MeshStandardMaterial({ color: 0x8c4f3c }), 0, 14.2, 0);
  } else if (type === 'container') {
    addM(g, new THREE.BoxGeometry(6.2, 0.3, 2.6), new THREE.MeshStandardMaterial({ color: 0xc2b08a, roughness: 0.85 }), 0, 0.15, 0);
    addM(g, new THREE.BoxGeometry(6, 2.4, 2.4), new THREE.MeshStandardMaterial({ color: 0xe2843c, roughness: 0.6, metalness: 0.3 }), 0, 1.5, 0);
  } else if (type === 'wall') {
    // Módulo de muro de kit (2u largo, 2.4 alto, 0.12 grosor)
    addM(g, new THREE.BoxGeometry(0.12, KIT.wallH, 2), new THREE.MeshStandardMaterial({ color: 0xc2b08a, roughness: 0.85 }), 0, KIT.wallH / 2, 0);
  } else if (type === 'tree') {
    addM(g, new THREE.CylinderGeometry(0.25, 0.35, 3.6, 8), new THREE.MeshStandardMaterial({ color: 0x7b5738 }), 0, 1.8, 0);
    addM(g, new THREE.ConeGeometry(2.0, 4.5, 8), new THREE.MeshStandardMaterial({ color: 0x2f6b3e, roughness: 0.9 }), 0, 4.8, 0);
  } else if (type === 'rock') {
    addM(g, new THREE.DodecahedronGeometry(1.2), new THREE.MeshStandardMaterial({ color: 0x777b74, roughness: 0.95 }), 0, 0.7, 0);
  } else if (type === 'road') {
    addM(g, new THREE.BoxGeometry(4, 0.12, 4), new THREE.MeshStandardMaterial({ color: 0x5a5a5a, roughness: 0.95 }), 0, 0.06, 0);
  }
  return g;
}

canvas.addEventListener('click', (e) => {
  if (e.button !== 0) return;
  const rect = canvas.getBoundingClientRect();
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  // raycast against terrain: find intersection with a horizontal plane at y=0 then refine
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();
  if (raycaster.ray.intersectPlane(plane, hit)) {
    const gs = 2;
    hit.x = Math.round(hit.x / gs) * gs;
    hit.z = Math.round(hit.z / gs) * gs;
    const y = world.heightAt(hit.x, hit.z);
    const floors = ((selectedPiece === 'house' || selectedPiece === 'cabin') && document.querySelector('#floorsSelect')) ? parseInt(document.querySelector('#floorsSelect').value, 10) || 1 : 1;
    const piece = makePiece(selectedPiece, hit.x, hit.z, floors);
    piece.position.y = y;
    const entry = { type: selectedPiece, x: hit.x, y, z: hit.z, rot: rotY };
    if ((selectedPiece === 'house' || selectedPiece === 'cabin') && floors > 1) entry.floors = floors;
    placed.push(entry);
    placedGroup.add(piece);
    document.querySelector('#status').textContent = `Colocado: ${selectedPiece}${floors>1?' ('+floors+' plantas)':''} en (${hit.x.toFixed(1)}, ${hit.z.toFixed(1)})`;
  }
});

canvas.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  // delete nearest
  const rect = canvas.getBoundingClientRect();
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  // find closest placed object
  let best = null, bestD = 3;
  for (const p of placedGroup.children) {
    const d = raycaster.ray.distanceToPoint(p.position);
    if (d < bestD) { bestD = d; best = p; }
  }
  if (best) {
    placedGroup.remove(best);
    const idx = placed.findIndex(p => p.x === best.position.x && p.z === best.position.z);
    if (idx >= 0) placed.splice(idx, 1);
    document.querySelector('#status').textContent = 'Eliminado';
  }
});

document.querySelector('#saveMap').onclick = async () => {
  const payload = JSON.stringify({ base: 'san-borondon', pieces: placed }, null, 2);
  document.querySelector('#mapText').value = payload;
  const paths = ['public/maps/custom-map.json', 'dist/maps/custom-map.json', 'maps/custom-map.json'];
  let ok = 0;
  for (const p of paths) {
    try { await window.opennite?.app?.writeFile?.(p, payload); ok++; } catch {}
  }
  // Fallback: download if IPC not available
  if (!ok) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
    a.download = 'custom-map.json';
    a.click();
  }
  document.querySelector('#status').textContent = `Guardado ${placed.length} piezas (custom-map)`;
};

document.querySelector('#clearMap').onclick = () => {
  while (placedGroup.children.length) placedGroup.remove(placedGroup.children[0]);
  placed.length = 0;
  document.querySelector('#status').textContent = 'Limpiado';
};

function tick() {
  requestAnimationFrame(tick);
  orbit.update();
  renderer.render(scene, camera);
}
tick();

window.addEventListener('resize', () => {
  camera.aspect = canvas.clientWidth / canvas.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
});
renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
