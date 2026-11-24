import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';

const viewport = document.getElementById('viewport');
const canvasHost = viewport;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(viewport.clientWidth, viewport.clientHeight);
renderer.shadowMap.enabled = true;
viewport.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0d12);
const camera = new THREE.PerspectiveCamera(55, viewport.clientWidth / viewport.clientHeight, 0.1, 500);
camera.position.set(6, 6, 8);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.5, 0);
controls.enableDamping = true;
controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
controls.enablePan = true;

const hemi = new THREE.HemisphereLight(0xddeeff, 0x223344, 0.9);
scene.add(hemi);
const dir = new THREE.DirectionalLight(0xffffff, 1.1);
dir.position.set(8, 12, 6);
dir.castShadow = true;
scene.add(dir);

const grid = new THREE.GridHelper(40, 40, 0x334455, 0x223344);
scene.add(grid);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: 0x141922, roughness: 1 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const tControls = new TransformControls(camera, renderer.domElement);
tControls.addEventListener('dragging-changed', (e) => { controls.enabled = !e.value; });
scene.add(tControls.getHelper());

let snapOn = false;
let gridSize = 2;
function applySnap() {
  tControls.setTranslationSnap(snapOn ? gridSize / 4 : null);
  tControls.setRotationSnap(snapOn ? THREE.MathUtils.degToRad(15) : null);
  tControls.setScaleSnap(snapOn ? 0.25 : null);
}

const partRoot = new THREE.Group();
partRoot.name = 'partRoot';
scene.add(partRoot);

let selected = null;
let idSeq = 1;

function matFor(color = 0xc2b08a, extruder = false) {
  if (extruder) return new THREE.MeshStandardMaterial({ color: 0xff5555, transparent: true, opacity: 0.35, roughness: 0.6 });
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05 });
}

function makeWedgeGeometry() {
  // Cuña/rampa: prisma triangular extruido (1x1x1) orientado como rampa
  const shape = new THREE.Shape();
  shape.moveTo(-0.5, -0.5);
  shape.lineTo(0.5, -0.5);
  shape.lineTo(0.5, 0.5);
  shape.lineTo(-0.5, -0.5);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false });
  geo.translate(0, 0, -0.5);
  geo.rotateY(-Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

function createShape(kind) {
  let geo;
  if (kind === 'box') geo = new THREE.BoxGeometry(2, 2, 2);
  else if (kind === 'plane') geo = new THREE.BoxGeometry(2, 0.2, 2);
  else if (kind === 'cylinder') geo = new THREE.CylinderGeometry(0.5, 0.5, 2, 24);
  else if (kind === 'wedge') geo = makeWedgeGeometry();
  else geo = new THREE.BoxGeometry(2, 2, 2);
  const mesh = new THREE.Mesh(geo, matFor(0xc2b08a, false));
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.position.set(0, kind === 'plane' ? 0.1 : 1, 0);
  mesh.userData.kind = kind;
  mesh.userData.extruder = false;
  mesh.userData.baseColor = '#c2b08a';
  mesh.name = `${kind}_${idSeq++}`;
  return mesh;
}

function addShape(kind) {
  const m = createShape(kind);
  partRoot.add(m);
  select(m);
  refreshList();
}

function isPartObject(o) { return o && (o.isMesh || o.isGroup) && o !== partRoot; }

function collectSelectable() {
  const out = [];
  partRoot.traverse((o) => { if (isPartObject(o) && o !== partRoot) out.push(o); });
  return out;
}

function select(obj) {
  selected = obj && isPartObject(obj) ? obj : null;
  if (selected) tControls.attach(selected); else tControls.detach();
  refreshList();
  syncPropsFromSelection();
}

function disposeObj(o) {
  if (o.isMesh) { o.geometry?.dispose?.(); if (Array.isArray(o.material)) o.material.forEach(m=>m.dispose()); else o.material?.dispose?.(); }
}

function removeSelected() {
  if (!selected) return;
  const p = selected.parent || partRoot;
  tControls.detach();
  p.remove(selected);
  disposeObj(selected);
  selected = null;
  refreshList(); syncPropsFromSelection();
}

function duplicateSelected() {
  if (!selected) return;
  let clone;
  if (selected.isGroup) {
    clone = selected.clone(true);
  } else {
    clone = selected.clone();
    clone.geometry = selected.geometry.clone();
  }
  clone.traverse((o) => {
    if (o.isMesh) {
      o.material = matFor(o.userData?.baseColor || '#c2b08a', !!o.userData?.extruder);
      o.castShadow = true; o.receiveShadow = true;
    }
  });
  clone.name = (selected.name || 'obj') + '_copy';
  clone.position.x += 0.5; clone.position.z += 0.5;
  (selected.parent || partRoot).add(clone);
  select(clone);
  refreshList();
}

function toggleExtruderSelected() {
  if (!selected || !selected.isMesh) return;
  selected.userData.extruder = !selected.userData.extruder;
  selected.material = matFor(selected.userData.baseColor || '#c2b08a', selected.userData.extruder);
  refreshList(); syncPropsFromSelection();
}

function groupSelected() {
  if (!selected || selected === partRoot) return;
  // Envuelve el objeto seleccionado en un grupo (agrupado simple)
  const parent = selected.parent || partRoot;
  const g = new THREE.Group();
  g.name = 'group_' + (idSeq++);
  g.userData.kind = 'group';
  parent.add(g);
  parent.remove(selected);
  g.add(selected);
  // normalizar: mantener transform del hijo
  select(g);
  refreshList();
}

function ungroupSelected() {
  if (!selected || !selected.isGroup) return;
  const parent = selected.parent || partRoot;
  const children = [...selected.children];
  for (const c of children) {
    c.applyMatrix4(selected.matrix);
    parent.add(c);
  }
  tControls.detach();
  parent.remove(selected);
  selected = children[0] || null;
  if (selected) tControls.attach(selected);
  refreshList(); syncPropsFromSelection();
}

function clearPart() {
  tControls.detach();
  while (partRoot.children.length) { const c = partRoot.children[0]; partRoot.remove(c); disposeObj(c); }
  selected = null; idSeq = 1;
  refreshList(); syncPropsFromSelection();
}

function serializeObject(o) {
  if (o.isGroup) {
    return {
      type: 'group', name: o.name,
      position: o.position.toArray(), rotation: [o.rotation.x, o.rotation.y, o.rotation.z],
      scale: o.scale.toArray(), extruder: !!o.userData.extruder,
      children: o.children.map(serializeObject)
    };
  }
  return {
    type: 'shape', name: o.name, shape: o.userData.kind || 'box',
    position: o.position.toArray(), rotation: [o.rotation.x, o.rotation.y, o.rotation.z],
    scale: o.scale.toArray(), color: o.userData.baseColor || '#c2b08a',
    extruder: !!o.userData.extruder
  };
}

function exportPart() {
  const data = {
    name: document.getElementById('partName').value || 'part',
    category: document.getElementById('partCategory').value || 'other',
    gridSize: Number(document.getElementById('gridSize').value) || 2,
    version: 1,
    objects: partRoot.children.map(serializeObject),
  };
  const json = JSON.stringify(data, null, 2);
  document.getElementById('partJson').value = json;
  return { data, json };
}

function buildObject(def) {
  if (def.type === 'group') {
    const g = new THREE.Group();
    g.name = def.name || ('group_' + idSeq++);
    g.userData.kind = 'group';
    g.position.fromArray(def.position || [0,0,0]);
    const r = def.rotation || [0,0,0]; g.rotation.set(r[0], r[1], r[2]);
    g.scale.fromArray(def.scale || [1,1,1]);
    (def.children || []).forEach(cd => g.add(buildObject(cd)));
    return g;
  }
  const kind = def.shape || 'box';
  let geo;
  if (kind === 'box') geo = new THREE.BoxGeometry(2,2,2);
  else if (kind === 'plane') geo = new THREE.BoxGeometry(2,0.2,2);
  else if (kind === 'cylinder') geo = new THREE.CylinderGeometry(0.5,0.5,2,24);
  else if (kind === 'sphere') geo = new THREE.SphereGeometry(0.5,8,6);
  else if (kind === 'cone') geo = new THREE.ConeGeometry(0.5,1.0,8);
  else if (kind === 'wedge') geo = makeWedgeGeometry();
  else geo = new THREE.BoxGeometry(2,2,2);
  const extruder = !!def.extruder;
  const color = def.color || '#c2b08a';
  const mesh = new THREE.Mesh(geo, matFor(color, extruder));
  mesh.name = def.name || (kind + '_' + idSeq++);
  mesh.userData.kind = kind;
  mesh.userData.extruder = extruder;
  mesh.userData.baseColor = color;
  mesh.position.fromArray(def.position || [0,0,0]);
  const r = def.rotation || [0,0,0]; mesh.rotation.set(r[0], r[1], r[2]);
  mesh.scale.fromArray(def.scale || [1,1,1]);
  mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}

function importPart(data) {
  clearPart();
  document.getElementById('partName').value = data.name || 'part';
  document.getElementById('partCategory').value = data.category || 'other';
  document.getElementById('gridSize').value = data.gridSize || 2;
  gridSize = Number(data.gridSize || 2);
  (data.objects || []).forEach(def => partRoot.add(buildObject(def)));
  applySnap();
  refreshList(); syncPropsFromSelection();
  setStatus('Parte cargada.');
}

async function savePart() {
  const { data, json } = exportPart();
  const safe = (data.name || 'part').replace(/[^a-zA-Z0-9_-]/g, '_');
  const rel = `config/parts/${safe}.json`;
  const writer = window.opennite?.app?.writeFile || window.app?.writeFile;
  try {
    if (typeof writer === 'function') {
      await writer(rel, json);
      setStatus(`Guardado en ${rel}`);
      return;
    }
  } catch (e) {
    console.warn('No se pudo guardar por IPC:', e);
  }
  // Fallback: descarga
  const blob = new Blob([json], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${safe}.json`; a.click();
  URL.revokeObjectURL(a.href);
  setStatus('JSON descargado (sin IPC de Electron).');
}

function loadPartFromFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try { importPart(JSON.parse(String(reader.result || '{}'))); }
    catch (e) { setStatus('JSON inválido: ' + e.message); }
  };
  reader.readAsText(file);
}

function loadTemplate(template) {
  const templates = {
    wall: {
      name: 'wall', category: 'wall', grid: 2,
      objects: [
        { name: 'wall', shape: 'box', position: [0, 1.2, 0], rotation: [0, 0, 0], scale: [2, 2.4, 0.2], color: 0xd4c4a8, isExtruder: false },
      ],
    },
    wall_window: {
      name: 'wall_window', category: 'wall_window', grid: 2,
      objects: [
        { name: 'wall', shape: 'box', position: [0, 1.2, 0], rotation: [0, 0, 0], scale: [2, 2.4, 0.2], color: 0xd4c4a8, isExtruder: false },
        { name: 'window_cutout', shape: 'box', position: [0, 1.3, 0], rotation: [0, 0, 0], scale: [0.8, 0.8, 0.4], color: 0xff6b6b, isExtruder: true },
      ],
    },
    wall_door: {
      name: 'wall_door', category: 'wall_door', grid: 2,
      objects: [
        { name: 'wall', shape: 'box', position: [0, 1.2, 0], rotation: [0, 0, 0], scale: [2, 2.4, 0.2], color: 0xd4c4a8, isExtruder: false },
        { name: 'door_cutout', shape: 'box', position: [0, 1.0, 0], rotation: [0, 0, 0], scale: [0.9, 2.0, 0.4], color: 0xff6b6b, isExtruder: true },
      ],
    },
    floor: {
      name: 'floor', category: 'floor', grid: 2,
      objects: [
        { name: 'slab', shape: 'box', position: [0, 0.05, 0], rotation: [0, 0, 0], scale: [2, 0.1, 2], color: 0x8a7a5e, isExtruder: false },
      ],
    },
    roof: {
      name: 'roof', category: 'roof', grid: 2,
      objects: [
        { name: 'base', shape: 'box', position: [0, 0.1, 0], rotation: [0, 0, 0], scale: [2.2, 0.2, 2.2], color: 0x8c4f3c, isExtruder: false },
        { name: 'slope_a', shape: 'wedge', position: [0.55, 0.7, 0], rotation: [0, 0, 0], scale: [1.1, 1.0, 2.2], color: 0x7f4332, isExtruder: false },
        { name: 'slope_b', shape: 'wedge', position: [-0.55, 0.7, 0], rotation: [0, 3.14159, 0], scale: [1.1, 1.0, 2.2], color: 0x7f4332, isExtruder: false },
      ],
    },
    stairs: {
      name: 'stairs', category: 'stairs', grid: 2,
      objects: [
        { name: 'step1', shape: 'box', position: [0, 0.2, 0.6], rotation: [0, 0, 0], scale: [1.6, 0.4, 0.6], color: 0xa38a68, isExtruder: false },
        { name: 'step2', shape: 'box', position: [0, 0.6, 0.0], rotation: [0, 0, 0], scale: [1.6, 0.4, 0.6], color: 0xa38a68, isExtruder: false },
        { name: 'step3', shape: 'box', position: [0, 1.0, -0.6], rotation: [0, 0, 0], scale: [1.6, 0.4, 0.6], color: 0xa38a68, isExtruder: false },
      ],
    },
    wall_corner: {
      name: 'wall_corner', category: 'wall_corner', grid: 2,
      objects: [
        { name: 'corner', shape: 'box', position: [0, 1.2, 0], rotation: [0, 0, 0], scale: [2, 2.4, 2], color: 0xd4c4a8, isExtruder: false },
        { name: 'corner_trim', shape: 'cylinder', position: [0, 2.3, 0], rotation: [0, 0, 0], scale: [0.3, 0.3, 1.8], color: 0x8f7a5e, isExtruder: false },
      ],
    },
    column: {
      name: 'column', category: 'column', grid: 0.5,
      objects: [
        { name: 'column', shape: 'cylinder', position: [0, 1.2, 0], rotation: [0, 0, 0], scale: [0.25, 0.25, 2.4], color: 0xc2b08a, isExtruder: false },
        { name: 'capital', shape: 'cone', position: [0, 2.5, 0], rotation: [Math.PI / 2, 0, 0], scale: [0.5, 0.1, 0.5], color: 0x8f7a5e, isExtruder: false },
      ],
    },
    road_stone_bump: {
      name: 'road_stone_bump', category: 'other', grid: 1.25,
      objects: [
        { name: 'stone_bump', shape: 'cone', position: [0, 0.2, 0], rotation: [0, 0, 0], scale: [0.28, 0.28, 0.5], color: 0xc3cdd2, isExtruder: false },
      ],
    },
    road_wood_spike: {
      name: 'road_wood_spike', category: 'other', grid: 1.4,
      objects: [
        { name: 'wood_spike', shape: 'cylinder', position: [0, 0.16, 0], rotation: [0, 0, 0], scale: [0.07, 0.18, 0.32], color: 0x6c5337, isExtruder: false },
        { name: 'wood_ball', shape: 'sphere', position: [0, 0.22, 0], rotation: [0, 0, 0], scale: [0.17, 0.17, 0.17], color: 0x7f4332, isExtruder: false },
      ],
    },
    map_road: {
      name: 'map_road', category: 'other', grid: 1.25,
      objects: [
        { name: 'road_base', shape: 'box', position: [0, 0.06, 0], rotation: [0, 0, 0], scale: [4, 0.16, 4], color: 0xc9d4d8, isExtruder: false },
        { name: 'road_spike_n', shape: 'cylinder', position: [1.2, 0.18, 0], rotation: [0, 0, 0], scale: [0.07, 0.18, 0.32], color: 0x6c5337, isExtruder: false },
        { name: 'road_spike_s', shape: 'cylinder', position: [-1.2, 0.18, 0], rotation: [0, 0, 0], scale: [0.07, 0.18, 0.32], color: 0x6c5337, isExtruder: false },
        { name: 'road_spike_e', shape: 'cylinder', position: [0, 0.18, 1.2], rotation: [0, 0, 0], scale: [0.07, 0.18, 0.32], color: 0x6c5337, isExtruder: false },
        { name: 'road_spike_w', shape: 'cylinder', position: [0, 0.18, -1.2], rotation: [0, 0, 0], scale: [0.07, 0.18, 0.32], color: 0x6c5337, isExtruder: false },
        { name: 'road_ball_n', shape: 'sphere', position: [1.2, 0.24, 0], rotation: [0, 0, 0], scale: [0.17, 0.17, 0.17], color: 0x7f4332, isExtruder: false },
        { name: 'road_ball_s', shape: 'sphere', position: [-1.2, 0.24, 0], rotation: [0, 0, 0], scale: [0.17, 0.17, 0.17], color: 0x7f4332, isExtruder: false },
        { name: 'road_ball_e', shape: 'sphere', position: [0, 0.24, 1.2], rotation: [0, 0, 0], scale: [0.17, 0.17, 0.17], color: 0x7f4332, isExtruder: false },
        { name: 'road_ball_w', shape: 'sphere', position: [0, 0.24, -1.2], rotation: [0, 0, 0], scale: [0.17, 0.17, 0.17], color: 0x7f4332, isExtruder: false },
      ],
    },
    map_path: {
      name: 'map_path', category: 'other', grid: 0.5,
      objects: [
        { name: 'path_base', shape: 'box', position: [0, 0.04, 0], rotation: [0, 0, 0], scale: [2, 0.1, 2], color: 0xadb6b8, isExtruder: false },
        { name: 'path_bump', shape: 'cone', position: [0.4, 0.18, 0], rotation: [0, 0, 0], scale: [0.14, 0.14, 0.5], color: 0xc3cdd2, isExtruder: false },
        { name: 'path_bump2', shape: 'cone', position: [-0.4, 0.18, 0], rotation: [Math.PI, 0, 0], scale: [0.14, 0.14, 0.5], color: 0xc3cdd2, isExtruder: false },
      ],
    },
    map_fence: {
      name: 'map_fence', category: 'other', grid: 0.5,
      objects: [
        { name: 'post_n', shape: 'cylinder', position: [0, 0.6, -0.5], rotation: [Math.PI / 2, 0, 0], scale: [0.15, 0.15, 0.3], color: 0x6c5337, isExtruder: false },
        { name: 'post_s', shape: 'cylinder', position: [0, 0.6, 0.5], rotation: [Math.PI / 2, 0, 0], scale: [0.15, 0.15, 0.3], color: 0x6c5337, isExtruder: false },
        { name: 'rail_n', shape: 'box', position: [0, 1.15, -0.5], rotation: [0, 0, 0], scale: [0.16, 0.04, 0.64], color: 0x6c5337, isExtruder: false },
        { name: 'rail_s', shape: 'box', position: [0, 1.15, 0.5], rotation: [0, 0, 0], scale: [0.16, 0.04, 0.64], color: 0x6c5337, isExtruder: false },
        { name: 'post_w', shape: 'cylinder', position: [-0.5, 0.6, 0], rotation: [Math.PI / 2, 0, 0], scale: [0.15, 0.15, 0.3], color: 0x6c5337, isExtruder: false },
        { name: 'post_e', shape: 'cylinder', position: [0.5, 0.6, 0], rotation: [Math.PI / 2, 0, 0], scale: [0.15, 0.15, 0.3], color: 0x6c5337, isExtruder: false },
        { name: 'rail_w', shape: 'box', position: [-0.5, 1.15, 0], rotation: [0, 0, 0], scale: [0.64, 0.04, 0.16], color: 0x6c5337, isExtruder: false },
        { name: 'rail_e', shape: 'box', position: [0.5, 1.15, 0], rotation: [0, 0, 0], scale: [0.64, 0.04, 0.16], color: 0x6c5337, isExtruder: false },
      ],
    },
    map_tree: {
      name: 'map_tree', category: 'other', grid: 0.5,
      objects: [
        { name: 'trunk', shape: 'cylinder', position: [0, 1.1, 0], rotation: [Math.PI / 2, 0, 0], scale: [0.14, 0.14, 2.0], color: 0x6c5337, isExtruder: false },
        { name: 'foliage1', shape: 'sphere', position: [0, 1.9, 0.5], rotation: [0, 0, 0], scale: [0.6, 0.6, 0.6], color: 0x2f6b3e, isExtruder: false },
        { name: 'foliage2', shape: 'sphere', position: [0.6, 2.2, 0.2], rotation: [0, 0, 0], scale: [0.5, 0.5, 0.5], color: 0x3f7a3f, isExtruder: false },
        { name: 'foliage3', shape: 'sphere', position: [-0.5, 2.0, -0.3], rotation: [0, 0, 0], scale: [0.55, 0.55, 0.55], color: 0x2f6b3e, isExtruder: false },
      ],
    },
    map_rock: {
      name: 'map_rock', category: 'other', grid: 0.5,
      objects: [
        { name: 'rock_body', shape: 'sphere', position: [0, 0.9, 0.3], rotation: [0, 0, 0], scale: [1.1, 1.1, 1.1], color: 0x808080, isExtruder: false },
        { name: 'rock_base', shape: 'box', position: [0, 0.25, 0], rotation: [0, 0, 0], scale: [1.8, 0.5, 1.5], color: 0x7a7a7a, isExtruder: false },
        { name: 'rock_chip', shape: 'cone', position: [-0.4, 1.3, 0.1], rotation: [0, 0, 0], scale: [0.3, 0.5, 0.3], color: 0x6d6d6d, isExtruder: false },
      ],
    },
    map_chest: {
      name: 'map_chest', category: 'other', grid: 0.5,
      objects: [
        { name: 'chest_body', shape: 'box', position: [0, 0.5, 0], rotation: [0, 0, 0], scale: [1.2, 0.7, 0.9], color: 0xc98a3a, isExtruder: false },
        { name: 'chest_lid', shape: 'box', position: [0, 1.05, 0], rotation: [0, 0, 0], scale: [1.1, 0.08, 0.8], color: 0xd29a45, isExtruder: false },
        { name: 'chest_lock', shape: 'box', position: [0, 0.55, 0.35], rotation: [0, 0, 0], scale: [0.05, 0.25, 0.05], color: 0x8a5a1f, isExtruder: false },
        { name: 'chest_spark', shape: 'sphere', position: [0.4, 0.7, 0], rotation: [0, 0, 0], scale: [0.08, 0.08, 0.08], color: 0xffd36a, isExtruder: false },
      ],
    },
    map_weapon_spawn: {
      name: 'map_weapon_spawn', category: 'other', grid: 0.5,
      objects: [
        { name: 'spawn_spark', shape: 'sphere', position: [0, 0.8, 0], rotation: [0, 0, 0], scale: [0.12, 0.12, 0.12], color: 0x63b3ed, isExtruder: false },
        { name: 'spawn_base', shape: 'box', position: [0, 0.45, 0], rotation: [0, 0, 0], scale: [0.7, 0.1, 0.7], color: 0x2b6cb0, isExtruder: false },
        { name: 'spawn_pedestal', shape: 'box', position: [0, 0.35, 0], rotation: [0, 0, 0], scale: [0.4, 0.5, 0.4], color: 0x4a5568, isExtruder: false },
      ],
    },
    map_loot_spawn: {
      name: 'map_loot_spawn', category: 'other', grid: 0.5,
      objects: [
        { name: 'loot_spark', shape: 'sphere', position: [0, 0.8, 0], rotation: [0, 0, 0], scale: [0.1, 0.1, 0.1], color: 0xffb347, isExtruder: false },
        { name: 'loot_spawner', shape: 'box', position: [0, 0.4, 0], rotation: [0, 0, 0], scale: [0.6, 0.08, 0.6], color: 0x7a7a7a, isExtruder: false },
        { name: 'loot_glow', shape: 'cone', position: [0, 1.1, 0], rotation: [Math.PI / 2, 0, 0], scale: [0.15, 0.15, 0.4], color: 0xffb347, isExtruder: false },
      ],
    },
    map_spawn_zone: {
      name: 'map_spawn_zone', category: 'other', grid: 0.5,
      objects: [
        { name: 'spawn_ring', shape: 'box', position: [0, 0.12, 0], rotation: [0, 0, 0], scale: [3.0, 0.08, 3.0], color: 0x9a9a9a, isExtruder: false },
        { name: 'spawn_node', shape: 'cylinder', position: [0, 0.4, 0], rotation: [Math.PI / 2, 0, 0], scale: [0.35, 0.35, 0.5], color: 0x4a5568, isExtruder: false },
        { name: 'spawn_beam', shape: 'box', position: [0, 1.5, 0], rotation: [0, 0, 0], scale: [0.3, 3.0, 0.3], color: 0xffd36a, isExtruder: false },
      ],
    },
    map_editor_house: {
      name: 'map_editor_house', category: 'other', grid: 2,
      objects: [
        { name: 'house_body', shape: 'box', position: [0, 3, 0], rotation: [0, 0, 0], scale: [8, 6, 6], color: 0xc2b08a, isExtruder: false },
        { name: 'house_door', shape: 'box', position: [0, 0.8, 0], rotation: [0, 0, 0], scale: [1, 1, 0.1], color: 0x6b4f2f, isExtruder: false },
        { name: 'house_window_l', shape: 'box', position: [3, 2, 0], rotation: [0, 0, 0], scale: [1.2, 1.2, 0.1], color: 0x63b3ed, isExtruder: false },
        { name: 'house_window_r', shape: 'box', position: [-3, 2, 0], rotation: [0, 0, 0], scale: [1.2, 1.2, 0.1], color: 0x63b3ed, isExtruder: false },
        { name: 'house_chimney', shape: 'cylinder', position: [3.2, 5.4, 0], rotation: [0, 0, 0], scale: [0.35, 0.35, 0.7], color: 0x5a4330, isExtruder: false },
      ],
    },
    map_editor_cabin: {
      name: 'map_editor_cabin', category: 'other', grid: 2,
      objects: [
        { name: 'cabin_body', shape: 'box', position: [0, 2.2, 0], rotation: [0, 0, 0], scale: [4, 4.5, 4], color: 0x8b5a2c, isExtruder: false },
        { name: 'cabin_door', shape: 'box', position: [0, 0.6, 0], rotation: [0, 0, 0], scale: [0.8, 0.9, 0.1], color: 0x6b4f2f, isExtruder: false },
        { name: 'cabin_window', shape: 'box', position: [0, 1.6, 0], rotation: [Math.PI / 2, 0, 0], scale: [1.1, 0.1, 1.1], color: 0x63b3ed, isExtruder: false },
      ],
    },
    map_editor_tower: {
      name: 'map_editor_tower', category: 'other', grid: 2,
      objects: [
        { name: 'tower_base', shape: 'cylinder', position: [0, 1.4, 0], rotation: [0, 0, 0], scale: [4.5, 4.5, 4], color: 0xcfc7b2, isExtruder: false },
        { name: 'tower_mid', shape: 'cylinder', position: [0, 7, 0], rotation: [0, 0, 0], scale: [2.8, 2.8, 9], color: 0xd4c4a8, isExtruder: false },
        { name: 'tower_top', shape: 'cylinder', position: [0, 12.6, 0], rotation: [0, 0, 0], scale: [2, 2, 0.5], color: 0x8c4f3c, isExtruder: false },
      ],
    },
    map_editor_container: {
      name: 'map_editor_container', category: 'other', grid: 2,
      objects: [
        { name: 'container_body', shape: 'box', position: [0, 1.4, 0], rotation: [0, 0, 0], scale: [6, 3, 2.4], color: 0xc2b08a, isExtruder: false },
        { name: 'container_door', shape: 'box', position: [0, 0.7, 0], rotation: [0, 0, 0], scale: [5.6, 0.2, 2.2], color: 0xe2843c, isExtruder: false },
      ],
    },
    map_editor_chest: {
      name: 'map_editor_chest', category: 'other', grid: 0.5,
      objects: [
        { name: 'chest_body', shape: 'box', position: [0, 0.5, 0], rotation: [0, 0, 0], scale: [1.2, 0.7, 0.9], color: 0xc98a3a, isExtruder: false },
        { name: 'chest_lid', shape: 'box', position: [0, 1.05, 0], rotation: [0, 0, 0], scale: [1.1, 0.08, 0.8], color: 0xd29a45, isExtruder: false },
      ],
    },
    map_editor_spawn: {
      name: 'map_editor_spawn', category: 'other', grid: 0.5,
      objects: [
        { name: 'spawn_spark', shape: 'sphere', position: [0, 0.8, 0], rotation: [0, 0, 0], scale: [0.12, 0.12, 0.12], color: 0x63b3ed, isExtruder: false },
        { name: 'spawn_base', shape: 'box', position: [0, 0.4, 0], rotation: [0, 0, 0], scale: [0.7, 0.1, 0.7], color: 0x2b6cb0, isExtruder: false },
        { name: 'spawn_pedestal', shape: 'cylinder', position: [0, 0.5, 0], rotation: [Math.PI / 2, 0, 0], scale: [0.25, 0.25, 0.7], color: 0x4a5568, isExtruder: false },
      ],
    },
    map_editor_tree_round: {
      name: 'map_editor_tree_round', category: 'other', grid: 0.5,
      objects: [
        { name: 'trunk', shape: 'cylinder', position: [0, 1.4, 0], rotation: [Math.PI / 2, 0, 0], scale: [0.18, 0.18, 2.4], color: 0x5f4a30, isExtruder: false },
        { name: 'foliage_a', shape: 'sphere', position: [0.6, 2.3, 0.4], rotation: [0, 0, 0], scale: [0.7, 0.7, 0.7], color: 0x2f6b3e, isExtruder: false },
        { name: 'foliage_b', shape: 'sphere', position: [-0.5, 2.5, 0.1], rotation: [0, 0, 0], scale: [0.75, 0.75, 0.75], color: 0x3f7a3f, isExtruder: false },
        { name: 'foliage_c', shape: 'sphere', position: [0.1, 2.4, -0.7], rotation: [0, 0, 0], scale: [0.6, 0.6, 0.6], color: 0x2f6b3e, isExtruder: false },
      ],
    },
    map_editor_tree_pine: {
      name: 'map_editor_tree_pine', category: 'other', grid: 0.5,
      objects: [
        { name: 'trunk', shape: 'cylinder', position: [0, 1.3, 0], rotation: [Math.PI / 2, 0, 0], scale: [0.12, 0.12, 2.1], color: 0x5a4332, isExtruder: false },
        { name: 'needle_a', shape: 'cone', position: [0.4, 2.3, 0], rotation: [Math.PI / 2, 0, 0], scale: [0.55, 0.12, 0.4], color: 0x4a9a3f, isExtruder: false },
        { name: 'needle_b', shape: 'cone', position: [-0.2, 2.7, 0.3], rotation: [Math.PI / 2, 0, 0], scale: [0.5, 0.12, 0.35], color: 0x50a346, isExtruder: false },
        { name: 'needle_c', shape: 'cone', position: [0, 2.9, -0.4], rotation: [Math.PI / 2, 0, 0], scale: [0.55, 0.13, 0.45], color: 0x46a341, isExtruder: false },
        { name: 'needle_d', shape: 'cone', position: [0.5, 2.2, -0.5], rotation: [Math.PI / 2, 0, 0], scale: [0.42, 0.1, 0.3], color: 0x3c8c33, isExtruder: false },
      ],
    },
    map_editor_tree_palm: {
      name: 'map_editor_tree_palm', category: 'other', grid: 0.5,
      objects: [
        { name: 'trunk', shape: 'cylinder', position: [0, 1.4, 0], rotation: [0, 0, 0], scale: [0.18, 0.18, 3.0], color: 0x8a6d3b, isExtruder: false },
        { name: 'frond_a', shape: 'box', position: [1.5, 2.8, 0], rotation: [0, 0, 0], scale: [0.7, 0.06, 0.9], color: 0x6b7a4f, isExtruder: false },
        { name: 'frond_b', shape: 'box', position: [-0.4, 3.1, 1.2], rotation: [0, 0, 0], scale: [0.8, 0.06, 0.7], color: 0x5f6e44, isExtruder: false },
        { name: 'frond_c', shape: 'box', position: [-0.6, 3.3, -1.0], rotation: [0, 0, 0], scale: [0.7, 0.06, 0.8], color: 0x55613c, isExtruder: false },
        { name: 'coconut_a', shape: 'sphere', position: [0.9, 2.4, 0.3], rotation: [0, 0, 0], scale: [0.45, 0.45, 0.45], color: 0xd9c48a, isExtruder: false },
        { name: 'coconut_b', shape: 'sphere', position: [-0.3, 2.6, 1.5], rotation: [0, 0, 0], scale: [0.42, 0.42, 0.42], color: 0xe2cf8a, isExtruder: false },
      ],
    },
    map_editor_tree_tall: {
      name: 'map_editor_tree_tall', category: 'other', grid: 0.5,
      objects: [
        { name: 'trunk', shape: 'cylinder', position: [0, 1.9, 0], rotation: [Math.PI / 2, 0, 0], scale: [0.16, 0.16, 3.1], color: 0x6c5337, isExtruder: false },
        { name: 'foliage_a', shape: 'sphere', position: [0.8, 3.4, 0.5], rotation: [0, 0, 0], scale: [0.9, 0.9, 0.9], color: 0x2f7a42, isExtruder: false },
        { name: 'foliage_b', shape: 'sphere', position: [-0.7, 3.7, -0.2], rotation: [0, 0, 0], scale: [1.0, 1.0, 1.0], color: 0x3a874c, isExtruder: false },
        { name: 'foliage_c', shape: 'sphere', position: [0.2, 4.0, -0.8], rotation: [0, 0, 0], scale: [0.85, 0.85, 0.85], color: 0x2f7a42, isExtruder: false },
      ],
    },
    map_editor_tree_birch: {
      name: 'map_editor_tree_birch', category: 'other', grid: 0.5,
      objects: [
        { name: 'trunk', shape: 'cylinder', position: [0, 1.8, 0], rotation: [Math.PI / 2, 0, 0], scale: [0.14, 0.14, 3.0], color: 0x5f6e7e, isExtruder: false },
        { name: 'bark_stripe', shape: 'box', position: [0.4, 1.8, 0], rotation: [Math.PI / 2, 0, 0], scale: [0.06, 0.1, 3.0], color: 0x8ca3b3, isExtruder: false },
        { name: 'foliage_a', shape: 'sphere', position: [0.7, 2.7, 0.3], rotation: [0, 0, 0], scale: [0.65, 0.65, 0.65], color: 0xeef7fa, isExtruder: false },
        { name: 'foliage_b', shape: 'sphere', position: [-0.4, 2.9, -0.6], rotation: [0, 0, 0], scale: [0.7, 0.7, 0.7], color: 0xd9e8f0, isExtruder: false },
      ],
    },
    map_editor_tree_dead: {
      name: 'map_editor_tree_dead', category: 'other', grid: 0.5,
      objects: [
        { name: 'trunk', shape: 'cylinder', position: [0, 1.8, 0], rotation: [Math.PI / 2, 0, 0], scale: [0.16, 0.16, 2.8], color: 0x665e55, isExtruder: false },
        { name: 'dead_branch_a', shape: 'box', position: [0.9, 1.9, 0.2], rotation: [Math.PI / 2, 0, 0], scale: [0.08, 0.1, 1.6], color: 0x4a4336, isExtruder: false },
        { name: 'dead_branch_b', shape: 'box', position: [-0.8, 2.2, -0.4], rotation: [Math.PI / 2, 0.3, 0], scale: [0.08, 0.1, 1.2], color: 0x4a4336, isExtruder: false },
        { name: 'dead_sprout', shape: 'sphere', position: [0.4, 2.0, 0.8], rotation: [0, 0, 0], scale: [0.28, 0.28, 0.28], color: 0x5c5547, isExtruder: false },
      ],
    },
    map_editor_tree_willow: {
      name: 'map_editor_tree_willow', category: 'other', grid: 0.5,
      objects: [
        { name: 'trunk', shape: 'cylinder', position: [0, 1.5, 0], rotation: [Math.PI / 2, 0, 0], scale: [0.12, 0.12, 2.2], color: 0x5a4a3c, isExtruder: false },
        { name: 'hanging_a', shape: 'box', position: [-0.4, 1.4, 0.4], rotation: [Math.PI / 2, 0, 0], scale: [0.08, 0.08, 1.4], color: 0x5d7a6f, isExtruder: false },
        { name: 'hanging_b', shape: 'box', position: [0.5, 1.3, -0.2], rotation: [Math.PI / 2, 0, 0], scale: [0.08, 0.08, 1.2], color: 0x678c81, isExtruder: false },
        { name: 'willow_leaf_a', shape: 'sphere', position: [-0.2, 0.8, 0.1], rotation: [0, 0, 0], scale: [0.55, 0.55, 0.55], color: 0x2f7a42, isExtruder: false },
        { name: 'willow_leaf_b', shape: 'sphere', position: [0.2, 0.7, -0.4], rotation: [0, 0, 0], scale: [0.5, 0.5, 0.5], color: 0x3c8c4d, isExtruder: false },
      ],
    },
    map_editor_tree_autumn: {
      name: 'map_editor_tree_autumn', category: 'other', grid: 0.5,
      objects: [
        { name: 'trunk', shape: 'cylinder', position: [0, 1.7, 0], rotation: [Math.PI / 2, 0, 0], scale: [0.14, 0.14, 2.6], color: 0x7c5f3f, isExtruder: false },
        { name: 'leaf_a', shape: 'sphere', position: [0.9, 2.9, 0.4], rotation: [0, 0, 0], scale: [0.8, 0.8, 0.8], color: 0xc97b32, isExtruder: false },
        { name: 'leaf_b', shape: 'sphere', position: [-0.5, 3.2, 0.1], rotation: [0, 0, 0], scale: [0.8, 0.8, 0.8], color: 0x913c1f, isExtruder: false },
        { name: 'leaf_c', shape: 'sphere', position: [0.1, 2.8, -0.8], rotation: [0, 0, 0], scale: [0.7, 0.7, 0.7], color: 0xb75525, isExtruder: false },
      ],
    },
    map_editor_rock_big: {
      name: 'map_editor_rock_big', category: 'other', grid: 0.5,
      objects: [
        { name: 'rock_center', shape: 'sphere', position: [0, 0.9, 0.3], rotation: [0, 0, 0], scale: [1.1, 1.1, 1.1], color: 0x808080, isExtruder: false },
        { name: 'rock_base', shape: 'box', position: [0, 0.25, 0], rotation: [0, 0, 0], scale: [1.8, 0.5, 1.5], color: 0x7a7a7a, isExtruder: false },
        { name: 'rock_chip', shape: 'cone', position: [-0.4, 1.3, 0.1], rotation: [0, 0, 0], scale: [0.3, 0.5, 0.3], color: 0x6d6d6d, isExtruder: false },
      ],
    },
    map_editor_rock_small: {
      name: 'map_editor_rock_small', category: 'other', grid: 0.5,
      objects: [
        { name: 'pebble_a', shape: 'sphere', position: [0, 0.45, 0], rotation: [0, 0, 0], scale: [0.6, 0.6, 0.6], color: 0x909090, isExtruder: false },
        { name: 'pebble_b', shape: 'sphere', position: [0.7, 0.5, -0.4], rotation: [0, 0, 0], scale: [0.5, 0.5, 0.5], color: 0xa0a0a0, isExtruder: false },
        { name: 'pebble_c', shape: 'sphere', position: [-0.5, 0.42, 0.6], rotation: [0, 0, 0], scale: [0.65, 0.65, 0.65], color: 0x888888, isExtruder: false },
      ],
    },
    map_editor_grass: {
      name: 'map_editor_grass', category: 'other', grid: 0.5,
      objects: [
        { name: 'grass_bunch', shape: 'box', position: [0, 0.1, 0], rotation: [0, 0, 0], scale: [2.5, 0.15, 2.5], color: 0x4f8a3e, isExtruder: false },
        { name: 'grass_tip_a', shape: 'cone', position: [0.4, 0.5, 0.3], rotation: [Math.PI / 2, 0, 0], scale: [0.25, 0.25, 0.8], color: 0x6aa152, isExtruder: false },
        { name: 'grass_tip_b', shape: 'cone', position: [-0.4, 0.45, -0.2], rotation: [Math.PI / 2, 0, 0], scale: [0.22, 0.22, 0.7], color: 0x7ab161, isExtruder: false },
        { name: 'grass_tip_c', shape: 'cone', position: [0.1, 0.5, -0.4], rotation: [Math.PI / 2, 0, 0], scale: [0.3, 0.3, 1.0], color: 0x5f9f4c, isExtruder: false },
      ],
    },
  };
  const data = templates[template];
  if (!data) return;
  importPart(data);
  setStatus('Plantilla cargada: ' + template);
}

function loadPartFromPrompt() {
  const txt = prompt('Pega el JSON de la parte:');
  if (!txt) return;
  try { importPart(JSON.parse(txt)); } catch (e) { setStatus('JSON inválido: ' + e.message); }
}

function refreshList() {
  const ul = document.getElementById('objList');
  ul.innerHTML = '';
  const walk = (o, depth) => {
    const li = document.createElement('li');
    li.style.paddingLeft = (8 + depth * 12) + 'px';
    const label = document.createElement('span');
    label.textContent = o.name || '(obj)';
    if (o.userData?.extruder) { const t = document.createElement('span'); t.className='tag2'; t.textContent='EXTRUSOR'; label.appendChild(t); }
    li.appendChild(label);
    if (o === selected) li.classList.add('sel');
    li.onclick = () => select(o);
    ul.appendChild(li);
    if (o.isGroup) o.children.forEach(c => { if (isPartObject(c)) walk(c, depth + 1); });
  };
  partRoot.children.forEach(c => { if (isPartObject(c)) walk(c, 0); });
}

function syncPropsFromSelection() {
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
  const setC = (id, v) => { const el = document.getElementById(id); if (el) el.checked = !!v; };
  if (!selected) {
    set('pName',''); set('pPosX',''); set('pPosY',''); set('pPosZ','');
    set('pRotX',''); set('pRotY',''); set('pRotZ',''); set('pSclX',''); set('pSclY',''); set('pSclZ','');
    set('pColor','#c2b08a'); setC('pExtruder', false); set('pShape',''); return;
  }
  set('pName', selected.name || '');
  set('pPosX', +selected.position.x.toFixed(3)); set('pPosY', +selected.position.y.toFixed(3)); set('pPosZ', +selected.position.z.toFixed(3));
  set('pRotX', +THREE.MathUtils.radToDeg(selected.rotation.x).toFixed(1)); set('pRotY', +THREE.MathUtils.radToDeg(selected.rotation.y).toFixed(1)); set('pRotZ', +THREE.MathUtils.radToDeg(selected.rotation.z).toFixed(1));
  set('pSclX', +selected.scale.x.toFixed(3)); set('pSclY', +selected.scale.y.toFixed(3)); set('pSclZ', +selected.scale.z.toFixed(3));
  set('pColor', selected.userData?.baseColor || '#c2b08a');
  setC('pExtruder', !!selected.userData?.extruder);
  set('pShape', selected.isGroup ? 'group' : (selected.userData?.kind || 'mesh'));
}

function applyPropsToSelection() {
  if (!selected) return;
  const num = (id) => parseFloat(document.getElementById(id).value);
  selected.name = document.getElementById('pName').value || selected.name;
  if (isFinite(num('pPosX'))) selected.position.set(num('pPosX'), num('pPosY'), num('pPosZ'));
  if (isFinite(num('pRotX'))) selected.rotation.set(THREE.MathUtils.degToRad(num('pRotX')), THREE.MathUtils.degToRad(num('pRotY')), THREE.MathUtils.degToRad(num('pRotZ')));
  if (isFinite(num('pSclX'))) selected.scale.set(num('pSclX'), num('pSclY'), num('pSclZ'));
  const color = document.getElementById('pColor').value;
  const extruder = document.getElementById('pExtruder').checked;
  if (selected.isMesh) {
    selected.userData.baseColor = color;
    selected.userData.extruder = extruder;
    selected.material = matFor(color, extruder);
  }
  refreshList();
}

['pName','pPosX','pPosY','pPosZ','pRotX','pRotY','pRotZ','pSclX','pSclY','pSclZ','pColor','pExtruder'].forEach(id => {
  const el = document.getElementById(id);
  el.addEventListener('change', applyPropsToSelection);
  el.addEventListener('input', (e) => { if (e.target.type !== 'color' && e.target.type !== 'checkbox') applyPropsToSelection(); });
});

tControls.addEventListener('change', () => { if (selected) syncPropsFromSelection(); });

function setStatus(t) { document.getElementById('status').textContent = t; }
function setMode(mode) {
  tControls.setMode(mode);
  document.getElementById('modeTranslate').classList.toggle('active', mode === 'translate');
  document.getElementById('modeRotate').classList.toggle('active', mode === 'rotate');
  document.getElementById('modeScale').classList.toggle('active', mode === 'scale');
}

document.querySelectorAll('[data-add]').forEach(btn => btn.addEventListener('click', () => addShape(btn.dataset.add)));
document.getElementById('modeTranslate').onclick = () => setMode('translate');
document.getElementById('modeRotate').onclick = () => setMode('rotate');
document.getElementById('modeScale').onclick = () => setMode('scale');
document.getElementById('toggleSnap').onclick = () => { snapOn = !snapOn; applySnap(); setStatus(snapOn ? 'Snap activado' : 'Snap desactivado'); };
document.getElementById('duplicateObj').onclick = duplicateSelected;
document.getElementById('groupObjs').onclick = groupSelected;
document.getElementById('ungroupObjs').onclick = ungroupSelected;
document.getElementById('deleteObj').onclick = removeSelected;
document.getElementById('toggleExtruder').onclick = toggleExtruderSelected;
document.getElementById('savePart').onclick = savePart;
document.getElementById('loadPart').onclick = () => document.getElementById('loadPartFile')?.click();
document.getElementById('loadPartFile')?.addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (file) loadPartFromFile(file);
  e.target.value = '';
});
document.getElementById('pastePart').onclick = loadPartFromPrompt;
document.getElementById('newPart').onclick = () => { clearPart(); setStatus('Parte nueva.'); };
document.getElementById('exportPart').onclick = () => { exportPart(); setStatus('JSON actualizado.'); };

const tplWall = document.getElementById('tplWall');
const tplWallCorner = document.getElementById('tplWallCorner');
const tplColumn = document.getElementById('tplColumn');
const tplWallWindow = document.getElementById('tplWallWindow');
const tplWallDoor = document.getElementById('tplWallDoor');
const tplFloor = document.getElementById('tplFloor');
const tplRoof = document.getElementById('tplRoof');
const tplStairs = document.getElementById('tplStairs');
const tplRoadStoneBump = document.getElementById('tplRoadStoneBump');
const tplRoadWoodSpike = document.getElementById('tplRoadWoodSpike');
const tplMapRoad = document.getElementById('tplMapRoad');
const tplMapPath = document.getElementById('tplMapPath');
const tplMapFence = document.getElementById('tplMapFence');
const tplMapTree = document.getElementById('tplMapTree');
const tplMapRock = document.getElementById('tplMapRock');
const tplMapChest = document.getElementById('tplMapChest');
const tplMapWeaponSpawn = document.getElementById('tplMapWeaponSpawn');
const tplMapLootSpawn = document.getElementById('tplMapLootSpawn');
const tplMapSpawnZone = document.getElementById('tplMapSpawnZone');
const tplMeHouse = document.getElementById('tplMeHouse');
const tplMeCabin = document.getElementById('tplMeCabin');
const tplMeTower = document.getElementById('tplMeTower');
const tplMeContainer = document.getElementById('tplMeContainer');
const tplMeWall = document.getElementById('tplMeWall');
const tplMeWallCorner = document.getElementById('tplMeWallCorner');
const tplMeColumn = document.getElementById('tplMeColumn');
const tplMeWallDoor = document.getElementById('tplMeWallDoor');
const tplMeWallWindow = document.getElementById('tplMeWallWindow');
const tplMeFloor = document.getElementById('tplMeFloor');
const tplMeRoof = document.getElementById('tplMeRoof');
const tplMeStairs = document.getElementById('tplMeStairs');
const tplMeRoad = document.getElementById('tplMeRoad');
const tplMePath = document.getElementById('tplMePath');
const tplMeChest = document.getElementById('tplMeChest');
const tplMeWeaponSpawn = document.getElementById('tplMeWeaponSpawn');
const tplMeSpawn = document.getElementById('tplMeSpawn');
const tplMeLootSpawn = document.getElementById('tplMeLootSpawn');
const tplMeTreeRound = document.getElementById('tplMeTreeRound');
const tplMeTreePine = document.getElementById('tplMeTreePine');
const tplMeTreePalm = document.getElementById('tplMeTreePalm');
const tplMeTreeTall = document.getElementById('tplMeTreeTall');
const tplMeTreeBirch = document.getElementById('tplMeTreeBirch');
const tplMeTreeDead = document.getElementById('tplMeTreeDead');
const tplMeTreeWillow = document.getElementById('tplMeTreeWillow');
const tplMeTreeAutumn = document.getElementById('tplMeTreeAutumn');
const tplMeRockBig = document.getElementById('tplMeRockBig');
const tplMeRockSmall = document.getElementById('tplMeRockSmall');
const tplMeGrass = document.getElementById('tplMeGrass');
if (tplWall) tplWall.onclick = () => loadTemplate('wall');
if (tplWallCorner) tplWallCorner.onclick = () => loadTemplate('wall_corner');
if (tplColumn) tplColumn.onclick = () => loadTemplate('column');
if (tplWallWindow) tplWallWindow.onclick = () => loadTemplate('wall_window');
if (tplWallDoor) tplWallDoor.onclick = () => loadTemplate('wall_door');
if (tplFloor) tplFloor.onclick = () => loadTemplate('floor');
if (tplRoof) tplRoof.onclick = () => loadTemplate('roof');
if (tplStairs) tplStairs.onclick = () => loadTemplate('stairs');
if (tplRoadStoneBump) tplRoadStoneBump.onclick = () => loadTemplate('road_stone_bump');
if (tplRoadWoodSpike) tplRoadWoodSpike.onclick = () => loadTemplate('road_wood_spike');
if (tplMapRoad) tplMapRoad.onclick = () => loadTemplate('map_road');
if (tplMapPath) tplMapPath.onclick = () => loadTemplate('map_path');
if (tplMapFence) tplMapFence.onclick = () => loadTemplate('map_fence');
if (tplMapTree) tplMapTree.onclick = () => loadTemplate('map_tree');
if (tplMapRock) tplMapRock.onclick = () => loadTemplate('map_rock');
if (tplMapChest) tplMapChest.onclick = () => loadTemplate('map_chest');
if (tplMapWeaponSpawn) tplMapWeaponSpawn.onclick = () => loadTemplate('map_weapon_spawn');
if (tplMapLootSpawn) tplMapLootSpawn.onclick = () => loadTemplate('map_loot_spawn');
if (tplMapSpawnZone) tplMapSpawnZone.onclick = () => loadTemplate('map_spawn_zone');
if (tplMeHouse) tplMeHouse.onclick = () => loadTemplate('map_editor_house');
if (tplMeCabin) tplMeCabin.onclick = () => loadTemplate('map_editor_cabin');
if (tplMeTower) tplMeTower.onclick = () => loadTemplate('map_editor_tower');
if (tplMeContainer) tplMeContainer.onclick = () => loadTemplate('map_editor_container');
if (tplMeWall) tplMeWall.onclick = () => loadTemplate('wall');
if (tplMeWallCorner) tplMeWallCorner.onclick = () => loadTemplate('wall_corner');
if (tplMeColumn) tplMeColumn.onclick = () => loadTemplate('column');
if (tplMeWallDoor) tplMeWallDoor.onclick = () => loadTemplate('wall_door');
if (tplMeWallWindow) tplMeWallWindow.onclick = () => loadTemplate('wall_window');
if (tplMeFloor) tplMeFloor.onclick = () => loadTemplate('floor');
if (tplMeRoof) tplMeRoof.onclick = () => loadTemplate('roof');
if (tplMeStairs) tplMeStairs.onclick = () => loadTemplate('stairs');
if (tplMeRoad) tplMeRoad.onclick = () => loadTemplate('map_road');
if (tplMePath) tplMePath.onclick = () => loadTemplate('map_path');
if (tplMeChest) tplMeChest.onclick = () => loadTemplate('map_editor_chest');
if (tplMeWeaponSpawn) tplMeWeaponSpawn.onclick = () => loadTemplate('map_editor_spawn');
if (tplMeSpawn) tplMeSpawn.onclick = () => loadTemplate('map_editor_spawn');
if (tplMeLootSpawn) tplMeLootSpawn.onclick = () => loadTemplate('map_loot_spawn');
if (tplMeTreeRound) tplMeTreeRound.onclick = () => loadTemplate('map_editor_tree_round');
if (tplMeTreePine) tplMeTreePine.onclick = () => loadTemplate('map_editor_tree_pine');
if (tplMeTreePalm) tplMeTreePalm.onclick = () => loadTemplate('map_editor_tree_palm');
if (tplMeTreeTall) tplMeTreeTall.onclick = () => loadTemplate('map_editor_tree_tall');
if (tplMeTreeBirch) tplMeTreeBirch.onclick = () => loadTemplate('map_editor_tree_birch');
if (tplMeTreeDead) tplMeTreeDead.onclick = () => loadTemplate('map_editor_tree_dead');
if (tplMeTreeWillow) tplMeTreeWillow.onclick = () => loadTemplate('map_editor_tree_willow');
if (tplMeTreeAutumn) tplMeTreeAutumn.onclick = () => loadTemplate('map_editor_tree_autumn');
if (tplMeRockBig) tplMeRockBig.onclick = () => loadTemplate('map_editor_rock_big');
if (tplMeRockSmall) tplMeRockSmall.onclick = () => loadTemplate('map_editor_rock_small');
if (tplMeGrass) tplMeGrass.onclick = () => loadTemplate('map_editor_grass');
document.getElementById('gridSize').addEventListener('change', (e) => { gridSize = Number(e.target.value) || 2; applySnap(); });

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
renderer.domElement.addEventListener('pointerdown', (e) => {
  if (tControls.dragging) return;
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(partRoot.children, true).filter(h => isPartObject(h.object));
  if (hits.length) {
    let obj = hits[0].object;
    // seleccionar el ancestro directo bajo partRoot o el mesh
    while (obj.parent && obj.parent !== partRoot && !obj.parent.isGroup) obj = obj.parent;
    select(obj);
  } else {
    select(null);
  }
});

window.addEventListener('keydown', (e) => {
  if (e.target && ['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) return;
  if (e.key === 'w' || e.key === 'W') setMode('translate');
  if (e.key === 'e' || e.key === 'E') setMode('rotate');
  if (e.key === 'r' || e.key === 'R') setMode('scale');
  if (e.key === 'Delete' || e.key === 'Backspace') removeSelected();
  if (e.key === 'd' || e.key === 'D') { if (e.ctrlKey || e.metaKey) { e.preventDefault(); duplicateSelected(); } }
});

window.addEventListener('resize', () => {
  const w = viewport.clientWidth, h = viewport.clientHeight;
  camera.aspect = w / h; camera.updateProjectionMatrix();
  renderer.setSize(w, h);
});

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();

setStatus('Listo. Añade shapes y transfórmalos (W/E/R).');
exportPart();
