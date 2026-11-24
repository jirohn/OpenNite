const fs = require('fs');
const p = 'src/game/game.js';
let s = fs.readFileSync(p, 'utf8');
s = s.replace(
  "    await this.world.load();\n",
  "    await this.world.load();\n    this.building = new BuildingManager(this.scene, this.world, this.settings);\n"
);
fs.writeFileSync(p, s, 'utf8');
console.log('done');
