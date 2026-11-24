const fs = require('fs');
const p = 'tools/gun-editor.mjs';
let s = fs.readFileSync(p, 'utf8');

// 1. Larger pick radius + store initial intersection in gizmoDrag
s = s.replace(
  "      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, len, 8), new THREE.MeshBasicMaterial({ visible: false }));",
  "      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, len, 8), new THREE.MeshBasicMaterial({ visible: false }));"
);

// 2. mousedown: compute initial intersection and store
const oldMd = `  const pos = gizmoWorldPos(picked.target);
  if (!pos) return;
  gizmoDrag = { target: picked.target, axis: picked.axis, startPos: pos.clone(), startLocal: picked.target.getLocal().clone() };
  orbit.enabled = false;`;
const newMd = `  const pos = gizmoWorldPos(picked.target);
  if (!pos) return;
  const viewDir = camera.position.clone().sub(pos).normalize();
  let pn = new THREE.Vector3().crossVectors(viewDir, picked.axis);
  if (pn.lengthSq() < 1e-6) pn = picked.axis.clone();
  pn.normalize();
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(pn, pos);
  const ray = new THREE.Raycaster();
  const rect = canvas.getBoundingClientRect();
  const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  ray.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
  const initInter = new THREE.Vector3();
  if (!ray.ray.intersectPlane(plane, initInter)) initInter.copy(pos);
  gizmoDrag = { target: picked.target, axis: picked.axis.clone(), planeNormal: pn, startPos: pos.clone(), startLocal: picked.target.getLocal().clone(), initInter: initInter.clone() };
  orbit.enabled = false;`;
if (!s.includes(oldMd)) { console.error('mousedown block not found'); process.exit(1); }
s = s.replace(oldMd, newMd);

// 3. mousemove: use initial intersection as reference (no jump)
const oldMm = `  const { target, axis, startPos } = gizmoDrag;
  const plane = new THREE.Plane();
  plane.setFromNormalAndCoplanarPoint(axis, startPos);
  const inter = new THREE.Vector3();
  if (ray.ray.intersectPlane(plane, inter)) {
    const delta = THREE.MathUtils.clamp(inter.sub(startPos).dot(axis), -2, 2);
    const newPos = startPos.clone().addScaledVector(axis, delta * 0.5);`;
const newMm = `  const { target, axis, startPos, initInter } = gizmoDrag;
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(gizmoDrag.planeNormal, startPos);
  const inter = new THREE.Vector3();
  if (ray.ray.intersectPlane(plane, inter)) {
    const delta = inter.sub(initInter).dot(axis);
    const newPos = startPos.clone().addScaledVector(axis, delta);`;
if (!s.includes(oldMm)) { console.error('mousemove block not found'); process.exit(1); }
s = s.replace(oldMm, newMm);

fs.writeFileSync(p, s, 'utf8');
console.log('done');
