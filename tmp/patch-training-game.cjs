const fs = require('fs');
const f = 'src/game/game.js';
let s = fs.readFileSync(f, 'utf8');
const old = `    this.player.equipStarting();
    this.player.placeOnBus();
    await this.syncWeaponModel();

    this.chute = createParachute();
    this.chute.visible = false;
    this.scene.add(this.chute);

    this.bus = this.createBus();
    this.scene.add(this.bus);

    this.loot = new LootManager(this.scene, this.world, this);
    await this.loot.load();
    this.loot.spawn(Math.round(78 * (config.map.lootDensity || 1)));
    this.storm = new Storm(this.scene, this.world, this);
    this.storm.onStormEvent = (text, type) => this.hud.toast(text, type);
    this.storm.onStormFinal = () => this.hud.toast('La tormenta ha terminado', 'good');

    this.bots = [];
    const count = clamp(config.bots ?? this.settings.get('maxBots'), 0, 19);
    // Los bots bajan con el jugador desde el autobǧs (punto de despliegue).
    const dropZone = new THREE.Vector3(0, 220, this.world.half + 120);
    const spots = this.world.spawnPoints || [];
    const botColors = [0xff5f6d, 0x4fa8ff, 0x54d17a, 0xf5b83d, 0xb07bff, 0x2fd6d0];
    for (let i = 0; i < count; i++) {
      const sp = spots.length ? spots[(i * 7 + 3) % spots.length] : { x: 0, y: 0, z: 0 };
      const nearDrop = i % 2 === 0;
      const px = nearDrop ? (Math.random() - 0.5) * 24 : sp.x;
      const pz = nearDrop ? (Math.random() - 0.5) * 24 : sp.z;
      const botSpawn = { x: dropZone.x + px, y: dropZone.y + (nearDrop ? 20 + Math.random() * 180 : 30), z: dropZone.z + pz };
      const ch = await Character.create(kit, {
        color: botColors[i % botColors.length],
        presetIndex: i + 1,
      });
      this.scene.add(ch.group);
      const bot = new Bot(ch, this.world, this, i, botSpawn);
      bot.dropping = nearDrop;
      attachWeapon(ch, 'ar');
      this.bots.push(bot);
    }
    this.world.debug?.setMarkers(() => [
      this.player?.character, ...(this.bots || []).map((b) => b.character),
    ].filter(Boolean));
    this.world.debug?.rebuild();
    this.audio.applyDeaf(!!this.settings.get('deafMode'));

    this.hud.mount(config.map.name);
    this.hud.banner('PREPARA EL SALTO', \`${'${count}'} rivales �� ${'${config.map.name}'}\`, 3.2);
    this.hud.toast('Pulsa ESPACIO para saltar del autobǧs (o se abrirǭ solo sobre la isla). Clic para controlar la cǭmara.', 'good');
    this.matchTime = 0;
    this.mode = 'playing';
    this.running = true;
    this.input.autoLock = true;
    this.app.setLoading?.(100, 'Listo');
    this.clock.getDelta();
    this.input.requestLock();`;
const neu = `    this.training = !!config.training || config.map?.type === 'training';
    this.player.equipStarting();
    await this.syncWeaponModel();

    this.chute = createParachute();
    this.chute.visible = false;
    this.scene.add(this.chute);

    this.bus = this.createBus();
    this.scene.add(this.bus);
    this.bus.visible = !this.training;

    this.loot = new LootManager(this.scene, this.world, this);
    await this.loot.load();
    if (!this.training) this.loot.spawn(Math.round(78 * (config.map.lootDensity || 1)));
    this.storm = new Storm(this.scene, this.world, this);
    this.storm.onStormEvent = (text, type) => this.hud.toast(text, type);
    this.storm.onStormFinal = () => this.hud.toast('La tormenta ha terminado', 'good');

    this.bots = [];
    const count = this.training ? clamp(config.bots ?? 6, 0, 12) : clamp(config.bots ?? this.settings.get('maxBots'), 0, 19);
    const dropZone = new THREE.Vector3(0, 220, this.world.half + 120);
    const spots = this.world.spawnPoints || [];
    const botColors = [0xff5f6d, 0x4fa8ff, 0x54d17a, 0xf5b83d, 0xb07bff, 0x2fd6d0];
    for (let i = 0; i < count; i++) {
      const sp = spots.length ? spots[(i * 7 + 3) % spots.length] : { x: 0, y: 0, z: 0 };
      const nearDrop = !this.training && i % 2 === 0;
      const px = nearDrop ? (Math.random() - 0.5) * 24 : sp.x;
      const pz = nearDrop ? (Math.random() - 0.5) * 24 : sp.z;
      const botSpawn = this.training
        ? { x: sp.x, y: 0, z: sp.z }
        : { x: dropZone.x + px, y: dropZone.y + (nearDrop ? 20 + Math.random() * 180 : 30), z: dropZone.z + pz };
      const ch = await Character.create(kit, {
        color: this.training ? 0x7fd0ff : botColors[i % botColors.length],
        presetIndex: i + 1,
      });
      this.scene.add(ch.group);
      const bot = new Bot(ch, this.world, this, i, botSpawn);
      bot.dropping = nearDrop;
      bot.trainingDummy = !!this.training;
      bot.passive = !!this.training;
      if (this.training) {
        bot.dropping = false;
        ch.group.traverse((o) => {
          if (o.isMesh && o.material) {
            const mats = Array.isArray(o.material) ? o.material : [o.material];
            o.material = mats.map((m) => {
              const mm = m.clone();
              mm.transparent = true;
              mm.opacity = 0.45;
              mm.emissive = new THREE.Color(0x4fbaff);
              mm.emissiveIntensity = 0.35;
              mm.depthWrite = false;
              return mm;
            });
            if (!Array.isArray(o.material)) o.material = o.material;
          }
        });
      }
      attachWeapon(ch, 'ar');
      this.bots.push(bot);
    }

    if (this.training) {
      this.player.inBus = false;
      this.player.gliding = false;
      this.player.character.group.visible = true;
      const ps = spots[0] || { x: 0, y: 0, z: 34 };
      this.player.position.set(ps.x, 0, ps.z);
      this.player.velocity.set(0, 0, 0);
      this.player.yaw = Math.PI;
      this.player.pitch = 0;
    } else {
      this.player.placeOnBus();
    }

    this.world.debug?.setMarkers(() => [
      this.player?.character, ...(this.bots || []).map((b) => b.character),
    ].filter(Boolean));
    this.world.debug?.rebuild();
    this.audio.applyDeaf(!!this.settings.get('deafMode'));

    this.hud.mount(config.map.name);
    if (this.training) {
      this.hud.banner('MODO ENTRENAMIENTO', 'Bots holográficos pasivos · Sin tormenta', 3.2);
      this.hud.toast('Modo entrenamiento: practica movimiento, puntería y construcción.', 'good');
    } else {
      this.hud.banner('PREPARA EL SALTO', \`${'${count}'} rivales · ${'${config.map.name}'}\`, 3.2);
      this.hud.toast('Pulsa ESPACIO para saltar del autobús (o se abrirá solo sobre la isla). Clic para controlar la cámara.', 'good');
    }
    this.matchTime = 0;
    this.mode = 'playing';
    this.running = true;
    this.input.autoLock = true;
    this.app.setLoading?.(100, 'Listo');
    this.clock.getDelta();
    this.input.requestLock();`;
if (!s.includes(old)) { console.error('not found'); process.exit(1); }
fs.writeFileSync(f, s.replace(old, neu));
console.log('ok');
