const fs = require('fs');
const p = 'src/game/world.js';
let s = fs.readFileSync(p, 'utf8');

// Add gridSize to constructor (after procedural assignment)
s = s.replace(
  "    this.procedural = map.type !== 'glb';",
  "    this.procedural = map.type !== 'glb';\n    this.gridSize = map.gridSize || 4;\n    this.gridSnap = map.gridSnap !== false;"
);

// Snap heightAt to grid
s = s.replace(
  "     let h = this.rawHeightAt(x, z);\n     for (const poi of this.map.pois || []) {",
  "     let h = this.rawHeightAt(x, z);\n     if (this.gridSnap) h = Math.round(h / 2) * 2;\n     for (const poi of this.map.pois || []) {"
);
// Also snap the final return
s = s.replace(
  "     return h;\n   }\n\n   /** Suelo efectivo al caer",
  "     if (this.gridSnap) h = Math.round(h / 2) * 2;\n     return h;\n   }\n\n   /** Suelo efectivo al caer"
);

fs.writeFileSync(p, s, 'utf8');
console.log('done');
