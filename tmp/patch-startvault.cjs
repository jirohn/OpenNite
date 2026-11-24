const fs=require('fs');
const f='src/game/player.js';
let s=fs.readFileSync(f,'utf8');
const old=`    // Animación de trepa: forzar bucle aéreo/mantle para que se vea durante el trepado.
    this.character.current = '';
    this.character.play('mantle', 0.1);
    return true;
  }`;
const neu=`    // Animación de trepa: forzar bucle aéreo/mantle para que se vea durante el trepado.
    this.character.current = '';
    this.character.play('mantle', 0.1);
    return true;
  }

  _startVault(tx, ty, tz) {
    this.mantling = true;
    this.sliding = false;
    this.slideTime = 0;
    this.mantleTime = 0;
    this.mantleDuration = 0.62;
    this.mantleStart.copy(this.position);
    this.mantleEnd.set(tx, ty, tz);
    this.mantleMid.set(
      lerp(this.position.x, tx, 0.5),
      Math.max(this.position.y, ty) + 0.95,
      lerp(this.position.z, tz, 0.5),
    );
    this.velocity.set(0, 0, 0);
    this.grounded = false;
    this.gliding = false;
    this.character.current = '';
    this.character.play('vault', 0.08);
    return true;
  }`;
if(!s.includes(old)){console.error('not found'); process.exit(1);}
fs.writeFileSync(f,s.replace(old,neu)); console.log('ok');