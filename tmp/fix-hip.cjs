const fs=require('fs');
const f='src/game/ubc-character.js';
let s=fs.readFileSync(f,'utf8');
s=s.replace(
`        const retargeted = SkeletonUtils.retargetClip(targetRoot, fbx, srcClip, {\n          hip: 'pelvis',`,
`        const sourceHip = names['pelvis'] || 'Hips';\n        const retargeted = SkeletonUtils.retargetClip(targetRoot, fbx, srcClip, {\n          hip: sourceHip,`
);
fs.writeFileSync(f,s); console.log(s.includes('sourceHip')?'ok':'no');