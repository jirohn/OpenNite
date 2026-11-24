const fs = require('fs');
const p = 'src/game/player.js';
let s = fs.readFileSync(p, 'utf8');
// set aimPitch/aimDir before character.update
s = s.replace(
  "    this.character.group.position.copy(this.position);\n    // El GLB mira hacia +Z; la cámara/frente del juego miran hacia -Z.\n    this.character.group.rotation.y = this.yaw + Math.PI;",
  "    this.character.group.position.copy(this.position);\n    // El GLB mira hacia +Z; la cámara/frente del juego miran hacia -Z.\n    this.character.group.rotation.y = this.yaw + Math.PI;\n    this.character.aimPitch = this.pitch;\n    this.character.aimDir = this.getAimDirection().clone();"
);
fs.writeFileSync(p, s, 'utf8');
console.log('done');
