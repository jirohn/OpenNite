const fs = require('fs');
const p = 'tools/gun-editor.mjs';
let s = fs.readFileSync(p, 'utf8');
s = s.replace(
  "    document.querySelector('#reset').onclick = onReset;",
  "    document.querySelector('#reset').onclick = onReset;\n    document.querySelector('#undo').onclick = undo;\n    document.querySelector('#redo').onclick = redo;"
);
fs.writeFileSync(p, s, 'utf8');
console.log('done');
