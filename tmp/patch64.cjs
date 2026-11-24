const fs = require('fs');
const p = 'tools/map-editor.mjs';
let s = fs.readFileSync(p, 'utf8');

// Replace the lightweight load block with a simple terrain mesh
const old = `world.generateRoads();
world.setupWater();
const range = Math.ceil(world.half / 256) + 1;
for (let cx = -range; cx <= range; cx++) for (let cz = -range; cz <= range; cz++) world.createChunk(cx, cz);
world.loaded = true;`;
const neu = `// Simple terrain mesh (low-res) for editor performance.
const seg = 64;
const size = world.size;
const half = world.half;
const geo = new THREE.PlaneGeometry(size, size, seg, seg);
const pos = geo.attributes.position;
for (let i = 0; i < pos.count; i++) {
  const x = pos.getX(i);
  const z = pos.getY(i);
  pos.setZ(i, world.heightAt(x, z));
}
geo.rotateX(-Math.PI / 2);
geo.computeVertexNormals();
const terrainMat = new THREE.MeshStandardMaterial({ color: 0x4f7c45, roughness: 0.9, metalness: 0 });
const terrain = new THREE.Mesh(geo, terrainMat);
scene.add(terrain);
// Water plane
const water = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial({ color: 0x2f7189, transparent: true, opacity: 0.6 }));
water.rotation.x = -Math.PI / 2;
water.position.y = world.waterLevel || 0;
scene.add(water);
world.loaded = true;`;
if (!s.includes(old)) { console.error('old not found'); process.exit(1); }
s = s.replace(old, neu);
fs.writeFileSync(p, s, 'utf8');
console.log('done');
