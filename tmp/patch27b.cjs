const fs = require('fs');
const p = 'tools/gun-editor.mjs';
let s = fs.readFileSync(p, 'utf8');
// reduce arrow size: len 0.5 -> 0.17, cone 0.12/0.22 -> 0.04/0.073
s = s.replace("    const len = 0.5;", "    const len = 0.17;");
s = s.replace("      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.22, 10), new THREE.MeshBasicMaterial({ color: c }));", "      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.073, 10), new THREE.MeshBasicMaterial({ color: c }));");
s = s.replace("      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, len, 8), new THREE.MeshBasicMaterial({ visible: false }));", "      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, len, 8), new THREE.MeshBasicMaterial({ visible: false }));");
fs.writeFileSync(p, s, 'utf8');
console.log('done');
