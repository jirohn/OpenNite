const fs = require('fs');
const p = 'tools/gun-editor.mjs';
let s = fs.readFileSync(p, 'utf8');
s = s.replace(
  "window.addEventListener('resize', () => {",
  "document.addEventListener('mousedown', (e) => {\n  const t = e.target;\n  if (t && t.tagName === 'INPUT' && t.type === 'range') pushUndo();\n});\nwindow.addEventListener('resize', () => {"
);
fs.writeFileSync(p, s, 'utf8');
console.log('done');
