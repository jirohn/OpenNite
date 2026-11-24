const fs = require('fs');
const p = 'tools/gun-editor.mjs';
let s = fs.readFileSync(p, 'utf8');

// 1. Fix gizmo drag: use screen-space plane for smoother movement
const oldDrag = `  const plane = new THREE.Plane();
  plane.setFromNormalAndCoplanarPoint(axis, startPos);
  const inter = new THREE.Vector3();
  if (ray.ray.intersectPlane(plane, inter)) {
    const delta = inter.sub(startPos).dot(axis);
    const newPos = startPos.clone().addScaledVector(axis, delta);`;
const newDrag = `  // Plano que contiene el eje y la vista: arrastre en espacio de pantalla (más suave).
  const viewDir = camera.position.clone().sub(startPos).normalize();
  let planeNormal = new THREE.Vector3().crossVectors(viewDir, axis);
  if (planeNormal.lengthSq() < 1e-6) planeNormal = axis.clone();
  planeNormal.normalize();
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(planeNormal, startPos);
  const inter = new THREE.Vector3();
  if (ray.ray.intersectPlane(plane, inter)) {
    const delta = THREE.MathUtils.clamp(inter.sub(startPos).dot(axis), -2, 2);
    const newPos = startPos.clone().addScaledVector(axis, delta * 0.5);`;
if (!s.includes(oldDrag)) { console.error('drag block not found'); process.exit(1); }
s = s.replace(oldDrag, newDrag);

// 2. Add undo/redo state + functions after gizmoDrag declaration
s = s.replace(
  "let gizmoDrag = null;",
  "let gizmoDrag = null;\nconst undoStack = [];\nconst redoStack = [];\nfunction snapshotState() {\n  return {\n    position: gun.position.clone(),\n    quaternion: gun.quaternion.clone(),\n    supportGrip: gun.userData.supportGrip ? gun.userData.supportGrip.clone() : null,\n    supportGripQuat: gun.userData.supportGripQuat ? gun.userData.supportGripQuat.clone() : null,\n    ikStrengthLeft: gun.userData.ikStrengthLeft,\n    ikStrengthRight: gun.userData.ikStrengthRight,\n    ikRightTarget: gun.userData.ikRightTarget ? gun.userData.ikRightTarget.clone() : null,\n  };\n}\nfunction pushUndo() { if (!gun) return; undoStack.push(snapshotState()); if (undoStack.length > 50) undoStack.shift(); redoStack.length = 0; }\nfunction applyState(st) {\n  if (!st || !gun) return;\n  gun.position.copy(st.position);\n  gun.quaternion.copy(st.quaternion);\n  if (st.supportGrip) gun.userData.supportGrip = st.supportGrip.clone();\n  if (st.supportGripQuat) gun.userData.supportGripQuat = st.supportGripQuat.clone();\n  gun.userData.ikStrengthLeft = st.ikStrengthLeft;\n  gun.userData.ikStrengthRight = st.ikStrengthRight;\n  gun.userData.ikStrength = gun.userData.ikStrengthLeft;\n  gun.userData.ikRightTarget = st.ikRightTarget ? st.ikRightTarget.clone() : undefined;\n  syncSlidersFromGun(); syncSupportSlidersFromGun(); syncRightIkSlidersFromGun(); setReadouts();\n}\nfunction undo() { if (undoStack.length === 0) return; redoStack.push(snapshotState()); applyState(undoStack.pop()); }\nfunction redo() { if (redoStack.length === 0) return; undoStack.push(snapshotState()); applyState(redoStack.pop()); }"
);

// pushUndo on gizmo drag start: insert into mousedown handler
s = s.replace(
  "  gizmoDrag = { target: picked.target, axis: picked.axis, startPos: pos.clone(), startLocal: picked.target.getLocal().clone() };\n  orbit.enabled = false;",
  "  pushUndo();\n  gizmoDrag = { target: picked.target, axis: picked.axis, startPos: pos.clone(), startLocal: picked.target.getLocal().clone() };\n  orbit.enabled = false;"
);

// keyboard shortcuts for undo/redo
s = s.replace(
  "window.addEventListener('resize', () => {",
  "window.addEventListener('keydown', (e) => {\n  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }\n  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }\n});\nwindow.addEventListener('resize', () => {"
);

fs.writeFileSync(p, s, 'utf8');
console.log('done');
