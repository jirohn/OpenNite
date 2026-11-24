const fs=require('fs');
const f='src/game/player.js';
let s=fs.readFileSync(f,'utf8');
const old=`        if (!wasGliding && !this.inBus && !this.swimming) {
          const fall = this.fallPeakY - ground;
          if (fall > FALL_SAFE) {
            const damage = Math.min(100, (fall - FALL_SAFE) * (100 / (FALL_LETHAL - FALL_SAFE)));
            if (this.onFallDamage) this.onFallDamage(damage);
            else this.takeDamage(damage);
          }
        }
        this.fallPeakY = ground;`;
const neu=`        if (!wasGliding && !this.inBus && !this.swimming) {
          const fall = this.fallPeakY - ground;
          const rollThreshold = (this.character?.height || 1.8) * 2;
          if (fall > rollThreshold) {
            this.character.play('landRoll', 0.08);
            this.audio.play('land');
          }
          if (fall > FALL_SAFE) {
            const damage = Math.min(100, (fall - FALL_SAFE) * (100 / (FALL_LETHAL - FALL_SAFE)));
            if (this.onFallDamage) this.onFallDamage(damage);
            else this.takeDamage(damage);
          }
        }
        this.fallPeakY = ground;`;
if(!s.includes(old)){console.error('not found'); process.exit(1);} 
fs.writeFileSync(f,s.replace(old,neu)); console.log('ok');