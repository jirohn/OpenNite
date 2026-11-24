const fs = require('fs');
const p = 'src/game/world.js';
let s = fs.readFileSync(p, 'utf8');

// Update hut signature to accept gable/windows
const oldHut = `     const hut = (x, z, w, d, h, rot = 0, wallMat = 'wood', roofMat = 'roof', twoFloor = false) => {
       if (this.heightAt(x, z) < this.waterLevel + 1.8) return;
       if (this.nearRoad(x, z, 2.8)) return;
       this.makeBuilding(ctx, x, z, w, d, h, {
         front: rot, wallMat, roofMat, windows: true, twoFloor,
       });
     };`;
const newHut = `     const hut = (x, z, w, d, h, rot = 0, wallMat = 'wood', roofMat = 'roof', opts = {}) => {
       if (this.heightAt(x, z) < this.waterLevel + 1.8) return;
       if (this.nearRoad(x, z, 2.8)) return;
       this.makeBuilding(ctx, x, z, w, d, h, {
         front: rot, wallMat, roofMat, windows: opts.windows !== false, gable: opts.gable !== false, twoFloor: !!opts.twoFloor,
       });
     };`;
if (!s.includes(oldHut)) { console.error('oldHut not found'); process.exit(1); }
s = s.replace(oldHut, newHut);

// Update town ring call to pass variety opts
const oldCall = `           const twoFloor = idx % 7 === 3;
           const gable = rnd() > 0.25;
           const windows = rnd() > 0.15;
           hut(x, z, ring.w + rnd() * 1.5, ring.d + rnd(), 3.1 + rnd() * 1.1,
             -a + Math.PI / 2 + (rnd() - 0.5) * 0.3,
             idx % 4 === 0 ? 'wall2' : idx % 3 === 0 ? 'wall' : 'wood', 'roof', twoFloor);`;
const newCall = `           const twoFloor = idx % 7 === 3;
           const gable = rnd() > 0.25;
           const windows = rnd() > 0.15;
           hut(x, z, ring.w + rnd() * 1.5, ring.d + rnd(), 3.1 + rnd() * 1.1,
             -a + Math.PI / 2 + (rnd() - 0.5) * 0.3,
             idx % 4 === 0 ? 'wall2' : idx % 3 === 0 ? 'wall' : 'wood', 'roof',
             { twoFloor, gable, windows });`;
if (!s.includes(oldCall)) { console.error('oldCall not found'); process.exit(1); }
s = s.replace(oldCall, newCall);

fs.writeFileSync(p, s, 'utf8');
console.log('done');
