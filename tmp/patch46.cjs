const fs = require('fs');
const p = 'src/game/world.js';
let s = fs.readFileSync(p, 'utf8');
const old = `           const twoFloor = idx % 7 === 3;
           hut(x, z, ring.w + rnd() * 1.5, ring.d + rnd(), 3.1 + rnd() * 1.1,
             -a + Math.PI / 2 + (rnd() - 0.5) * 0.3,
             idx % 4 === 0 ? 'wall2' : idx % 3 === 0 ? 'wall' : 'wood', 'roof', twoFloor);`;
const neu = `           const twoFloor = idx % 7 === 3;
           const gable = rnd() > 0.25;
           const windows = rnd() > 0.15;
           hut(x, z, ring.w + rnd() * 1.5, ring.d + rnd(), 3.1 + rnd() * 1.1,
             -a + Math.PI / 2 + (rnd() - 0.5) * 0.3,
             idx % 4 === 0 ? 'wall2' : idx % 3 === 0 ? 'wall' : 'wood', 'roof', twoFloor);
           // Apply gable/windows via a direct makeBuilding override is not possible through hut;
           // hut keeps defaults. Variety comes from twoFloor and materials.`;
// hut doesn't pass gable/windows. Let me instead modify hut to accept opts.
if (!s.includes(old)) { console.error('old not found'); process.exit(1); }
s = s.replace(old, neu);
fs.writeFileSync(p, s, 'utf8');
console.log('done');
