const fs=require('fs');
const p='src/game/ubc-character.js';
let s=fs.readFileSync(p,'utf8');
const old=`        return tracks.length ? new THREE.AnimationClip(clip.name, clip.duration, tracks) : null;
      };

      const trySet = (name, clip, sourceSkin = ualSource) => {
        if (!clip || this._remappedClips.has(name)) return;
        let r = retarget(clip, sourceSkin, targetToUalSource);
        if (!r) r = simpleRemap(clip);
        if (r) { r.name = name; this._remappedClips.set(name, r); }
      };`;
const neu=`        const out = tracks.length ? new THREE.AnimationClip(clip.name, clip.duration, tracks) : null;
        return stripRootPos(out);
      };

      const trySet = (name, clip, sourceSkin = ualSource) => {
        if (!clip || this._remappedClips.has(name)) return;
        let r = retarget(clip, sourceSkin, targetToUalSource);
        if (!r) r = simpleRemap(clip);
        if (r) { r.name = name; this._remappedClips.set(name, r); }
      };`;
if(!s.includes(old)){ console.error('not found'); process.exit(1); }
fs.writeFileSync(p, s.replace(old, neu));
console.log('ok');
