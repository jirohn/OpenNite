const fs = require('fs');
const p = 'src/game/character.js';
let s = fs.readFileSync(p, 'utf8');
// Add footIKTimer in constructor
s = s.replace(
  "    this.grounded = true;",
  "    this.grounded = true;\n    this.footIKTimer = 0;"
);
// Throttle in applyFootIK
s = s.replace(
  "  applyFootIK(world) {\n    if (!this.grounded) return;",
  "  applyFootIK(world) {\n    if (!this.grounded) return;\n    this.footIKTimer -= (this._dt || 0.016);\n    if (this.footIKTimer > 0) return;\n    this.footIKTimer = 0.05;"
);
// store dt in update
s = s.replace(
  "  update(dt) {\n    this.kitChar.update(dt);",
  "  update(dt) {\n    this._dt = dt;\n    this.kitChar.update(dt);"
);
fs.writeFileSync(p, s, 'utf8');
console.log('done');
