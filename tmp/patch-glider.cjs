const fs=require('fs');
const f='src/game/player.js';
let s=fs.readFileSync(f,'utf8');
const old=`    if (!this.grounded && !this.gliding && !this.swimming) this.fallPeakY = Math.max(this.fallPeakY, this.position.y);
    if (this.swimming) {
      const targetY = waterY - WATER_FLOAT;
      const desiredV = clamp((targetY - this.position.y) * 4.5, -3.2, 3.2);
      this.velocity.y = lerp(this.velocity.y, desiredV, clamp(dt * 6, 0, 1));
    } else if (this.gliding) {
      this.velocity.y = Math.max(this.velocity.y - 9 * dt, -22);
      if (this.grounded) {
        this.gliding = false;
        this.audio.play('land');
      }
    } else {
      this.velocity.y -= GRAVITY * dt;
    }`;
const neu=`    if (!this.grounded && !this.gliding && !this.swimming) this.fallPeakY = Math.max(this.fallPeakY, this.position.y);
    // Auto-despliegue del paracaídas cerca del suelo (se puede desactivar con toggle).
    if (!this.inBus && !this.grounded && !this.swimming && !this.gliding && !this.mantling && !this.gliderManualOff) {
      const groundBelow = this.world.surfaceHeightAt ? this.world.surfaceHeightAt(this.position.x, this.position.z) : this.world.heightAt(this.position.x, this.position.z);
      const alt = this.position.y - Math.max(groundBelow, waterY);
      if (alt < 28 && alt > 2.5 && this.velocity.y < -8) {
        this.gliding = true;
        this.fallPeakY = this.position.y;
        this.audio.play('glide');
        this.character.play('jump');
      }
    }
    if (this.swimming) {
      const targetY = waterY - WATER_FLOAT;
      const desiredV = clamp((targetY - this.position.y) * 4.5, -3.2, 3.2);
      this.velocity.y = lerp(this.velocity.y, desiredV, clamp(dt * 6, 0, 1));
    } else if (this.gliding) {
      this.velocity.y = Math.max(this.velocity.y - 9 * dt, -22);
      if (this.grounded) {
        this.gliding = false;
        this.gliderManualOff = false;
        this.audio.play('land');
      }
    } else {
      this.velocity.y -= GRAVITY * dt;
    }`;
if(!s.includes(old)){console.error('not found'); process.exit(1);} 
fs.writeFileSync(f,s.replace(old,neu)); console.log('ok');