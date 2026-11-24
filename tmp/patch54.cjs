const fs = require('fs');
const p = 'tools/map-editor.mjs';
let s = fs.readFileSync(p, 'utf8');
s = s.replace(
  "const world = new World(scene, { type: 'island', theme: 'temperate', size: 360, seed: 20261119, waterLevel: 0, pois: [] }, settings);",
  "const world = new World(scene, { type: 'island', theme: 'temperate', size: 360, seed: 20261119, waterLevel: 0, pois: [], modelBase: '/models/quaternius/glTF/', propBase: '/models/quaternius/props/glTF/' }, settings);"
);
fs.writeFileSync(p, s, 'utf8');
console.log('done');
