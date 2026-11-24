const fs = require('fs');
const p = 'tools/gun-editor.mjs';
let s = fs.readFileSync(p, 'utf8');

// 1. Thicker pick cylinders
s = s.replace(
  "      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, len, 8), new THREE.MeshBasicMaterial({ visible: false }));",
  "      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, len, 8), new THREE.MeshBasicMaterial({ visible: false }));"
);

// 2. mousedown: compute initial intersection
const oldMd = `  pushUndo();
  gizmoDrag = { target: picked.target, axis: picked.axis, startPos: pos.clone(), startLocal: picked.target.getLocal().clone() };
  orbit.enabled = false;`;
const newMd = `  const viewDir = camera.position.clone().sub(pos).normalize();
  let pn = new THREE.Vector3().crossVectors(viewDir, picked.axis);
  if (pn.lengthSq() < 1e-6) pn = picked.axis.clone();
  pn.normalize();
  const plane0 = new THREE.Plane().setFromNormalAndCoplanarPoint(pn, pos);
  const rect0 = canvas.getBoundingClientRect();
  const ndcX0 = ((e.clientX - rect0.left) / rect0.width) * 2 - 1;
  const ndcY0 = -((e.clientY - rect0.top) / rect0.height) * 2 + 1;
  const ray0 = new THREE.Raycaster();
  ray0.setFromCamera(new THREE.Vector2(ndcX0, ndcY0), camera);
  const initInter = new THREE.Vector3();
  if (!ray0.ray.intersectPlane(plane0, initInter)) initInter.copy(pos);
  pushUndo();
  gizmoDrag = { target: picked.target, axis: picked.axis.clone(), planeNormal: pn, startPos: pos.clone(), startLocal: picked.target.getLocal().clone(), initInter: initInter.clone() };
  orbit.enabled = false;`;
if (!s.includes(oldMd)) { console.error('mousedown block not found'); process.exit(1); }
s = s.replace(oldMd, newMd);

// 3. mousemove: use initial intersection, full 1:1 (no 0.5 scale)
const oldMm = `  const { target, axis, startPos } = gizmoDrag;
  const plane = new THREE.Plane();
  plane.setFromNormalAndCoplanarPoint(axis, startPos);
  const inter = new THREE.Vector3();
  if (ray.ray.intersectPlane(plane, inter)) {
    const delta = THREE.MathUtils.clamp(inter.sub(startPos).dot(axis), -2, 2);
    const newPos = startPos.clone().addScaledVector(axis, delta * 0.5);`;
const newMm = `  const { target, axis, startPos, initInter, planeNormal } = gizmoDrag;
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(planeNormal, startPos);
  const inter = new THREE.Vector3();
  if (ray.ray.intersectPlane(plane, inter)) {
    const delta = inter.sub(initInter).dot(axis);
    const newPos = startPos.clone().addScaledVector(axis, delta);`;
if (!s.includes(oldMm)) { console.error('mousemove block not found'); process.exit(1); }
s = s.replace(oldMm, newMm);

fs.writeFileSync(p, s, 'utf8');
console.log('done');
