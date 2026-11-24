const fs = require('fs');
const p = 'tools/map-editor.mjs';
let s = fs.readFileSync(p, 'utf8');
const old = `world.generateRoads();
world.generateSanBorondonLandmarks();
world.setupWater();
world.setupJumpPads();
const range = Math.ceil(world.half / 256) + 1;
for (let cx = -range; cx <= range; cx++) for (let cz = -range; cz <= range; cz++) world.createChunk(cx, cz);
world.loaded = true;`;
const neu = `world.generateRoads();
world.setupWater();
const range = Math.ceil(world.half / 256) + 1;
for (let cx = -range; cx <= range; cx++) for (let cz = -range; cz <= range; cz++) world.createChunk(cx, cz);
world.loaded = true;`;
if (!s.includes(old)) { console.error('old not found'); process.exit(1); }
s = s.replace(old, neu);
fs.writeFileSync(p, s, 'utf8');
console.log('done');
