const fs = require('fs');
const p = 'src/game/world.js';
const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);
const newBlock = [
  '    // Casas sueltas en monta\\u00f1as con loot garantizado.',
  '    let mountainHuts = 0;',
  '    for (let i = 0; i < 220 && mountainHuts < 18; i++) {',
  '      const a = rnd() * Math.PI * 2;',
  '      const r = this.half * (0.12 + rnd() * 0.62);',
  '      const x = Math.cos(a) * r;',
  '      const z = Math.sin(a) * r;',
  '      const y = this.heightAt(x, z);',
  '      if (y < this.waterLevel + 7.5) continue;',
  '      if (this.nearPOI(x, z, 0.8)) continue;',
  '      if (this.nearRoad(x, z, 3)) continue;',
  '      const rot = rnd() * Math.PI * 2;',
  '      const w = 6 + rnd() * 4;',
  '      const d = 5 + rnd() * 3.5;',
  '      const h = 2.8 + rnd() * 0.8;',
  '      hut(x, z, w, d, h, rot, rnd() > 0.5 ? \'wood\' : \'wall2\', \'roof\', { windows: true, gable: rnd() > 0.3 });',
  '      crate(x + 2.5, z + 1.5, rnd() > 0.5 ? \'Crate_Wooden\' : \'FarmCrate_Apple\');',
  '      barrel(x - 2.5, z - 1.5, rnd() > 0.5 ? \'Barrel\' : \'Barrel_Apples\');',
  '      ctx.loot.push(new THREE.Vector3(x + 1.2, y + 1, z + 1.2));',
  '      ctx.loot.push(new THREE.Vector3(x - 1.8, y + 1, z + 0.8));',
  '      ctx.spawns.push(new THREE.Vector3(x + 3.5, y + 1.5, z + 3.5));',
  '      if (rnd() > 0.5) prop(\'Torch_Metal\', x + 3.2, z - 2.2, rot);',
  '      mountainHuts++;',
  '    }',
  '',
  '    // Caba\\u00f1as aisladas, almacenes y bot\\u00edn disperso por el interior.',
  '    for (let i = 0; i < 20; i++) {',
  '      const a = rnd() * Math.PI * 2;',
  '      const r = this.half * (0.16 + rnd() * 0.48);',
  '      const x = Math.cos(a) * r;',
  '      const z = Math.sin(a) * r;',
  '      if (this.nearPOI(x, z, 1.2)) continue;',
  '      if (this.heightAt(x, z) < this.waterLevel + 2) continue;',
  '      if (rnd() > 0.38) hut(x, z, 6 + rnd() * 4, 5 + rnd() * 3, 2.8, rnd() * Math.PI * 2);',
  '      else crate(x, z, rnd() > 0.5 ? \'Crate_Wooden\' : \'Crate_Metal\');',
  '      if (rnd() > 0.5) barrel(x + 3, z + 2);',
  '    }',
].map(s => s.replace(/\\u00f1/g, '\u00f1').replace(/\\u00ed/g, '\u00ed'));
// replace 0-based 2022..2033 (12 lines) = lines 2023..2034 1-based
// line 2023 (0-based 2022) is the comment "    // Caba??as aisladas..."
lines.splice(2022, 12, ...newBlock);
fs.writeFileSync(p, lines.join('\n'), 'utf8');
console.log('replaced mountain huts block');