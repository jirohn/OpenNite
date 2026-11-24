const fs = require('fs');
const p = 'src/game/game.js';
let s = fs.readFileSync(p, 'utf8');
// player character world
s = s.replace(
  "    this.scene.add(this.player.character.group);",
  "    this.scene.add(this.player.character.group);\n    this.player.character.world = this.world;"
);
// bots: set world on character
s = s.replace(
  "       attachWeapon(ch, 'ar');\n       this.bots.push(bot);",
  "       attachWeapon(ch, 'ar');\n       ch.world = this.world;\n       this.bots.push(bot);"
);
// preview: after world creation, assign world to preview chars
s = s.replace(
  "    this.world.debug = new WorldDebug(this.world, this.scene, this.camera);",
  "    this.world.debug = new WorldDebug(this.world, this.scene, this.camera);\n    if (this.previewCharacter) this.previewCharacter.world = this.world;\n    for (const sk of (this.previewSkins || [])) sk.world = this.world;"
);
fs.writeFileSync(p, s, 'utf8');
console.log('done');
