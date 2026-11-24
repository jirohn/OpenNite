const fs = require('fs');
const p = 'src/game/bot.js';
let s = fs.readFileSync(p, 'utf8');
s = s.replace(
  "    this.character.update(dt);\n    this.character.group.visible",
  "    this.character.grounded = this.grounded;\n    this.character.update(dt);\n    this.character.group.visible"
);
fs.writeFileSync(p, s, 'utf8');
console.log('done');
