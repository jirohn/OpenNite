const fs = require('fs');
const p = 'src/game/character.js';
let s = fs.readFileSync(p, 'utf8');
const old = `    for (let i = 0; i < 2; i++) {
      this.rotateBoneTowards(lowerL, handL, target, influence * 0.8);
      this.rotateBoneTowards(upperL, lowerL, target, influence * 0.55);
      // No se tira del hombro/espalda: evita que la espalda se baje.
    }
  }`;
const neu = `    for (let i = 0; i < 2; i++) {
      this.rotateBoneTowards(lowerL, handL, target, influence * 0.8);
      this.rotateBoneTowards(upperL, lowerL, target, influence * 0.55);
    }
    // Aplicar rotación del agarre izquierdo a la mano.
    if (weapon?.userData?.supportGripQuat) {
      const wq = weapon.getWorldQuaternion(new THREE.Quaternion());
      const sq = weapon.userData.supportGripQuat.clone();
      const targetQ = wq.clone().multiply(sq);
      handL.quaternion.copy(handL.parent ? handL.parent.worldToLocalQuaternion ? handL.parent.worldToLocalQuaternion(targetQ) : targetQ : targetQ);
      // fallback: set world quat via parent
      if (handL.parent) {
        const pq = handL.parent.getWorldQuaternion(new THREE.Quaternion());
        handL.quaternion.copy(pq.invert().multiply(targetQ));
      }
    }
  }`;
if (!s.includes(old)) { console.error('old not found'); process.exit(1); }
s = s.replace(old, neu);
fs.writeFileSync(p, s, 'utf8');
console.log('done');
