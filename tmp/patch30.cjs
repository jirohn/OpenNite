const fs = require('fs');
const p = 'tools/gun-editor.mjs';
let s = fs.readFileSync(p, 'utf8');

// 1. Add activeGizmoTarget variable after gizmoDrag
s = s.replace(
  "let gizmoDrag = null;",
  "let gizmoDrag = null;\nlet activeGizmoTarget = 'weaponPos';"
);

// 2. pickGizmo: only pick active target
s = s.replace(
  "  const t = gizmoTargets.find(x => x.name === h.userData.target);",
  "  if (h.userData.target !== activeGizmoTarget) return null;\n  const t = gizmoTargets.find(x => x.name === h.userData.target);"
);

// 3. drawGizmos: highlight active, dim others; thicker cylinders + arrow cones
s = s.replace(
  "      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, len, 8), new THREE.MeshBasicMaterial({ visible: false }));",
  "      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, len, 8), new THREE.MeshBasicMaterial({ visible: false }));"
);
// add arrow cone after cylinder
s = s.replace(
  "      cyl.userData = { target: t.name, axis: d.clone() };\n      gizmoGroup.add(cyl);",
  "      cyl.userData = { target: t.name, axis: d.clone() };\n      gizmoGroup.add(cyl);\n      // flecha visible en la punta\n      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.22, 10), new THREE.MeshBasicMaterial({ color: c }));\n      cone.position.copy(end);\n      cone.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), d);\n      cone.userData = { target: t.name, axis: d.clone() };\n      gizmoGroup.add(cone);"
);

// 4. dim non-active gizmos: in drawGizmos loop, skip drawing non-active targets entirely
s = s.replace(
  "  for (const t of gizmoTargets) {\n    const pos = gizmoWorldPos(t); if (!pos) continue;",
  "  for (const t of gizmoTargets) {\n    if (t.name !== activeGizmoTarget) continue;\n    const pos = gizmoWorldPos(t); if (!pos) continue;"
);

// 5. wire hierarchy buttons in main
s = s.replace(
  "    document.querySelector('#reset').onclick = onReset;",
  "    document.querySelector('#reset').onclick = onReset;\n    const setSel = (name, label) => {\n      activeGizmoTarget = name;\n      const h = document.querySelector('#activeHint'); if (h) h.textContent = 'Activo: ' + label;\n      for (const id of ['selWeapon','selSupport','selRightIk']) document.querySelector('#'+id)?.classList.remove('activeSel');\n    };\n    document.querySelector('#selWeapon').onclick = () => setSel('weaponPos', 'Arma (mano derecha)');\n    document.querySelector('#selSupport').onclick = () => setSel('support', 'IK mano izquierda');\n    document.querySelector('#selRightIk').onclick = () => setSel('rightIk', 'IK mano derecha');"
);

fs.writeFileSync(p, s, 'utf8');
console.log('done');
