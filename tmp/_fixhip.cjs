const fs=require('fs');
const p='src/game/ubc-character.js';
let s=fs.readFileSync(p,'utf8');
const old=`      const retarget = (clip, sourceSkin, nameMap) => {
        if (!clip?.tracks?.length || !targetSkin?.skeleton || !sourceSkin?.skeleton) return null;
        try {
          const saved = targetSkin.skeleton.bones.map((b) => ({ p: b.position.clone(), q: b.quaternion.clone(), s: b.scale.clone() }));
          const out = SkeletonUtils.retargetClip(targetSkin, sourceSkin, clip, { hip: byNorm.get('Hips') || 'Hips', names: nameMap, preservePosition: false, useFirstFramePosition: false });
          targetSkin.skeleton.bones.forEach((b, i) => { const sv = saved[i]; if (sv) { b.position.copy(sv.p); b.quaternion.copy(sv.q); b.scale.copy(sv.s); } });
          targetSkin.updateMatrixWorld(true);
          if (out?.tracks?.length) { out.name = clip.name; return out; }
        } catch (e) { /* fallback */ }
        return null;
      };`;
const neu=`      const hipName = byNorm.get('Hips') || 'Hips';
      const stripRootPos = (clip) => {
        if (!clip) return clip;
        clip.tracks = clip.tracks.filter(t => !(t.name === hipName + '.position' || t.name.endsWith('Hips.position') || t.name.endsWith('hips.position')));
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
      };`;
if(!s.includes(old)){ console.error('not found'); process.exit(1); }
fs.writeFileSync(p, s.replace(old, neu));
console.log('ok');
