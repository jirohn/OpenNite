import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { clamp, distance2D, raySphere } from '../core/utils.js';
import { randomLoot } from './weapons.js';
import { loadCharacterModel, Character, createParachute, attachWeapon } from './character.js';
import { World } from './world.js';
import { Player } from './player.js';
import { Bot } from './bot.js';
import { Effects } from './effects.js';
import { LootManager } from './loot.js';
import { Storm } from './storm.js';
import { HUD } from './hud.js';
import { WEAPONS } from './weapons.js';
import { WorldDebug } from './debug.js';
import { BuildingManager } from './building.js';

const SKIN_COLORS = [0xffb45c, 0x6f8a5b, 0x5f83a6, 0xa35f52, 0x7a6b4e, 0x4e6470, 0xb59a5e, 0x8b7a6a];
const SKIN_ANIMS = ['dance', 'wave', 'idle', 'yes', 'dance', 'no', 'wave', 'idle'];

export class Game {
  constructor(canvas, uiRoot, settings, audio, input, app) {
    this.canvas = canvas;
    this.uiRoot = uiRoot;
    this.settings = settings;
    this.audio = audio;
    this.input = input;
    this.app = app;
    this.clock = new THREE.Clock();
    this.mode = 'preview';
    this.previewSkins = [];
    this.previewDebug = null;
    this.skinPreviewMode = false;
    this.selectedPreviewColor = settings.get('playerColor');
    this.running = false;
    this.paused = false;
    this.bots = [];
    this.hitboxes = [];
    this.matchTime = 0;
    this.firedThisFrame = false;
    this.lastWeaponType = null;
    this.stormDamageTimer = 0;

    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: true, powerPreference: 'high-performance', stencil: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(this.settings.get('fov'), window.innerWidth / window.innerHeight, 0.1, 8000);
    this.camera.position.set(4, 3, 7);
    this.camera.lookAt(0, 1.5, 0);

    this.setupPreview();
    this.setupComposer();
    this.applyQuality();

    this.hud = new HUD(uiRoot, settings);
    this.hud.input = this.input;
    this.settings.onChange(() => {
      this.applyQuality();
      const color = this.settings.get('playerColor');
      const preset = this.settings.get('playerPreset');
      if (this.previewCharacter && this.mode === 'preview') {
        if (preset !== this.previewPreset) {
          this.previewPreset = preset;
          this.previewCharacter.setAppearance({ preset, color }).catch((error) => {
            console.warn('No se pudo cambiar el aspecto:', error);
          });
        } else this.previewCharacter.setColor(color);
      }
      if (this.mode === 'preview') this.setPreviewSkin(color);
      if (this.player?.character && (this.mode === 'playing' || this.mode === 'paused')) {
        this.player.character.setColor(color);
      }
    });
    window.addEventListener('resize', () => this.resize());
    this.resize();

    // F5 activa/desactiva el modo debug (cajas rojas de colisionadores + ejes XYZ del mundo/preview).
    const debugTarget = () => this.world?.debug || this.previewDebug;
    const onDebugKey = () => {
      const dbg = debugTarget();
      if (!dbg) return;
      dbg.toggle();
      this.settings.set('debugMode', dbg.enabled);
    };
    document.addEventListener('keydown', (e) => {
      if (e.code !== 'F5') return;
      if (!this.world?.debug && !this.previewDebug) return;
      e.preventDefault();
      e.stopPropagation();
      onDebugKey();
    }, true);
    this.settings.onChange((_, key) => {
      if (key === 'debugMode') debugTarget()?.setEnabled(!!this.settings.get('debugMode'));
    });
    this.input.on('keydown', (code) => {
      if (code === 'F5') onDebugKey();
    });

    this.input.on('lockchange', (locked) => {
      if (this.mode === 'playing' && !locked && !this.ending) this.app.requestPause();
    });

    // ESPACIO por pulsación: salir del bus, saltar o alternar el paracaídas.
    this.input.on('keydown', (code) => {
      if (this.mode !== 'playing' || this.paused || !this.player) return;
      if (code === 'Escape') {
        this.app.requestPause();
        return;
      }
      if (code !== 'Space') return;
      if (this.player.inBus) this.player.jumpFromBus();
      else this.player.onSpacePress();
    });
  }

  setupComposer() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 0.62, 0.55, 0.82);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());
    this.useComposer = false;
  }

  applyQuality() {
    const s = this.settings.all();
    const pr = Math.min(window.devicePixelRatio || 1, 2) * s.resolutionScale;
    this.renderer.setPixelRatio(pr);
    this.renderer.shadowMap.enabled = !!s.shadows;
    if (this.world?.sun) {
      this.world.sun.castShadow = !!s.shadows;
      const size = s.shadowMapSize || 1024;
      if (this.world.sun.shadow.mapSize.x !== size) {
        this.world.sun.shadow.mapSize.set(size, size);
        this.world.sun.shadow.map?.dispose();
        this.world.sun.shadow.map = null;
      }
    }
    if (this.bloomPass) {
      this.bloomPass.strength = 0.28 + 0.42 * (s.effects || 1);
      this.bloomPass.enabled = !!s.bloom;
    }
    this.useComposer = !!(s.bloom || s.ssao);
    this.renderer.info.autoReset = true;
    this.resize();
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.composer?.setSize(w, h);
  }

  // ---------------------- Vista previa del menú ----------------------

  async setupPreview() {
    this.preview = new THREE.Group();
    this.scene.add(this.preview);
    const hemi = new THREE.HemisphereLight(0xa8c8ff, 0x30302c, 2.0);
    const key = new THREE.DirectionalLight(0xffd8a0, 3.2);
    key.position.set(5, 8, 4);
    const rim = new THREE.DirectionalLight(0x26d3c7, 2.2);
    rim.position.set(-5, 3, -4);
    this.preview.add(hemi, key, rim);
    const pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(2.1, 2.4, 0.5, 32),
      new THREE.MeshStandardMaterial({ color: 0x1b202b, metalness: 0.6, roughness: 0.35 }),
    );
    pedestal.position.y = -0.25;
    this.preview.add(pedestal);
    this.previewPedestal = pedestal;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(2.25, 0.045, 8, 64),
      new THREE.MeshBasicMaterial({ color: 0xff8a2b }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.02;
    this.preview.add(ring);
    this.previewRing = ring;

    try {
      const kit = await loadCharacterModel();
      if (this.mode !== 'preview') return;
      const ch = await Character.create(kit, {
        color: this.settings.get('playerColor'),
        preset: this.settings.get('playerPreset'),
      });
      ch.group.position.set(0, 0, 0);
      ch.group.rotation.y = -0.5;
      ch.play('dance');
      attachWeapon(ch, 'ar');
      this.preview.add(ch.group);
      this.previewCharacter = ch;
      this.previewPreset = this.settings.get('playerPreset');
      this.previewDebug = new WorldDebug(null, this.preview, this.camera);
      this.previewDebug.setMarkers(() => [this.previewCharacter, ...(this.previewSkins || [])].filter(Boolean));
      this.previewDebug.setEnabled(!!this.settings.get('debugMode'));

      // Ocho maniquíes 3D animados, uno por aspecto, para elegir en el lobby.
      const skins = await Promise.all(SKIN_COLORS.map(async (color, i) => {
        const skin = await Character.create(kit, { color, presetIndex: i });
        skin.group.position.set(3.85 + i * 0.5, 0, 0);
        skin.group.rotation.y = -0.35;
        skin.group.scale.setScalar(1.05);
        skin.play(SKIN_ANIMS[i]);
        await attachWeapon(skin, i % 3 === 0 ? 'pistol' : i % 3 === 1 ? 'smg' : 'ar');
        skin.alwaysAlignForward = true;
        const disc = new THREE.Mesh(
          new THREE.CylinderGeometry(0.66, 0.72, 0.09, 24),
          new THREE.MeshStandardMaterial({ color: 0x12161f, emissive: color, emissiveIntensity: 0.25, metalness: 0.5, roughness: 0.4 }),
        );
        disc.position.y = -0.05;
        skin.group.add(disc);
        skin.group.userData.color = color;
        skin.group.userData.disc = disc;
        this.preview.add(skin.group);
        return skin;
      }));
      this.previewSkins = skins;
      this.setSkinPreview(this.skinPreviewMode);
      this.app.onAssetsReady?.();
    } catch (error) {
      console.error('No se pudo cargar el modelo CC0:', error);
      this.app.onAssetsError?.(error);
    }
  }

  /** Activa la galería de skins 3D (lobby) o el héroe singular (menú). */
  setSkinPreview(active) {
    this.skinPreviewMode = !!active;
    if (this.previewCharacter) this.previewCharacter.group.visible = !this.skinPreviewMode;
    for (const skin of this.previewSkins) skin.group.visible = this.skinPreviewMode;
    if (this.previewPedestal) this.previewPedestal.visible = !this.skinPreviewMode;
    if (this.previewRing) this.previewRing.visible = !this.skinPreviewMode;
    this.setPreviewSkin(this.selectedPreviewColor);
  }

  setPreviewSkin(color) {
    this.selectedPreviewColor = color;
    for (const skin of this.previewSkins) {
      const active = skin.group.userData.color === color;
      skin.group.userData.targetScale = active ? 1.3 : 1.05;
      if (skin.group.userData.disc) skin.group.userData.disc.material.emissiveIntensity = active ? 1.1 : 0.2;
    }
  }

  updatePreview(dt, elapsed) {
    this.previewDebug?.update(dt);
    if (this.skinPreviewMode) {
      this.camera.position.set(3.0 + Math.sin(elapsed * 0.12) * 0.16, 2.6, 7.5);
      this.camera.lookAt(3.0, 1.1, 0);
      this.previewSkins.forEach((skin, i) => {
        skin.update(dt);
        skin.group.rotation.y = -0.35 + Math.sin(elapsed * 0.5 + i * 0.6) * 0.18;
        skin.group.position.y = Math.sin(elapsed * 1.1 + i) * 0.03;
        const target = skin.group.userData.targetScale ?? 1.05;
        const s = THREE.MathUtils.lerp(skin.group.scale.x, target, Math.min(1, dt * 8));
        skin.group.scale.setScalar(s);
      });
    } else {
      this.camera.position.set(3.1 + Math.sin(elapsed * 0.15) * 0.4, 2.3 + Math.sin(elapsed * 0.22) * 0.12, 4.15);
      this.camera.lookAt(0, 1.2, 0);
      if (this.previewCharacter) {
        this.previewCharacter.update(dt);
        this.previewCharacter.group.rotation.y = -0.5 + Math.sin(elapsed * 0.3) * 0.35;
      }
      if (this.previewRing) this.previewRing.rotation.z += dt * 0.25;
    }
    this.camera.fov = 46;
    this.camera.updateProjectionMatrix();
  }

  // ---------------------- Partida ----------------------

  async startMatch(config) {
    this.ending = false;
    this.paused = false;
    this.mode = 'loading';
    this.app.setLoading?.(20, 'Descargando mapa desde GitHub...');

    const kit = await loadCharacterModel();
    if (this.preview) this.preview.visible = false;
    this.previewDebug?.setEnabled(!!this.settings.get('debugMode'));
    this.hud.unmount();

    this.world = new World(this.scene, config.map, this.settings);
    this.world.debug = new WorldDebug(this.world, this.scene, this.camera);
    if (this.previewCharacter) this.previewCharacter.world = this.world;
    for (const sk of (this.previewSkins || [])) sk.world = this.world;
    this.world.debug.setEnabled(!!this.settings.get('debugMode'));
    this.app.setLoading?.(40, config.map.type === 'glb' ? 'Cargando escena 3D completa...' : 'Creando San Borondon y colocando la naturaleza...');
    await this.world.load();
    this.building = new BuildingManager(this.scene, this.world, this.settings);
    this.app.setLoading?.(55, 'Colocando botín y jugadores...');

    this.effects = new Effects(this.scene, this.settings);
    const playerCharacter = await Character.create(kit, {
      color: this.settings.get('playerColor'),
      preset: this.settings.get('playerPreset'),
    });
    this.player = new Player(this.camera, playerCharacter, this.world, this.settings, this.input, this.audio);
    this.player.onFallDamage = (damage) => {
      if (damage >= 99) this.hud.toast('¡Caída mortal!', 'warn');
      this.onBotHit(this.player, damage, 'body', { name: 'la caída' }, null);
    };
    this.player.onJumpPad = (position, pad) => {
      this.effects.burst(new THREE.Vector3(pad.x, pad.y + 0.5, pad.z), 22, [0x4ff0ff, 0xffffff, 0x2a8dff],
        { speed: 7, size: 0.22, life: 0.65, lift: 6, gravity: 3 });
      this.hud.toast('¡Bomba de fuerza!', 'good');
    };
    this.scene.add(this.player.character.group);
    this.player.character.world = this.world;
    this.player.character.group.castShadow = true;
    this.player.equipStarting();
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
    // Los bots bajan con el jugador desde el autobús (punto de despliegue).
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
    this.hud.banner('PREPARA EL SALTO', `${count} rivales · ${config.map.name}`, 3.2);
    this.hud.toast('Pulsa ESPACIO para saltar del autobús (o se abrirá solo sobre la isla). Clic para controlar la cámara.', 'good');
    this.matchTime = 0;
    this.mode = 'playing';
    this.running = true;
    this.input.autoLock = true;
    this.app.setLoading?.(100, 'Listo');
    this.clock.getDelta();
    this.input.requestLock();
  }

  createBus() {
    const group = new THREE.Group();
    const body = new THREE.MeshStandardMaterial({ color: 0xe08a2b, metalness: 0.4, roughness: 0.5 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2a2f38, metalness: 0.7, roughness: 0.35 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x86bcd0, metalness: 0.4, roughness: 0.2 });
    const add = (geo, mat, x, y, z, sx = 1, sy = 1, sz = 1) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.scale.set(sx, sy, sz);
      group.add(m);
    };
    add(new THREE.BoxGeometry(6, 4, 20), body, 0, 0, 0);
    add(new THREE.BoxGeometry(5.4, 1.5, 19), glass, 0, 1.1, -0.2);
    add(new THREE.BoxGeometry(23, 0.6, 3.6), dark, 0, 0.2, 0);
    add(new THREE.BoxGeometry(9, 0.4, 1.6), dark, 0, 0.5, 6.5);
    for (const s of [-1, 1]) {
      add(new THREE.CylinderGeometry(1.1, 1.1, 2.4, 10), dark, s * 3.4, -0.4, -6);
      add(new THREE.BoxGeometry(0.25, 4, 2.6), dark, s * 3.1, 2.4, 0);
    }
    return group;
  }

  async syncWeaponModel() {
    const inv = this.player?.inventory;
    const type = inv?.current()?.type || null;
    if (type === this.lastWeaponType) return;
    this.lastWeaponType = type;
    await attachWeapon(this.player.character, type);
  }

  // ---------------------- Combate ----------------------

  fire() {
    const inv = this.player.inventory;
    const shot = inv.fire(this.player.ads);
    if (!shot) {
      if (inv.current()?.ammo === 0) this.audio.play('empty');
      return;
    }
    this.audio.play('shoot', { weapon: shot.weapon.type });
    this.player.addRecoil(shot.recoil);
    this.player.character.fire(shot.weapon.type);
    const origin = this.camera.position.clone();
    const muzzle = this.player.getMuzzlePosition();
    const dirBase = this.player.getAimDirection(0);

    for (let p = 0; p < shot.pellets; p++) {
      const dir = this.player.getAimDirection(shot.spread);
      const worldHit = this.world.raycast(origin, dir, shot.range);
      let nearest = worldHit ? worldHit.distance : shot.range;
      let hitBot = null;
      let hitPart = 'body';
      let hitPoint = null;

      for (const bot of this.bots) {
        if (!bot.alive) continue;
        const d2 = distance2D(bot.position, this.player.position);
        if (d2 > shot.range + 4) continue;
        const boxes = bot.getHitboxes(this.hitboxes);
        for (const b of boxes) {
          const t = raySphere(origin, dir, b, b.r);
          if (t > 0 && t < nearest) { nearest = t; hitBot = bot; hitPart = b.part; }
        }
      }

      if (hitBot) {
        hitPoint = origin.clone().addScaledVector(dir, nearest);
        const falloff = Math.max(0.4, 1 - nearest * shot.falloff);
        const mult = hitPart === 'head' ? 2.15 : hitPart === 'legs' ? 0.85 : 1;
        const dmg = shot.damage * falloff * mult;
        this.effects.impact(hitPoint, dir.clone().negate(), hitPart === 'head' ? 'flesh' : 'flesh');
        this.onBotHit(hitBot, dmg, hitPart, this.player, hitPoint, shot.weapon.name);
      } else if (worldHit) {
        hitPoint = worldHit.point;
        const surf = worldHit.type === 'terrain' ? 'terrain' : 'stone';
        this.effects.impact(worldHit.point, dir.clone().negate(), surf);
      } else {
        hitPoint = origin.clone().addScaledVector(dir, shot.range);
      }
      this.effects.tracer(muzzle, hitPoint, 0xffe08a);
    }
    this.effects.muzzle(muzzle, dirBase, 0xffbb55);
  }

  onBotHit(target, damage, part, attacker, point, weaponName = 'Fusil AR') {
    if (target === this.player) {
      const result = this.player.takeDamage(damage, attacker);
      if (result.shieldBroken) {
        this.audio.play('shieldbreak');
        this.hud.toast('¡Escudo roto!', 'warn');
      } else this.audio.play('hurt');
      this.hud.damageFlash(clamp(damage / 55, 0.15, 0.7));
      if (!result.killed) this.player.character?.hit?.(damage > 35);
      if (result.killed) this.endMatch(false, attacker?.name || 'Tormenta');
      return;
    }
    if (!target?.alive) return;
    const byPlayer = attacker === this.player;
    if (byPlayer) {
      this.player.damageDealt += damage;
      this.hud.hitMarker();
      this.audio.play('hit', { head: part === 'head' });
      if (this.settings.get('showDamageNumbers') && point) {
        this.effects.floatingText(point, `${Math.round(damage)}${part === 'head' ? '!' : ''}`, part === 'head' ? '#ffdb4d' : '#ffffff');
      }
    }
    const killed = target.takeDamage(damage, part, attacker);
    if (!killed) target.character?.hit?.(part === 'head' || damage > 35);
    if (killed) this.handleBotDeath(target, attacker, weaponName);
  }

  handleBotDeath(bot, attacker, weaponName = 'AR') {
    const isPlayer = attacker === this.player;
    if (isPlayer) {
      this.player.kills++;
      this.audio.play('kill');
      this.hud.banner('ELIMINADO', bot.name, 1.4);
    }
    this.hud.kill(isPlayer ? 'TÚ' : attacker?.name || '???', bot.name, isPlayer ? weaponName : weaponName || 'AR');
    this.effects.burst(bot.position.clone().add(new THREE.Vector3(0, 1.2, 0)), 22, [0xff4d5e, 0x9b1c2e], { speed: 4, life: 0.8 });
    if (this.loot) {
      const drop = randomLoot(Math.random);
      const angle = Math.random() * Math.PI * 2;
      const pos = bot.position.clone().add(new THREE.Vector3(Math.cos(angle) * 1.5, 0.2, Math.sin(angle) * 1.5));
      this.loot.createEntity(pos, drop, false);
    }
    if (this.bots.every((b) => !b.alive)) this.endMatch(true);
  }

  onBotKilled(bot, attacker, weaponName = 'AR') {
    if (bot?.alive) return;
    this.handleBotDeath(bot, attacker, weaponName);
  }

  onStormEvent(text, type) { this.hud.toast(text, type); }

  endMatch(victory, killer = '') {
    if (this.ending) return;
    this.ending = true;
    this.mode = 'results';
    this.input.autoLock = false;
    this.input.releaseLock();
    this.audio.play(victory ? 'victory' : 'defeat');
    this.hud.banner(victory ? '¡VICTORIA!' : 'ELIMINADO', victory ? 'Último jugador en pie' : `Por ${killer}`, 3);
    const result = {
      victory,
      kills: this.player.kills,
      damage: Math.round(this.player.damageDealt),
      time: this.matchTime,
      rank: victory ? 1 : 1 + this.bots.filter((b) => b.alive).length,
      map: this.world.map.name,
    };
    setTimeout(() => this.app.onMatchEnd?.(result), victory ? 2600 : 2200);
  }

  // ---------------------- Bucle ----------------------

  start() {
    if (this.running) return;
    this.running = true;
    this.clock.getDelta();
    this.loop();
  }

  loop = () => {
    if (!this.running) return;
    requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, this.clock.getDelta());
    const elapsed = this.clock.elapsedTime;
    if (!this.paused) {
      if (this.mode === 'preview') {
        this.updatePreview(dt, elapsed);
      } else if (this.mode === 'playing' && this.world && this.player) {
        this.updateMatch(dt);
      }
    }
    if (this.useComposer) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
  };

  updateMatch(dt) {
    const player = this.player;
    this.matchTime += dt;

    const mouse = this.input.consumeMouse();
    if (this.mode === 'playing' && player.alive && (this.input.locked || this.input.autoLock)) {
      player.handleMouse(mouse.x, mouse.y);
      if (mouse.wheel) player.inventory.cycle(mouse.wheel > 0 ? 1 : -1);
    }

    if (this.mode === 'playing' && player.alive) {
      this.syncWeaponModel();
      player.update(dt, this.input);

      if (player.inBus) {
        // Detrás y por debajo del jugador: la cámara nunca queda dentro del autobús.
        this.bus.position.copy(player.position).add(new THREE.Vector3(0, -2.2, 13));
        this.bus.visible = true;
        this.chute.visible = false;
      } else {
        this.bus.visible = false;
        this.chute.visible = player.gliding;
        if (player.gliding) {
          this.chute.position.copy(player.position).add(new THREE.Vector3(0, 0.4, 0));
          this.chute.rotation.y = player.yaw;
        }
        if (this.input.buttons.has(0)) this.fire();
        if (this.input.isDown('KeyR')) player.inventory.reload();
        const near = this.loot.findNear(player.position, 3.4);
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
        if (!this.input.isDown('KeyE')) this.pickupLatch = false;
      }
    } else if (player && !player.alive) {
      player.character.update(dt);
      this.camera.position.lerp(new THREE.Vector3(player.position.x + 3, player.position.y + 2.5, player.position.z + 3), dt * 1.5);
      this.camera.lookAt(player.position.x, player.position.y + 1, player.position.z);
    }

    // Bots
    for (const bot of this.bots) bot.update(dt, player, this.bots, this.storm);
    if (player.alive) this.audio.applyDeaf(!!this.settings.get('deafMode'));

    // Tormenta y daño ambiental
    if (player.inBus && this.matchTime > 8) this.storm.start();
    if (!player.inBus && !this.storm.active) this.storm.start();
    this.storm.update(dt, player.position);
    this.stormDamageTimer -= dt;
    if (this.stormDamageTimer <= 0 && this.storm.active) {
      this.stormDamageTimer = 0.5;
      if (player.alive) {
        const dmg = this.storm.damageAt(player.position);
        if (dmg > 0) this.onBotHit(player, dmg * 0.5, 'body', { name: 'la tormenta' }, null);
      }
      for (const bot of this.bots) {
        if (!bot.alive) continue;
        const dmg = this.storm.damageAt(bot.position);
        if (dmg > 0) {
          const killed = bot.takeDamage(dmg * 0.5, 'body', { name: 'la tormenta' });
          if (killed) this.handleBotDeath(bot, { name: 'la tormenta' }, 'Tormenta');
        }
      }
    }

    this.world.update(player.position);
    this.world.tick(dt);
    this.loot.update(dt, this.matchTime);
    this.effects.update(dt);
    this.hud.update(this, dt);
  }

  setPaused(value) {
    this.paused = value;
    if (value) {
      this.input.autoLock = false;
      this.input.releaseLock();
    } else if (this.mode === 'playing') {
      this.input.autoLock = true;
      this.input.requestLock();
    }
  }

  resume() {
    this.paused = false;
    this.input.autoLock = true;
    this.input.requestLock();
  }

  disposeMatch() {
    this.input.autoLock = false;
    this.input.releaseLock();
    this.hud.unmount();
    for (const bot of this.bots) bot.destroy();
    this.bots.length = 0;
    this.loot?.dispose();
    this.storm?.dispose();
    this.effects?.dispose();
    this.world?.dispose();
    this.player?.character.dispose();
    this.player?.character.group.removeFromParent();
    this.chute?.removeFromParent();
    this.bus?.removeFromParent();
    this.lastWeaponType = null;
    this.player = null;
    this.world = null;
    this.mode = 'preview';
    this.paused = false;
    this.ending = false;
    if (this.preview) this.preview.visible = true;
    this.previewDebug?.setEnabled(!!this.settings.get('debugMode'));
  }
}
