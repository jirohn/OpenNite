const fs = require('fs');
const p = 'src/game/game.js';
let s = fs.readFileSync(p, 'utf8');

// Force debugMode off on startup (ignore saved true)
s = s.replace(
  "    await this.settings.load();\n",
  "    await this.settings.load();\n    this.settings.set('debugMode', false);\n"
);

// F5 works in preview too
s = s.replace(
  "    document.addEventListener('keydown', (e) => {\n      if (e.code !== 'F5' || !this.world?.debug) return;",
  "    document.addEventListener('keydown', (e) => {\n      if (e.code !== 'F5') return;\n      if (!this.world?.debug && !this.previewDebug) return;"
);

fs.writeFileSync(p, s, 'utf8');
console.log('done');
