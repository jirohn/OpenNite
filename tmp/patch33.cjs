const fs = require('fs');
const p = 'tools/gun-editor.mjs';
let s = fs.readFileSync(p, 'utf8');

// 1. Replace drawGizmos
const start = s.indexOf('function drawGizmos() {');
const end = s.indexOf('function pickGizmo(');
const newDraw = `function drawGizmos() {
  while (gizmoGroup.children.length) { const c = gizmoGroup.children.pop(); c.geometry?.dispose?.(); c.material?.dispose?.(); }
  if (!gun) return;
  gun.updateWorldMatrix(true, true);
  const q = gun.getWorldQuaternion(new THREE.Quaternion());
  const localAxes = [new THREE.Vector3(1,0,0).applyQuaternion(q), new THREE.Vector3(0,1,0).applyQuaternion(q), new THREE.Vector3(0,0,1).applyQuaternion(q)];
  const colors = [0xff4444, 0x3ccb3c, 0x445bff];
  for (const t of gizmoTargets) {
    if (t.name !== activeGizmoTarget) continue;
    const pos = gizmoWorldPos(t); if (!pos) continue;
    const len = 0.17;
    for (let ai = 0; ai < 3; ai++) {
      const c = colors[ai];
      const d = localAxes[ai];
      const endp = pos.clone().addScaledVector(d, len);
      const geo = new THREE.BufferGeometry().setFromPoints([pos, endp]);
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: 0.9 }));
      line.frustumCulled = false;
      gizmoGroup.add(line);
      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, len, 8), new THREE.MeshBasicMaterial({ visible: false }));
      const mid = pos.clone().addScaledVector(d, len / 2);
      cyl.position.copy(mid); cyl.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), d);
      cyl.userData = { target: t.name, axisIndex: ai };
      gizmoGroup.add(cyl);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.073, 10), new THREE.MeshBasicMaterial({ color: c }));
      cone.position.copy(endp);
      cone.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), d);
      cone.userData = { target: t.name, axisIndex: ai };
      gizmoGroup.add(cone);
    }
    const sph = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 12), new THREE.MeshBasicMaterial({ color: t.color }));
    sph.position.copy(pos); sph.userData = { target: t.name, axis: null };
    gizmoGroup.add(sph);
  }
}
`;
s = s.slice(0, start) + newDraw + s.slice(end);

// Update pickGizmo
const pickOld = `  if (h.userData && h.userData.target) {
    if (h.userData.target !== activeGizmoTarget) return null;
  const t = gizmoTargets.find(x => x.name === h.userData.target);
    const axis = h.userData.axis ? h.userData.axis.clone() : new THREE.Vector3(1,0,0);
    return { target: t, axis };
  }`;
const pickNew = `  if (h.userData && h.userData.target) {
    if (h.userData.target !== activeGizmoTarget) return null;
    const t = gizmoTargets.find(x => x.name === h.userData.target);
    gun.updateWorldMatrix(true, true);
    const q = gun.getWorldQuaternion(new THREE.Quaternion());
    const idx = (h.userData.axisIndex != null) ? h.userData.axisIndex : 0;
    const base = [new THREE.Vector3(1,0,0), new THREE.Vector3(0,1,0), new THREE.Vector3(0,0,1)][idx];
    const axis = base.clone().applyQuaternion(q);
    return { target: t, axis, axisIndex: idx };
  }`;
if (!s.includes(pickOld)) { console.error('pickOld not found'); process.exit(1); }
s = s.replace(pickOld, pickNew);

fs.writeFileSync(p, s, 'utf8');
console.log('done');
