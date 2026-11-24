const fs = require('fs');
const p = 'tools/gun-editor.mjs';
let s = fs.readFileSync(p, 'utf8');
// Add setGroundColor function after setBackground
s = s.replace(
  "function setBackground(hex) {\n  scene.background = new THREE.Color(hex);",
  "function setGroundColor(hex) {\n  ground.material.color.set(hex);\n  const lbl = document.querySelector('#groundVal'); if (lbl) lbl.textContent = hex;\n  const inp = document.querySelector('#groundColor'); if (inp) inp.value = hex;\n}\nfunction setBackground(hex) {\n  scene.background = new THREE.Color(hex);"
);
// bind in bindVisualControls
s = s.replace(
  "  const bg = document.querySelector('#bgColor');\n  bg?.addEventListener('input', () => setBackground(bg.value));",
  "  const bg = document.querySelector('#bgColor');\n  bg?.addEventListener('input', () => setBackground(bg.value));\n  const gc = document.querySelector('#groundColor');\n  gc?.addEventListener('input', () => setGroundColor(gc.value));"
);
fs.writeFileSync(p, s, 'utf8');
console.log('done');
