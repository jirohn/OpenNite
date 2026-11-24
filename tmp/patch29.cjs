const fs = require('fs');
const p = 'tools/gun-editor.mjs';
let s = fs.readFileSync(p, 'utf8');
const old = `  sel.onchange = () => {
    weaponType = sel.value;
    attachWeapon(character, weaponType).then(() => {`;
const neu = `  sel.onchange = () => {
    // Guardar en memoria los ajustes de la arma actual antes de cambiar.
    try {
      const gq = gun.quaternion;
      const sq = gun.userData.supportGripQuat || new THREE.Quaternion();
      const placement = { position: gun.position.toArray(), quaternion: [gq.x, gq.y, gq.z, gq.w], supportGrip: { position: (gun.userData.supportGrip || new THREE.Vector3()).toArray(), quaternion: [sq.x, sq.y, sq.z, sq.w] }, ikStrengthLeft: gun.userData.ikStrengthLeft ?? gun.userData.ikStrength ?? 0, ikStrengthRight: gun.userData.ikStrengthRight ?? 0, ikRightTarget: gun.userData.ikRightTarget ? { position: gun.userData.ikRightTarget.toArray() } : undefined };
      setGunPlacement(placement, weaponType);
      if (weaponType === 'ar' || weaponType === 'pistol') setGunPlacement(placement, 'default');
    } catch {}
    weaponType = sel.value;
    attachWeapon(character, weaponType).then(() => {`;
if (!s.includes(old)) { console.error('old not found'); process.exit(1); }
s = s.replace(old, neu);
fs.writeFileSync(p, s, 'utf8');
console.log('done');
