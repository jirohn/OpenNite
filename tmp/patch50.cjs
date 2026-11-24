const fs = require('fs');
const p = 'src/game/world.js';
let s = fs.readFileSync(p, 'utf8');
const oldHut = "    const hut = (x, z, w, d, h, rot = 0, wallMat = 'wood', roofMat = 'roof', twoFloor = false) => {\n      if (this.heightAt(x, z) < this.waterLevel + 1.8) return;\n      if (this.nearRoad(x, z, 2.8)) return;\n      this.makeBuilding(ctx, x, z, w, d, h, {\n        front: rot, wallMat, roofMat, windows: true, twoFloor,\n      });\n    };";
const newHut = "    const hut = (x, z, w, d, h, rot = 0, wallMat = 'wood', roofMat = 'roof', opts = {}) => {\n      if (this.heightAt(x, z) < this.waterLevel + 1.8) return;\n      if (this.nearRoad(x, z, 2.8)) return;\n      this.makeBuilding(ctx, x, z, w, d, h, {\n        front: rot, wallMat, roofMat, windows: opts.windows !== false, gable: opts.gable !== false, twoFloor: !!opts.twoFloor,\n      });\n    };";
if (!s.includes(oldHut)) { console.error('oldHut not found'); process.exit(1); }
s = s.replace(oldHut, newHut);
fs.writeFileSync(p, s, 'utf8');
console.log('hut updated');
