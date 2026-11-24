const fs = require('fs');
const p = 'src/game/game.js';
let s = fs.readFileSync(p, 'utf8');
s = s.replace(
  "      ch.play('dance');\n      await attachWeapon(ch, 'ar');\n",
  "      ch.play('dance');\n      await attachWeapon(ch, 'ar');\n      ch.alwaysAlignForward = true;\n"
);
s = s.replace(
  "        skin.play(SKIN_ANIMS[i]);\n        await attachWeapon(skin, i % 3 === 0 ? 'pistol' : i % 3 === 1 ? 'smg' : 'ar');\n",
  "        skin.play(SKIN_ANIMS[i]);\n        await attachWeapon(skin, i % 3 === 0 ? 'pistol' : i % 3 === 1 ? 'smg' : 'ar');\n        skin.alwaysAlignForward = true;\n"
);
fs.writeFileSync(p, s, 'utf8');
console.log('done');
