import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { getCartoonGradient } from '../core/cartoon.mjs';

/**
 * Personajes Quaternius Universal Base Characters (CC0) + Universal Animation
 * Library (CC0). Ambos packs comparten exactamente el mismo rig de 65 huesos,
 * así que los clips se aplican directamente sobre el esqueleto del modelo sin
 * retargeting. Mantiene la misma interfaz que kit-character.js para que el
 * motor no tenga que saber qué pack está usando.
 */

const BODY_HEIGHT = 1.82; // alto real del GLB en sus propias unidades

let kitPromise = null;
let sharedJimmyAnimsPromise = null;
let sharedExtraMixamoPromise = null;
let sharedNewMixamoPromise = null;

// New Mixamo anim set (user-provided). File name -> clip names it provides.
const NEW_MIXAMO_ANIMS = [
  { file: '/models/opennite/characters/100avatars/anims/Jimmy.fbx', names: ['Idle_Loop'] },
  { file: '/models/opennite/characters/100avatars/anims/Idle Happy.fbx', names: ['Idle_Happy'] },
  { file: '/models/opennite/characters/100avatars/anims/Idle Sad.fbx', names: ['Idle_Sad'] },
  { file: '/models/opennite/characters/100avatars/anims/Walking.fbx', names: ['Walk_Loop'] },
  { file: '/models/opennite/characters/100avatars/anims/Running.fbx', names: ['Jog_Fwd_Loop'] },
  { file: '/models/opennite/characters/100avatars/anims/Pistol Run.fbx', names: ['Sprint_Loop'] },
  { file: '/models/opennite/characters/100avatars/anims/Crouched Walking.fbx', names: ['Crouch_Fwd_Loop'] },
  { file: '/models/opennite/characters/100avatars/anims/Jump Forward Aiming.fbx', names: ['Jump_Loop', 'Jump_Start'] },
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

async function loadSharedJimmyAnims() {
  if (sharedJimmyAnimsPromise) return sharedJimmyAnimsPromise;
  sharedJimmyAnimsPromise = (async () => {
    try {
      const loader = new FBXLoader();
      const fbx = await new Promise((res, rej) => loader.load('/models/opennite/characters/100avatars/100Avatars_003_Jimmy.fbx', res, undefined, rej));
      const clips = (fbx.animations || []).filter(c => c?.tracks?.length);
      console.info('[ubc] Shared Jimmy anims loaded', clips.length);
      return clips;
    } catch (e) {
      console.warn('[ubc] Shared Jimmy anims failed', e);
      return [];
    }
  })();
  return sharedJimmyAnimsPromise;
}

async function loadSharedExtraMixamoAnims() {
  if (sharedExtraMixamoPromise) return sharedExtraMixamoPromise;
  sharedExtraMixamoPromise = (async () => {
    const files = [
      { file: '/models/opennite/ubc/extra-anim/Falling.fbx', name: 'Extra_Falling' },
      { file: '/models/opennite/ubc/extra-anim/FallingToRoll.fbx', name: 'Extra_FallingToRoll' },
      { file: '/models/opennite/ubc/extra-anim/slide.fbx', name: 'Extra_Slide' },
      { file: '/models/opennite/ubc/extra-anim/JumpWindow.fbx', name: 'Extra_JumpWindow' },
      { file: '/models/opennite/ubc/extra-anim/ClimbWall.fbx', name: 'Extra_ClimbWall' },
    ];
    const loader = new FBXLoader();
    const out = [];
    await Promise.all(files.map(async ({ file, name }) => {
      try {
        const fbx = await new Promise((res, rej) => loader.load(file, res, undefined, rej));
        const clip = fbx.animations?.[0];
        if (clip) { clip.name = name; out.push({ name, clip, fbx }); }
      } catch (e) { console.warn('[ubc] extra mixamo load failed', name, e); }
    }));
    console.info('[ubc] Shared extra Mixamo anims loaded', out.length);
    return out;
  })();
  return sharedExtraMixamoPromise;
}

async function loadSharedNewMixamoAnims() {
  if (sharedNewMixamoPromise) return sharedNewMixamoPromise;
  sharedNewMixamoPromise = (async () => {
    const loader = new FBXLoader();
    const out = [];
    await Promise.all(NEW_MIXAMO_ANIMS.map(async ({ file, names }) => {
      try {
        const fbx = await new Promise((res, rej) => loader.load(file, res, undefined, rej));
        const src = (fbx.animations || []).find(c => c?.tracks?.length) || fbx.animations?.[0];
        if (!src) return;
        for (const name of names) {
          const clip = src.clone();
          clip.name = name;
          out.push({ name, clip, fbx });
        }
      } catch (e) { console.warn('[ubc] new mixamo anim failed', file, e); }
    }));
    console.info('[ubc] New Mixamo anims loaded', out.length);
    return out;
  })();
  return sharedNewMixamoPromise;
}

/** Carga del pack de personajes UBC/UAL. `base` permite servir desde fuera de dist/ (tools/editor). */
export function loadUbcKit(base = './models/opennite/ubc/') {
  if (kitPromise) return kitPromise;
  kitPromise = (async () => {
    const loader = new GLTFLoader();
    const fbxLoader = new FBXLoader();
    const urls = {
      male: `${base}Superhero_Male_FullBody.gltf`,
      female: `${base}Superhero_Female_FullBody.gltf`,
      animations: `${base}UAL1_Standard.glb`,
    };
    const cache = new Map();
    const get = (url) => {
      if (!cache.has(url)) cache.set(url, loader.loadAsync(url));
      return cache.get(url);
    };
    const getFbx = (url) => {
      if (!cache.has(url)) cache.set(url, fbxLoader.loadAsync(url));
      return cache.get(url);
    };
    const [male, female, anim] = await Promise.all([
      get(urls.male), get(urls.female), get(urls.animations),
    ]);
    const clips = new Map();
    for (const clip of anim.animations) clips.set(clip.name, clip);

    // Animaciones extra (FBX, típicamente Mixamo) retargeteadas al esqueleto UBC.
    const MIXAMO_TO_UBC = {
      Hips: 'pelvis', Spine: 'spine_01', Spine1: 'spine_02', Spine2: 'spine_03',
      Neck: 'neck_01', Head: 'Head',
      LeftShoulder: 'clavicle_l', RightShoulder: 'clavicle_r',
      LeftArm: 'upperarm_l', RightArm: 'upperarm_r',
      LeftForeArm: 'lowerarm_l', RightForeArm: 'lowerarm_r',
      LeftHand: 'hand_l', RightHand: 'hand_r',
      LeftUpLeg: 'thigh_l', RightUpLeg: 'thigh_r',
      LeftLeg: 'calf_l', RightLeg: 'calf_r',
      LeftFoot: 'foot_l', RightFoot: 'foot_r',
      LeftToeBase: 'ball_l', RightToeBase: 'ball_r',
      LeftToe_End: 'ball_leaf_l', RightToe_End: 'ball_leaf_r',
      LeftHandThumb1: 'thumb_01_l', LeftHandThumb2: 'thumb_02_l', LeftHandThumb3: 'thumb_03_l',
      LeftHandIndex1: 'index_01_l', LeftHandIndex2: 'index_02_l', LeftHandIndex3: 'index_03_l',
      LeftHandMiddle1: 'middle_01_l', LeftHandMiddle2: 'middle_02_l', LeftHandMiddle3: 'middle_03_l',
      LeftHandRing1: 'ring_01_l', LeftHandRing2: 'ring_02_l', LeftHandRing3: 'ring_03_l',
      LeftHandPinky1: 'pinky_01_l', LeftHandPinky2: 'pinky_02_l', LeftHandPinky3: 'pinky_03_l',
      RightHandThumb1: 'thumb_01_r', RightHandThumb2: 'thumb_02_r', RightHandThumb3: 'thumb_03_r',
      RightHandIndex1: 'index_01_r', RightHandIndex2: 'index_02_r', RightHandIndex3: 'index_03_r',
      RightHandMiddle1: 'middle_01_r', RightHandMiddle2: 'middle_02_r', RightHandMiddle3: 'middle_03_r',
      RightHandRing1: 'ring_01_r', RightHandRing2: 'ring_02_r', RightHandRing3: 'ring_03_r',
      RightHandPinky1: 'pinky_01_r', RightHandPinky2: 'pinky_02_r', RightHandPinky3: 'pinky_03_r',
    };
    const normalizeMixamoName = (name) => String(name || '').replace(/^mixamorig\d*:?/i, '');
    const buildSourceNameMap = (fbx) => {
      const byNorm = new Map();
      fbx.traverse((obj) => {
        if (obj.isBone) byNorm.set(normalizeMixamoName(obj.name), obj.name);
      });
      const map = {};
      for (const [mixamo, ubcName] of Object.entries(MIXAMO_TO_UBC)) {
        const src = byNorm.get(mixamo);
        if (src) map[ubcName] = src;
      }
      return map;
    };

    const extraAnims = [
      { file: 'extra-anim/Falling.fbx', name: 'Extra_Falling' },
      { file: 'extra-anim/FallingToRoll.fbx', name: 'Extra_FallingToRoll' },
      { file: 'extra-anim/slide.fbx', name: 'Extra_Slide' },
      { file: 'extra-anim/JumpWindow.fbx', name: 'Extra_JumpWindow' },
      { file: 'extra-anim/ClimbWall.fbx', name: 'Extra_ClimbWall' },
    ];
    const targetRoot = male.scene;
    await Promise.all(extraAnims.map(async ({ file, name }) => {
      try {
        const fbx = await getFbx(`${base}${file}`);
        const srcClip = fbx.animations?.[0];
        if (!srcClip) return;
        const names = buildSourceNameMap(fbx);
        const sourceHip = names['pelvis'] || 'Hips';
        const targetSkin = targetRoot.getObjectByProperty('isSkinnedMesh', true);
        let sourceSkin = fbx.getObjectByProperty('isSkinnedMesh', true);
        if (!sourceSkin?.skeleton) {
          const bones = [];
          fbx.traverse((o) => { if (o.isBone) bones.push(o); });
          if (bones.length) {
            sourceSkin = fbx;
            sourceSkin.skeleton = new THREE.Skeleton(bones);
          }
        }
        if (!targetSkin?.skeleton || !sourceSkin?.skeleton) {
          console.warn('[ubc] Extra anim missing skeleton', name, !!targetSkin?.skeleton, !!sourceSkin?.skeleton);
          return;
        }
        // Save/restore target pose - retargetClip mutates target bones in place
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
        if (retargeted.tracks.length) {
          retargeted.tracks = retargeted.tracks.filter(t => { if(!t.name.endsWith('.position')) return true; const n=t.name.slice(0,-9).replace(/^mixamorig\d*:?/i,'').toLowerCase(); return !(n==='hips'||n==='pelvis'); });
          clips.set(name, retargeted);
          console.info('[ubc] Extra anim loaded', name, retargeted.tracks.length, 'tracks');
        } else {
          console.warn('[ubc] Extra anim has 0 tracks', name, file);
        }
      } catch (err) {
        console.warn('[ubc] No se pudo cargar animación extra', file, err);
      }
    }));

    return { urls, get, clips, male, female, ual: anim };
  })().catch((error) => {
    kitPromise = null;
    throw error;
  });
  return kitPromise;
}

const isFemale = (options = {}) => {
  if (typeof options.gender === 'string') return /femin|female|mujer/i.test(options.gender);
  if (Number.isInteger(options.presetIndex)) return options.presetIndex % 2 === 1;
  return /femin|female|mujer/i.test(String(options.preset || ''));
};

const sanitize = (name) => String(name).replace(/[\s.:\-[\]]/g, '').toLowerCase();

export class Character {
  static async create(kit, options = {}) {
    const self = new Character(kit, options);
    await self.init();
    return self;
  }

  constructor(kit, options = {}) {
    this.kit = kit;
    this.options = options;
    this.female = isFemale(options);
    this.holder = new THREE.Group();
    this.bones = new Map();
    this._materials = new Map();
    this._clipCache = new Map();
    this._current = null;
    this._currentName = '';
    this.baseHeight = BODY_HEIGHT;
  }

  async init() {
    if (this.options.mixamoTest) return this._initMixamoTest();
    const modelPath = this.options.modelPath;
    if (modelPath) {
      await this._initCustomModel(modelPath);
      return;
    }
    const source = this.female ? this.kit.female : this.kit.male;
    this.root = SkeletonUtils.clone(source.scene);
    this.root.updateMatrixWorld(true);
    this.holder.add(this.root);

    this.root.traverse((obj) => {
      if (obj.isBone) {
        this.bones.set(obj.name, obj);
        this.bones.set(sanitize(obj.name), obj);
      }
      if (!obj.isMesh) return;
      obj.frustumCulled = false;
      obj.castShadow = true;
      obj.receiveShadow = true;
      obj.material = this._own(obj.material, obj.name);
    });

    const box = new THREE.Box3().setFromObject(this.root);
    if (box && Number.isFinite(box.max.y - box.min.y) && box.max.y - box.min.y > 0.1) {
      this.baseHeight = box.max.y - box.min.y;
    }
    this.mixer = new THREE.AnimationMixer(this.root);
    this.setHeight(1.78);
    if (this.options.color) this.setBodyColor(this.options.color);
  }

  async _initCustomModel(modelPath) {
    const lower = String(modelPath).toLowerCase();
    const isFbx = lower.endsWith('.fbx');
    let obj;
    if (isFbx) {
      const loader = new FBXLoader();
      obj = await new Promise((res, rej) => loader.load(modelPath, res, undefined, rej));
    } else {
      const loader = new GLTFLoader();
      const gltf = await new Promise((res, rej) => loader.load(modelPath, res, undefined, rej));
      obj = gltf.scene || gltf.scenes?.[0];
    }
    // Capture any embedded animations before replacing root
    const embeddedClips = [...(obj.animations || []), ...(isFbx ? [] : [])];
    this.root = obj;
    this.root.updateMatrixWorld(true);
    this.holder.add(this.root);
    this.root.traverse((obj) => {
      if (obj.isBone) {
        this.bones.set(obj.name, obj);
        this.bones.set(sanitize(obj.name), obj);
      }
      if (!obj.isMesh) return;
      obj.frustumCulled = false;
      obj.castShadow = true;
      obj.receiveShadow = true;
      obj.material = this._own(obj.material, obj.name);
    });
    const box = new THREE.Box3().setFromObject(this.root);
    let bh = (box && Number.isFinite(box.max.y - box.min.y)) ? (box.max.y - box.min.y) : 1.8;
    if (bh > 10) { this.root.scale.setScalar(0.01); this.root.updateMatrixWorld(true); bh *= 0.01; }
    if (bh > 0.1) this.baseHeight = bh;
    this.mixer = new THREE.AnimationMixer(this.root);
    this._customModel = true;
    this._remappedClips = new Map();
    this._overrideClips = new Map();
    // Shared Jimmy animations for all 100Avatars skins
    await this._loadSharedJimmyAnims();
    if (embeddedClips.length) this._remapClipsToSelf(embeddedClips, 'Embedded_');
    await this._remapKitAnimsForCustom(); // includes _loadAnimOverrides()
    this.setHeight(1.78);
    if (this.options.color) this.setBodyColor(this.options.color);
  }

  async _remapKitAnimsForCustom() {
    try {
      if (!this.kit) return;
      if (!this._remappedClips) this._remappedClips = new Map();
      const targetSkin = this.root?.getObjectByProperty?.('isSkinnedMesh', true);
      const ualSource = this.kit.ual?.scene?.getObjectByProperty?.('isSkinnedMesh', true) || this.kit.ual?.scene;
      const ubcSource = this.kit.male?.scene?.getObjectByProperty?.('isSkinnedMesh', true) || this.kit.male?.scene;

      const normalizeMixamo = (n) => String(n || '').replace(/^mixamorig\d*:?/i, '');
      const byNorm = new Map();
      this.root?.traverse?.((o) => { if (o.isBone) byNorm.set(normalizeMixamo(o.name), o.name); });
      const MIXAMO_TO_UBC = {
        Hips:'pelvis',Spine:'spine_01',Spine1:'spine_02',Spine2:'spine_03',Neck:'neck_01',Head:'Head',
        LeftShoulder:'clavicle_l',RightShoulder:'clavicle_r',LeftArm:'upperarm_l',RightArm:'upperarm_r',
        LeftForeArm:'lowerarm_l',RightForeArm:'lowerarm_r',LeftHand:'hand_l',RightHand:'hand_r',
        LeftUpLeg:'thigh_l',RightUpLeg:'thigh_r',LeftLeg:'calf_l',RightLeg:'calf_r',
        LeftFoot:'foot_l',RightFoot:'foot_r',LeftToeBase:'ball_l',RightToeBase:'ball_r',
        LeftHandThumb1:'thumb_01_l',LeftHandThumb2:'thumb_02_l',LeftHandThumb3:'thumb_03_l',
        LeftHandIndex1:'index_01_l',LeftHandIndex2:'index_02_l',LeftHandIndex3:'index_03_l',
        LeftHandMiddle1:'middle_01_l',LeftHandMiddle2:'middle_02_l',LeftHandMiddle3:'middle_03_l',
        LeftHandRing1:'ring_01_l',LeftHandRing2:'ring_02_l',LeftHandRing3:'ring_03_l',
        LeftHandPinky1:'pinky_01_l',LeftHandPinky2:'pinky_02_l',LeftHandPinky3:'pinky_03_l',
        RightHandThumb1:'thumb_01_r',RightHandThumb2:'thumb_02_r',RightHandThumb3:'thumb_03_r',
        RightHandIndex1:'index_01_r',RightHandIndex2:'index_02_r',RightHandIndex3:'index_03_r',
        RightHandMiddle1:'middle_01_r',RightHandMiddle2:'middle_02_r',RightHandMiddle3:'middle_03_r',
        RightHandRing1:'ring_01_r',RightHandRing2:'ring_02_r',RightHandRing3:'ring_03_r',
        RightHandPinky1:'pinky_01_r',RightHandPinky2:'pinky_02_r',RightHandPinky3:'pinky_03_r',
      };
      const targetToUalSource = {};
      for (const [mixamo, ubc] of Object.entries(MIXAMO_TO_UBC)) {
        const targetName = byNorm.get(mixamo);
        if (targetName) targetToUalSource[targetName] = ubc;
      }

      const hipName = byNorm.get('Hips') || 'Hips';
      const stripRootPos = (clip) => {
        if (!clip) return clip;
        clip.tracks = clip.tracks.filter(t => {
          if (!t.name.endsWith('.position')) return true;
          const bone = t.name.slice(0, -9);
          const n = bone.replace(/^mixamorig\d*:?/i, '').toLowerCase();
          return !(n === 'hips' || n === 'pelvis' || bone === hipName);
        });
        return clip;
      };
      const retarget = (clip, sourceSkin, nameMap) => {
        if (!clip?.tracks?.length || !targetSkin?.skeleton || !sourceSkin?.skeleton) return null;
        try {
          const saved = targetSkin.skeleton.bones.map((b) => ({ p: b.position.clone(), q: b.quaternion.clone(), s: b.scale.clone() }));
          const out = SkeletonUtils.retargetClip(targetSkin, sourceSkin, clip, { hip: hipName, names: nameMap, preservePosition: false, useFirstFramePosition: false });
          targetSkin.skeleton.bones.forEach((b, i) => { const sv = saved[i]; if (sv) { b.position.copy(sv.p); b.quaternion.copy(sv.q); b.scale.copy(sv.s); } });
          targetSkin.updateMatrixWorld(true);
          if (out?.tracks?.length) { out.name = clip.name; return stripRootPos(out); }
        } catch (e) { /* fallback */ }
        return null;
      };

      const simpleRemap = (clip) => {
        const tracks = [];
        for (const t of clip.tracks) {
          const m = t.name.match(/^(.+)\.(position|quaternion|scale)$/);
          if (!m) continue;
          const [, boneName, prop] = m;
          const norm = boneName.replace(/^mixamorig\d*:?/i, '');
          const candidates = [
            boneName, sanitize(boneName), norm,
            'mixamorig' + norm, 'mixamorig1:' + norm, 'mixamorig:' + norm,
            boneName.replace(/^mixamorig:?/i, ''),
          ];
          let targetName = null;
          for (const c of candidates) { const b = this.bones.get(c); if (b) { targetName = b.name || c; break; } }
          if (!targetName) {
            const sn = sanitize(boneName);
            for (const [k, v] of this.bones) { if (sanitize(k) === sn || sanitize(k) === 'mixamorig' + sanitize(norm)) { targetName = v.name; break; } }
          }
          if (!targetName) continue;
          const track = t.clone();
          track.name = `${targetName}.${prop}`;
          tracks.push(track);
        }
        const out = tracks.length ? new THREE.AnimationClip(clip.name, clip.duration, tracks) : null;
        return stripRootPos(out);
      };

      const sameMixamoFamily = (clip) => {
        let match = 0, total = 0;
        for (const t of clip.tracks || []) {
          const m = t.name.match(/^(.+)\.(position|quaternion|scale)$/);
          if (!m) continue; total++;
          const norm = m[1].replace(/^mixamorig\d*:?/i, '');
          if (byNorm.has(norm)) match++;
        }
        return total > 0 && (match / total) > 0.6;
      };

      const trySet = (name, clip, sourceSkin = ualSource) => {
        if (!clip || this._remappedClips.has(name)) return;
        let r = null;
        if (sameMixamoFamily(clip)) {
          // Same Mixamo rig: direct remap is most reliable (same bone names/rest pose)
          r = simpleRemap(clip);
          if (!r) r = retarget(clip, sourceSkin, targetToUalSource);
        } else {
          r = retarget(clip, sourceSkin, targetToUalSource);
          if (!r) r = simpleRemap(clip);
        }
        if (r) { r.name = name; this._remappedClips.set(name, r); }
      };

      // New Mixamo anims: primary source for 100Avatars/custom Mixamo rigs
      try {
        const newAnims = await loadSharedNewMixamoAnims();
        for (const { name, clip, fbx } of newAnims) {
          let srcSkin = fbx?.getObjectByProperty?.('isSkinnedMesh', true);
          if (!srcSkin?.skeleton && fbx) {
            const bones = []; fbx.traverse((o) => { if (o.isBone) bones.push(o); });
            if (bones.length) {
              srcSkin = fbx; srcSkin.skeleton = new THREE.Skeleton(bones);
              try { srcSkin.skeleton.calculateInverses(); } catch {}
              try { srcSkin.updateMatrixWorld(true); } catch {}
            }
          }
          const srcByNorm = new Map();
          fbx?.traverse?.((o) => { if (o.isBone) srcByNorm.set(normalizeMixamo(o.name), o.name); });
          const mmNames = {};
          for (const [norm, targetName] of byNorm.entries()) { const srcName = srcByNorm.get(norm); if (srcName) mmNames[targetName] = srcName; }
          let r = null;
          if (sameMixamoFamily(clip)) { r = simpleRemap(clip); if (!r) r = retarget(clip, srcSkin, mmNames); }
          else { r = retarget(clip, srcSkin, mmNames); if (!r) r = simpleRemap(clip); }
          if (r) { r.name = name; this._remappedClips.set(name, r); }
        }
      } catch (e) { console.warn('[ubc] new mixamo anims failed', e); }

      // UAL fallback only for missing keys (avoid deformed cross-rig when new anim exists)
      for (const [k, clip] of (this.kit.clips || new Map())) {
        if (clip?.tracks) trySet(k, clip, ualSource || ubcSource);
      }
      await this._loadAnimOverrides();
    } catch (e) { console.warn('[ubc] remap custom anims failed', e); }
  }

  async _loadAnimOverrides() {
    try {
      let overrides = null;
      for (const url of ['/config/anim-overrides.json', '/models/opennite/characters/100avatars/anims/overrides/anim-overrides.json']) {
        try { const r = await fetch(url, { cache: 'no-store' }); if (r.ok) { overrides = await r.json(); break; } } catch {}
      }
      if (!overrides || typeof overrides !== 'object') { console.info('[ubc] no anim overrides'); return; }
      if (!this._overrideClips) this._overrideClips = new Map();
      for (const [name, clipUrl] of Object.entries(overrides)) {
        try {
          const r = await fetch(clipUrl, { cache: 'no-store' });
          if (!r.ok) continue;
          const data = await r.json();
          const clip = THREE.AnimationClip.parse(data);
          if (!clip?.tracks?.length) continue;
          clip.name = name;
          if (!this._remappedClips) this._remappedClips = new Map();
          this._remappedClips.set(name, clip);
          this._overrideClips.set(name, clip);
          if (this._mixamoClips) this._mixamoClips.delete(name);
          if (this._clipCache) this._clipCache.delete(name);
          console.info('[ubc] anim override applied', name);
        } catch (e) { console.warn('[ubc] anim override failed', name, e); }
      }
    } catch (e) { console.warn('[ubc] anim overrides failed', e); }
  }

  _remapClipsToSelf(clips, prefix = '') {
    if (!this._remappedClips) this._remappedClips = new Map();
    const norm = (n) => String(n || '').toLowerCase().replace(/^armature\|/,'').replace(/^mixamo\.com\|?/,'').replace(/[^a-z0-9]+/g,' ').trim();
    const aliasToUbc = (name, clip) => {
      const n = norm(name);
      const map = [
        [/idle|standing/, 'Idle_Loop'], [/walk/, 'Walk_Loop'], [/jog|run slow/, 'Jog_Fwd_Loop'], [/sprint|run fast|run/, 'Sprint_Loop'],
        [/jump start|jump up/, 'Jump_Start'], [/jump loop|falling|jump/, 'Jump_Loop'], [/land/, 'Jump_Land'],
        [/dance/, 'Dance_Loop'], [/punch|attack/, 'Punch_Jab'], [/wave|talk/, 'Idle_Talking_Loop'],
        [/sit/, 'Sitting_Idle_Loop'], [/stand up/, 'Sitting_Exit'], [/hit|impact/, 'Hit_Chest'], [/death|dying/, 'Death01'],
        [/pick/, 'PickUp_Table'], [/crouch/, 'Crouch_Idle_Loop'], [/aim/, 'Pistol_Aim_Neutral'], [/shoot|fire/, 'Pistol_Shoot'],
        [/reload/, 'Pistol_Reload'], [/roll|dodge/, 'Roll'], [/swim/, 'Swim_Idle_Loop'], [/climb/, 'Extra_ClimbWall'],
        [/slide/, 'Extra_Slide'], [/vault|window/, 'Extra_JumpWindow']
      ];
      for (const [re, ubcName] of map) {
        if (re.test(n) && !this._remappedClips.has(ubcName)) this._remappedClips.set(ubcName, clip);
      }
    };
    for (const clip of (clips || [])) {
      if (!clip?.tracks?.length) continue;
      const tracks = [];
      for (const t of clip.tracks) {
        const m = t.name.match(/^(.+)\.(position|quaternion|scale)$/);
        if (!m) continue;
        const [, boneName, prop] = m;
        const candidates = [boneName, sanitize(boneName), boneName.replace(/^mixamorig\d*:?/i, ''), boneName.replace(/^mixamorig:?/i, '')];
        let target = null;
        for (const c of candidates) { if (this.bones.has(c)) { target = c; break; } }
        if (!target) continue;
        const tr = t.clone();
        tr.name = `${target}.${prop}`;
        tracks.push(tr);
      }
      if (tracks.length) {
        const name = prefix + (clip.name || 'clip');
        const out = new THREE.AnimationClip(name, clip.duration, tracks);
        this._remappedClips.set(name, out);
        aliasToUbc(name, out);
      }
    }
  }

  async _loadSharedJimmyAnims() {
    try {
      const clips = await loadSharedJimmyAnims();
      if (clips?.length) this._remapClipsToSelf(clips, '');
    } catch (e) { console.warn('[ubc] shared jimmy anims remap failed', e); }
  }

  async _initMixamoTest() {
    const loader = new FBXLoader();
    const fbx = await new Promise((res, rej) => loader.load('/models/opennite/ubc/mixamo-test.fbx', res, undefined, rej));
    this.root = fbx;
    this.root.updateMatrixWorld(true);
    this.holder.add(this.root);
    this._mixamoClips = new Map();
    this._mixamoTest = true;
    this.root.traverse((obj) => {
      if (obj.isBone) {
        this.bones.set(obj.name, obj);
        this.bones.set(sanitize(obj.name), obj);
      }
      if (!obj.isMesh) return;
      obj.frustumCulled = false;
      obj.castShadow = true;
      obj.receiveShadow = true;
      obj.material = this._own(obj.material, obj.name);
    });
    const box = new THREE.Box3().setFromObject(this.root);
    let h = (box && Number.isFinite(box.max.y - box.min.y)) ? (box.max.y - box.min.y) : 1.8;
    if (h > 10) { this.root.scale.setScalar(0.01); this.root.updateMatrixWorld(true); h *= 0.01; }
    this.baseHeight = h > 0.1 ? h : 1.8;
    this.mixer = new THREE.AnimationMixer(this.root);
    this.setHeight(1.78);
    let meshCount = 0; this.root.traverse(o => { if (o.isMesh) meshCount++; });
    console.info('[mixamo-test] ready meshes', meshCount, 'height', this.baseHeight, 'scale', this.root.scale.toArray());

    // Use embedded anims as fallback idle/walk
    if (fbx.animations?.length) {
      for (const a of fbx.animations) { a.name = a.name || 'mixamo_embedded'; this._mixamoClips.set(a.name, a); }
      const idle = fbx.animations[0];
      ['Idle_Loop','Walk_Loop','Jog_Fwd_Loop','Sprint_Loop','Jump_Loop','Jump_Start','Jump_Land','Pistol_Idle_Loop'].forEach(n => this._mixamoClips.set(n, idle));
      console.info('[mixamo-test] embedded anims', fbx.animations.map(a=>a.name));
    }

    // Load Mixamo extra anims directly (no retarget)
    const extra = [
      { file: '/models/opennite/ubc/extra-anim/Falling.fbx', name: 'Extra_Falling' },
      { file: '/models/opennite/ubc/extra-anim/FallingToRoll.fbx', name: 'Extra_FallingToRoll' },
      { file: '/models/opennite/ubc/extra-anim/slide.fbx', name: 'Extra_Slide' },
      { file: '/models/opennite/ubc/extra-anim/JumpWindow.fbx', name: 'Extra_JumpWindow' },
      { file: '/models/opennite/ubc/extra-anim/ClimbWall.fbx', name: 'Extra_ClimbWall' },
    ];
    for (const { file, name } of extra) {
      try {
        const a = await new Promise((res, rej) => loader.load(file, res, undefined, rej));
        const clip = a.animations?.[0];
        if (clip) { clip.name = name; this._mixamoClips.set(name, clip); console.info('[mixamo-test] loaded', name, clip.tracks.length); }
      } catch (e) { console.warn('[mixamo-test] anim fail', name, e); }
    }
  }

  _own(material, meshName = '') {
    if (Array.isArray(material)) return material.map((m) => this._own(m, meshName));
    if (!material) return material;
    if (this._materials.has(material.uuid)) return this._materials.get(material.uuid);
    const src = material;
    const key = `${src.name || ''} ${meshName || ''}`.toLowerCase();
    const isEye = key.includes('eye');
    const baseColor = src.color ? src.color.clone() : new THREE.Color(0xffffff);
    if (!isEye) { const hsl = { h: 0, s: 0, l: 0 }; baseColor.getHSL(hsl); baseColor.setHSL(hsl.h, Math.min(1, hsl.s * 1.35 + 0.1), hsl.l); }
    const m = new THREE.MeshToonMaterial({
      color: baseColor,
      map: src.map || null,
      normalMap: src.normalMap || null,
      alphaMap: src.alphaMap || null,
      transparent: !!src.transparent,
      opacity: src.opacity ?? 1,
      side: src.side ?? THREE.FrontSide,
      gradientMap: isEye ? null : getCartoonGradient(),
    });
    if (isEye) { m.color.set(0xffffff); }
    m.name = src.name || '';
    m.userData.baseColor = m.color.clone();
    m.flatShading = false;
    m.needsUpdate = true;
    if (!isEye) { this.bodyMaterial = m; this.bodyBase = m.color.clone(); }
    this._materials.set(src.uuid, m);
    return m;
  }

  /** Teñimos solo el material del cuerpo; pelo y ojos conservan su aspecto. */
  setBodyColor(color, strength = 0.48) {
    if (!this.bodyMaterial || color === undefined || color === null) return;
    const tint = new THREE.Color(color);
    this.bodyMaterial.color.copy(this.bodyBase).lerp(tint, THREE.MathUtils.clamp(strength, 0, 1));
  }

  colorOf(key = 'shirt') {
    if (!['shirt', 'hat', 'pack', 'linen', 'body'].includes(key) || !this.bodyMaterial) return null;
    return `#${this.bodyMaterial.color.getHexString()}`;
  }

  setColor(key, hex) {
    if (!this.bodyMaterial) return;
    // El wrapper del juego llama con claves del kit antiguo; todas tiñen el cuerpo.
    if (hex === null || hex === undefined) this.bodyMaterial.color.copy(this.bodyBase);
    else this.setBodyColor(hex);
  }

  async apply(appearance = {}) {
    const color = appearance.color ?? appearance.colors?.shirt;
    if (color) this.setBodyColor(color);
    return this;
  }

  _trackBoneName(name) {
    const m = String(name || '').match(/\.bones\[([^\]]+)\]/);
    if (m) return m[1];
    return String(name || '').split('.')[0];
  }

  _mixamoTargetPrefix() {
    if (this._mxPrefix !== undefined) return this._mxPrefix;
    for (const k of this.bones.keys()) { const m = String(k).match(/^(mixamorig\d*:?)/i); if (m) { this._mxPrefix = m[1]; return this._mxPrefix; } }
    this._mxPrefix = '';
    return this._mxPrefix;
  }
  _remapMixamoBone(bone) {
    if (this.bones.has(bone)) return bone;
    const prefix = this._mixamoTargetPrefix();
    if (!prefix) return bone;
    const stripped = String(bone).replace(/^mixamorig\d*:?/i, '');
    const candidate = prefix + stripped;
    if (this.bones.has(candidate)) return candidate;
    // also try without colon variations
    const alt = prefix.replace(':','') + stripped;
    if (this.bones.has(alt)) return alt;
    return bone;
  }

  clipFor(name, entry) {
    let clip = this._clipCache.get(name);
    if (!clip) {
      const tracks = [];
      for (const t of entry.clip.tracks) {
        let bone = this._trackBoneName(t.name);
        if (this._mixamoTest) bone = this._remapMixamoBone(bone);
        if (!this.bones.has(bone)) continue;
        const prop = t.name.includes('.bones[') ? t.name.replace(/^.*\.bones\[[^\]]+\]\./, '') : t.name.split('.').slice(1).join('.');
        const trackName = prop ? `${bone}.${prop}` : bone;
        if (trackName === t.name) { tracks.push(t); continue; }
        const T = t.constructor;
        tracks.push(new T(trackName, t.times, t.values, t.getInterpolation ? t.getInterpolation() : undefined));
      }
      if (this._mixamoTest) console.info('[mixamo-test] clipFor', name, 'kept', tracks.length, '/', entry.clip.tracks.length, 'sample', entry.clip.tracks[0]?.name, 'remap->', this._remapMixamoBone(this._trackBoneName(entry.clip.tracks[0]?.name)));
      clip = new THREE.AnimationClip(name, entry.clip.duration, tracks);
      this._clipCache.set(name, clip);
    }
    return clip;
  }

  /** Reproduce un clip de UAL por nombre. once = se queda en el último fotograma. */
  async playClip(name, { fade = 0.2, once = false, speed = 1, restart = false } = {}) {
    const clip = this._overrideClips?.get(name) || this._mixamoClips?.get(name) || this._remappedClips?.get(name) || (this._mixamoTest ? null : (!this._customModel ? this.kit.clips.get(name) : null)) || (this._customModel ? this.kit.clips.get(name) : null) || (this._customModel ? this.clipFor(name) : null);
    if (!clip) {
      if (this._mixamoTest && !this._warnedMissing?.has(name)) { this._warnedMissing = this._warnedMissing || new Set(); this._warnedMissing.add(name); console.warn('[mixamo-test] missing clip', name); }
      return false;
    }
    if (this._currentName === name && this._current && !restart) {
      this._current.timeScale = speed;
      this._current.paused = false;
      return true;
    }
    const next = this.mixer.clipAction(this.clipFor(name, { clip }));
    next.reset();
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
    next.clampWhenFinished = once;
    next.timeScale = speed;
    next.paused = false;
    next.play();
    const prev = this._current;
    if (prev && prev !== next) {
      next.crossFadeFrom(prev, fade, false);
      // Si venimos de un seek/pose congelada (dive al agua), mantener el último fotograma durante el fade.
      if (prev.paused || prev.timeScale === 0) { prev.paused = false; prev.timeScale = 0.0001; }
    }
    this._current = next;
    this._currentName = name;
    return true;
  }

  async seekClip(name, t01, { fade = 0.12 } = {}) {
    const clip = this._overrideClips?.get(name) || this._mixamoClips?.get(name) || this._remappedClips?.get(name) || (this._mixamoTest ? null : (!this._customModel ? this.kit.clips.get(name) : null)) || (this._customModel ? this.kit.clips.get(name) : null) || (this._customModel ? this.clipFor(name) : null);
    if (!clip) return false;
    const next = this.mixer.clipAction(this.clipFor(name, { clip }));
    if (this._currentName !== name || this._current !== next) {
      next.reset();
      next.setLoop(THREE.LoopOnce, 1);
      next.clampWhenFinished = true;
      next.play();
      if (this._current && this._current !== next) next.crossFadeFrom(this._current, fade, false);
      this._current = next;
      this._currentName = name;
    }
    next.paused = true;
    next.timeScale = 0;
    next.time = Math.max(0, Math.min(0.999, t01)) * (clip.duration || 1);
    this.mixer.update(0);
    return true;
  }

  get playing() { return this._currentName; }

  update(dt) { this.mixer.update(dt); }

  /** Altura total en unidades del mundo. */
  setHeight(h) { this.holder.scale.setScalar(h / Math.max(0.1, this.baseHeight)); }

  dispose() {
    this.mixer?.stopAllAction();
    this.holder.removeFromParent();
    for (const m of this._materials.values()) m.dispose();
    this._materials.clear();
  }
}
