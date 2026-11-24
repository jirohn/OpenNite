const fs = require('fs');
const p = 'tools/map-editor.mjs';
let s = fs.readFileSync(p, 'utf8');
const old = "const world = new World(scene, { type: 'island', theme: 'temperate', size: 360, seed: 20261119, waterLevel: 0, pois: [], modelBase: '/models/quaternius/glTF/', propBase: '/models/quaternius/props/glTF/' }, settings);";
const neu = "let mapData = null;\ntry { const res = await fetch('/maps/san-borondon.json'); mapData = await res.json(); } catch {}\nif (!mapData) mapData = { type: 'island', theme: 'temperate', size: 360, seed: 20261119, waterLevel: 0, pois: [] };\nmapData.modelBase = '/models/quaternius/glTF/';\nmapData.propBase = '/models/quaternius/props/glTF/';\nconst world = new World(scene, mapData, settings);";
if (!s.includes(old)) { console.error('old not found'); process.exit(1); }
s = s.replace(old, neu);
fs.writeFileSync(p, s, 'utf8');
console.log('done');
