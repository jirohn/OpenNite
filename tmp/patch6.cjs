const fs = require('fs');
const p = 'src/game/character.js';
let s = fs.readFileSync(p, 'utf8');
const old = "    model.position.set(cfg.position[0], cfg.position[1], cfg.position[2]);\n    model.quaternion.set(cfg.quaternion[0], cfg.quaternion[1], cfg.quaternion[2], cfg.quaternion[3]);\n    // UBC/Unreal rig: ajustar el mount del arma para que el cañón apunte";
const neu = "    model.position.set(cfg.position[0], cfg.position[1], cfg.position[2]);\n    model.quaternion.set(cfg.quaternion[0], cfg.quaternion[1], cfg.quaternion[2], cfg.quaternion[3]);\n    // Soporte izquierdo (IK) configurable por arma.\n    if (cfg.supportGrip && cfg.supportGrip.position) {\n      model.userData.supportGrip = new THREE.Vector3(cfg.supportGrip.position[0], cfg.supportGrip.position[1], cfg.supportGrip.position[2]);\n    }\n    model.userData.ikStrength = (cfg.ikStrength != null) ? Number(cfg.ikStrength) : (type === 'pistol' || type === 'pickaxe' ? 0 : 0.6);\n    // UBC/Unreal rig: ajustar el mount del arma para que el cañón apunte";
if (!s.includes(old)) { console.error('old not found'); process.exit(1); }
s = s.replace(old, neu);
fs.writeFileSync(p, s, 'utf8');
console.log('done');
