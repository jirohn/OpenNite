const fs=require("fs"); let s=fs.readFileSync("src/game/player.js","utf8");
const old=`    const wasDivingToWater = !!this.divingToWater;
    this.divingToWater = !this.inBus && !this.grounded && !this.swimming && !this.gliding && !this.mantling && this.velocity.y < 4 && planarSpeedNow > 2.0 && (deepWater || aheadDeepWater);
    if (this.divingToWater && this.diveStartY == null) this.diveStartY = Math.max(this.position.y, this.fallPeakY);
    if (this.grounded || this.swimming) this.diveStartY = null;`;
const neu=`    const wasDivingToWater = !!this.divingToWater;
    this.divingToWater = !this.inBus && !this.grounded && !this.swimming && !this.gliding && !this.mantling && planarSpeedNow > 1.8 && (deepWater || aheadDeepWater);
    if (this.divingToWater && this.diveStartY == null) this.diveStartY = this.position.y;
    if (this.divingToWater) this.diveApexY = Math.max(this.diveApexY ?? this.diveStartY ?? this.position.y, this.position.y);
    if (this.grounded || this.swimming) { this.diveStartY = null; this.diveApexY = null; }`;
if(!s.includes(old)){console.log('no'); process.exit(1);} 
s=s.replace(old,neu); fs.writeFileSync("src/game/player.js",s); console.log('ok');
