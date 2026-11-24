const fs=require('fs');
const f='src/game/player.js';
let s=fs.readFileSync(f,'utf8');
const old=`      const cols = this.world.collidersNear(px, pz, 1.2);
      for (const c of cols) {
        if (px < c.minX - radius || px > c.maxX + radius || pz < c.minZ - radius || pz > c.maxZ + radius) continue;
        const top = c.maxY;
        const h = top - feetY;
        if (h <= MANTLE_MIN || h > MANTLE_MAX) continue;
        // Solo si el colisionador realmente está delante/bloqueando alrededor de esa altura
        if (top < feetY + 0.2) continue;
        const standX = px + nx * 0.35;
        const standZ = pz + nz * 0.35;
        const standGround = Math.max(top, (this.world.surfaceHeightAt ? this.world.surfaceHeightAt(standX, standZ) : this.world.heightAt(standX, standZ)));
        if (standGround - feetY > MANTLE_MAX + 0.1) continue;
        const targetY = Math.max(top, standGround);
        if (!this._hasClearance(standX, targetY + 0.05, standZ, radius, 1.7)) continue;
        return this._startMantle(standX, targetY, standZ, h);
      }`;
const neu=`      const cols = this.world.collidersNear(px, pz, 1.2);
      for (const c of cols) {
        if (px < c.minX - radius || px > c.maxX + radius || pz < c.minZ - radius || pz > c.maxZ + radius) continue;
        const top = c.maxY;
        const h = top - feetY;
        // Vault de ventana: si es ventana y el jugador salta hacia ella, pasar al otro lado.
        if (c.role === 'window' && wantJump) {
          const sillRel = feetY - c.minY;
          if (sillRel >= -0.8 && sillRel <= 1.6) {
            const landX = this.position.x + nx * 2.1;
            const landZ = this.position.z + nz * 2.1;
            const landGround = this.world.surfaceHeightAt ? this.world.surfaceHeightAt(landX, landZ) : this.world.heightAt(landX, landZ);
            const landY = Math.max(landGround, c.minY);
            if (Math.abs(landY - feetY) < 1.8 && this._hasClearance(landX, landY + 0.05, landZ, radius, 1.7)) {
              return this._startVault(landX, landY, landZ);
            }
          }
        }
        if (h <= MANTLE_MIN || h > MANTLE_MAX) continue;
        // Solo si el colisionador realmente está delante/bloqueando alrededor de esa altura
        if (top < feetY + 0.2) continue;
        const standX = px + nx * 0.35;
        const standZ = pz + nz * 0.35;
        const standGround = Math.max(top, (this.world.surfaceHeightAt ? this.world.surfaceHeightAt(standX, standZ) : this.world.heightAt(standX, standZ)));
        if (standGround - feetY > MANTLE_MAX + 0.1) continue;
        const targetY = Math.max(top, standGround);
        if (!this._hasClearance(standX, targetY + 0.05, standZ, radius, 1.7)) continue;
        return this._startMantle(standX, targetY, standZ, h);
      }`;
if(!s.includes(old)){console.error('not found'); process.exit(1);}
fs.writeFileSync(f,s.replace(old,neu)); console.log('ok');