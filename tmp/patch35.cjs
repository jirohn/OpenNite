const fs = require('fs');
const p = 'src/game/character.js';
let s = fs.readFileSync(p, 'utf8');

// 1. constructor: add aimPitch and aimDir
s = s.replace(
  "    this.manualGunAlign = false;\n    this.alwaysAlignForward = false;",
  "    this.manualGunAlign = false;\n    this.alwaysAlignForward = false;\n    this.aimPitch = 0;\n    this.aimDir = new THREE.Vector3(0, 0, -1);"
);

// 2. applyRecoil UBC branch: apply aim pitch
s = s.replace(
  "    if (this.isUbc) { this.weaponMount.position.set(0, 0, 0); return; }",
  "    if (this.isUbc) { this.weaponMount.position.set(0, 0, 0); this.weaponMount.rotateX(this.aimPitch || 0); return; }"
);

// 3. applyRightIK target: use aimDir when no ikRightTarget
const old = `    let target;
    if (weapon?.userData?.ikRightTarget) {
      target = weapon.localToWorld(weapon.userData.ikRightTarget.clone());
    } else {
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.group.quaternion);
      target = this.group.position.clone().add(fwd.multiplyScalar(0.9)).add(new THREE.Vector3(0, 1.15, 0));
    }`;
const neu = `    let target;
    if (weapon?.userData?.ikRightTarget) {
      target = weapon.localToWorld(weapon.userData.ikRightTarget.clone());
    } else {
      const fwd = this.aimDir ? this.aimDir.clone() : new THREE.Vector3(0, 0, -1).applyQuaternion(this.group.quaternion);
      target = this.group.position.clone().add(fwd.multiplyScalar(0.9)).add(new THREE.Vector3(0, 1.15, 0));
    }`;
if (!s.includes(old)) { console.error('old target block not found'); process.exit(1); }
s = s.replace(old, neu);

fs.writeFileSync(p, s, 'utf8');
console.log('done');
