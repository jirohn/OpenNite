const fs = require('fs');
const p = 'tools/map-editor.html';
let s = fs.readFileSync(p, 'utf8');
const old = `  <div class="palette">
    <button data-piece="house" class="active">Casa</button>
    <button data-piece="tower">Torre</button>
    <button data-piece="container">Contenedor</button>
    <button data-piece="wall">Pared</button>
    <button data-piece="tree">Árbol</button>
    <button data-piece="rock">Roca</button>
  </div>`;
const neu = `  <div class="palette">
    <button data-piece="house" class="active">Casa</button>
    <button data-piece="tower">Torre</button>
    <button data-piece="container">Contenedor</button>
    <button data-piece="wall">Pared</button>
    <button data-piece="road">Camino</button>
    <button data-piece="tree">Árbol</button>
    <button data-piece="rock">Roca</button>
  </div>`;
if (!s.includes(old)) { console.error('old not found'); process.exit(1); }
s = s.replace(old, neu);
fs.writeFileSync(p, s, 'utf8');
console.log('done');
// map-editor.mjs: add road piece
const p2 = 'tools/map-editor.mjs';
let s2 = fs.readFileSync(p2, 'utf8');
const old2 = `  } else if (type === 'rock') {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1.5), new THREE.MeshStandardMaterial({ color: 0x777b74 }));
    rock.position.y = 0.8; g.add(rock);
  }`;
const neu2 = `  } else if (type === 'rock') {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1.5), new THREE.MeshStandardMaterial({ color: 0x777b74 }));
    rock.position.y = 0.8; g.add(rock);
  } else if (type === 'road') {
    const road = new THREE.Mesh(new THREE.BoxGeometry(4, 0.15, 4), new THREE.MeshStandardMaterial({ color: 0x5a5a5a }));
    road.position.y = 0.075; road.receiveShadow = true; g.add(road);
  }`;
if (!s2.includes(old2)) { console.error('old2 not found'); process.exit(1); }
s2 = s2.replace(old2, neu2);
fs.writeFileSync(p2, s2, 'utf8');
console.log('done2');
