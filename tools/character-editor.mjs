import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const $ = (id) => document.getElementById(id);
const statusEl = $('status');
const leftStatus = $('leftStatus');
const setStatus = (msg) => { statusEl.textContent = msg; leftStatus.textContent = msg; };

const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0f18);
const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 500);
camera.position.set(2.2, 1.8, 3.2);
const orbit = new OrbitControls(camera, canvas);
orbit.target.set(0, 1, 0);
orbit.enableDamping = true;
orbit.dampingFactor = 0.08;

scene.add(new THREE.HemisphereLight(0xcfe4ff, 0x223040, 0.95));
const dir = new THREE.DirectionalLight(0xffffff, 1.2);
dir.position.set(3, 5, 4);
dir.castShadow = true;
scene.add(dir);
const grid = new THREE.GridHelper(10, 20, 0x334155, 0x1f2937);
scene.add(grid);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 1 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const gizmo = new TransformControls(camera, canvas);
gizmo.addEventListener('dragging-changed', (e) => { orbit.enabled = !e.value; if (!e.value) syncTransformInputs(); });
gizmo.addEventListener('objectChange', () => { syncTransformInputs(); markDirtyPose(); });
scene.add(gizmo.getHelper());

const gltfLoader = new GLTFLoader();
const fbxLoader = new FBXLoader();

let modelRoot = null;
let skeleton = null;
let bones = [];
let selectedBone = null;
let mixer = null;
let clips = []; // {name, clip, duration}
let currentClip = null; // clip object
let playing = false;
let clock = new THREE.Clock();
let currentTime = 0;
let duration = 2;
let dirty = false;
let selectedKey = null; // {trackName, index}
let animActions = {}; // action -> clipName
let animSpeeds = {}; // action/clip -> speed multiplier
let selectedAction = '';

const ACTIONS = [
  ['idle','Idle'],['idleArmed','Idle armado'],['walk','Caminar'],['walkArmed','Caminar armado'],
  ['run','Correr'],['sprint','Sprint'],['jump','Saltar'],['jumpStart','Inicio salto'],
  ['fall','Caer'],['mantle','Trepar'],['land','Aterrizar'],['landRoll','Rodar aterrizaje'],
  ['slide','Deslizarse'],['vault','Saltar ventana/vault'],['swim','Nadar'],['swimFwd','Nadar adelante'],
  ['dive','Salto delfín/buceo'],['death','Muerte'],['death2','Muerte 2'],['dance','Baile'],
  ['punch','Puñetazo'],['wave','Saludo'],['sit','Sentarse'],['stand','Levantarse'],
  ['yes','Sí'],['no','No'],['hit','Golpe'],['hit2','Golpe 2'],['pickup','Recoger'],
  ['interact','Interactuar'],['chestOpen','Abrir cofre'],['fire','Disparar'],['fire2','Disparar 2'],
  ['crouch','Agachado'],['crouchWalk','Caminar agachado'],['aim','Apuntar'],['aim2','Apuntar 2'],
  ['reload','Recargar'],['reload2','Recargar 2'],['strafeL','Strafe izq'],['strafeR','Strafe der'],
  ['back','Caminar atrás'],['dodge','Esquivar']
];

// --- utils ---
let lastW = 0, lastH = 0;
function resize(force = false) {
  const wrap = $('viewport');
  const w = wrap.clientWidth, h = wrap.clientHeight;
  if (!force && w === lastW && h === lastH) return;
  lastW = w; lastH = h;
  renderer.setSize(w, h, false);
  camera.aspect = w / h || 1;
  camera.updateProjectionMatrix();
  drawTimeline();
}
window.addEventListener('resize', () => resize(true));

let _toonGradient = null;
function getToonGradient() {
  if (_toonGradient) return _toonGradient;
  const colors = new Uint8Array([90, 170, 255]);
  _toonGradient = new THREE.DataTexture(colors, colors.length, 1, THREE.RedFormat);
  _toonGradient.minFilter = THREE.NearestFilter;
  _toonGradient.magFilter = THREE.NearestFilter;
  _toonGradient.generateMipmaps = false;
  _toonGradient.needsUpdate = true;
  return _toonGradient;
}
function toToonMaterial(mat) {
  if (Array.isArray(mat)) return mat.map(toToonMaterial);
  if (!mat) return mat;
  const isEye = /eye/i.test(mat.name || '');
  const baseColor = mat.color ? mat.color.clone() : new THREE.Color(0xffffff);
  if (!isEye) { const hsl = { h: 0, s: 0, l: 0 }; baseColor.getHSL(hsl); baseColor.setHSL(hsl.h, Math.min(1, hsl.s * 1.35 + 0.1), hsl.l); }
  const m = new THREE.MeshToonMaterial({
    color: baseColor,
    map: mat.map || null, normalMap: mat.normalMap || null, alphaMap: mat.alphaMap || null,
    transparent: !!mat.transparent, opacity: mat.opacity ?? 1, side: mat.side ?? THREE.FrontSide,
    gradientMap: isEye ? null : getToonGradient(),
  });
  if (isEye) m.color.set(0xffffff);
  m.name = mat.name || '';
  m.flatShading = false;
  m.needsUpdate = true;
  return m;
}

function clearModel() {
  if (modelRoot) { scene.remove(modelRoot); modelRoot.traverse(o => { o.geometry?.dispose?.(); if (o.material) [].concat(o.material).forEach(m => m.dispose?.()); }); }
  modelRoot = null; skeleton = null; bones = []; selectedBone = null; mixer = null; clips = []; currentClip = null; playing = false; currentTime = 0; selectedKey = null;
  gizmo.detach();
  $('boneList').innerHTML = '';
  $('animSelect').innerHTML = '<option value="">(ninguna)</option>';
  syncTransformInputs();
  drawTimeline();
}

function robustBounds(obj) {
  const box = new THREE.Box3();
  const meshes = [];
  obj.traverse((o) => { if (o.isMesh) meshes.push(o); });
  for (const mesh of meshes) {
    if (!mesh.geometry) continue;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const bb = mesh.geometry.boundingBox;
    if (!bb) continue;
    // Use 8 corners transformed by matrixWorld for a stable world AABB
    const corners = [
      [bb.min.x,bb.min.y,bb.min.z],[bb.min.x,bb.min.y,bb.max.z],[bb.min.x,bb.max.y,bb.min.z],[bb.min.x,bb.max.y,bb.max.z],
      [bb.max.x,bb.min.y,bb.min.z],[bb.max.x,bb.min.y,bb.max.z],[bb.max.x,bb.max.y,bb.min.z],[bb.max.x,bb.max.y,bb.max.z],
    ];
    for (const c of corners) box.expandByPoint(new THREE.Vector3(c[0],c[1],c[2]).applyMatrix4(mesh.matrixWorld));
  }
  if (box.isEmpty()) {
    obj.traverse((o) => { if (o.isBone) box.expandByPoint(o.getWorldPosition(new THREE.Vector3())); });
  }
  if (box.isEmpty()) box.setFromObject(obj);
  return box;
}

function fitCamera(obj) {
  const box = robustBounds(obj);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const h = Math.max(size.y, 0.5);
  orbit.target.set(center.x, center.y, center.z);
  camera.position.set(center.x + h * 1.2, center.y + h * 0.6, center.z + h * 2.0);
  camera.near = 0.01; camera.far = Math.max(500, h * 100);
  camera.updateProjectionMatrix();
  orbit.update();
}

function loadAny(url, name = '') {
  const fromUrl = (url || '').split('?')[0].split('.').pop().toLowerCase();
  const fromName = (name || '').split('?')[0].split('.').pop().toLowerCase();
  const ext = ['fbx','glb','gltf'].includes(fromUrl) ? fromUrl : (['fbx','glb','gltf'].includes(fromName) ? fromName : fromUrl);
  if (ext === 'fbx') return new Promise((res, rej) => fbxLoader.load(url, res, undefined, rej));
  return new Promise((res, rej) => gltfLoader.load(url, g => {
    const root = g.scene || g;
    if (g.animations?.length) root.animations = g.animations;
    res(root);
  }, undefined, rej));
}

function collectBones(root) {
  const found = [];
  root.traverse(o => { if (o.isBone) found.push(o); });
  // stable unique
  const seen = new Set();
  bones = found.filter(b => { if (seen.has(b.uuid)) return false; seen.add(b.uuid); return true; });
  const skinned = []; root.traverse(o => { if (o.isSkinnedMesh && o.skeleton) skinned.push(o.skeleton); });
  skeleton = skinned[0] || null;
}

function populateBoneList(filter = '') {
  const ul = $('boneList');
  ul.innerHTML = '';
  const f = filter.toLowerCase();
  for (const b of bones) {
    if (f && !b.name.toLowerCase().includes(f)) continue;
    const li = document.createElement('li');
    li.textContent = b.name || '(bone)';
    li.dataset.uuid = b.uuid;
    if (selectedBone && selectedBone.uuid === b.uuid) li.classList.add('sel');
    li.onclick = () => selectBone(b);
    ul.appendChild(li);
  }
}

function selectBone(bone) {
  selectedBone = bone;
  populateBoneList($('boneFilter').value);
  if (bone) {
    gizmo.attach(bone);
    $('selInfo').textContent = bone.name;
  } else {
    gizmo.detach();
    $('selInfo').textContent = 'Sin selección';
  }
  syncTransformInputs();
  drawTimeline();
}

function syncTransformInputs() {
  const b = selectedBone;
  if (!b) { ['pX','pY','pZ','rX','rY','rZ','sX','sY','sZ'].forEach(id => $(id).value = ''); return; }
  $('pX').value = b.position.x.toFixed(3); $('pY').value = b.position.y.toFixed(3); $('pZ').value = b.position.z.toFixed(3);
  $('rX').value = THREE.MathUtils.radToDeg(b.rotation.x).toFixed(2);
  $('rY').value = THREE.MathUtils.radToDeg(b.rotation.y).toFixed(2);
  $('rZ').value = THREE.MathUtils.radToDeg(b.rotation.z).toFixed(2);
  $('sX').value = b.scale.x.toFixed(3); $('sY').value = b.scale.y.toFixed(3); $('sZ').value = b.scale.z.toFixed(3);
}

function applyTransformFromInputs() {
  if (!selectedBone) return;
  const b = selectedBone;
  b.position.set(+$('pX').value||0, +$('pY').value||0, +$('pZ').value||0);
  b.rotation.set(THREE.MathUtils.degToRad(+$('rX').value||0), THREE.MathUtils.degToRad(+$('rY').value||0), THREE.MathUtils.degToRad(+$('rZ').value||0));
  b.scale.set(+$('sX').value||1, +$('sY').value||1, +$('sZ').value||1);
  markDirtyPose();
}

['pX','pY','pZ','rX','rY','rZ','sX','sY','sZ'].forEach(id => $(id).addEventListener('change', applyTransformFromInputs));

function markDirtyPose() { dirty = true; }

const GAME_EXTRA_ANIMS = [
  { file: 'extra-anim/Falling.fbx', name: 'Extra_Falling' },
  { file: 'extra-anim/FallingToRoll.fbx', name: 'Extra_FallingToRoll' },
  { file: 'extra-anim/slide.fbx', name: 'Extra_Slide' },
  { file: 'extra-anim/JumpWindow.fbx', name: 'Extra_JumpWindow' },
  { file: 'extra-anim/ClimbWall.fbx', name: 'Extra_ClimbWall' },
];

const NEW_MIXAMO_GAME_ANIMS = [
  { file: '/models/opennite/characters/100avatars/anims/Jimmy.fbx', names: ['Idle_Loop'] },
  { file: '/models/opennite/characters/100avatars/anims/Idle Happy.fbx', names: ['Idle_Happy'] },
  { file: '/models/opennite/characters/100avatars/anims/Idle Sad.fbx', names: ['Idle_Sad'] },
  { file: '/models/opennite/characters/100avatars/anims/Walking.fbx', names: ['Walk_Loop'] },
  { file: '/models/opennite/characters/100avatars/anims/Running.fbx', names: ['Jog_Fwd_Loop'] },
  { file: '/models/opennite/characters/100avatars/anims/Pistol Run.fbx', names: ['Sprint_Loop'] },
  { file: '/models/opennite/characters/100avatars/anims/Crouched Walking.fbx', names: ['Crouch_Fwd_Loop'] },
  { file: '/models/opennite/characters/100avatars/anims/Jump Forward Aiming.fbx', names: ['Jump_Loop','Jump_Start'] },
  { file: '/models/opennite/characters/100avatars/anims/ClimbWall.fbx', names: ['Extra_ClimbWall'] },
  { file: '/models/opennite/characters/100avatars/anims/Slide pose.fbx', names: ['Extra_Slide'] },
  { file: '/models/opennite/characters/100avatars/anims/Swimming.fbx', names: ['Swim_Fwd_Loop'] },
  { file: '/models/opennite/characters/100avatars/anims/Idle In Water.fbx', names: ['Swim_Idle_Loop'] },
  { file: '/models/opennite/characters/100avatars/anims/Run To Swimming.fbx', names: ['Run_To_Swim'] },
  { file: '/models/opennite/characters/100avatars/anims/Riffle Gunplay.fbx', names: ['Pistol_Shoot'] },
  { file: '/models/opennite/characters/100avatars/anims/Gunplay Shotgun.fbx', names: ['Shotgun_Shoot'] },
  { file: '/models/opennite/characters/100avatars/anims/Run Forward Aiming.fbx', names: ['Jog_Aim_Fwd_Loop'] },
  { file: '/models/opennite/characters/100avatars/anims/Walk Forward aiming.fbx', names: ['Walk_Aim_Fwd_Loop'] },
  { file: '/models/opennite/characters/100avatars/anims/Walking Backwards.fbx', names: ['Walk_Bwd_Loop'] },
  { file: '/models/opennite/characters/100avatars/anims/Walking Backwards Aiming.fbx', names: ['Walk_Aim_Bwd_Loop'] },
  { file: '/models/opennite/characters/100avatars/anims/Running Backward.fbx', names: ['Jog_Bwd_Loop'] },
  { file: '/models/opennite/characters/100avatars/anims/Pistol Run Backward.fbx', names: ['Sprint_Bwd_Loop'] },
  { file: '/models/opennite/characters/100avatars/anims/Run Backward Aiming.fbx', names: ['Jog_Aim_Bwd_Loop'] },
  { file: '/models/opennite/characters/100avatars/anims/Running Left Turn.fbx', names: ['Run_Turn_L'] },
  { file: '/models/opennite/characters/100avatars/anims/Running Right Turn.fbx', names: ['Run_Turn_R'] },
  { file: '/models/opennite/characters/100avatars/anims/Running Turn 180.fbx', names: ['Run_Turn_180'] },
];

// Animaciones canónicas del juego (las que Jimmy/100Avatars comparten).
// Fuente: UBC_ANIM_MAP en src/game/character.js + extras. 100Avatars no incluye animaciones propias.
const GAME_ANIM_WHITELIST = new Set([
  'Idle_Loop','Walk_Loop','Jog_Fwd_Loop','Sprint_Loop','Jump_Start','Jump_Loop','Jump_Land',
  'Pistol_Jump_Start','Pistol_Jump_Loop','Pistol_Jump_Land','Swim_Idle_Loop','Swim_Fwd_Loop',
  'Death01','Death02','Dance_Loop','Punch_Jab','Idle_Talking_Loop','Sitting_Idle_Loop','Sitting_Exit',
  'Hit_Chest','Hit_Head','PickUp_Table','Interact','Fixing_Kneeling',
  'Pistol_Shoot','Crouch_Fwd_Loop','Crouch_Idle_Loop','Pistol_Aim_Neutral','Pistol_Reload','Roll',
  'Extra_Falling','Extra_FallingToRoll','Extra_Slide','Extra_JumpWindow','Extra_ClimbWall',
]);
const isGameAnim = (name) => GAME_ANIM_WHITELIST.has(name) || /^Extra_/.test(name);
const MIXAMO_TO_UBC = {
  Hips:'pelvis', Spine:'spine_01', Spine1:'spine_02', Spine2:'spine_03',
  Neck:'neck_01', Head:'Head',
  LeftShoulder:'clavicle_l', RightShoulder:'clavicle_r',
  LeftArm:'upperarm_l', RightArm:'upperarm_r',
  LeftForeArm:'lowerarm_l', RightForeArm:'lowerarm_r',
  LeftHand:'hand_l', RightHand:'hand_r',
  LeftUpLeg:'thigh_l', RightUpLeg:'thigh_r',
  LeftLeg:'calf_l', RightLeg:'calf_r',
  LeftFoot:'foot_l', RightFoot:'foot_r',
  LeftToeBase:'ball_l', RightToeBase:'ball_r',
  LeftToe_End:'ball_leaf_l', RightToe_End:'ball_leaf_r',
  LeftHandThumb1:'thumb_01_l', LeftHandThumb2:'thumb_02_l', LeftHandThumb3:'thumb_03_l',
  LeftHandIndex1:'index_01_l', LeftHandIndex2:'index_02_l', LeftHandIndex3:'index_03_l',
  LeftHandMiddle1:'middle_01_l', LeftHandMiddle2:'middle_02_l', LeftHandMiddle3:'middle_03_l',
  LeftHandRing1:'ring_01_l', LeftHandRing2:'ring_02_l', LeftHandRing3:'ring_03_l',
  LeftHandPinky1:'pinky_01_l', LeftHandPinky2:'pinky_02_l', LeftHandPinky3:'pinky_03_l',
  RightHandThumb1:'thumb_01_r', RightHandThumb2:'thumb_02_r', RightHandThumb3:'thumb_03_r',
  RightHandIndex1:'index_01_r', RightHandIndex2:'index_02_r', RightHandIndex3:'index_03_r',
  RightHandMiddle1:'middle_01_r', RightHandMiddle2:'middle_02_r', RightHandMiddle3:'middle_03_r',
  RightHandRing1:'ring_01_r', RightHandRing2:'ring_02_r', RightHandRing3:'ring_03_r',
  RightHandPinky1:'pinky_01_r', RightHandPinky2:'pinky_02_r', RightHandPinky3:'pinky_03_r',
};
const UBC_TO_MIXAMO = Object.fromEntries(Object.entries(MIXAMO_TO_UBC).map(([m,u]) => [u,m]));
const normalizeMixamoName = (n) => String(n || '').replace(/^mixamorig\d*:?/i, '');
function buildSourceNameMap(fbx) {
  const byNorm = new Map();
  fbx.traverse((obj) => { if (obj.isBone) byNorm.set(normalizeMixamoName(obj.name), obj.name); });
  const map = {};
  for (const [mixamo, ubcName] of Object.entries(MIXAMO_TO_UBC)) {
    const src = byNorm.get(mixamo);
    if (src) map[ubcName] = src;
  }
  return map;
}

async function loadGameExtraAnims(targetRoot, base = '/models/opennite/ubc/') {
  const targetSkin = targetRoot?.getObjectByProperty('isSkinnedMesh', true);
  if (!targetSkin?.skeleton) return 0;
  let loaded = 0;
  await Promise.all(GAME_EXTRA_ANIMS.map(async ({ file, name }) => {
    try {
      const fbx = await loadAny(base + file, file);
      const srcClip = fbx.animations?.[0];
      if (!srcClip) return;
      const names = buildSourceNameMap(fbx);
      let sourceSkin = fbx.getObjectByProperty('isSkinnedMesh', true);
      if (!sourceSkin?.skeleton) {
        const bones = [];
        fbx.traverse((o) => { if (o.isBone) bones.push(o); });
        if (bones.length) { sourceSkin = fbx; sourceSkin.skeleton = new THREE.Skeleton(bones); }
      }
      if (!sourceSkin?.skeleton) return;
      const saved = targetSkin.skeleton.bones.map((b) => ({ p: b.position.clone(), q: b.quaternion.clone(), s: b.scale.clone() }));
      const retargeted = SkeletonUtils.retargetClip(targetSkin, sourceSkin, srcClip, {
        hip: 'pelvis',
        names,
        getBoneName: (bone) => names[bone.name] || names[normalizeMixamoName(bone.name)] || '',
        preservePosition: false,
        useFirstFramePosition: false,
      });
      targetSkin.skeleton.bones.forEach((b, i) => { const sv = saved[i]; if (sv) { b.position.copy(sv.p); b.quaternion.copy(sv.q); b.scale.copy(sv.s); } });
      targetSkin.updateMatrixWorld(true);
      retargeted.name = name;
      if (retargeted.tracks.length) { addClip(name, retargeted); loaded++; }
    } catch (e) { console.warn('[editor] extra anim failed', name, e); }
  }));
  return loaded;
}

async function loadModelFromURL(url, name='model') {
  setStatus('Cargando modelo...');
  try {
    const obj = await loadAny(url, name);
    clearModel();
    modelRoot = obj;
    modelRoot.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; o.material = toToonMaterial(o.material); } });
    scene.add(modelRoot);
    // Auto-scale and frame: 100Avatars/FBX can come in at huge scales
    {
      const box = new THREE.Box3().setFromObject(modelRoot);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z, 0.001);
      if (size.y > 0.1 && (size.y > 4 || maxDim > 4 || size.y < 0.5)) {
        const targetH = 1.8;
        const s = targetH / size.y;
        modelRoot.scale.multiplyScalar(s);
        modelRoot.updateMatrixWorld(true);
      }
      const box2 = new THREE.Box3().setFromObject(modelRoot);
      const c2 = box2.getCenter(new THREE.Vector3());
      const s2 = box2.getSize(new THREE.Vector3());
      modelRoot.position.sub(c2);
      modelRoot.position.y += s2.y / 2;
      modelRoot.updateMatrixWorld(true);
      const h = Math.max(s2.y, 1.8);
      orbit.target.set(0, h * 0.55, 0);
      camera.position.set(0, h * 0.6, h * 1.8);
      camera.near = 0.01; camera.far = Math.max(100, h * 20);
      camera.updateProjectionMatrix();
      orbit.update();
    }
    collectBones(modelRoot);
    populateBoneList();
    mixer = new THREE.AnimationMixer(modelRoot);
    // collect embedded clips
    const srcClips = obj.animations || [];
    for (const c of srcClips) addClip(c.name || `clip_${clips.length+1}`, c);
    // Auto-load game anims for any rigged character
    const isUbcModel = /Superhero_|\/ubc\//i.test(url) && !/UAL1_Standard|animation/i.test(url);
    const isMixamoRig = bones.some(b => /mixamorig/i.test(b.name));
    const baseUbc = '/models/opennite/ubc/';
    if (isUbcModel) {
      try {
        const animObj = await loadAny(baseUbc + 'UAL1_Standard.glb', 'UAL1_Standard.glb');
        for (const a of (animObj.animations || [])) addClip(a.name || `UAL_${clips.length+1}`, a);
        await loadGameExtraAnims(modelRoot, baseUbc);
      } catch (e) { console.warn('UAL/extra autoload failed', e); }
    } else if (bones.length) {
      // Para rigs Mixamo: retarget directo Mixamo->Mixamo (mejor calidad)
      let extraCount = 0;
      const targetSkin = modelRoot?.getObjectByProperty?.('isSkinnedMesh', true);
      const byNorm = new Map();
      modelRoot?.traverse?.((o) => { if (o.isBone) byNorm.set(String(o.name).replace(/^mixamorig\d*:?/i, ''), o.name); });
      if (isMixamoRig) {
        await Promise.all(NEW_MIXAMO_GAME_ANIMS.map(async ({ file, names }) => {
          try {
            const fbx = await loadAny(file, file.split('/').pop());
            const srcClip = fbx.animations?.[0];
            if (!srcClip) return;
            for (const aname of names) {
              if (clips.some(c => c.name === aname)) continue;
              let remapped = null;
              // Prefer SkeletonUtils.retargetClip for correct rest-pose handling across 100Avatars
              if (targetSkin?.skeleton) {
                let srcSkin = fbx.getObjectByProperty('isSkinnedMesh', true);
                if (!srcSkin?.skeleton) { const sb=[]; fbx.traverse(o=>{if(o.isBone)sb.push(o);}); if(sb.length){srcSkin=fbx; srcSkin.skeleton=new THREE.Skeleton(sb); try{srcSkin.skeleton.calculateInverses();}catch{} try{srcSkin.updateMatrixWorld(true);}catch{}} }
                if (srcSkin?.skeleton) {
                  const srcByNorm = new Map(); fbx.traverse(o=>{if(o.isBone) srcByNorm.set(String(o.name).replace(/^mixamorig\d*:?/i,''), o.name);});
                  const mmNames={}; for(const [norm,tgtName] of byNorm.entries()){ const src=srcByNorm.get(norm); if(src) mmNames[tgtName]=src; }
                  try { const saved=targetSkin.skeleton.bones.map(b=>({p:b.position.clone(),q:b.quaternion.clone(),s:b.scale.clone()})); const out=SkeletonUtils.retargetClip(targetSkin,srcSkin,srcClip,{hip:byNorm.get('Hips')||'Hips',names:mmNames,preservePosition:false,useFirstFramePosition:false}); targetSkin.skeleton.bones.forEach((b,i)=>{const sv=saved[i]; if(sv){b.position.copy(sv.p); b.quaternion.copy(sv.q); b.scale.copy(sv.s);}}); targetSkin.updateMatrixWorld(true); if(out?.tracks?.length) remapped=stripRootPosition(out, modelRoot); } catch {}
                }
              }
              if (!remapped) remapped = remapClipToSkeleton(srcClip, bones);
              if (remapped) remapped = stripRootPosition(remapped, modelRoot);
              if (remapped?.tracks?.length) { remapped.name = aname; addClip(aname, remapped); }
            }
          } catch (e) { console.warn('[editor] new mixamo anim failed', file, e); }
        }));
      }
      await Promise.all(GAME_EXTRA_ANIMS.map(async ({ file, name: aname }) => {
        try {
          const fbx = await loadAny(baseUbc + file, file);
          const srcClip = fbx.animations?.[0];
          if (!srcClip) return;
          let remapped = null;
          if (targetSkin?.skeleton) {
            let srcSkin = fbx.getObjectByProperty('isSkinnedMesh', true);
            if (!srcSkin?.skeleton) {
              const sb = []; fbx.traverse((o) => { if (o.isBone) sb.push(o); });
              if (sb.length) { srcSkin = fbx; srcSkin.skeleton = new THREE.Skeleton(sb); try{srcSkin.skeleton.calculateInverses();}catch{} try{srcSkin.updateMatrixWorld(true);}catch{} }
            }
            if (srcSkin?.skeleton) {
              const srcByNorm = new Map();
              fbx.traverse((o) => { if (o.isBone) srcByNorm.set(String(o.name).replace(/^mixamorig\d*:?/i, ''), o.name); });
              const mmNames = {};
              for (const [norm, tgtName] of byNorm.entries()) { const src = srcByNorm.get(norm); if (src) mmNames[tgtName] = src; }
              try {
                const saved = targetSkin.skeleton.bones.map((b) => ({ p: b.position.clone(), q: b.quaternion.clone(), s: b.scale.clone() }));
                const out = SkeletonUtils.retargetClip(targetSkin, srcSkin, srcClip, { hip: byNorm.get('Hips') || 'Hips', names: mmNames, preservePosition: false, useFirstFramePosition: false });
                targetSkin.skeleton.bones.forEach((b, i) => { const sv = saved[i]; if (sv) { b.position.copy(sv.p); b.quaternion.copy(sv.q); b.scale.copy(sv.s); } });
                targetSkin.updateMatrixWorld(true);
                if (out?.tracks?.length) remapped = stripRootPosition(out, modelRoot);
              } catch {}
            }
          }
          if (!remapped) { remapped = remapClipToSkeleton(srcClip, bones); if (remapped) remapped = stripRootPosition(remapped, modelRoot); }
          if (remapped?.tracks?.length) { remapped.name = aname; addClip(aname, remapped); }
        } catch (e) { console.warn('[editor] extra anim failed', aname, e); }
      }));
      // Mixamo/100Avatars: Jimmy comparte TODAS las animaciones disponibles (UAL completo + extras)
      if (isMixamoRig) {
        try {
          const animObj = await loadAny(baseUbc + 'UAL1_Standard.glb', 'UAL1_Standard.glb');
          const ualSourceSkin = animObj?.getObjectByProperty?.('isSkinnedMesh', true) || animObj;
          const MIXAMO_TO_UBC = { Hips:'pelvis',Spine:'spine_01',Spine1:'spine_02',Spine2:'spine_03',Neck:'neck_01',Head:'Head',LeftShoulder:'clavicle_l',RightShoulder:'clavicle_r',LeftArm:'upperarm_l',RightArm:'upperarm_r',LeftForeArm:'lowerarm_l',RightForeArm:'lowerarm_r',LeftHand:'hand_l',RightHand:'hand_r',LeftUpLeg:'thigh_l',RightUpLeg:'thigh_r',LeftLeg:'calf_l',RightLeg:'calf_r',LeftFoot:'foot_l',RightFoot:'foot_r',LeftToeBase:'ball_l',RightToeBase:'ball_r',LeftHandThumb1:'thumb_01_l',LeftHandThumb2:'thumb_02_l',LeftHandThumb3:'thumb_03_l',LeftHandIndex1:'index_01_l',LeftHandIndex2:'index_02_l',LeftHandIndex3:'index_03_l',LeftHandMiddle1:'middle_01_l',LeftHandMiddle2:'middle_02_l',LeftHandMiddle3:'middle_03_l',LeftHandRing1:'ring_01_l',LeftHandRing2:'ring_02_l',LeftHandRing3:'ring_03_l',LeftHandPinky1:'pinky_01_l',LeftHandPinky2:'pinky_02_l',LeftHandPinky3:'pinky_03_l',RightHandThumb1:'thumb_01_r',RightHandThumb2:'thumb_02_r',RightHandThumb3:'thumb_03_r',RightHandIndex1:'index_01_r',RightHandIndex2:'index_02_r',RightHandIndex3:'index_03_r',RightHandMiddle1:'middle_01_r',RightHandMiddle2:'middle_02_r',RightHandMiddle3:'middle_03_r',RightHandRing1:'ring_01_r',RightHandRing2:'ring_02_r',RightHandRing3:'ring_03_r',RightHandPinky1:'pinky_01_r',RightHandPinky2:'pinky_02_r',RightHandPinky3:'pinky_03_r' };
          const targetToUbc = {};
          for (const [mixamo, ubc] of Object.entries(MIXAMO_TO_UBC)) { const tgt = byNorm.get(mixamo); if (tgt) targetToUbc[tgt] = ubc; }
          for (const a of (animObj.animations || [])) {
            let remapped = null;
            if (targetSkin?.skeleton && ualSourceSkin?.skeleton) {
              try {
                const saved = targetSkin.skeleton.bones.map((b) => ({ p: b.position.clone(), q: b.quaternion.clone(), s: b.scale.clone() }));
                const out = SkeletonUtils.retargetClip(targetSkin, ualSourceSkin, a, { hip: byNorm.get('Hips') || 'Hips', names: targetToUbc, preservePosition: false, useFirstFramePosition: false });
                targetSkin.skeleton.bones.forEach((b, i) => { const sv = saved[i]; if (sv) { b.position.copy(sv.p); b.quaternion.copy(sv.q); b.scale.copy(sv.s); } });
                targetSkin.updateMatrixWorld(true);
                if (out?.tracks?.length) { remapped = stripRootPosition(out, modelRoot); }
              } catch {}
            }
            if (!remapped) remapped = remapClipToSkeleton(a, bones);
            const aname = a.name || `UAL_${clips.length+1}`;
            if (remapped.tracks.length > 5 && !clips.some(c => c.name === aname)) addClip(aname, remapped);
          }
        } catch {}
      }
      if (extraCount) console.info('[editor] loaded extra anims for non-UBC rig', extraCount);
    }
    try {
      const overrides = (await loadConfigJSON('anim-overrides.json')) || null;
      if (overrides && typeof overrides === 'object') {
        const boneNames = new Set((bones||[]).map(b=>b.name));
        for (const [name, url] of Object.entries(overrides)) {
          try {
            const r = await fetch(url, { cache: 'no-store' });
            if (!r.ok) continue;
            const data = await r.json();
            const clip = THREE.AnimationClip.parse(data);
            if (!clip?.tracks?.length) continue;
            const tracks = clip.tracks.filter(t => {
              const m = String(t.name||'').match(/^(.+).(position|quaternion|scale|visible)$/);
              return m && boneNames.has(m[1]);
            });
            if (!tracks.length) continue;
            const cleaned = new THREE.AnimationClip(name, clip.duration, tracks);
            addClip(name, cleaned);
            console.info('[editor] override applied', name, tracks.length);
          } catch (e) { console.warn('[editor] override failed', name, e); }
        }
      }
    } catch (e) { console.warn('[editor] load anim overrides failed', e); }
    fitCamera(modelRoot);
    if (clips.length) {
      const preferred = clips.find(c => /^Idle_Loop$/i.test(c.name)) || clips.find(c => /^Idle/i.test(c.name)) || clips.find(c => /Idle/i.test(c.name)) || clips[0];
      selectClip(preferred.name);
      playing = true;
      $('btnPlay').textContent = 'Pause';
    }
    setStatus(`Modelo cargado: ${name} (${bones.length} huesos, ${clips.length} clips)`);
  } catch (e) {
    console.error(e);
    setStatus('Error cargando modelo: ' + (e?.message || e));
  }
}

function addClip(name, clip) {
  // normalize: ensure clip uses bone names in this model; keep as-is, we'll retarget by name on apply
  const existing = clips.find(c => c.name === name);
  const entry = { name, clip, duration: clip.duration || 0 };
  if (existing) { existing.clip = clip; existing.duration = entry.duration; }
  else clips.push(entry);
  refreshAnimSelect();
}

function refreshAnimSelect() {
  const sel = $('animSelect');
  const cur = sel.value;
  sel.innerHTML = '<option value="">(ninguna)</option>';
  for (const c of clips) {
    const o = document.createElement('option');
    o.value = c.name; o.textContent = `${c.name} (${c.duration.toFixed(2)}s)`;
    sel.appendChild(o);
  }
  if (cur && clips.some(c=>c.name===cur)) sel.value = cur;
}

function selectClip(name) {
  const entry = clips.find(c => c.name === name);
  currentClip = entry ? entry.clip : null;
  selectedKey = null;
  if (currentClip) {
    duration = Math.max(0.1, currentClip.duration || duration);
    $('durInput').value = duration.toFixed(2);
    $('animSelect').value = name;
    applyClipAtTime(currentTime);
  }
  drawTimeline();
}

function refreshActionSelect() {
  const sel = $('actionSelect');
  if (!sel) return;
  const cur = sel.value || selectedAction;
  sel.innerHTML = '<option value="">(selecciona acción)</option>';
  for (const [id, label] of ACTIONS) {
    const assigned = animActions[id] || '';
    const o = document.createElement('option');
    o.value = id;
    const sp = speedFor(id, assigned);
    const speedTag = sp === 1 ? '' : ` [${sp}x]`;
    o.textContent = assigned ? `${label} → ${assigned}${speedTag}` : `${label}${speedTag}`;
    sel.appendChild(o);
  }
  if (cur && ACTIONS.some(a => a[0] === cur)) sel.value = cur;
}

async function loadAnimActions() {
  try {
    const data = await loadConfigJSON('anim-actions.json');
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      // Support both {action:clip} and {actions:{...}}
      animActions = (data.actions && typeof data.actions === 'object') ? { ...data.actions } : { ...data };
    }
  } catch {}
  // fill defaults from UBC_ANIM_MAP where missing
  const defaults = { idle:'Idle_Loop',idleArmed:'Idle_Loop',walk:'Walk_Loop',walkArmed:'Walk_Aim_Fwd_Loop',run:'Jog_Fwd_Loop',sprint:'Sprint_Loop',jump:'Jump_Loop',jumpStart:'Jump_Start',fall:'Jump_Loop',mantle:'Extra_ClimbWall',land:'Jump_Land',landRoll:'Roll',slide:'Extra_Slide',vault:'Extra_ClimbWall',swim:'Swim_Idle_Loop',swimFwd:'Swim_Fwd_Loop',dive:'Run_To_Swim',death:'Death01',death2:'Death01',dance:'Dance_Loop',punch:'Punch_Jab',wave:'Idle_Talking_Loop',sit:'Sitting_Idle_Loop',stand:'Sitting_Exit',yes:'Idle_Talking_Loop',no:'Hit_Head',hit:'Hit_Chest',hit2:'Hit_Head',pickup:'PickUp_Table',interact:'Interact',chestOpen:'Fixing_Kneeling',fire:'Pistol_Shoot',fire2:'Shotgun_Shoot',crouch:'Crouch_Fwd_Loop',crouchWalk:'Crouch_Fwd_Loop',aim:'Walk_Aim_Fwd_Loop',aim2:'Walk_Aim_Fwd_Loop',reload:'Pistol_Reload',reload2:'Pistol_Reload',strafeL:'Walk_Loop',strafeR:'Walk_Loop',back:'Walk_Bwd_Loop',dodge:'Roll' };
  for (const [k,v] of Object.entries(defaults)) if (!animActions[k]) animActions[k] = v;
  refreshActionSelect();
}

async function saveAnimActions(okMsg = 'Asignaciones guardadas') {
  const payload = { ...animActions };
  await saveConfigJSON('anim-actions.json', payload, okMsg);
  try { if (window.opennite?.app?.writeFile) await window.opennite.app.writeFile('public/config/anim-actions.json', JSON.stringify(payload, null, 2)); } catch {}
  try { if (window.opennite?.app?.writeFile) await window.opennite.app.writeFile('dist/config/anim-actions.json', JSON.stringify(payload, null, 2)); } catch {}
  refreshActionSelect();
}

function speedFor(action, clipName) {
  for (const key of [action, clipName]) {
    if (!key) continue;
    const n = Number(animSpeeds[key]);
    if (Number.isFinite(n) && n > 0) return Math.min(3, Math.max(0.1, n));
  }
  return 1;
}

function syncSpeedInput() {
  const action = selectedAction || '';
  const clipName = (action && animActions[action]) || $('animSelect').value || currentClip?.name || '';
  const perClip = !!$('speedPerClip')?.checked;
  const key = perClip ? clipName : (action || clipName);
  const rawClipSpeed = Number(animSpeeds[clipName]);
  const clipSpeed = Number.isFinite(rawClipSpeed) && rawClipSpeed > 0
    ? Math.min(3, Math.max(0.1, rawClipSpeed)) : 1;
  const speed = perClip ? clipSpeed : speedFor(action, clipName);
  $('animSpeed').value = String(Math.round(speed * 100) / 100);
  $('animSpeedHint').textContent = `${key ? key + ': ' : ''}${speed.toFixed(2)}x`;
}

async function loadAnimSpeeds() {
  try {
    const data = await loadConfigJSON('anim-speeds.json');
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      animSpeeds = {};
      for (const [key, value] of Object.entries(data)) {
        const n = Number(value);
        if (Number.isFinite(n) && n > 0) animSpeeds[key] = Math.min(3, Math.max(0.1, n));
      }
    }
  } catch {}
  refreshActionSelect();
  syncSpeedInput();
}

async function saveAnimSpeeds(okMsg = 'Velocidades guardadas') {
  const payload = { ...animSpeeds };
  await saveConfigJSON('anim-speeds.json', payload, okMsg);
  try { if (window.opennite?.app?.writeFile) await window.opennite.app.writeFile('public/config/anim-speeds.json', JSON.stringify(payload, null, 2)); } catch {}
  try { if (window.opennite?.app?.writeFile) await window.opennite.app.writeFile('dist/config/anim-speeds.json', JSON.stringify(payload, null, 2)); } catch {}
  refreshActionSelect();
  syncSpeedInput();
}

function selectAction(actionId) {
  selectedAction = actionId || '';
  $('actionSelect').value = selectedAction;
  syncSpeedInput();
  if (!selectedAction) return;
  const clipName = animActions[selectedAction];
  if (clipName) {
    // If clip exists, select it; if not, still set animSelect value for visibility
    if (clips.some(c => c.name === clipName)) selectClip(clipName);
    else { $('animSelect').value = clipName; setStatus(`Acción ${selectedAction} asignada a ${clipName} (clip no cargado aún)`); }
  } else {
    setStatus(`Acción ${selectedAction} sin animación asignada`);
  }
}

function ensureClip() {
  if (currentClip) return currentClip;
  const name = `Anim_${clips.length+1}`;
  const clip = new THREE.AnimationClip(name, duration, []);
  addClip(name, clip);
  selectClip(name);
  return clip;
}

function trackFor(boneName, prop) {
  ensureClip();
  const trackName = `${boneName}.${prop}`;
  let t = currentClip.tracks.find(tr => tr.name === trackName);
  if (!t) {
    const isQuat = prop === 'quaternion';
    const times = [0];
    const values = isQuat ? [0,0,0,1] : [prop==='scale'?1:0, prop==='scale'?1:0, prop==='scale'?1:0];
    // init from current bone
    const b = bones.find(x=>x.name===boneName);
    if (b) {
      if (prop==='position') values.splice(0,3,b.position.x,b.position.y,b.position.z);
      else if (prop==='quaternion') values.splice(0,4,b.quaternion.x,b.quaternion.y,b.quaternion.z,b.quaternion.w);
      else if (prop==='scale') values.splice(0,3,b.scale.x,b.scale.y,b.scale.z);
    }
    const Ctor = isQuat ? THREE.QuaternionKeyframeTrack : THREE.VectorKeyframeTrack;
    t = new Ctor(trackName, times, values);
    currentClip.tracks.push(t);
  }
  return t;
}

function upsertKey(track, time, valueArr, interp) {
  const stride = track.getValueSize();
  const times = Array.from(track.times);
  let idx = times.findIndex(t => Math.abs(t - time) < 1e-4);
  const vals = Array.from(track.values);
  if (idx >= 0) {
    for (let i=0;i<stride;i++) vals[idx*stride+i] = valueArr[i];
  } else {
    idx = times.findIndex(t => t > time);
    if (idx < 0) idx = times.length;
    times.splice(idx, 0, time);
    vals.splice(idx*stride, 0, ...valueArr);
  }
  track.times = new Float32Array(times);
  track.values = new Float32Array(vals);
  setTrackInterpolation(track, interp || getTrackInterpolation(track));
  return idx;
}

function getTrackInterpolation(track) {
  const ip = track.getInterpolation ? track.getInterpolation() : THREE.InterpolateLinear;
  if (ip === THREE.InterpolateDiscrete) return 'step';
  if (track.userData?.interp) return track.userData.interp;
  return 'linear';
}

function setTrackInterpolation(track, mode) {
  track.userData = track.userData || {};
  track.userData.interp = mode;
  if (mode === 'step') track.setInterpolation(THREE.InterpolateDiscrete);
  else track.setInterpolation(THREE.InterpolateLinear);
  // easeIn/easeOut/easeInOut handled at sampling for simplicity
}

function addKeyframeForSelected(time = currentTime) {
  if (!selectedBone) { setStatus('Selecciona un hueso para crear keyframes.'); return; }
  const clip = ensureClip();
  const b = selectedBone;
  const interp = $('interpSelect').value;
  const tPos = trackFor(b.name, 'position');
  const tRot = trackFor(b.name, 'quaternion');
  const tScl = trackFor(b.name, 'scale');
  const kiP = upsertKey(tPos, time, [b.position.x,b.position.y,b.position.z], interp);
  const kiR = upsertKey(tRot, time, [b.quaternion.x,b.quaternion.y,b.quaternion.z,b.quaternion.w], interp);
  const kiS = upsertKey(tScl, time, [b.scale.x,b.scale.y,b.scale.z], interp);
  clip.duration = Math.max(clip.duration, duration, time);
  duration = Math.max(duration, clip.duration);
  $('durInput').value = duration.toFixed(2);
  const entry = clips.find(c=>c.clip===clip); if (entry) entry.duration = clip.duration;
  refreshAnimSelect(); $('animSelect').value = clip.name;
  selectedKey = { trackName: tRot.name, index: kiR, bone: b.name };
  drawTimeline();
  setStatus(`Keyframe en ${time.toFixed(2)}s para ${b.name} (${interp})`);
}

function deleteSelectedKey() {
  if (!selectedKey || !currentClip) { setStatus('No hay keyframe seleccionado.'); return; }
  const tr = currentClip.tracks.find(t => t.name === selectedKey.trackName);
  if (!tr) return;
  const stride = tr.getValueSize();
  const times = Array.from(tr.times);
  const vals = Array.from(tr.values);
  if (selectedKey.index < 0 || selectedKey.index >= times.length) return;
  times.splice(selectedKey.index,1);
  vals.splice(selectedKey.index*stride, stride);
  tr.times = new Float32Array(times);
  tr.values = new Float32Array(vals);
  selectedKey = null;
  drawTimeline();
  setStatus('Keyframe eliminado.');
}

function normalizeBoneName(name) {
  return String(name || '')
    .replace(/^.*mixamorig\d*:?/i, 'mixamorig:')
    .replace(/^mixamorig:/i, '')
    .toLowerCase();
}
function resolveBone(trackBoneName) {
  if (!trackBoneName) return null;
  let b = bones.find(x => x.name === trackBoneName);
  if (b) return b;
  const norm = normalizeBoneName(trackBoneName);
  b = bones.find(x => normalizeBoneName(x.name) === norm);
  if (b) return b;
  const stripped = trackBoneName.replace(/^.*?(mixamorig\d*:?)/i, '$1');
  b = bones.find(x => x.name === stripped || x.name.endsWith(stripped));
  if (b) return b;
  return null;
}

function stripRootPosition(clip, root){
  if(!clip||!root) return clip;
  const hips = new Set();
  root.traverse?.(o=>{ if(o.isBone && /hip|pelvis/i.test(o.name)) { hips.add(o.name); hips.add(normalizeBoneName(o.name)); } });
  if(!hips.size) return clip;
  clip.tracks = clip.tracks.filter(t => {
    const { boneName, prop } = parseTrackName(t.name);
    if (prop !== 'position') return true;
    return !(hips.has(boneName) || hips.has(normalizeBoneName(boneName)));
  });
  return clip;
}
function remapClipToSkeleton(clip, boneList) {
  const tracks = [];
  for (const t of clip.tracks) {
    const { boneName, prop } = parseTrackName(t.name);
    let target = boneList.find(x => x.name === boneName);
    if (!target) {
      const norm = normalizeBoneName(boneName);
      target = boneList.find(x => normalizeBoneName(x.name) === norm);
    }
    if (!target) {
      const stripped = boneName.replace(/^.*?(mixamorig\d*:?)/i, '$1');
      target = boneList.find(x => x.name === stripped || x.name.endsWith(stripped));
    }
    if (!target) {
      // UBC -> Mixamo name mapping (for loading UAL clips onto Mixamo rigs)
      const mixamo = UBC_TO_MIXAMO[boneName] || UBC_TO_MIXAMO[boneName.toLowerCase()];
      if (mixamo) {
        const normM = mixamo.toLowerCase();
        target = boneList.find(x => normalizeBoneName(x.name) === normM) || boneList.find(x => x.name.toLowerCase().endsWith(normM));
      }
    }
    if (!target) continue;
    const trackName = `${target.name}.${prop}`;
    if (trackName === t.name) { tracks.push(t); continue; }
    const T = t.constructor;
    tracks.push(new T(trackName, Array.from(t.times), Array.from(t.values), t.getInterpolation ? t.getInterpolation() : undefined));
  }
  const out = new THREE.AnimationClip(clip.name, clip.duration, tracks);
  out.userData = { ...(clip.userData||{}), remapped: true };
  return out;
}

function parseTrackName(name) {
  const s = String(name || '');
  const m = s.match(/\.?bones\[(.+?)\]\.(position|quaternion|scale)$/);
  if (m) return { boneName: m[1], prop: m[2] };
  const p = s.match(/^(.+)\.(position|quaternion|scale)$/);
  if (p) return { boneName: p[1], prop: p[2] };
  const i = s.lastIndexOf('.');
  return { boneName: i >= 0 ? s.slice(0, i) : s, prop: i >= 0 ? s.slice(i + 1) : '' };
}
function applyClipAtTime(t) {
  if (!modelRoot) return;
  const time = Math.max(0, Math.min(t, duration));
  currentTime = time;
  $('timeInput').value = time.toFixed(2);
  if (!currentClip) { drawTimeline(); return; }
  for (const tr of currentClip.tracks) {
    const { boneName, prop } = parseTrackName(tr.name);
    const bone = resolveBone(boneName);
    if (!bone) continue;
    const val = sampleTrack(tr, time);
    if (!val) continue;
    if (prop === 'position') bone.position.set(val[0],val[1],val[2]);
    else if (prop === 'quaternion') bone.quaternion.set(val[0],val[1],val[2],val[3]).normalize();
    else if (prop === 'scale') bone.scale.set(val[0],val[1],val[2]);
  }
  syncTransformInputs();
  drawTimeline();
}

function ease(t, mode) {
  if (mode === 'easeIn') return t*t;
  if (mode === 'easeOut') return 1 - (1-t)*(1-t);
  if (mode === 'easeInOut') return t<0.5 ? 2*t*t : 1 - Math.pow(-2*t+2,2)/2;
  return t;
}

function sampleTrack(tr, time) {
  const times = tr.times; const vals = tr.values; const stride = tr.getValueSize();
  const n = times.length;
  if (!n) return null;
  if (time <= times[0]) return vals.slice(0, stride);
  if (time >= times[n-1]) return vals.slice((n-1)*stride, n*stride);
  let i0 = 0;
  for (let i=0;i<n-1;i++) { if (time >= times[i] && time <= times[i+1]) { i0=i; break; } }
  const i1 = i0+1;
  const t0 = times[i0], t1 = times[i1];
  const a = (time-t0)/Math.max(1e-6,(t1-t0));
  const interp = tr.userData?.interp || (tr.getInterpolation()===THREE.InterpolateDiscrete?'step':'linear');
  if (interp === 'step') return vals.slice(i0*stride, (i0+1)*stride);
  const k = ease(a, interp);
  const out = new Array(stride);
  if (stride === 4) {
    // quaternion slerp
    const q0 = new THREE.Quaternion(vals[i0*4],vals[i0*4+1],vals[i0*4+2],vals[i0*4+3]);
    const q1 = new THREE.Quaternion(vals[i1*4],vals[i1*4+1],vals[i1*4+2],vals[i1*4+3]);
    q0.slerp(q1, k);
    out[0]=q0.x; out[1]=q0.y; out[2]=q0.z; out[3]=q0.w;
  } else {
    for (let j=0;j<stride;j++) out[j] = vals[i0*stride+j] + (vals[i1*stride+j]-vals[i0*stride+j])*k;
  }
  return out;
}

// --- timeline ---
const tlCanvas = $('timelineCanvas');
const tlCtx = tlCanvas.getContext('2d');
function drawTimeline() {
  const wrap = $('timelineWrap');
  const w = wrap.clientWidth || 600;
  const h = wrap.clientHeight || 160;
  tlCanvas.width = Math.floor(w * devicePixelRatio);
  tlCanvas.height = Math.floor(h * devicePixelRatio);
  tlCanvas.style.width = w+'px'; tlCanvas.style.height = h+'px';
  tlCtx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);
  tlCtx.clearRect(0,0,w,h);
  tlCtx.fillStyle = '#0d121b'; tlCtx.fillRect(0,0,w,h);

  const pxPerSec = Math.max(20, +$('zoomInput').value || 120);
  const leftPad = 140;
  const topPad = 24;
  const rowH = 20;
  const dur = Math.max(duration, 0.1);

  // ruler
  tlCtx.fillStyle = '#111a28'; tlCtx.fillRect(0,0,w,topPad);
  tlCtx.strokeStyle = '#243145'; tlCtx.beginPath(); tlCtx.moveTo(0,topPad); tlCtx.lineTo(w,topPad); tlCtx.stroke();
  tlCtx.fillStyle = '#8fa1b8'; tlCtx.font = '10px Segoe UI';
  for (let s=0; s<=dur+0.001; s+=0.5) {
    const x = leftPad + s*pxPerSec;
    if (x>w) break;
    tlCtx.strokeStyle = s%1===0 ? '#314157' : '#233044';
    tlCtx.beginPath(); tlCtx.moveTo(x, topPad); tlCtx.lineTo(x, h); tlCtx.stroke();
    if (s%1===0) tlCtx.fillText(s.toFixed(0)+'s', x+2, 14);
  }

  // tracks list
  const tracks = (currentClip?.tracks || []).slice().sort((a,b)=>a.name.localeCompare(b.name));
  const visible = tracks.slice(0, Math.floor((h-topPad)/rowH));
  for (let i=0;i<visible.length;i++) {
    const tr = visible[i];
    const y = topPad + i*rowH;
    tlCtx.fillStyle = i%2 ? '#101826' : '#0f1622';
    tlCtx.fillRect(0,y,w,rowH);
    tlCtx.fillStyle = '#b8c5d8';
    tlCtx.fillText(tr.name.slice(0,22), 6, y+13);
    // keys
    const interp = tr.userData?.interp || 'linear';
    for (let k=0;k<tr.times.length;k++) {
      const t = tr.times[k];
      const x = leftPad + t*pxPerSec;
      if (x<leftPad-5 || x>w+5) continue;
      const sel = selectedKey && selectedKey.trackName===tr.name && selectedKey.index===k;
      tlCtx.fillStyle = sel ? '#ffd166' : (interp==='step' ? '#b084f7' : interp==='easeIn' ? '#58d68d' : interp==='easeOut' ? '#f5b041' : interp==='easeInOut' ? '#5dade2' : '#d8e1ec');
      tlCtx.save(); tlCtx.translate(x, y+rowH/2); tlCtx.rotate(Math.PI/4);
      tlCtx.fillRect(-4,-4,8,8); tlCtx.restore();
    }
  }

  // playhead
  const phX = leftPad + currentTime*pxPerSec;
  tlCtx.strokeStyle = '#ff5d5d'; tlCtx.lineWidth = 2;
  tlCtx.beginPath(); tlCtx.moveTo(phX, 0); tlCtx.lineTo(phX, h); tlCtx.stroke();
  tlCtx.fillStyle = '#ff5d5d'; tlCtx.fillRect(phX-5,0,10,topPad);
  tlCtx.lineWidth = 1;
}

function timelinePick(e) {
  const rect = tlCanvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const pxPerSec = Math.max(20, +$('zoomInput').value || 120);
  const leftPad = 140; const topPad=24; const rowH=20;
  const time = Math.max(0, Math.min(duration, (x-leftPad)/pxPerSec));
  const tracks = (currentClip?.tracks || []).slice().sort((a,b)=>a.name.localeCompare(b.name));
  const row = Math.floor((y-topPad)/rowH);
  const tr = tracks[row];
  let keyIndex = -1;
  if (tr) {
    for (let k=0;k<tr.times.length;k++) {
      const kx = leftPad + tr.times[k]*pxPerSec;
      if (Math.abs(kx-x) < 8 && Math.abs((topPad+row*rowH+rowH/2)-y) < 10) { keyIndex=k; break; }
    }
  }
  return { time, track: tr, keyIndex, row };
}

let draggingKey = null;
tlCanvas.addEventListener('mousedown', (e) => {
  const p = timelinePick(e);
  if (p.track && p.keyIndex >= 0) {
    selectedKey = { trackName: p.track.name, index: p.keyIndex, bone: parseTrackName(p.track.name).boneName };
    draggingKey = { track: p.track, index: p.keyIndex };
    // select bone
    const b = bones.find(bb=>bb.name===selectedKey.bone);
    if (b) selectBone(b);
    $('interpSelect').value = p.track.userData?.interp || (p.track.getInterpolation()===THREE.InterpolateDiscrete?'step':'linear');
  } else {
    selectedKey = null;
  }
  applyClipAtTime(p.time);
});
window.addEventListener('mousemove', (e) => {
  if (!draggingKey) return;
  const p = timelinePick(e);
  const tr = draggingKey.track;
  const times = Array.from(tr.times);
  times[draggingKey.index] = Math.max(0, Math.min(duration, p.time));
  // keep order simple: sort by rebuilding
  const stride = tr.getValueSize();
  const rows = times.map((t,i)=>({t, v:Array.from(tr.values.slice(i*stride,(i+1)*stride))})).sort((a,b)=>a.t-b.t);
  tr.times = new Float32Array(rows.map(r=>r.t));
  tr.values = new Float32Array(rows.flatMap(r=>r.v));
  draggingKey.index = rows.findIndex(r=>Math.abs(r.t-p.time)<1e-5);
  selectedKey = { trackName: tr.name, index: draggingKey.index, bone: parseTrackName(tr.name).boneName };
  applyClipAtTime(p.time);
});
window.addEventListener('mouseup', () => { draggingKey = null; });
tlCanvas.addEventListener('dblclick', (e) => {
  const p = timelinePick(e);
  applyClipAtTime(p.time);
  addKeyframeForSelected(p.time);
});

// --- UI wiring ---
$('toolMove').onclick = () => { gizmo.setMode('translate'); setActiveTool('toolMove'); };
$('toolRotate').onclick = () => { gizmo.setMode('rotate'); setActiveTool('toolRotate'); };
$('toolScale').onclick = () => { gizmo.setMode('scale'); setActiveTool('toolScale'); };
function setActiveTool(id){ ['toolMove','toolRotate','toolScale'].forEach(x=>$(x).classList.toggle('active', x===id)); }
$('toolLocal').onclick = () => { const local = gizmo.space === 'world'; gizmo.setSpace(local?'local':'world'); $('toolLocal').classList.toggle('active', local); };
$('btnResetPose').onclick = () => { if (modelRoot) { modelRoot.traverse(o=>{ if(o.isBone){ o.position.set(0,0,0); o.rotation.set(0,0,0); o.scale.set(1,1,1); } }); syncTransformInputs(); drawTimeline(); setStatus('Pose reset (visual).'); } };

$('boneFilter').addEventListener('input', e => populateBoneList(e.target.value));
$('btnAddKey').onclick = () => addKeyframeForSelected(currentTime);
$('btnKeySel').onclick = () => addKeyframeForSelected(currentTime);
$('btnDeleteKey').onclick = deleteSelectedKey;
$('btnDelKey').onclick = deleteSelectedKey;

$('timeInput').addEventListener('change', e => { playing=false; $('btnPlay').textContent='Play'; applyClipAtTime(+e.target.value||0); });
$('durInput').addEventListener('change', e => { duration = Math.max(0.1, +e.target.value||duration); if (currentClip) currentClip.duration = Math.max(currentClip.duration, duration); drawTimeline(); });
$('zoomInput').addEventListener('input', drawTimeline);
$('fpsInput').addEventListener('change', drawTimeline);

$('interpSelect').addEventListener('change', e => {
  if (!selectedKey || !currentClip) return;
  const tr = currentClip.tracks.find(t=>t.name===selectedKey.trackName);
  if (tr) { setTrackInterpolation(tr, e.target.value); drawTimeline(); setStatus(`Interpolación ${e.target.value} en ${tr.name}`); }
});

$('btnPlay').onclick = () => { playing = !playing; $('btnPlay').textContent = playing ? 'Pause' : 'Play'; };
$('btnStop').onclick = () => { playing = false; $('btnPlay').textContent='Play'; applyClipAtTime(0); };

$('animSelect').addEventListener('change', async e => {
  const name = e.target.value;
  selectClip(name);
  if (selectedAction && name) {
    animActions[selectedAction] = name;
    await saveAnimActions(`Acción ${selectedAction} → ${name}`);
    setStatus(`Asignado: ${selectedAction} → ${name}`);
  }
  syncSpeedInput();
});
$('actionSelect').addEventListener('change', e => selectAction(e.target.value));

$('btnSaveAnimSpeed').onclick = async () => {
  const perClip = !!$('speedPerClip')?.checked;
  const clipName = $('animSelect').value || currentClip?.name;
  const key = perClip ? clipName : (selectedAction || clipName);
  if (!key) { setStatus('Selecciona una acción o animación.'); return; }
  const n = Math.min(3, Math.max(0.1, Number($('animSpeed').value) || 1));
  animSpeeds[key] = n;
  await saveAnimSpeeds(`Velocidad ${key} = ${n.toFixed(2)}x`);
  setStatus(`Velocidad guardada: ${key} = ${n.toFixed(2)}x`);
};
$('speedPerClip')?.addEventListener('change', syncSpeedInput);

$('btnLoadModel').onclick = () => $('modelFile').click();
$('modelFile').addEventListener('change', async e => { const f=e.target.files?.[0]; if(!f) return; const url=URL.createObjectURL(f); await loadModelFromURL(url, f.name); $('skinModelPath').value = f.name; });

async function selectSkinById(id, loadModel = true) {
  const s = loadSkinsLocal().find(x => x.id === id);
  if (!s) return;
  selectedSkinId = s.id;
  fillSkinForm(s);
  refreshSkinList();
  $('gameCharSelect').value = s.id;
  if (loadModel && s.modelPath) {
    await loadModelFromURL(s.modelPath, s.name || s.id);
    $('skinModelPath').value = s.modelPath;
  }
}
$('btnLoadGameChar').onclick = async () => { await selectSkinById($('gameCharSelect').value, true); };
$('gameCharSelect').addEventListener('change', async () => { await selectSkinById($('gameCharSelect').value, true); });

$('btnLoadAnim').onclick = () => $('animFile').click();
$('btnReplaceAnim').onclick = () => {
  if (!currentClip) { setStatus('Selecciona una animación para reemplazar.'); return; }
  $('replaceAnimFile').click();
};
$('replaceAnimFile').addEventListener('change', async e => {
  const f = (e.target.files||[])[0];
  e.target.value = '';
  if (!f) return;
  if (!currentClip) { setStatus('Selecciona una animación para reemplazar.'); return; }
  const replaceName = currentClip.name;
  try {
    const url = URL.createObjectURL(f);
    const obj = await loadAny(url, f.name);
    const anims = obj.animations || [];
    if (!anims.length) { setStatus(`Sin animaciones en ${f.name}`); return; }
    const targetSkin = modelRoot?.getObjectByProperty?.('isSkinnedMesh', true);
    const byNorm = new Map();
    modelRoot?.traverse?.((o) => { if (o.isBone) byNorm.set(String(o.name).replace(/^mixamorigd*:?/i, ''), o.name); });
    let replaced = 0;
    for (const a of anims) {
      let out = null;
      const sameFamily = (() => { let m=0,t=0; for(const tr of a.tracks||[]){ const mm=tr.name.match(/^(.+)\.(position|quaternion|scale)$/); if(!mm) continue; t++; if(byNorm.has(mm[1].replace(/^mixamorig\d*:?/i,''))) m++; } return t>0 && m/t>0.6; })();
      if (sameFamily) { out = remapClipToSkeleton(a, bones); if (out) out = stripRootPosition(out, modelRoot); }
      if (!out && targetSkin?.skeleton) {
        let srcSkin = obj.getObjectByProperty?.('isSkinnedMesh', true);
        if (!srcSkin?.skeleton) { const sb=[]; obj.traverse?.(o=>{ if(o.isBone) sb.push(o); }); if (sb.length) { srcSkin = obj; srcSkin.skeleton = new THREE.Skeleton(sb); try{srcSkin.skeleton.calculateInverses();}catch{} try{srcSkin.updateMatrixWorld(true);}catch{} } }
        if (srcSkin?.skeleton) {
          const srcByNorm = new Map(); obj.traverse?.(o=>{ if(o.isBone) srcByNorm.set(String(o.name).replace(/^mixamorig\d*:?/i,''), o.name); });
          const mmNames = {}; for (const [norm,tgtName] of byNorm.entries()) { const src=srcByNorm.get(norm); if(src) mmNames[tgtName]=src; }
          try {
            const saved = targetSkin.skeleton.bones.map(b=>({p:b.position.clone(),q:b.quaternion.clone(),s:b.scale.clone()}));
            const ret = SkeletonUtils.retargetClip(targetSkin, srcSkin, a, { hip: byNorm.get('Hips')||'Hips', names: mmNames, preservePosition:false, useFirstFramePosition:false });
            targetSkin.skeleton.bones.forEach((b,i)=>{ const sv=saved[i]; if(sv){ b.position.copy(sv.p); b.quaternion.copy(sv.q); b.scale.copy(sv.s); }});
            targetSkin.updateMatrixWorld(true);
            if (ret?.tracks?.length) out = ret;
          } catch {}
        }
      }
      if (!out) out = remapClipToSkeleton(a, bones);
      if (out?.tracks?.length) {
        stripRootPosition(out, modelRoot); out.name = replaceName;
        const boneNames = new Set((bones||[]).map(b=>b.name));
        const cleanTracks = out.tracks.filter(t => { const m = String(t.name||'').match(/^(.+)\.(position|quaternion|scale)$/); return m && boneNames.has(m[1]); });
        const cleanOut = cleanTracks.length ? new THREE.AnimationClip(replaceName, out.duration, cleanTracks) : out;
        addClip(replaceName, cleanOut); replaced++;
        try {
          const safe = String(replaceName).replace(/[^a-zA-Z0-9_-]+/g, '_');
          const clipJson = JSON.stringify(THREE.AnimationClip.toJSON(cleanOut));
          const relUrl = `/models/opennite/characters/100avatars/anims/overrides/${safe}.json`;
          if (window.opennite?.app?.writeFile) {
            await window.opennite.app.writeFile(`public${relUrl}`, clipJson);
            try { await window.opennite.app.writeFile(`dist${relUrl}`, clipJson); } catch {}
          }
          const overrides = (await loadConfigJSON('anim-overrides.json')) || {};
          overrides[replaceName] = relUrl;
          await saveConfigJSON('anim-overrides.json', overrides, 'Override guardado');
          try { if (window.opennite?.app?.writeFile) await window.opennite.app.writeFile('public/config/anim-overrides.json', JSON.stringify(overrides, null, 2)); } catch {}
          try { if (window.opennite?.app?.writeFile) await window.opennite.app.writeFile('dist/config/anim-overrides.json', JSON.stringify(overrides, null, 2)); } catch {}
        } catch (e) { console.warn('No se pudo guardar override', e); }
        break;
      }
    }
    if (replaced) { selectClip(replaceName); setStatus(`Animación reemplazada y guardada: ${replaceName} <- ${f.name}`); }
    else setStatus(`No se pudo retargetear ${f.name}`);
  } catch(err) { console.error(err); setStatus('Error reemplazando anim: '+err.message); }
});
$('animFile').addEventListener('change', async e => {
  const files = [...(e.target.files||[])];
  for (const f of files) {
    try {
      const url = URL.createObjectURL(f);
      const obj = await loadAny(url, f.name);
      const anims = obj.animations || [];
      if (!anims.length) { setStatus(`Sin animaciones en ${f.name}`); continue; }
      const targetSkin = modelRoot?.getObjectByProperty?.('isSkinnedMesh', true);
      const isMixamoRig = bones.some(b => /mixamorig/i.test(b.name));
      const byNorm = new Map();
      modelRoot?.traverse?.((o) => { if (o.isBone) byNorm.set(String(o.name).replace(/^mixamorig\d*:?/i, ''), o.name); });
      for (const a of anims) {
        let out = null;
        const sameFamily = (() => { let m=0,t=0; for(const tr of a.tracks||[]){ const mm=tr.name.match(/^(.+)\.(position|quaternion|scale)$/); if(!mm) continue; t++; if(byNorm.has(mm[1].replace(/^mixamorig\d*:?/i,''))) m++; } return t>0 && m/t>0.6; })();
        if (sameFamily) {
          out = remapClipToSkeleton(a, bones);
          if (out) out = stripRootPosition(out, modelRoot);
        }
        if (!out && targetSkin?.skeleton) {
          let srcSkin = obj.getObjectByProperty?.('isSkinnedMesh', true);
          if (!srcSkin?.skeleton) {
            const sb=[]; obj.traverse?.(o=>{ if(o.isBone) sb.push(o); });
            if (sb.length) { srcSkin = obj; srcSkin.skeleton = new THREE.Skeleton(sb); try{srcSkin.skeleton.calculateInverses();}catch{} try{srcSkin.updateMatrixWorld(true);}catch{} }
          }
          if (srcSkin?.skeleton) {
            const srcByNorm = new Map();
            obj.traverse?.(o=>{ if(o.isBone) srcByNorm.set(String(o.name).replace(/^mixamorig\d*:?/i,''), o.name); });
            const mmNames = {};
            for (const [norm,tgtName] of byNorm.entries()) { const src=srcByNorm.get(norm); if(src) mmNames[tgtName]=src; }
            try {
              const saved = targetSkin.skeleton.bones.map(b=>({p:b.position.clone(),q:b.quaternion.clone(),s:b.scale.clone()}));
              const ret = SkeletonUtils.retargetClip(targetSkin, srcSkin, a, { hip: byNorm.get('Hips')||'Hips', names: mmNames, preservePosition:false, useFirstFramePosition:false });
              targetSkin.skeleton.bones.forEach((b,i)=>{ const sv=saved[i]; if(sv){ b.position.copy(sv.p); b.quaternion.copy(sv.q); b.scale.copy(sv.s); }});
              targetSkin.updateMatrixWorld(true);
              if (ret?.tracks?.length) out = ret;
            } catch {}
          }
        }
        if (!out && targetSkin?.skeleton) {
          let srcSkin = obj.getObjectByProperty?.('isSkinnedMesh', true);
          if (!srcSkin?.skeleton) {
            const sb=[]; obj.traverse?.(o=>{ if(o.isBone) sb.push(o); });
            if (sb.length) { srcSkin = obj; srcSkin.skeleton = new THREE.Skeleton(sb); }
          }
          if (srcSkin?.skeleton) {
            const srcByNorm = new Map();
            obj.traverse?.(o=>{ if(o.isBone) srcByNorm.set(String(o.name).replace(/^mixamorig\d*:?/i,''), o.name); });
            const mmNames = {};
            for (const [norm,tgtName] of byNorm.entries()) { const src=srcByNorm.get(norm); if(src) mmNames[tgtName]=src; }
            try {
              const saved = targetSkin.skeleton.bones.map(b=>({p:b.position.clone(),q:b.quaternion.clone(),s:b.scale.clone()}));
              out = SkeletonUtils.retargetClip(targetSkin, srcSkin, a, { hip: byNorm.get('Hips')||'Hips', names: mmNames, preservePosition:false, useFirstFramePosition:false });
              targetSkin.skeleton.bones.forEach((b,i)=>{ const sv=saved[i]; if(sv){ b.position.copy(sv.p); b.quaternion.copy(sv.q); b.scale.copy(sv.s); }});
              targetSkin.updateMatrixWorld(true);
              if (!out?.tracks?.length) out = null;
            } catch {}
          }
        }
        if (!out) out = remapClipToSkeleton(a, bones);
        if (out?.tracks?.length) { stripRootPosition(out, modelRoot); addClip(out.name || a.name || f.name.replace(/\.[^.]+$/,''), out); }
      }
      if (!currentClip && clips.length) selectClip(clips[clips.length-1].name);
      setStatus(`Animación cargada: ${f.name} (${anims.length} clips, retarget ${isMixamoRig?'Mixamo':'generic'})`);
    } catch(err) { console.error(err); setStatus('Error anim: '+err.message); }
  }
});

$('btnNewAnim').onclick = () => {
  if (!modelRoot) { setStatus('Carga un modelo primero.'); return; }
  const name = prompt('Nombre de animación:', `Anim_${clips.length+1}`);
  if (!name) return;
  const clip = new THREE.AnimationClip(name, Math.max(0.1,+$('durInput').value||2), []);
  addClip(name, clip); selectClip(name); setStatus(`Animación creada: ${name}`);
};

$('btnExportAnim').onclick = () => {
  if (!currentClip) { setStatus('No hay animación para exportar.'); return; }
  const data = THREE.AnimationClip.toJSON(currentClip);
  downloadJSON(data, `${currentClip.name||'animation'}.clip.json`);
  setStatus('Animación exportada.');
};

$('btnSaveAnim').onclick = async () => {
  if (!currentClip) { setStatus('No hay animación.'); return; }
  const data = { name: currentClip.name, duration: currentClip.duration, clip: THREE.AnimationClip.toJSON(currentClip) };
  await saveConfigJSON('character-anim.json', data, `Animación ${currentClip.name} guardada`);
};

function downloadJSON(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], {type:'application/json'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click(); URL.revokeObjectURL(a.href);
}

async function saveConfigJSON(file, obj, okMsg) {
  const text = JSON.stringify(obj, null, 2);
  // Electron preload bridge
  try {
    if (window.opennite?.app?.writeFile) {
      await window.opennite.app.writeFile(`config/${file}`, text);
      setStatus(okMsg + ' → config/' + file);
      return;
    }
  } catch (e) { console.warn('writeFile failed', e); }
  downloadJSON(obj, file);
  setStatus(okMsg + ' (descargado)');
}

async function loadConfigJSON(file) {
  try {
    const r = await fetch(`/config/${file}`, { cache: 'no-store' });
    if (r.ok) return await r.json();
  } catch {}
  return null;
}

// --- skin metadata ---
const SKINS_KEY = 'opennite.character.skins';
const GAME_CHARACTERS = [
  { id: '100avatars_003_jimmy', name: 'Jimmy (Base)', path: '/models/opennite/characters/100avatars/100Avatars_003_Jimmy.fbx', default: true },
];
const GAME_DEFAULT_SKINS = [
  { id:'100avatars_001_crimsom', name:'01 Crimsom', rarity:'common', price:0, currency:'chapas', saleStart:null, saleEnd:null, battlePassGift:false, battlePassLevel:null, modelPath:'/models/opennite/characters/100avatars/100Avatars_001_Crimsom.fbx', notes:'Básico/default. 100Avatars CC BY 4.0', color:'#e53935', default:true },
  { id:'100avatars_002_coolalien', name:'02 CoolAlien', rarity:'rare', price:500, currency:'chapas', saleStart:null, saleEnd:null, battlePassGift:false, battlePassLevel:null, modelPath:'/models/opennite/characters/100avatars/100Avatars_002_CoolAlien.fbx', notes:'Venta 500 chapas. 100Avatars CC BY 4.0', color:'#43a047' },
  { id:'100avatars_003_jimmy', name:'03 Jimmy', rarity:'rare', price:1000, currency:'chapas', saleStart:null, saleEnd:null, battlePassGift:false, battlePassLevel:null, modelPath:'/models/opennite/characters/100avatars/100Avatars_003_Jimmy.fbx', notes:'Venta 1000 chapas. 100Avatars CC BY 4.0', color:'#1e88e5' },
  { id:'100avatars_004_oldmoustache', name:'04 OldMoustache', rarity:'epic', price:19000, currency:'chapas', saleStart:null, saleEnd:null, battlePassGift:false, battlePassLevel:null, modelPath:'/models/opennite/characters/100avatars/100Avatars_004_OldMoustache.fbx', notes:'Épico 19000 chapas. 100Avatars CC BY 4.0', color:'#8e24aa' },
  { id:'100avatars_005_skull', name:'05 Skull', rarity:'epic', price:0, currency:'chapas', saleStart:null, saleEnd:null, battlePassGift:true, battlePassLevel:10, modelPath:'/models/opennite/characters/100avatars/100Avatars_005_Skull.fbx', notes:'Pase batalla nivel 10. 100Avatars CC BY 4.0', color:'#fdd835' },
  { id:'100avatars_006_cappy', name:'06 Cappy', rarity:'rare', price:0, currency:'chapas', saleStart:null, saleEnd:null, battlePassGift:true, battlePassLevel:5, modelPath:'/models/opennite/characters/100avatars/100Avatars_006_Cappy.fbx', notes:'Pase batalla nivel 5. 100Avatars CC BY 4.0', color:'#fb8c00' }
];
function loadSkinsLocal() {
  try { return JSON.parse(localStorage.getItem(SKINS_KEY) || '[]'); } catch { return []; }
}
function saveSkinsLocal(list) { localStorage.setItem(SKINS_KEY, JSON.stringify(list)); }

function ensureDefaultSkins() {
  const list = loadSkinsLocal();
  let changed = false;
  for (const d of GAME_DEFAULT_SKINS) {
    const existing = list.find(s => s.id === d.id);
    if (!existing) { list.push({ ...d, updatedAt: new Date().toISOString() }); changed = true; }
    else {
      if (d.modelPath && existing.modelPath !== d.modelPath) { existing.modelPath = d.modelPath; changed = true; }
      if (!existing.name && d.name) { existing.name = d.name; changed = true; }
    }
  }
  if (changed) saveSkinsLocal(list);
  return list;
}

function populateGameCharSelect() { refreshSkinList(); }

function readSkinForm() {
  return {
    id: $('skinId').value.trim(),
    name: $('skinName').value.trim(),
    rarity: $('skinRarity').value,
    price: Math.max(0, +$('skinPrice').value || 0),
    currency: $('skinCurrency').value,
    saleStart: $('skinStart').value || null,
    saleEnd: $('skinEnd').value || null,
    battlePassGift: $('skinBpGift').checked,
    battlePassLevel: $('skinBpGift').checked ? Math.max(1, +$('skinBpLevel').value || 1) : null,
    modelPath: $('skinModelPath').value.trim() || null,
    notes: $('skinNotes').value.trim(),
    updatedAt: new Date().toISOString(),
  };
}
function fillSkinForm(s) {
  $('skinId').value = s.id || ''; $('skinName').value = s.name || ''; $('skinRarity').value = s.rarity || 'common';
  $('skinPrice').value = s.price ?? 0; $('skinCurrency').value = s.currency || 'vbucks';
  $('skinStart').value = s.saleStart || ''; $('skinEnd').value = s.saleEnd || '';
  $('skinBpGift').checked = !!s.battlePassGift; $('skinBpLevel').value = s.battlePassLevel || 1;
  $('skinBpLevel').disabled = !$('skinBpGift').checked;
  $('skinModelPath').value = s.modelPath || ''; $('skinNotes').value = s.notes || '';
}
let selectedSkinId = '';
function refreshSkinList() {
  const list = loadSkinsLocal();
  const sel = $('gameCharSelect');
  const prev = selectedSkinId || sel.value;
  sel.innerHTML = '';
  for (const s of list) {
    const o = document.createElement('option');
    o.value = s.id;
    o.textContent = `${s.name || s.id}${s.battlePassGift ? ' [Pase]' : ''}`;
    sel.appendChild(o);
  }
  if (prev && list.some(s => s.id === prev)) sel.value = prev;
  else if (list[0]) sel.value = list[0].id;
}
$('skinBpGift').addEventListener('change', e => { $('skinBpLevel').disabled = !e.target.checked; });
$('btnSaveSkin').onclick = async () => {
  const s = readSkinForm();
  if (!s.id) { setStatus('ID de skin requerido.'); return; }
  if (s.saleStart && s.saleEnd && new Date(s.saleEnd) < new Date(s.saleStart)) { setStatus('Caducidad debe ser >= inicio venta.'); return; }
  const list = loadSkinsLocal();
  const i = list.findIndex(x=>x.id===s.id);
  if (i>=0) list[i]=s; else list.push(s);
  saveSkinsLocal(list);
  selectedSkinId = s.id;
  refreshSkinList();
  $('gameCharSelect').value = s.id;
  await saveConfigJSON('character-skins.json', { skins: list }, `Skin ${s.id} guardada`);
};
$('btnExportSkin').onclick = () => { downloadJSON({ skins: loadSkinsLocal() }, 'character-skins.json'); setStatus('Skins exportadas.'); };
$('btnDeleteSkin').onclick = async () => {
  const id = selectedSkinId || $('gameCharSelect').value;
  if (!id) return;
  const list = loadSkinsLocal();
  const idx = list.findIndex(s => s.id === id);
  if (idx < 0) { setStatus('Skin no encontrada.'); return; }
  const name = list[idx].name || id;
  if (!confirm('Eliminar skin "' + name + '"?')) return;
  list.splice(idx, 1);
  saveSkinsLocal(list);
  const next = list[0] || null;
  selectedSkinId = next?.id || '';
  refreshSkinList();
  if (next) await selectSkinById(next.id, true);
  else { clearModel(); setStatus('Skin eliminada. No quedan skins.'); }
  await saveConfigJSON('character-skins.json', { skins: list }, 'Skin eliminada: ' + name);
};
$('btnNewSkin').onclick = () => {
  const id = 'skin_' + Date.now().toString(36);
  selectedSkinId = id;
  fillSkinForm({ id, name: 'Nueva skin', rarity: 'common', price: 0, currency: 'chapas', saleStart: null, saleEnd: null, battlePassGift: false, battlePassLevel: null, modelPath: $('skinModelPath').value || '/models/opennite/characters/100avatars/100Avatars_003_Jimmy.fbx', notes: '' });
  refreshSkinList();
  setStatus('Nueva skin: edita y pulsa Guardar skin.');
};

// --- keyboard shortcuts ---
window.addEventListener('keydown', (e) => {
  if (e.target.closest('input,textarea,select')) return;
  if (e.key === 'w' || e.key === 'W') $('toolMove').click();
  if (e.key === 'e' || e.key === 'E') $('toolRotate').click();
  if (e.key === 'r' || e.key === 'R') $('toolScale').click();
  if (e.key === 'Delete' || e.key === 'Backspace') deleteSelectedKey();
  if (e.key === ' ') { e.preventDefault(); $('btnPlay').click(); }
  if (e.key === 'k' || e.key === 'K') addKeyframeForSelected(currentTime);
});

// --- drop ---
const dropOverlay = $('dropOverlay');
$('viewportWrap').addEventListener('dragover', e=>{ e.preventDefault(); dropOverlay.style.display='flex'; });
$('viewportWrap').addEventListener('dragleave', ()=>{ dropOverlay.style.display='none'; });
$('viewportWrap').addEventListener('drop', async e=>{ e.preventDefault(); dropOverlay.style.display='none'; const f=e.dataTransfer?.files?.[0]; if(!f) return; const url=URL.createObjectURL(f); await loadModelFromURL(url,f.name); });

// --- animation loop ---
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (playing && currentClip) {
    currentTime += dt * speedFor(selectedAction, currentClip.name);
    if (currentTime > duration) currentTime = 0;
    applyClipAtTime(currentTime);
  }
  orbit.update();
  renderer.render(scene, camera);
}

async function init() {
  const saved = await loadConfigJSON('character-skins.json');
  if (saved?.skins?.length) saveSkinsLocal(saved.skins);
  ensureDefaultSkins();
  refreshSkinList();
  await loadAnimActions();
  await loadAnimSpeeds();
  resize(true);
  drawTimeline();
  Object.assign(window, { __ed: { get modelRoot(){ return modelRoot; }, get clips(){ return clips; }, get currentClip(){ return currentClip; }, camera, orbit, scene, THREE, loadModelFromURL, applyClipAtTime } });
  animate();
  const list = loadSkinsLocal();
  const defSkin = list.find(s => s.id === '100avatars_003_jimmy') || list.find(s => s.id === 'skin_default_male') || list[0];
  if (defSkin) {
    selectedSkinId = defSkin.id;
    fillSkinForm(defSkin);
    refreshSkinList();
    $('gameCharSelect').value = defSkin.id;
    if (defSkin.modelPath) {
      setStatus(`Cargando personaje por defecto: ${defSkin.name || defSkin.id}...`);
      try {
        await loadModelFromURL(defSkin.modelPath, defSkin.name || defSkin.id);
        if (modelRoot) setStatus(`Listo. Personaje cargado: ${defSkin.name || defSkin.id}. ${clips.length} animaciones.`);
      } catch (e) {
        console.error('[editor] auto-load failed', e);
        setStatus('Error cargando: ' + (e?.message || e));
      }
    } else {
      setStatus('Editor listo. Selecciona un modelo para la skin.');
    }
  } else {
    setStatus('Editor de personajes listo.');
  }
}
init();