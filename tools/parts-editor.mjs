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
  // Intentar guardar vía IPC de Electron (app:writeFile) si está disponible
  const safe = (data.name || 'part').replace(/[^a-zA-Z0-9_-]/g, '_');
  const rel = `config/parts/${safe}.json`;
  try {
    if (window.app && typeof window.app.writeFile === 'function') {
      await window.app.writeFile(rel, json);
      setStatus(`Guardado en ${rel}`);
      return;
    }
  } catch (e) { /* fallback */ }
  // Fallback: descarga
  const blob = new Blob([json], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${safe}.json`; a.click();
  URL.revokeObjectURL(a.href);
  setStatus('JSON descargado (sin IPC).');
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
document.getElementById('loadPart').onclick = loadPartFromPrompt;
document.getElementById('newPart').onclick = () => { clearPart(); setStatus('Parte nueva.'); };
document.getElementById('exportPart').onclick = () => { exportPart(); setStatus('JSON actualizado.'); };
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
