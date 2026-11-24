const fs = require('fs');
const p = 'tools/gun-editor.mjs';
let s = fs.readFileSync(p, 'utf8');

// 1. gizmoAxes: store index + color
s = s.replace(
  "const gizmoAxes = [[new THREE.Vector3(1,0,0), 0xff4444], [new THREE.Vector3(0,1,0), 0x3ccb3c], [new THREE.Vector3(0,0,1), 0x445bff]];",
  "const gizmoAxes = [[0, 0xff4444], [1, 0x3ccb3c], [2, 0x445bff]];"
);

// 2. drawGizmos: rotate axes by weapon's world quaternion
const oldDraw = `  for (const t of gizmoTargets) {
    if (t.name !== activeGizmoTarget) continue;
    const pos = gizmoWorldPos(t); if (!pos) continue;
    const len = 0.17;
    for (const [d, c] of gizmoAxes) {
      const end = pos.clone().addScaledVector(d, len);
      const geo = new THREE.BufferGeometry().setFromPoints([pos, end]);
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: 0.9 }));
      line.frustumCulled = false;
      gizmoGroup.add(line);
      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, len, 8), new THREE.MeshBasicMaterial({ visible: false }));
      const mid = pos.clone().addScaledVector(d, len / 2);
      cyl.position.copy(mid); cyl.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), d);
      cyl.userData = { target: t.name, axis: d.clone() };
      gizmoGroup.add(cyl);
      // flecha visible en la punta
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.073, 10), new THREE.MeshBasicMaterial({ color: c }));
      cone.position.copy(end);
      cone.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), d);
      cone.userData = { target: t.name, axis: d.clone() };
      gizmoGroup.add(cone);
    }`;
const newDraw = `  if (!gun) return;
  gun.updateWorldMatrix(true, true);
  const q = gun.getWorldQuaternion(new THREE.Quaternion());
  const localAxes = [new THREE.Vector3(1,0,0).applyQuaternion(q), new THREE.Vector3(0,1,0).applyQuaternion(q), new THREE.Vector3(0,0,1).applyQuaternion(q)];
  for (const t of gizmoTargets) {
    if (t.name !== activeGizmoTarget) continue;
    const pos = gizmoWorldPos(t); if (!pos) continue;
    const len = 0.17;
    for (let ai = 0; ai < 3; ai++) {
      const c = gizmoAxes[ai][1];
      const d = localAxes[ai];
      const end = pos.clone().addScaledVector(d, len);
      const geo = new THREE.BufferGeometry().setFromPoints([pos, end]);
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: 0.9 }));
      line.frustumCulled = false;
      gizmoGroup.add(line);
      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, len, 8), new THREE.MeshBasicMaterial({ visible: false }));
      const mid = pos.clone().addScaledVector(d, len / 2);
      cyl.position.copy(mid); cyl.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), d);
      cyl.userData = { target: t.name, axisIndex: ai };
      gizmoGroup.add(cyl);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.073, 10), new THREE.MeshBasicMaterial({ color: c }));
      cone.position.copy(end);
      cone.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), d);
      cone.userData = { target: t.name, axisIndex: ai };
      gizmoGroup.add(cone);
    }`;
if (!s.includes(oldDraw)) { console.error('draw block not found'); process.exit(1); }
s = s.replace(oldDraw, newDraw);

// 3. pickGizmo: reconstruct world axis from axisIndex
s = s.replace(
  "  if (h.userData && h.userData.target) {\n    if (h.userData.target !== activeGizmoTarget) return null;\n  const t = gizmoTargets.find(x => x.name === h.userData.target);\n    const axis = h.userData.axis ? h.userData.axis.clone() : new THREE.Vector3(1,0,0);\n    return { target: t, axis };\n  }",
  "  if (h.userData && h.userData.target) {\n    if (h.userData.target !== activeGizmoTarget) return null;\n    const t = gizmoTargets.find(x => x.name === h.userData.target);\n    gun.updateWorldMatrix(true, true);\n    const q = gun.getWorldQuaternion(new THREE.Quaternion());\n    const idx = h.userData.axisIndex ?? 0;\n    const base = [new THREE.Vector3(1,0,0), new THREE.Vector3(0,1,0), new THREE.Vector3(0,0,1)][idx];\n    const axis = base.clone().applyQuaternion(q);\n    return { target: t, axis, axisIndex: idx };\n  }"
);

// 4. mousedown: axis is already world vector (from pickGizmo)
// (no change needed, picked.axis is world vector)

fs.writeFileSync(p, s, 'utf8');
console.log('done');
