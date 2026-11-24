const fs = require('fs');
const p = 'tools/gun-editor.mjs';
let s = fs.readFileSync(p, 'utf8');
s = s.replace(
  "  gun = character.weaponMount.children[0];\n  setManual(false);\n  buildAnimOptions();\n  // Hornear el alineado en la pose armada (la misma que usa el juego).",
  "  gun = character.weaponMount.children[0];\n  setManual(false);\n  buildAnimOptions();\n  syncSupportSlidersFromGun();\n  // Hornear el alineado en la pose armada (la misma que usa el juego)."
);
fs.writeFileSync(p, s, 'utf8');
console.log('done');
