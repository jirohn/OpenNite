const fs=require("fs"); let s=fs.readFileSync("src/game/player.js","utf8");
s=s.replace(
`    const wasDivingToWater = !!this.divingToWater;
    this.divingToWater = !this.inBus && !this.grounded && !this.swimming && !this.gliding && !this.mantling && this.velocity.y < 4 && planarSpeedNow > 2.0 && (deepWater || aheadDeepWater);
    if (this.divingToWater && !wasDivingToWater) this.diveStartY = Math.max(this.position.y, this.fallPeakY);
    if (!this.divingToWater) this.diveStartY = null;`,
`    const wasDivingToWater = !!this.divingToWater;
    this.divingToWater = !this.inBus && !this.grounded && !this.swimming && !this.gliding && !this.mantling && this.velocity.y < 4 && planarSpeedNow > 2.0 && (deepWater || aheadDeepWater);
    if (this.divingToWater && this.diveStartY == null) this.diveStartY = Math.max(this.position.y, this.fallPeakY);
    if (this.grounded || this.swimming) this.diveStartY = null;`
);
fs.writeFileSync("src/game/player.js",s); console.log(s.includes('diveStartY == null')?'ok':'no');
