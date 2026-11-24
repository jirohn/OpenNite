const fs = require('fs');
const p = 'src/game/world.js';
let s = fs.readFileSync(p, 'utf8');
const old = "          const twoFloor = idx % 7 === 3;\n          hut(x, z, ring.w + rnd() * 1.5, ring.d + rnd(), 3.1 + rnd() * 1.1,\n            -a + Math.PI / 2 + (rnd() - 0.5) * 0.3,\n            idx % 4 === 0 ? 'wall2' : idx % 3 === 0 ? 'wall' : 'wood', 'roof', twoFloor);";
const neu = "          const twoFloor = idx % 7 === 3;\n          const gable = rnd() > 0.25;\n          const windows = rnd() > 0.15;\n          hut(x, z, ring.w + rnd() * 1.5, ring.d + rnd(), 3.1 + rnd() * 1.1,\n            -a + Math.PI / 2 + (rnd() - 0.5) * 0.3,\n            idx % 4 === 0 ? 'wall2' : idx % 3 === 0 ? 'wall' : 'wood', 'roof',\n            { twoFloor, gable, windows });";
if (!s.includes(old)) { console.error('old not found'); process.exit(1); }
s = s.replace(old, neu);
fs.writeFileSync(p, s, 'utf8');
console.log('done');
