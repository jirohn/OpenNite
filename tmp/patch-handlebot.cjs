const fs = require('fs');
const f = 'src/game/game.js';
let s = fs.readFileSync(f, 'utf8');
const start = s.indexOf("  handleBotDeath(bot, attacker, weaponName = 'AR') {");
const end = s.indexOf("\n  }\n\n  onBotKilled(bot, attacker, weaponName = 'AR') {");
if (start < 0 || end < 0) { console.error('no', start, end); process.exit(1); }
const neu = `  handleBotDeath(bot, attacker, weaponName = 'AR') {
    const isPlayer = attacker === this.player;
    if (isPlayer) {
      this.player.kills++;
      this.audio.play('kill');
      this.hud.banner('ELIMINADO', bot.name, 1.4);
    }
    this.hud.kill(isPlayer ? 'Tú' : attacker?.name || '???', bot.name, isPlayer ? weaponName : weaponName || 'AR');
    this.effects.burst(bot.position.clone().add(new THREE.Vector3(0, 1.2, 0)), 22, [0xff4d5e, 0x9b1c2e], { speed: 4, life: 0.8 });
    if (!this.training && this.loot) {
      const drop = randomLoot(Math.random);
      const angle = Math.random() * Math.PI * 2;
      const pos = bot.position.clone().add(new THREE.Vector3(Math.cos(angle) * 1.5, 0.2, Math.sin(angle) * 1.5));
      this.loot.createEntity(pos, drop, false);
    }
    if (this.training) {
      setTimeout(() => {
        if (this.mode !== 'playing') return;
        const spots = this.world?.spawnPoints || [{ x: 0, y: 0, z: 0 }];
        const sp = spots[Math.floor(Math.random() * spots.length)];
        bot.alive = true;
        bot.deathTimer = 0;
        bot.character.health = bot.character.maxHealth || 100;
        bot.position.set(sp.x, 0, sp.z);
        bot.velocity.set(0, 0, 0);
        bot.character.group.visible = true;
        bot.character.play('idle');
        bot.character.group.position.copy(bot.position);
      }, 1500);
      return;
    }
    if (this.bots.every((b) => !b.alive)) this.endMatch(true);
  }`;
s = s.slice(0, start) + neu + s.slice(end + 4);
fs.writeFileSync(f, s);
console.log('ok');
