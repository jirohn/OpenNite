const fs = require('fs');
const p = 'tools/gun-editor.mjs';
let s = fs.readFileSync(p, 'utf8');

const old1 = "    for (const id of ['posX', 'posY', 'posZ', 'rotX', 'rotY', 'rotZ']) {\n      document.querySelector('#' + id).oninput = onSlider;\n    }\n";
const neu1 = "    for (const id of ['posX', 'posY', 'posZ', 'rotX', 'rotY', 'rotZ']) {\n      document.querySelector('#' + id).oninput = onSlider;\n    }\n    for (const id of ['sgX','sgY','sgZ','sgrX','sgrY','sgrZ','ikStr']) {\n      const el = document.querySelector('#' + id);\n      if (el) el.oninput = () => { applySupportSliders(); setReadouts(); };\n    }\n";
if (!s.includes(old1)) { console.error('old1 not found'); process.exit(1); }
s = s.replace(old1, neu1);

const old2 = "    const placement = { position: gun.position.toArray(), quaternion: [gq.x, gq.y, gq.z, gq.w] };\n";
const neu2 = "    const sq = gun.userData.supportGripQuat || new THREE.Quaternion();\n    const placement = { position: gun.position.toArray(), quaternion: [gq.x, gq.y, gq.z, gq.w], supportGrip: { position: (gun.userData.supportGrip || new THREE.Vector3()).toArray(), quaternion: [sq.x, sq.y, sq.z, sq.w] }, ikStrength: gun.userData.ikStrength ?? 0 };\n";
if (!s.includes(old2)) { console.error('old2 not found'); process.exit(1); }
s = s.replace(old2, neu2);

fs.writeFileSync(p, s, 'utf8');
console.log('done');
