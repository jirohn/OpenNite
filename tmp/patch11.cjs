const fs = require('fs');
const p = 'src/game/character.js';
let s = fs.readFileSync(p, 'utf8');
const old = `  applySupportIK() {
    const weapon = this.weaponMount?.children?.[0];
    const ikStrength = this.isUbc ? (weapon?.userData?.ikStrength ?? 0) : (this.supportBase + this.supportBoost);
    const influence = Math.min(0.92, ikStrength);
    if (influence < 0.01) return;
    const { shoulderL, upperL, lowerL, handL } = this.bones;
    if (!upperL || !lowerL || !handL || !weapon?.userData?.supportGrip) return;
    this.group.updateWorldMatrix(true, true);
    weapon.updateWorldMatrix(true, false);
    const target = weapon.localToWorld(weapon.userData.supportGrip.clone());
    if (!this.supportReach) {
      const a = upperL.getWorldPosition(new THREE.Vector3());
      const b = lowerL.getWorldPosition(new THREE.Vector3());
      const c = handL.getWorldPosition(new THREE.Vector3());
      this.supportReach = (a.distanceTo(b) + b.distanceTo(c)) * 0.97;
    }
    const shoulder = upperL.getWorldPosition(new THREE.Vector3());
    const toTarget = target.clone().sub(shoulder);
    const distance = toTarget.length();
    if (distance > this.supportReach) {
      target.copy(shoulder).addScaledVector(toTarget, this.supportReach / distance);
    }
    for (let i = 0; i < 2; i++) {
      this.rotateBoneTowards(lowerL, handL, target, influence * 0.8);
      this.rotateBoneTowards(upperL, lowerL, target, influence * 0.55);
      if (shoulderL) this.rotateBoneTowards(shoulderL, upperL, target, influence * 0.3);
    }
  }`;
const neu = `  applySupportIK() {
    const weapon = this.weaponMount?.children?.[0];
    const ikStrength = this.isUbc ? (weapon?.userData?.ikStrengthLeft ?? weapon?.userData?.ikStrength ?? 0) : (this.supportBase + this.supportBoost);
    const influence = Math.min(0.92, ikStrength);
    if (influence < 0.01) return;
    const { upperL, lowerL, handL } = this.bones;
    if (!upperL || !lowerL || !handL || !weapon?.userData?.supportGrip) return;
    this.group.updateWorldMatrix(true, true);
    weapon.updateWorldMatrix(true, false);
    const target = weapon.localToWorld(weapon.userData.supportGrip.clone());
    if (!this.supportReach) {
      const a = upperL.getWorldPosition(new THREE.Vector3());
      const b = lowerL.getWorldPosition(new THREE.Vector3());
      const c = handL.getWorldPosition(new THREE.Vector3());
      this.supportReach = (a.distanceTo(b) + b.distanceTo(c)) * 0.97;
    }
    const shoulder = upperL.getWorldPosition(new THREE.Vector3());
    const toTarget = target.clone().sub(shoulder);
    const distance = toTarget.length();
    if (distance > this.supportReach) {
      target.copy(shoulder).addScaledVector(toTarget, this.supportReach / distance);
    }
    for (let i = 0; i < 2; i++) {
      this.rotateBoneTowards(lowerL, handL, target, influence * 0.8);
      this.rotateBoneTowards(upperL, lowerL, target, influence * 0.55);
      // No se tira del hombro/espalda: evita que la espalda se baje.
    }
  }
  applyRightIK() {
    const weapon = this.weaponMount?.children?.[0];
    const ikStrength = this.isUbc ? (weapon?.userData?.ikStrengthRight ?? 0) : 0;
    const influence = Math.min(0.5, ikStrength);
    if (influence < 0.01) return;
    const { upperR, lowerR, handR } = this.bones;
    if (!upperR || !lowerR || !handR) return;
    this.group.updateWorldMatrix(true, true);
    weapon?.updateWorldMatrix(true, false);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.group.quaternion);
    const target = this.group.position.clone().add(fwd.multiplyScalar(0.9)).add(new THREE.Vector3(0, 1.15, 0));
    const shoulder = upperR.getWorldPosition(new THREE.Vector3());
    const toTarget = target.clone().sub(shoulder);
    const distance = toTarget.length();
    const reach = (upperR.getWorldPosition(new THREE.Vector3()).distanceTo(lowerR.getWorldPosition(new THREE.Vector3())) + lowerR.getWorldPosition(new THREE.Vector3()).distanceTo(handR.getWorldPosition(new THREE.Vector3()))) * 0.97;
    if (distance > reach) target.copy(shoulder).addScaledVector(toTarget, reach / distance);
    for (let i = 0; i < 2; i++) {
      this.rotateBoneTowards(lowerR, handR, target, influence * 0.7);
      this.rotateBoneTowards(upperR, lowerR, target, influence * 0.4);
    }
  }`;
if (!s.includes(old)) { console.error('old not found'); process.exit(1); }
s = s.replace(old, neu);
// call applyRightIK in update after applySupportIK
s = s.replace('    this.applySupportIK();\n', '    this.applySupportIK();\n    if (this.isUbc) this.applyRightIK();\n');
// rename ikStrength usage: keep legacy field
fs.writeFileSync(p, s, 'utf8');
console.log('done');
