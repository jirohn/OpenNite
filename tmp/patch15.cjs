const fs = require('fs');
const p = 'src/game/gun-config.js';
let s = fs.readFileSync(p, 'utf8');
// getGunPlacement: add ikRightTarget
s = s.replace(
  "  if (entry.ikStrengthRight != null) out.ikStrengthRight = Number(entry.ikStrengthRight);\n  return out;",
  "  if (entry.ikStrengthRight != null) out.ikStrengthRight = Number(entry.ikStrengthRight);\n  if (entry.ikRightTarget && Array.isArray(entry.ikRightTarget.position)) {\n    out.ikRightTarget = { position: entry.ikRightTarget.position.map(Number) };\n  }\n  return out;"
);
// setGunPlacement: add ikRightTarget
s = s.replace(
  "  if (cfg.ikStrengthRight != null) config[t].ikStrengthRight = Number(cfg.ikStrengthRight);",
  "  if (cfg.ikStrengthRight != null) config[t].ikStrengthRight = Number(cfg.ikStrengthRight);\n  if (cfg.ikRightTarget && Array.isArray(cfg.ikRightTarget.position)) {\n    config[t].ikRightTarget = { position: cfg.ikRightTarget.position.map(Number) };\n  }"
);
fs.writeFileSync(p, s, 'utf8');
console.log('done');
// character.js attachWeapon: apply ikRightTarget
const p2 = 'src/game/character.js';
let s2 = fs.readFileSync(p2, 'utf8');
s2 = s2.replace(
  "    model.userData.ikStrength = model.userData.ikStrengthLeft;",
  "    model.userData.ikStrength = model.userData.ikStrengthLeft;\n    if (cfg.ikRightTarget?.position) {\n      model.userData.ikRightTarget = new THREE.Vector3(cfg.ikRightTarget.position[0], cfg.ikRightTarget.position[1], cfg.ikRightTarget.position[2]);\n    }"
);
// applyRightIK: use ikRightTarget if present
s2 = s2.replace(
  "    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.group.quaternion);\n    const target = this.group.position.clone().add(fwd.multiplyScalar(0.9)).add(new THREE.Vector3(0, 1.15, 0));",
  "    const weapon = this.weaponMount?.children?.[0];\n    let target;\n    if (weapon?.userData?.ikRightTarget) {\n      target = weapon.localToWorld(weapon.userData.ikRightTarget.clone());\n    } else {\n      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.group.quaternion);\n      target = this.group.position.clone().add(fwd.multiplyScalar(0.9)).add(new THREE.Vector3(0, 1.15, 0));\n    }"
);
// remove duplicate weapon declaration in applyRightIK (it now declares weapon at top)
s2 = s2.replace(
  "  applyRightIK() {\n    const weapon = this.weaponMount?.children?.[0];\n    const ikStrength = this.isUbc ? (weapon?.userData?.ikStrengthRight ?? 0) : 0;",
  "  applyRightIK() {\n    const ikStrength = this.isUbc ? (this.weaponMount?.children?.[0]?.userData?.ikStrengthRight ?? 0) : 0;\n    const weapon = this.weaponMount?.children?.[0];"
);
fs.writeFileSync(p2, s2, 'utf8');
console.log('done2');
