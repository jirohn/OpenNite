const fs = require('fs');
const p = 'tools/gun-editor.mjs';
let s = fs.readFileSync(p, 'utf8');
s = s.replace("  sel.innerHTML = Object.keys(WEAPONS)\n    .filter((id) => !WEAPONS[id].melee)\n    .map((id) => `<option value=\"${id}\"${id === weaponType ? ' selected' : ''}>${WEAPONS[id].name}</option>`)",
            "  sel.innerHTML = Object.keys(WEAPONS)\n    .map((id) => `<option value=\"${id}\"${id === weaponType ? ' selected' : ''}>${WEAPONS[id].name}</option>`)");
fs.writeFileSync(p, s, 'utf8');
console.log('done');
