/**
 * Editor de armas — arma editable sobre el modelo base UBC (Quaternius).
 * Ajusta posición/rotación del arma y exporta a config/gun-config.json.
 * (IK eliminado: solo placement.)
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Character as CharacterWrapper, attachWeapon, UBC_ANIM_MAP } from '../src/game/character.js';
import { loadUbcKit } from '../src/game/ubc-character.js';
import { WEAPONS } from '../src/game/weapons.js';
import { loadGunConfig, getGunPlacement, setGunPlacement, getAllGunConfig } from '../src/game/gun-config.js';

const D2R = Math.PI / 180;
const fmt = (a) => a.map((v) => (Math.abs(v) < 1e-3 ? 0 : +v.toFixed(3)));

const canvas = document.querySelector('#editor-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 1, 0.05, 200);
camera.position.set(3.0, 1.9, 3.8);
camera.lookAt(0, 0.95, 0);

const hemi = new THREE.HemisphereLight(0x9fb4cc, 0x3c4044, 2.2);
const sun = new THREE.DirectionalLight(0xffe2b0, 3.0);
sun.position.set(6, 10, 4);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -8; sun.shadow.camera.right = 8;
sun.shadow.camera.top = 8; sun.shadow.camera.bottom = -8;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 40;
const rim = new THREE.DirectionalLight(0x26d3c7, 1.6);
rim.position.set(-5, 3, -4);
scene.add(hemi, sun, rim);
scene.background = new THREE.Color(0x23272f);

const ground = new THREE.Mesh(new THREE.CircleGeometry(7, 48), new THREE.MeshStandardMaterial({ color: 0x1a1e26, roughness: 0.95, metalness: 0 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
const grid = new THREE.GridHelper(14, 28, 0x2f3644, 0x232936);
grid.position.y = 0.001;
scene.add(grid);

const orbit = new OrbitControls(camera, canvas);
orbit.target.set(0, 0.95, 0);
orbit.enableDamping = true;
orbit.dampingFactor = 0.08;
orbit.minDistance = 1.2;
orbit.maxDistance = 14;
orbit.maxPolarAngle = Math.PI * 0.55;
orbit.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
orbit.enablePan = true;
orbit.update();

let character = null;
let gun = null;
let weaponType = 'ar';
let manualMode = false;
let outlineOn = false;
const clock = new THREE.Clock();

let composer = null;
let outlinePass = null;
let axisGroup = null;
const gizmoGroup = new THREE.Group();
scene.add(gizmoGroup);
let gizmoDrag = null;
const undoStack = [];
const redoStack = [];

function snapshotState() {
  return {
    position: gun.position.clone(),
    quaternion: gun.quaternion.clone(),
  };
}
function pushUndo() { if (!gun) return; undoStack.push(snapshotState()); if (undoStack.length > 50) undoStack.shift(); redoStack.length = 0; }
function applyState(st) {
  if (!st || !gun) return;
  gun.position.copy(st.position);
  gun.quaternion.copy(st.quaternion);
  syncSlidersFromGun();
  setReadouts();
}
function undo() { if (undoStack.length === 0) return; redoStack.push(snapshotState()); applyState(undoStack.pop()); }
function redo() { if (redoStack.length === 0) return; undoStack.push(snapshotState()); applyState(redoStack.pop()); }

const GAME_SKINS = [
  { id: '100avatars_001_crimsom', name: '01 Crimsom', modelPath: '/models/opennite/characters/100avatars/100Avatars_001_Crimsom.fbx', color: '#e53935' },
  { id: '100avatars_002_coolalien', name: '02 CoolAlien', modelPath: '/models/opennite/characters/100avatars/100Avatars_002_CoolAlien.fbx', color: '#43a047' },
  { id: '100avatars_003_jimmy', name: '03 Jimmy', modelPath: '/models/opennite/characters/100avatars/100Avatars_003_Jimmy.fbx', color: '#1e88e5', default: true },
  { id: '100avatars_004_oldmoustache', name: '04 OldMoustache', modelPath: '/models/opennite/characters/100avatars/100Avatars_004_OldMoustache.fbx', color: '#8d6e63' },
  { id: '100avatars_005_skull', name: '05 Skull', modelPath: '/models/opennite/characters/100avatars/100Avatars_005_Skull.fbx', color: '#eeeeee' },
  { id: '100avatars_006_cappy', name: '06 Cappy', modelPath: '/models/opennite/characters/100avatars/100Avatars_006_Cappy.fbx', color: '#fdd835' },
];
const animKeysByWeapon = {
  pistol: ['fire', 'fire2', 'reload', 'reload2', 'idleArmed', 'ads'],
  smg: ['fire', 'fire2', 'reload', 'reload2', 'idleArmed', 'ads'],
  ar: ['fire', 'fire2', 'reload', 'reload2', 'idleArmed', 'ads'],
  shotgun: ['fire', 'reload', 'idleArmed'],
  sniper: ['fire', 'reload', 'idleArmed', 'ads'],
  pickaxe: ['fire', 'idleArmed'],
};
const EXTRA_TEST_ANIMS = ['idle','walk','run','sprint','jump','fall','land','landRoll','slide','mantle','dance','swim','swimFwd','death','chestOpen','hit','pickup','interact'];

function rotVec(q, v) {
  const x = q.x, y = q.y, z = q.z, w = q.w;
  const vx = v[0], vy = v[1], vz = v[2];
  const tx = 2 * (y * vz - z * vy), ty = 2 * (z * vx - x * vz), tz = 2 * (x * vy - y * vx);
  return [vx + w * tx + (y * tz - z * ty), vy + w * ty + (z * tx - x * tz), vz + w * tz + (x * ty - y * tx)];
}
function gunWorldForward() { gun.updateWorldMatrix(true, true); return rotVec(gun.getWorldQuaternion(new THREE.Quaternion()), [0, 0, -1]); }
function gunWorldPosition() { gun.updateWorldMatrix(true, true); return gun.getWorldPosition(new THREE.Vector3()).toArray(); }
function charForward() { character.group.updateWorldMatrix(true, true); return rotVec(character.group.getWorldQuaternion(new THREE.Quaternion()), [0, 0, -1]); }
function readout(el, arr) { if (el && arr) el.textContent = arr.map((v) => +Number(v).toFixed(3)).join(', '); }

function buildComposer() {
  if (composer) return;
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  outlinePass = new OutlinePass(new THREE.Vector2(canvas.clientWidth, canvas.clientHeight), scene, camera);
  outlinePass.edgeStrength = 5; outlinePass.edgeGlow = 0; outlinePass.edgeThickness = 1.2;
  outlinePass.visibleEdgeColor.set(0x00e5ff); outlinePass.hiddenEdgeColor.set(0x004455);
  composer.addPass(outlinePass);
  composer.addPass(new OutputPass());
  applyResolution(); applyOutlineTargets();
}
function applyOutlineTargets() { if (outlinePass) outlinePass.selectedObjects = [character?.group, gun].filter(Boolean); }
function applyResolution() {
  const pr = Number(document.querySelector('#resScale')?.value ?? 1);
  const dpr = Math.min(window.devicePixelRatio || 1, 2) * pr;
  renderer.setPixelRatio(dpr); renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  if (composer) { composer.setPixelRatio(dpr); composer.setSize(canvas.clientWidth, canvas.clientHeight); }
  const lbl = document.querySelector('#resVal'); if (lbl) lbl.textContent = `${pr.toFixed(2)}x (${dpr.toFixed(2)}dpr)`;
}
function setGroundColor(hex) {
  ground.material.color.set(hex);
  const lbl = document.querySelector('#groundVal'); if (lbl) lbl.textContent = hex;
  const inp = document.querySelector('#groundColor'); if (inp) inp.value = hex;
}
function setBackground(hex) {
  scene.background = new THREE.Color(hex);
  const lbl = document.querySelector('#bgVal'); if (lbl) lbl.textContent = hex;
  const inp = document.querySelector('#bgColor'); if (inp) inp.value = hex;
}
function setOutline(on) { outlineOn = on; if (on) { buildComposer(); applyOutlineTargets(); } }

function drawGunAxes() {
  if (!gun) return;
  if (!axisGroup) { axisGroup = new THREE.Group(); scene.add(axisGroup); }
  while (axisGroup.children.length) { const c = axisGroup.children.pop(); c.geometry?.dispose?.(); c.material?.dispose?.(); }
  gun.updateWorldMatrix(true, true);
  const base = gun.getWorldPosition(new THREE.Vector3());
  const q = gun.getWorldQuaternion(new THREE.Quaternion());
  const len = 0.55;
  const dirs = [[new THREE.Vector3(1, 0, 0), 0xff4444], [new THREE.Vector3(0, 1, 0), 0x3ccb3c], [new THREE.Vector3(0, 0, -1), 0x445bff]];
  for (const [d, c] of dirs) {
    const end = base.clone().addScaledVector(d.clone().applyQuaternion(q), len);
    const geo = new THREE.BufferGeometry().setFromPoints([base, end]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: 0.95 }));
    line.frustumCulled = false;
    axisGroup.add(line);
  }
}

function drawGizmos() {
  while (gizmoGroup.children.length) { const c = gizmoGroup.children.pop(); c.geometry?.dispose?.(); c.material?.dispose?.(); }
  if (!gun) return;
  gun.updateWorldMatrix(true, true);
  const pos = gun.getWorldPosition(new THREE.Vector3());
  const q = gun.getWorldQuaternion(new THREE.Quaternion());
  const localAxes = [new THREE.Vector3(1,0,0).applyQuaternion(q), new THREE.Vector3(0,1,0).applyQuaternion(q), new THREE.Vector3(0,0,1).applyQuaternion(q)];
  const colors = [0xff4444, 0x3ccb3c, 0x445bff];
  const len = 0.17;
  for (let ai = 0; ai < 3; ai++) {
    const c = colors[ai];
    const d = localAxes[ai];
    const endp = pos.clone().addScaledVector(d, len);
    const geo = new THREE.BufferGeometry().setFromPoints([pos, endp]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: 0.9 }));
    line.frustumCulled = false;
    gizmoGroup.add(line);
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, len, 8), new THREE.MeshBasicMaterial({ visible: false }));
    const mid = pos.clone().addScaledVector(d, len / 2);
    cyl.position.copy(mid); cyl.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), d);
    cyl.userData = { axisIndex: ai };
    gizmoGroup.add(cyl);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.073, 10), new THREE.MeshBasicMaterial({ color: c }));
    cone.position.copy(endp);
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), d);
    cone.userData = { axisIndex: ai };
    gizmoGroup.add(cone);
  }
  const sph = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 12), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  sph.position.copy(pos);
  gizmoGroup.add(sph);
}
function pickGizmo(ndcX, ndcY) {
  const ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
  const meshes = gizmoGroup.children.filter(c => c.isMesh);
  const hits = ray.intersectObjects(meshes, false);
  if (hits.length === 0) return null;
  const h = hits[0].object;
  if (h.userData && h.userData.axisIndex != null) {
    gun.updateWorldMatrix(true, true);
    const q = gun.getWorldQuaternion(new THREE.Quaternion());
    const idx = h.userData.axisIndex;
    const base = [new THREE.Vector3(1,0,0), new THREE.Vector3(0,1,0), new THREE.Vector3(0,0,1)][idx];
    const axis = base.clone().applyQuaternion(q);
    return { axis };
  }
  return null;
}
canvas.addEventListener('mousedown', (e) => {
  if (e.button !== 0 || !gun) return;
  const rect = canvas.getBoundingClientRect();
  const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  const picked = pickGizmo(ndcX, ndcY);
  if (!picked) return;
  const pos = gun.getWorldPosition(new THREE.Vector3());
  const viewDir = camera.position.clone().sub(pos).normalize();
  const plane0 = new THREE.Plane().setFromNormalAndCoplanarPoint(viewDir, pos);
  const ray0 = new THREE.Raycaster();
  ray0.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
  const initInter = new THREE.Vector3();
  if (!ray0.ray.intersectPlane(plane0, initInter)) initInter.copy(pos);
  pushUndo();
  gizmoDrag = { axis: picked.axis.clone(), startPos: pos.clone(), initInter: initInter.clone() };
  orbit.enabled = false;
  e.preventDefault(); e.stopPropagation();
}, true);
canvas.addEventListener('mousemove', (e) => {
  if (!gizmoDrag || !gun) return;
  const rect = canvas.getBoundingClientRect();
  const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  const ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
  const { axis, startPos, initInter } = gizmoDrag;
  const viewDir = camera.position.clone().sub(startPos).normalize();
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(viewDir, startPos);
  const inter = new THREE.Vector3();
  if (ray.ray.intersectPlane(plane, inter)) {
    const delta = inter.sub(initInter).dot(axis);
    const newPos = startPos.clone().addScaledVector(axis, delta);
    gun.updateWorldMatrix(true, true);
    const parent = gun.parent;
    if (parent) {
      parent.updateWorldMatrix(true, true);
      gun.position.copy(parent.worldToLocal(newPos));
    } else {
      gun.position.copy(newPos);
    }
    syncSlidersFromGun();
    setReadouts();
  }
});
window.addEventListener('mouseup', () => { gizmoDrag = null; });

function setReadouts() {
  if (!gun) return;
  const gd = gun.userData || {};
  readout(document.querySelector('#pvX'), [gun.position.x]);
  readout(document.querySelector('#pvY'), [gun.position.y]);
  readout(document.querySelector('#pvZ'), [gun.position.z]);
  const r = new THREE.Euler().setFromQuaternion(gun.quaternion).toArray();
  readout(document.querySelector('#rvX'), [r[0] * (180 / Math.PI)]);
  readout(document.querySelector('#rvY'), [r[1] * (180 / Math.PI)]);
  readout(document.querySelector('#rvZ'), [r[2] * (180 / Math.PI)]);
  const ha = character?.handAlign;
  if (ha) readout(document.querySelector('#handAlign'), [ha.w ?? 1, ha.x ?? 0, ha.y ?? 0, ha.z ?? 0]);
  if (gd.muzzle) readout(document.querySelector('#muzzleLocal'), fmt(gd.muzzle.toArray()));
  if (gd.grip) readout(document.querySelector('#gripLocal'), fmt(gd.grip.toArray()));
  if (gd.length != null) readout(document.querySelector('#lengthVal'), [gd.length]);
  const fwd = gunWorldForward();
  readout(document.querySelector('#gunFwd'), fmt(fwd));
  readout(document.querySelector('#gunPosWorld'), fmt(gunWorldPosition()));
  readout(document.querySelector('#gunFwdAng'), [Math.max(0, -fwd[1])]);
}

function buildAnimOptions() {
  const sel = document.querySelector('#animSel');
  if (!sel) return;
  const keys = [...(animKeysByWeapon[weaponType] || []), ...EXTRA_TEST_ANIMS.filter(k => !(animKeysByWeapon[weaponType]||[]).includes(k))];
  sel.innerHTML = keys
    .map((k) => `<option value="${k}"${k === 'idleArmed' ? ' selected' : ''}>${UBC_ANIM_MAP[k] || k} - ${k}</option>`)
    .join('');
  sel.onchange = () => { character?.play(sel.value); };
}

function buildWeaponOptions() {
  const sel = document.querySelector('#weaponType');
  if (!sel) return;
  sel.innerHTML = Object.keys(WEAPONS)
    .map((id) => `<option value="${id}"${id === weaponType ? ' selected' : ''}>${WEAPONS[id].name}</option>`)
    .join('');
  sel.onchange = () => {
    // Guardar en memoria los ajustes de la arma actual antes de cambiar.
    try {
      const gq = gun.quaternion;
      const placement = { position: gun.position.toArray(), quaternion: [gq.x, gq.y, gq.z, gq.w] };
      setGunPlacement(placement, weaponType);
      if (weaponType === 'ar' || weaponType === 'pistol') setGunPlacement(placement, 'default');
    } catch {}
    weaponType = sel.value;
    attachWeapon(character, weaponType).then(() => {
      gun = character.weaponMount.children[0];
      syncSlidersFromGun(); setReadouts(); buildAnimOptions();
      if (outlineOn) applyOutlineTargets();
    });
  };
}

function applySliders() {
  if (!character?.manualGunAlign || !gun) return;
  gun.position.set(Number(document.querySelector('#posX').value), Number(document.querySelector('#posY').value), Number(document.querySelector('#posZ').value));
  gun.quaternion.setFromEuler(new THREE.Euler(Number(document.querySelector('#rotX').value) * D2R, Number(document.querySelector('#rotY').value) * D2R, Number(document.querySelector('#rotZ').value) * D2R, 'XYZ'));
}
function syncSlidersFromGun() {
  if (!gun) return;
  const set = (id, v) => { const el = document.querySelector('#' + id); if (el) el.value = Number(v).toFixed(2); };
  const r = new THREE.Euler().setFromQuaternion(gun.quaternion);
  set('posX', gun.position.x); set('posY', gun.position.y); set('posZ', gun.position.z);
  set('rotX', (r.x * 180) / Math.PI); set('rotY', (r.y * 180) / Math.PI); set('rotZ', (r.z * 180) / Math.PI);
}
function setManual(on) {
  manualMode = !!on;
  const label = document.querySelector('#manualLabel');
  if (label) label.textContent = manualMode ? 'Movimiento manual (ON)' : 'Movimiento manual (OFF)';
  const dot = document.querySelector('#manualDot');
  if (dot) dot.classList.toggle('on', manualMode);
  if (character) character.manualGunAlign = manualMode;
  if (manualMode) { syncSlidersFromGun(); applySliders(); }
  else if (gun) {
    const cfg = getGunPlacement(weaponType);
    gun.position.set(cfg.position[0], cfg.position[1], cfg.position[2]);
    gun.quaternion.set(cfg.quaternion[0], cfg.quaternion[1], cfg.quaternion[2], cfg.quaternion[3]);
  }
  setReadouts();
}
function onSlider() { if (manualMode) applySliders(); setReadouts(); }
function onApply() { if (!manualMode) setManual(true); else applySliders(); setReadouts(); }

function onReset() {
  attachWeapon(character, weaponType).then(() => {
    gun = character.weaponMount.children[0];
    setManual(false);
    buildAnimOptions();
    syncSlidersFromGun();
    const sel = document.querySelector('#animSel');
    if (sel) { sel.value = 'idleArmed'; sel.dispatchEvent(new Event('change', { bubbles: true })); }
    if (outlineOn) applyOutlineTargets();
  });
}

function placementFromGun() {
  const gq = gun.quaternion;
  return { position: gun.position.toArray(), quaternion: [gq.x, gq.y, gq.z, gq.w] };
}

function generateExport() {
  const gd = gun.userData || {};
  const ha = character?.handAlign || new THREE.Quaternion();
  const fwd = gunWorldForward();
  const lines = [];
  lines.push('=== OpenNite — Editor de armas (UBC/Unreal) — configuración exportada ===');
  lines.push(`Fecha: ${new Date().toLocaleString()}`);
  lines.push(`Tipo de arma: ${WEAPONS[weaponType]?.name || weaponType} (${weaponType})`);
  lines.push('');
  lines.push('Datos de posición:');
  lines.push(`  Posición local del arma (gun.position):    ${fmt(gun.position.toArray()).join(' ')}`);
  const gq = gun.quaternion;
  lines.push(`  Rotación local del arma (gun.quaternion):  ${fmt([gq.x, gq.y, gq.z, gq.w]).join(' ')}`);
  lines.push(`  handAlign (w, x, y, z):                    ${fmt([ha.w, ha.x, ha.y, ha.z]).join(' ')}`);
  if (gd.muzzle) lines.push(`  Muzzle (local):                            ${fmt(gd.muzzle.toArray()).join(' ')}`);
  if (gd.grip) lines.push(`  Grip (local):                              ${fmt(gd.grip.toArray()).join(' ')}`);
  if (gd.length != null) lines.push(`  Length:                                    ${fmt([gd.length])[0]}`);
  lines.push('');
  lines.push(`Alineación del arma (gunWorldForward): ${fmt(fwd).join(' ')}`);
  lines.push(`Frente del personaje (charForward): ${fmt(charForward()).join(' ')}`);
  lines.push('');
  lines.push('Clips (motor → UAL) para el tipo de arma:');
  for (const k of (animKeysByWeapon[weaponType] || [])) lines.push(`  ${k} → ${UBC_ANIM_MAP[k] || '(sin clip)'}`);
  return lines.join('\n');
}

function onExport() {
  const text = generateExport();
  const ta = document.querySelector('#configText');
  if (ta) ta.value = text;
  try {
    const placement = placementFromGun();
    setGunPlacement(placement, weaponType);
    if (weaponType === 'ar' || weaponType === 'pistol') setGunPlacement(placement, 'default');
    const all = getAllGunConfig();
    window.opennite?.app?.writeFile?.('config/gun-config.json', JSON.stringify(all, null, 2));
    window.opennite?.app?.writeFile?.('config/gun-config.txt', text);
  } catch { /* ignore */ }
}

function showInspector(name) {
  for (const sec of document.querySelectorAll('.section')) {
    sec.classList.toggle('active', sec.dataset.for === name);
  }
  const hint = document.querySelector('#activeHint');
  const labels = { weaponPos: 'Arma (mano derecha)', scene: 'Escena / visual' };
  if (hint) hint.textContent = 'Activo: ' + (labels[name] || name);
  document.querySelector('#selWeapon')?.classList.toggle('activeSel', name === 'weaponPos');
  document.querySelector('#selScene')?.classList.toggle('activeSel', name === 'scene');
}
function bindVisualControls() {
  const res = document.querySelector('#resScale');
  res?.addEventListener('input', applyResolution);
  const quality = document.querySelector('#quality');
  quality?.addEventListener('change', () => { if (res) { res.value = quality.value; applyResolution(); } });
  const bg = document.querySelector('#bgColor');
  bg?.addEventListener('input', () => setBackground(bg.value));
  const gc = document.querySelector('#groundColor');
  gc?.addEventListener('input', () => setGroundColor(gc.value));
  for (const btn of document.querySelectorAll('[data-bg]')) btn.addEventListener('click', () => setBackground(btn.getAttribute('data-bg')));
  const outlineDot = document.querySelector('#outlineDot');
  outlineDot?.addEventListener('click', () => { const on = !outlineOn; outlineDot.classList.toggle('on', on); setOutline(on); });
  const manualDot = document.querySelector('#manualDot');
  manualDot?.addEventListener('click', () => setManual(!manualMode));
}

function populateSkinSelect() {
  const sel = document.querySelector('#skinSel');
  if (!sel) return;
  sel.innerHTML = GAME_SKINS.map(s => `<option value="${s.id}" ${s.default ? 'selected' : ''}>${s.name}</option>`).join('');
}
async function loadCharacterSkin(skinId) {
  const skin = GAME_SKINS.find(s => s.id === skinId) || GAME_SKINS.find(s => s.default) || GAME_SKINS[0];
  if (!skin) return;
  if (character?.kitChar?.dispose) { try { character.kitChar.dispose(); } catch {} }
  else if (character?.group) { try { character.group.removeFromParent(); } catch {} }
  character = await CharacterWrapper.create(window.__openniteGunKit, { color: skin.color || 0xffb45c, modelPath: skin.modelPath });
  character.group.position.set(0, 0, 0);
  character.group.rotation.y = 0.6;
  character.manualGunAlign = manualMode;
  character.play('idleArmed');
  scene.add(character.group);
  await attachWeapon(character, weaponType);
  gun = character.weaponMount.children[0];
  syncSlidersFromGun(); setReadouts(); buildAnimOptions();
  const animSel0 = document.querySelector('#animSel');
  if (animSel0) animSel0.value = 'idleArmed';
  if (outlineOn) applyOutlineTargets();
  console.log('[gun-editor] Skin cargada:', skin.name);
}

async function main() {
  try {
    const ubcKit = await loadUbcKit('/models/opennite/ubc/');
    const kit = { type: 'ubc', ubc: ubcKit };
    window.__openniteGunKit = kit;
    await loadGunConfig();
    weaponType = 'ar';
    populateSkinSelect();
    const defSkin = GAME_SKINS.find(s => s.default) || GAME_SKINS[0];
    await loadCharacterSkin(defSkin?.id);
    buildWeaponOptions();
    const skinSel = document.querySelector('#skinSel');
    if (skinSel) skinSel.onchange = () => loadCharacterSkin(skinSel.value);
    bindVisualControls();
    document.querySelector('#apply').onclick = onApply;
    document.querySelector('#reset').onclick = onReset;
    document.querySelector('#selWeapon').onclick = () => showInspector('weaponPos');
    document.querySelector('#selScene').onclick = () => showInspector('scene');
    document.querySelector('#undo').onclick = undo;
    document.querySelector('#redo').onclick = redo;
    document.querySelector('#export').onclick = onExport;
    document.querySelector('#copy').onclick = onExport;
    for (const id of ['posX', 'posY', 'posZ', 'rotX', 'rotY', 'rotZ']) {
      const el = document.querySelector('#' + id); if (el) el.oninput = onSlider;
    }
    applyResolution();
    syncSlidersFromGun();
    setReadouts();

    window.openniteEditorDebug = () => ({
      editor: true, characterUbc: !!character?.isUbc, characterInScene: !!character?.group?.parent,
      gunAttached: !!gun, weaponType, manualMode, outlineOn,
      gunFwd: gun ? gunWorldForward() : null, gunPos: gun ? gunWorldPosition() : null, charFwd: charForward(),
      playing: character?.current,
    });
    window.openniteEditorShot = () => { if (outlineOn && composer) composer.render(); else renderer.render(scene, camera); return canvas.toDataURL('image/png'); };
  } catch (error) {
    console.error('Editor de armas: error de carga', error);
    const overlay = document.querySelector('#error-overlay');
    if (overlay) { overlay.style.display = 'block'; overlay.textContent = `Error cargando el editor: ${error?.message || error}\n\nComprueba que /tools/ y /node_modules/ se sirven.`; }
    if (canvas) canvas.style.display = 'none';
  }
}

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(0.05, clock.getDelta());
  orbit.enabled = !gizmoDrag;
  orbit.update();
  if (character && gun) {
    character.update(dt);
    if (manualMode) applySliders();
    setReadouts();
  }
  drawGunAxes();
  drawGizmos();
  if (outlineOn && composer) composer.render(); else renderer.render(scene, camera);
}

window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
});
document.addEventListener('mousedown', (e) => {
  const t = e.target;
  if (t && t.tagName === 'INPUT' && t.type === 'range') pushUndo();
});
window.addEventListener('resize', () => {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;
  camera.aspect = w / h; camera.updateProjectionMatrix(); applyResolution();
});

main().then(() => tick());
