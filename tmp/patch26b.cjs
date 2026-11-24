const fs = require('fs');
const p = 'tools/gun-editor.mjs';
let s = fs.readFileSync(p, 'utf8');

// mousedown: use view direction as plane normal (screen plane)
s = s.replace(
  `  const viewDir = camera.position.clone().sub(pos).normalize();
  let pn = new THREE.Vector3().crossVectors(viewDir, picked.axis);
  if (pn.lengthSq() < 1e-6) pn = picked.axis.clone();
  pn.normalize();
  const plane0 = new THREE.Plane().setFromNormalAndCoplanarPoint(pn, pos);`,
  `  const viewDir = camera.position.clone().sub(pos).normalize();
  const plane0 = new THREE.Plane().setFromNormalAndCoplanarPoint(viewDir, pos);`
);

// mousemove: use view direction as plane normal
s = s.replace(
  `  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(planeNormal, startPos);`,
  `  const viewDir = camera.position.clone().sub(startPos).normalize();
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(viewDir, startPos);`
);

// store planeNormal in gizmoDrag (still used? no, but keep for compat) - update the gizmoDrag creation to not reference pn
s = s.replace(
  "  gizmoDrag = { target: picked.target, axis: picked.axis.clone(), planeNormal: pn, startPos: pos.clone(), startLocal: picked.target.getLocal().clone(), initInter: initInter.clone() };",
  "  gizmoDrag = { target: picked.target, axis: picked.axis.clone(), startPos: pos.clone(), startLocal: picked.target.getLocal().clone(), initInter: initInter.clone() };"
);

// mousemove destructure: remove planeNormal
s = s.replace(
  "  const { target, axis, startPos, initInter, planeNormal } = gizmoDrag;",
  "  const { target, axis, startPos, initInter } = gizmoDrag;"
);

fs.writeFileSync(p, s, 'utf8');
console.log('done');
