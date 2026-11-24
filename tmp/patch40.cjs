const fs = require('fs');
const p1 = 'src/game/character.js';
let s1 = fs.readFileSync(p1, 'utf8');
s1 = s1.replace(
  "    this.aimPitch = 0;\n    this.aimDir = new THREE.Vector3(0, 0, -1);",
  "    this.aimPitch = 0;\n    this.aimDir = new THREE.Vector3(0, 0, -1);\n    this.grounded = true;"
);
// guard applyFootIK
s1 = s1.replace(
  "  applyFootIK(world) {\n    const { thighL, calfL, footL, thighR, calfR, footR } = this.bones;",
  "  applyFootIK(world) {\n    if (!this.grounded) return;\n    const { thighL, calfL, footL, thighR, calfR, footR } = this.bones;"
);
fs.writeFileSync(p1, s1, 'utf8');

const p2 = 'src/game/player.js';
let s2 = fs.readFileSync(p2, 'utf8');
s2 = s2.replace(
  "    this.character.group.position.copy(this.position);",
  "    this.character.group.position.copy(this.position);\n    this.character.grounded = this.grounded;"
);
fs.writeFileSync(p2, s2, 'utf8');
console.log('done');
