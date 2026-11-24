const fs = require('fs');
const p = 'src/game/character.js';
let s = fs.readFileSync(p, 'utf8');

// update call: pass world
s = s.replace('    if (this.isUbc) this.applyFootIK();\n',
              '    if (this.isUbc && this.world) this.applyFootIK(this.world);\n');

// Add applyFootIK method after applyRightIK. Find end of applyRightIK method (before applyRecoil? it's after applySupportIK block). Insert before "  rotateBoneTowards"
const marker = '  rotateBoneTowards(bone, effector, target, influence) {';
const method = `  applyFootIK(world) {
    const { thighL, calfL, footL, thighR, calfR, footR } = this.bones;
    if (!thighL || !calfL || !footL) return;
    this.group.updateWorldMatrix(true, true);
    for (const side of ['L', 'R']) {
      const thigh = side === 'L' ? thighL : thighR;
      const calf = side === 'L' ? calfL : calfR;
      const foot = side === 'L' ? footL : footR;
      if (!thigh || !calf || !foot) continue;
      const footPos = foot.getWorldPosition(new THREE.Vector3());
      const groundY = world.heightAt ? world.heightAt(footPos.x, footPos.z) : footPos.y;
      const target = new THREE.Vector3(footPos.x, groundY, footPos.z);
      // simple 2-bone IK: pull thigh and calf toward target
      const shoulder = thigh.getWorldPosition(new THREE.Vector3());
      const toTarget = target.clone().sub(shoulder);
      const dist = toTarget.length();
      const upperLen = thigh.getWorldPosition(new THREE.Vector3()).distanceTo(calf.getWorldPosition(new THREE.Vector3()));
      const lowerLen = calf.getWorldPosition(new THREE.Vector3()).distanceTo(foot.getWorldPosition(new THREE.Vector3()));
      const reach = (upperLen + lowerLen) * 0.98;
      if (dist > reach) target.copy(shoulder).addScaledVector(toTarget, reach / dist);
      for (let i = 0; i < 2; i++) {
        this.rotateBoneTowards(calf, foot, target, 0.6);
        this.rotateBoneTowards(thigh, calf, target, 0.4);
      }
    }
  }
`;
if (!s.includes(marker)) { console.error('marker not found'); process.exit(1); }
s = s.replace(marker, method + marker);
fs.writeFileSync(p, s, 'utf8');
console.log('done');
