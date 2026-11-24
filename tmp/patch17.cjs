const fs = require('fs');
const p = 'tools/gun-editor.mjs';
let s = fs.readFileSync(p, 'utf8');

// Add sync/apply functions after applySupportReadouts function (before function syncSlidersFromGun? it's after applySupportReadouts's closing brace). Insert before "function syncSlidersFromGun() {"
const funcs = `function syncRightIkSlidersFromGun() {
  const t = gun?.userData?.ikRightTarget;
  const set = (id, v) => { const el = document.querySelector('#' + id); if (el) el.value = Number(v).toFixed(2); };
  set('rikX', t ? t.x : 0); set('rikY', t ? t.y : 0); set('rikZ', t ? t.z : 0);
  applyRightIkReadouts();
}
function applyRightIkSliders() {
  if (!gun?.userData) return;
  const x = Number(document.querySelector('#rikX').value);
  const y = Number(document.querySelector('#rikY').value);
  const z = Number(document.querySelector('#rikZ').value);
  gun.userData.ikRightTarget = new THREE.Vector3(x, y, z);
  applyRightIkReadouts();
}
function applyRightIkReadouts() {
  const t = gun?.userData?.ikRightTarget;
  const set = (id, v) => { const el = document.querySelector('#' + id + 'v'); if (el) el.textContent = Number(v).toFixed(2); };
  if (t) { set('rikX', t.x); set('rikY', t.y); set('rikZ', t.z); }
}
`;
const anchor = 'function syncSlidersFromGun() {';
if (!s.includes(anchor)) { console.error('anchor not found'); process.exit(1); }
s = s.replace(anchor, funcs + anchor);

// bind right IK sliders in main
s = s.replace(
  "    for (const id of ['sgX','sgY','sgZ','sgrX','sgrY','sgrZ','ikStr','ikStrR']) {",
  "    for (const id of ['sgX','sgY','sgZ','sgrX','sgrY','sgrZ','ikStr','ikStrR','rikX','rikY','rikZ']) {"
);
// update the binding loop body to call applyRightIkSliders for rik* ids
s = s.replace(
  "      const el = document.querySelector('#' + id);\n      if (el) el.oninput = () => { applySupportSliders(); setReadouts(); };",
  "      const el = document.querySelector('#' + id);\n      if (el) el.oninput = () => {\n        if (id.startsWith('rik')) applyRightIkSliders(); else applySupportSliders();\n        setReadouts();\n      };"
);

// call syncRightIkSlidersFromGun in main after attachWeapon
s = s.replace(
  "    syncSupportSlidersFromGun();\n\n    buildWeaponOptions();",
  "    syncSupportSlidersFromGun();\n    syncRightIkSlidersFromGun();\n\n    buildWeaponOptions();"
);

// weapon change handler: sync right ik
s = s.replace(
  "    buildAnimOptions();\n    syncSupportSlidersFromGun();\n    if (outlineOn) applyOutlineTargets();",
  "    buildAnimOptions();\n    syncSupportSlidersFromGun();\n    syncRightIkSlidersFromGun();\n    if (outlineOn) applyOutlineTargets();"
);

// onReset: sync right ik
s = s.replace(
  "  buildAnimOptions();\n  syncSupportSlidersFromGun();\n  // Hornear el alineado",
  "  buildAnimOptions();\n  syncSupportSlidersFromGun();\n  syncRightIkSlidersFromGun();\n  // Hornear el alineado"
);

// onExport: add ikRightTarget to placement
s = s.replace(
  "    const placement = { position: gun.position.toArray(), quaternion: [gq.x, gq.y, gq.z, gq.w], supportGrip: { position: (gun.userData.supportGrip || new THREE.Vector3()).toArray(), quaternion: [sq.x, sq.y, sq.z, sq.w] }, ikStrength: gun.userData.ikStrengthLeft ?? gun.userData.ikStrength ?? 0, ikStrengthLeft: gun.userData.ikStrengthLeft ?? gun.userData.ikStrength ?? 0, ikStrengthRight: gun.userData.ikStrengthRight ?? 0 };",
  "    const placement = { position: gun.position.toArray(), quaternion: [gq.x, gq.y, gq.z, gq.w], supportGrip: { position: (gun.userData.supportGrip || new THREE.Vector3()).toArray(), quaternion: [sq.x, sq.y, sq.z, sq.w] }, ikStrength: gun.userData.ikStrengthLeft ?? gun.userData.ikStrength ?? 0, ikStrengthLeft: gun.userData.ikStrengthLeft ?? gun.userData.ikStrength ?? 0, ikStrengthRight: gun.userData.ikStrengthRight ?? 0, ikRightTarget: gun.userData.ikRightTarget ? { position: gun.userData.ikRightTarget.toArray() } : undefined };"
);

fs.writeFileSync(p, s, 'utf8');
console.log('done');
