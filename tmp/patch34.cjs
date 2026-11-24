const fs = require('fs');
const p = 'tools/gun-editor.mjs';
let s = fs.readFileSync(p, 'utf8');

// Add showInspector function (insert before bindVisualControls)
const fn = `function showInspector(name) {
  activeGizmoTarget = (name === 'support') ? 'support' : (name === 'rightIk') ? 'rightIk' : (name === 'scene') ? activeGizmoTarget : 'weaponPos';
  for (const sec of document.querySelectorAll('.section')) {
    sec.classList.toggle('active', sec.dataset.for === name);
  }
  const hint = document.querySelector('#activeHint');
  const labels = { weaponPos: 'Arma (mano derecha)', support: 'IK mano izquierda', rightIk: 'IK mano derecha', scene: 'Escena / visual' };
  if (hint) hint.textContent = 'Activo: ' + (labels[name] || name);
}
`;
s = s.replace('function bindVisualControls() {', fn + 'function bindVisualControls() {');

// Wire hierarchy buttons
s = s.replace(
  "    document.querySelector('#selWeapon').onclick = () => setSel('weaponPos', 'Arma (mano derecha)');\n    document.querySelector('#selSupport').onclick = () => setSel('support', 'IK mano izquierda');\n    document.querySelector('#selRightIk').onclick = () => setSel('rightIk', 'IK mano derecha');",
  "    document.querySelector('#selWeapon').onclick = () => { setSel('weaponPos', 'Arma (mano derecha)'); showInspector('weaponPos'); };\n    document.querySelector('#selSupport').onclick = () => { setSel('support', 'IK mano izquierda'); showInspector('support'); };\n    document.querySelector('#selRightIk').onclick = () => { setSel('rightIk', 'IK mano derecha'); showInspector('rightIk'); };\n    document.querySelector('#selScene').onclick = () => showInspector('scene');"
);

fs.writeFileSync(p, s, 'utf8');
console.log('done');
