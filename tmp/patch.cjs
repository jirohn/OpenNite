const fs = require('fs');
const p = 'src/game/character.js';
let s = fs.readFileSync(p, 'utf8');
const old = `    if (this.isUbc && this.needsGunAlign) {
      this.gunAlignTimer += dt;
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
