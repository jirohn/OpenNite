const fs = require('fs');
const p = 'src/game/game.js';
let s = fs.readFileSync(p, 'utf8');
s = s.replace(
  "    await this.world.load();\n    this.app.setLoading?.(55, 'Colocando botones y jugadores...');",
  "    await this.world.load();\n    this.building = new BuildingManager(this.scene, this.world, this.settings);\n    this.app.setLoading?.(55, 'Colocando botones y jugadores...');"
);
// Add B key toggle in update loop (playing mode)
s = s.replace(
  "    if (this.input.isDown('KeyE') && near && !this.pickupLatch) {",
  "    if (this.input.isDown('KeyB') && !this.buildToggleLatch) { this.buildToggleLatch = true; const on = this.building.toggle(); this.hud.toast(on ? 'Modo construcción ON (Q/E rotar, clic colocar)' : 'Modo construcción OFF', on ? 'good' : 'warn'); }\n    if (!this.input.isDown('KeyB')) this.buildToggleLatch = false;\n    if (this.building?.enabled) this.building.update(this.player, this.camera, this.input);\n    if (this.input.isDown('KeyE') && near && !this.pickupLatch) {"
);
fs.writeFileSync(p, s, 'utf8');
console.log('done');
