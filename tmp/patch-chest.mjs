import fs from 'node:fs';
const path = 'src/game/game.js';
let text = fs.readFileSync(path, 'utf8');
const old = `        const near = this.loot.findNear(player.position, 3.4);
        this.pickupLatch = this.pickupLatch || false;
        if (this.input.isDown('KeyB') && !this.buildToggleLatch) { this.buildToggleLatch = true; const on = this.building.toggle(); this.hud.toast(on ? 'Modo construcción ON (Q/E rotar, clic colocar)' : 'Modo construcción OFF', on ? 'good' : 'warn'); }
    if (!this.input.isDown('KeyB')) this.buildToggleLatch = false;
    if (this.building?.enabled) this.building.update(this.player, this.camera, this.input);
    if (this.input.isDown('KeyE') && near && !this.pickupLatch) {
          const res = this.loot.interact(near, player);
          if (res) this.hud.toast(res.text, res.color === '#5bd88a' ? 'good' : '');
          this.audio.play('click');
          this.pickupLatch = true;
          this.syncWeaponModel();
        }
        if (!this.input.isDown('KeyE')) this.pickupLatch = false;`;
const neu = `        const near = this.loot.findNear(player.position, 3.4);
        this.pickupLatch = this.pickupLatch || false;
        if (this.input.isDown('KeyB') && !this.buildToggleLatch) { this.buildToggleLatch = true; const on = this.building.toggle(); this.hud.toast(on ? 'Modo construcción ON (Q/E rotar, clic colocar)' : 'Modo construcción OFF', on ? 'good' : 'warn'); }
        if (!this.input.isDown('KeyB')) this.buildToggleLatch = false;
        if (this.building?.enabled) this.building.update(this.player, this.camera, this.input);

        // Interacción: cofres se abren con canalización de 1s (Fixing_Kneeling + progreso circular)
        const holdE = this.input.isDown('KeyE');
        if (this.chestOpening) {
          const co = this.chestOpening;
          const stillNear = co.entity && !co.entity.dead && co.entity.pos.distanceToSquared(player.position) < 3.6 * 3.6;
          if (!holdE || !stillNear || !player.alive) {
            this.chestOpening = null;
          } else {
            co.time += dt;
            player.character.play('chestOpen', 0.08);
            if (co.time >= co.duration) {
              const res = this.loot.interact(co.entity, player);
              if (res) this.hud.toast(res.text, res.color === '#5bd88a' ? 'good' : '');
              this.audio.play('click');
              this.syncWeaponModel();
              this.chestOpening = null;
              this.pickupLatch = true;
            }
          }
        } else if (holdE && near && !this.pickupLatch) {
          if (near.isChest) {
            this.chestOpening = { entity: near, time: 0, duration: 1.0 };
            player.character.play('chestOpen', 0.08);
          } else {
            const res = this.loot.interact(near, player);
            if (res) this.hud.toast(res.text, res.color === '#5bd88a' ? 'good' : '');
            this.audio.play('click');
            this.pickupLatch = true;
            this.syncWeaponModel();
          }
        }
        if (!holdE) { this.pickupLatch = false; if (this.chestOpening) this.chestOpening = null; }`;
if (!text.includes(old)) { console.log('not found'); process.exit(1); }
fs.writeFileSync(path, text.replace(old, neu));
console.log('ok');