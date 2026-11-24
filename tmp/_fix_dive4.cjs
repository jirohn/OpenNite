const fs=require("fs"); let s=fs.readFileSync("src/game/player.js","utf8");
const old=`    const _diveWaterY = this.world.waterYAt ? this.world.waterYAt(this.position.x, this.position.z) : (this.world.waterLevel ?? -100);
    const diveProgress = (this.divingToWater && this.diveStartY != null)
      ? Math.max(0, Math.min(1, (this.diveStartY - this.position.y) / Math.max(0.001, this.diveStartY - _diveWaterY)))
      : 0;`;
const neu=`    const _diveWaterY = this.world.waterYAt ? this.world.waterYAt(this.position.x, this.position.z) : (this.world.waterLevel ?? -100);
    let diveProgress = 0;
    if (this.divingToWater && this.diveStartY != null) {
      const apex = Math.max(this.diveApexY ?? this.diveStartY, this.position.y, this.diveStartY);
      const startY = this.diveStartY;
      const ascend = Math.max(0, apex - startY);
      const descend = Math.max(0.001, apex - _diveWaterY);
      const total = ascend + descend;
      const traveled = (this.velocity.y > 0 ? Math.max(0, this.position.y - startY) : ascend + Math.max(0, apex - this.position.y));
      diveProgress = Math.max(0, Math.min(1, traveled / Math.max(0.001, total)));
    }`;
if(!s.includes(old)){console.log('no'); process.exit(1);} 
s=s.replace(old,neu); fs.writeFileSync("src/game/player.js",s); console.log('ok');
