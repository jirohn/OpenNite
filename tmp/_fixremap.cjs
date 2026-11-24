const fs=require('fs');
const p='src/game/ubc-character.js';
let s=fs.readFileSync(p,'utf8');
const start=s.indexOf('  async _remapKitAnimsForCustom() {');
const end=s.indexOf('  _remapClipsToSelf(clips, prefix = \'\') {');
if(start<0||end<0||end<=start){ console.error('not found',start,end); process.exit(1); }
const neu = `  async _remapKitAnimsForCustom() {
    try {
      if (!this.kit) return;
      if (!this._remappedClips) this._remappedClips = new Map();
      const targetSkin = this.root?.getObjectByProperty?.('isSkinnedMesh', true);
      const ualSource = this.kit.ual?.scene?.getObjectByProperty?.('isSkinnedMesh', true) || this.kit.ual?.scene;
      const ubcSource = this.kit.male?.scene?.getObjectByProperty?.('isSkinnedMesh', true) || this.kit.male?.scene;

      const normalizeMixamo = (n) => String(n || '').replace(/^mixamorig\\d*:?/i, '');
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

      const retarget = (clip, sourceSkin, nameMap) => {
        if (!clip?.tracks?.length || !targetSkin?.skeleton || !sourceSkin?.skeleton) return null;
        try {
          const saved = targetSkin.skeleton.bones.map((b) => ({ p: b.position.clone(), q: b.quaternion.clone(), s: b.scale.clone() }));
          const out = SkeletonUtils.retargetClip(targetSkin, sourceSkin, clip, { hip: byNorm.get('Hips') || 'Hips', names: nameMap, preservePosition: false, useFirstFramePosition: false });
          targetSkin.skeleton.bones.forEach((b, i) => { const sv = saved[i]; if (sv) { b.position.copy(sv.p); b.quaternion.copy(sv.q); b.scale.copy(sv.s); } });
          targetSkin.updateMatrixWorld(true);
          if (out?.tracks?.length) { out.name = clip.name; return out; }
        } catch (e) { /* fallback */ }
        return null;
      };

      const simpleRemap = (clip) => {
        const tracks = [];
        for (const t of clip.tracks) {
          const m = t.name.match(/^(.+)\\.(position|quaternion|scale)$/);
          if (!m) continue;
          const [, boneName, prop] = m;
          const candidates = [boneName, sanitize(boneName), boneName.replace(/^mixamorig\\d*:?/i, ''), boneName.replace(/^mixamorig:?/i, '')];
          let target = null;
          for (const c of candidates) { if (this.bones.has(c)) { target = c; break; } }
          if (!target) continue;
          const track = t.clone();
          track.name = \`\${target}.\${prop}\`;
          tracks.push(track);
        }
        return tracks.length ? new THREE.AnimationClip(clip.name, clip.duration, tracks) : null;
      };

      const trySet = (name, clip, sourceSkin = ualSource) => {
        if (!clip || this._remappedClips.has(name)) return;
        let r = retarget(clip, sourceSkin, targetToUalSource);
        if (!r) r = simpleRemap(clip);
        if (r) { r.name = name; this._remappedClips.set(name, r); }
      };

      for (const [k, clip] of (this.kit.clips || new Map())) {
        if (clip?.tracks) trySet(k, clip, ualSource || ubcSource);
      }
    } catch (e) { console.warn('[ubc] remap custom anims failed', e); }
  }

`;
fs.writeFileSync(p, s.slice(0,start)+neu+s.slice(end));
console.log('ok');
