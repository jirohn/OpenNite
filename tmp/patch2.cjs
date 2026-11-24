const fs = require('fs');
const p = 'src/game/character.js';
let s = fs.readFileSync(p, 'utf8');
const old = `    if (this.isUbc && this.needsGunAlign) {
      // Horneamos el alineado en la pose armada (la pose base del rig), con la
      // animación ya asentada. Si nunca se usa, esperamos 2.5 s y horneamos en
      // la pose que haya. Tras eso el arma acompaña al hueso siempre.
      this.gunAlignTimer += dt;
      // Solo horneamos en la pose armada tranquila; si el personaje está en
      // otra acción, conserva el alineado calculado en attachWeapon().
      if (this.current === 'idleArmed' && this.gunAlignTimer > 0.45) {
        this.updateWeaponMount();
        this.needsGunAlign = false;
      }
    }`;
const neu = `    if (this.isUbc) {
      if (this.alwaysAlignForward) {
        this.updateWeaponMount();
      } else if (this.needsGunAlign) {
        this.gunAlignTimer += dt;
        if (this.current === 'idleArmed' && this.gunAlignTimer > 0.45) {
          this.updateWeaponMount();
          this.needsGunAlign = false;
        }
      }
    }`;
if (!s.includes(old)) { console.error('old not found'); process.exit(1); }
s = s.replace(old, neu);
fs.writeFileSync(p, s, 'utf8');
console.log('done');
