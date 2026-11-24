const fs = require('fs');
const p = 'tools/gun-editor.mjs';
let s = fs.readFileSync(p, 'utf8');

// 1. Add weapon position gizmo target (after rightIk target)
s = s.replace(
  "  { name: 'rightIk', color: 0x33ccff, getLocal: () => gun?.userData?.ikRightTarget, setLocal: (v) => { if (gun?.userData) gun.userData.ikRightTarget = v; } },\n];",
  "  { name: 'rightIk', color: 0x33ccff, getLocal: () => gun?.userData?.ikRightTarget, setLocal: (v) => { if (gun?.userData) gun.userData.ikRightTarget = v; } },\n  { name: 'weaponPos', color: 0xffffff, getLocal: () => gun?.position, setLocal: (v) => { if (gun) { const m = gun.parent; if (m) { const local = m.worldToLocal(v.clone()); gun.position.copy(local); } } } },\n];"
);

// 2. Thicker pick cylinders + visible sphere at tip
s = s.replace(
  "      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, len, 8), new THREE.MeshBasicMaterial({ visible: false }));",
  "      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, len, 8), new THREE.MeshBasicMaterial({ visible: false }));"
);

// 3. Weapon change handler: sync main sliders too
s = s.replace(
  "      gun = character.weaponMount.children[0];\n      setReadouts();\n      buildAnimOptions();\n      syncSupportSlidersFromGun();\n      syncRightIkSlidersFromGun();",
  "      gun = character.weaponMount.children[0];\n      syncSlidersFromGun();\n      setReadouts();\n      buildAnimOptions();\n      syncSupportSlidersFromGun();\n      syncRightIkSlidersFromGun();"
);

fs.writeFileSync(p, s, 'utf8');
console.log('done');
