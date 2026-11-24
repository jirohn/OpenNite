const fs = require('fs');
const p = 'tools/gun-editor.mjs';
let s = fs.readFileSync(p, 'utf8');

// syncSupportSlidersFromGun: read ikStrengthRight too
s = s.replace(
  "  const str = document.querySelector('#ikStr'); if (str) str.value = Number(gun.userData.ikStrength ?? 0).toFixed(2);\n  applySupportReadouts();",
  "  const str = document.querySelector('#ikStr'); if (str) str.value = Number(gun.userData.ikStrengthLeft ?? gun.userData.ikStrength ?? 0).toFixed(2);\n  const strR = document.querySelector('#ikStrR'); if (strR) strR.value = Number(gun.userData.ikStrengthRight ?? 0).toFixed(2);\n  applySupportReadouts();"
);

// applySupportSliders: write both
s = s.replace(
  "  gun.userData.ikStrength = Number(document.querySelector('#ikStr').value);\n  applySupportReadouts();",
  "  gun.userData.ikStrengthLeft = Number(document.querySelector('#ikStr').value);\n  gun.userData.ikStrengthRight = Number(document.querySelector('#ikStrR').value);\n  gun.userData.ikStrength = gun.userData.ikStrengthLeft;\n  applySupportReadouts();"
);

// applySupportReadouts: read both
s = s.replace(
  "  const s = gun?.userData?.ikStrength;\n  if (s != null) set('ikStr', s);",
  "  const sL = gun?.userData?.ikStrengthLeft ?? gun?.userData?.ikStrength;\n  if (sL != null) set('ikStr', sL);\n  const sR = gun?.userData?.ikStrengthRight;\n  if (sR != null) set('ikStrR', sR);"
);

// input binding list
s = s.replace(
  "    for (const id of ['sgX','sgY','sgZ','sgrX','sgrY','sgrZ','ikStr']) {",
  "    for (const id of ['sgX','sgY','sgZ','sgrX','sgrY','sgrZ','ikStr','ikStrR']) {"
);

// onExport placement: write ikStrengthLeft/Right
s = s.replace(
  "    const placement = { position: gun.position.toArray(), quaternion: [gq.x, gq.y, gq.z, gq.w], supportGrip: { position: (gun.userData.supportGrip || new THREE.Vector3()).toArray(), quaternion: [sq.x, sq.y, sq.z, sq.w] }, ikStrength: gun.userData.ikStrength ?? 0 };",
  "    const placement = { position: gun.position.toArray(), quaternion: [gq.x, gq.y, gq.z, gq.w], supportGrip: { position: (gun.userData.supportGrip || new THREE.Vector3()).toArray(), quaternion: [sq.x, sq.y, sq.z, sq.w] }, ikStrength: gun.userData.ikStrengthLeft ?? gun.userData.ikStrength ?? 0, ikStrengthLeft: gun.userData.ikStrengthLeft ?? gun.userData.ikStrength ?? 0, ikStrengthRight: gun.userData.ikStrengthRight ?? 0 };"
);

fs.writeFileSync(p, s, 'utf8');
console.log('done');
