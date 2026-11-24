const fs=require('fs');
const f='src/game/player.js';
let s=fs.readFileSync(f,'utf8');
s=s.replace(
`      const wasGliding = this.gliding;
      const landedInWater = deepWater && ground >= waterY - WATER_FLOAT - 0.01;
      const wasAirborne = !this.grounded && !wasSwimming;
      if (wasAirborne && impact < -8 && !landedInWater) this.audio.play('land');
      this.position.y = ground;
      this.velocity.y = 0;
      this.grounded = !landedInWater;
      this.gliding = false;`,
`      const wasGliding = this.gliding;
      const landedInWater = deepWater && ground >= waterY - WATER_FLOAT - 0.01;
      const wasAirborne = !this.grounded && !wasSwimming;
      if (wasAirborne && impact < -8 && !landedInWater) this.audio.play('land');
      this.position.y = ground;
      this.velocity.y = 0;
      this.grounded = !landedInWater;
      this.gliding = false;
      this.gliderManualOff = false;`
);
fs.writeFileSync(f,s); console.log('ok');