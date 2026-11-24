const fs = require('fs');
const p = 'src/game/character.js';
let s = fs.readFileSync(p, 'utf8');
const old = `    this.bones = {
      upperR: pick('upperarmr', 'upperarm_r'),
      lowerR: pick('lowerarmr', 'lowerarm_r'),
      handR: pick('handslotr', 'handr', 'hand_r', 'handslot_r'),
      shoulderL: pick('chest', 'spine_03', 'spine_02'),
      upperL: pick('upperarml', 'upperarm_l'),
      lowerL: pick('lowerarml', 'lowerarm_l'),
      handL: pick('handslotl', 'handl', 'hand_l', 'handslot_l'),
    };`;
const neu = `    this.bones = {
      upperR: pick('upperarmr', 'upperarm_r'),
      lowerR: pick('lowerarmr', 'lowerarm_r'),
      handR: pick('handslotr', 'handr', 'hand_r', 'handslot_r'),
      shoulderL: pick('chest', 'spine_03', 'spine_02'),
      upperL: pick('upperarml', 'upperarm_l'),
      lowerL: pick('lowerarml', 'lowerarm_l'),
      handL: pick('handslotl', 'handl', 'hand_l', 'handslot_l'),
      thighL: pick('thigh_l', 'thighl'),
      calfL: pick('calf_l', 'calfl'),
      footL: pick('foot_l', 'footl'),
      thighR: pick('thigh_r', 'thighr'),
      calfR: pick('calf_r', 'calfr'),
      footR: pick('foot_r', 'footr'),
    };`;
if (!s.includes(old)) { console.error('old not found'); process.exit(1); }
s = s.replace(old, neu);
// call applyFootIK in update for UBC
s = s.replace('    this.applySupportIK();\n    if (this.isUbc) this.applyRightIK();\n',
              '    this.applySupportIK();\n    if (this.isUbc) this.applyRightIK();\n    if (this.isUbc) this.applyFootIK();\n');
fs.writeFileSync(p, s, 'utf8');
console.log('done');
