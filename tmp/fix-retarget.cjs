const fs=require('fs');
const f='src/game/ubc-character.js';
let s=fs.readFileSync(f,'utf8');

const old=`    // Animaciones extra (FBX, típicamente Mixamo) retargeteadas al esqueleto UBC.
    const MIXAMO_TO_UBC = {
      Hips: 'pelvis',
      Spine: 'spine_01',
      Spine1: 'spine_02',
      Spine2: 'spine_03',
      Neck: 'neck_01',
      Head: 'Head',
      LeftShoulder: 'clavicle_l',
      RightShoulder: 'clavicle_r',
      LeftArm: 'upperarm_l',
      RightArm: 'upperarm_r',
      LeftForeArm: 'lowerarm_l',
      RightForeArm: 'lowerarm_r',
      LeftHand: 'hand_l',
      RightHand: 'hand_r',
      LeftUpLeg: 'thigh_l',
      RightUpLeg: 'thigh_r',
      LeftLeg: 'calf_l',
      RightLeg: 'calf_r',
      LeftFoot: 'foot_l',
      RightFoot: 'foot_r',
      LeftToeBase: 'ball_l',
      RightToeBase: 'ball_r',
      LeftToe_End: 'ball_leaf_l',
      RightToe_End: 'ball_leaf_r',
      LeftHandThumb1: 'thumb_01_l',
      LeftHandThumb2: 'thumb_02_l',
      LeftHandThumb3: 'thumb_03_l',
      LeftHandIndex1: 'index_01_l',
      LeftHandIndex2: 'index_02_l',
      LeftHandIndex3: 'index_03_l',
      LeftHandMiddle1: 'middle_01_l',
      LeftHandMiddle2: 'middle_02_l',
      LeftHandMiddle3: 'middle_03_l',
      LeftHandRing1: 'ring_01_l',
      LeftHandRing2: 'ring_02_l',
      LeftHandRing3: 'ring_03_l',
      LeftHandPinky1: 'pinky_01_l',
      LeftHandPinky2: 'pinky_02_l',
      LeftHandPinky3: 'pinky_03_l',
      RightHandThumb1: 'thumb_01_r',
      RightHandThumb2: 'thumb_02_r',
      RightHandThumb3: 'thumb_03_r',
      RightHandIndex1: 'index_01_r',
      RightHandIndex2: 'index_02_r',
      RightHandIndex3: 'index_03_r',
      RightHandMiddle1: 'middle_01_r',
      RightHandMiddle2: 'middle_02_r',
      RightHandMiddle3: 'middle_03_r',
      RightHandRing1: 'ring_01_r',
      RightHandRing2: 'ring_02_r',
      RightHandRing3: 'ring_03_r',
      RightHandPinky1: 'pinky_01_r',
      RightHandPinky2: 'pinky_02_r',
      RightHandPinky3: 'pinky_03_r',
    };
    const normalizeMixamoName = (name) => String(name || '').replace(/^mixamorig\\d*:/i, '').replace(/^mixamorig/i, '');
    const remapMixamoClip = (clip) => {
      const tracks = [];
      for (const t of clip.tracks) {
        const dot = t.name.indexOf('.');
        if (dot < 0) continue;
        const bone = t.name.slice(0, dot);
        const prop = t.name.slice(dot);
        const base = normalizeMixamoName(bone);
        const mapped = MIXAMO_TO_UBC[base];
        if (!mapped) continue;
        // Solo rotación/cuaternión/escala; posición solo en cadera se ignora para evitar root motion raro.
        if (prop.startsWith('.position') && mapped !== 'pelvis') continue;
        if (prop.startsWith('.position') && mapped === 'pelvis') continue;
        const nt = t.clone();
        nt.name = mapped + prop;
        tracks.push(nt);
      }
      return new THREE.AnimationClip(clip.name, clip.duration, tracks);
    };

    const extraAnims = [
      { file: 'extra-anim/Falling.fbx', name: 'Extra_Falling', loop: true },
      { file: 'extra-anim/FallingToRoll.fbx', name: 'Extra_FallingToRoll', loop: false },
      { file: 'extra-anim/slide.fbx', name: 'Extra_Slide', loop: true },
      { file: 'extra-anim/JumpWindow.fbx', name: 'Extra_JumpWindow', loop: false },
      { file: 'extra-anim/ClimbWall.fbx', name: 'Extra_ClimbWall', loop: false },
    ];
    await Promise.all(extraAnims.map(async ({ file, name }) => {
      try {
        const fbx = await getFbx(\`\${base}\${file}\`);
        const srcClip = fbx.animations?.[0];
        if (!srcClip) return;
        const remapped = remapMixamoClip(srcClip);
        remapped.name = name;
        if (remapped.tracks.length) clips.set(name, remapped);
      } catch (err) {
        console.warn('[ubc] No se pudo cargar animación extra', file, err);
      }
    }));`;

const neu=`    // Animaciones extra (FBX, típicamente Mixamo) retargeteadas al esqueleto UBC.
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
    const normalizeMixamoName = (name) => String(name || '').replace(/^mixamorig\\d*:/i, '').replace(/^mixamorig/i, '');
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
        const fbx = await getFbx(\`\${base}\${file}\`);
        const srcClip = fbx.animations?.[0];
        if (!srcClip) return;
        const names = buildSourceNameMap(fbx);
        // Retarget con mapeo de nombres Mixamo->UBC (preserva rest pose correctamente).
        const retargeted = SkeletonUtils.retargetClip(targetRoot, fbx, srcClip, {
          hip: 'pelvis',
          names,
          getBoneName: (bone) => names[bone.name] || names[normalizeMixamoName(bone.name)] || '',
          preservePosition: false,
          useFirstFramePosition: false,
        });
        retargeted.name = name;
        if (retargeted.tracks.length) clips.set(name, retargeted);
      } catch (err) {
        console.warn('[ubc] No se pudo cargar animación extra', file, err);
      }
    }));`;

if(!s.includes(old)){ console.error('not found'); process.exit(1); }
fs.writeFileSync(f,s.replace(old,neu));
console.log('ok');