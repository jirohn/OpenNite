const fs = require('fs');
const p = 'tools/map-editor.mjs';
let s = fs.readFileSync(p, 'utf8');
const old = `  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();
  if (raycaster.ray.intersectPlane(plane, hit)) {
    const y = world.heightAt(hit.x, hit.z);
    const piece = makePiece(selectedPiece, hit.x, hit.z);`;
const neu = `  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();
  if (raycaster.ray.intersectPlane(plane, hit)) {
    const gs = 2;
    hit.x = Math.round(hit.x / gs) * gs;
    hit.z = Math.round(hit.z / gs) * gs;
    const y = world.heightAt(hit.x, hit.z);
    const piece = makePiece(selectedPiece, hit.x, hit.z);`;
if (!s.includes(old)) { console.error('old not found'); process.exit(1); }
s = s.replace(old, neu);
fs.writeFileSync(p, s, 'utf8');
console.log('done');
