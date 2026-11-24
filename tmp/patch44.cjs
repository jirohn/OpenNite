const fs = require('fs');
const p = 'src/game/world.js';
let s = fs.readFileSync(p, 'utf8');
const old = `    const geo = new THREE.BufferGeometry();
    const verts = new Float32Array([-base / 2, 0, 0, base / 2, 0, 0, 0, height, 0]);
    geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    geo.setIndex([0, 1, 2]);
    geo.computeVertexNormals();`;
const neu = `    const geo = new THREE.BufferGeometry();
    const verts = new Float32Array([-base / 2, 0, 0, base / 2, 0, 0, 0, height, 0]);
    const uvs = new Float32Array([0, 0, 1, 0, 0.5, 1]);
    geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setIndex([0, 1, 2]);
    geo.computeVertexNormals();`;
if (!s.includes(old)) { console.error('old not found'); process.exit(1); }
s = s.replace(old, neu);
fs.writeFileSync(p, s, 'utf8');
console.log('done');
