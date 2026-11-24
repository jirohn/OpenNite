const fs = require('fs');
const p = 'tools/gun-editor.mjs';
let s = fs.readFileSync(p, 'utf8');
const old = `    if (target.name === 'support') {
      gun.userData.supportGrip = local.clone();
      syncSupportSlidersFromGun();
    } else {
      gun.userData.ikRightTarget = local.clone();
      syncRightIkSlidersFromGun();
    }`;
const neu = `    if (target.name === 'support') {
      gun.userData.supportGrip = local.clone();
      syncSupportSlidersFromGun();
    } else if (target.name === 'rightIk') {
      gun.userData.ikRightTarget = local.clone();
      syncRightIkSlidersFromGun();
    } else if (target.name === 'weaponPos') {
      syncSlidersFromGun();
    }`;
if (!s.includes(old)) { console.error('old not found'); process.exit(1); }
s = s.replace(old, neu);
fs.writeFileSync(p, s, 'utf8');
console.log('done');
