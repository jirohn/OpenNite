import * as THREE from 'three';
import { distance2D } from '../core/utils.js';
import { Player } from './player.js';
import { VirtualInput } from './bot-input.js';
import { BotBrain, DIFFICULTY } from './bot-brain.js';
import { attachWeapon, createParachute } from './character.js';

const NAMES = [
  'Rex', 'Nova', 'Kilo', 'Zeta', 'Luna', 'Tango', 'Echo', 'Rush', 'Mako', 'Viper',
  'Pixel', 'Frost', 'Cinder', 'Bolt', 'Onyx', 'Wave', 'Cruz', 'Astra', 'Grit', 'Dash',
  'Rook', 'Nyx', 'Blitz', 'Cobra', 'Sable', 'Ember', 'Jett', 'Riot', 'Ghost', 'Axel',
  'Mira', 'Talon', 'Fury', 'Halo', 'Koda', 'Nitro', 'Quill', 'Raven', 'Scout', 'Vega',
];

const BOT_COLORS = [
  0xff6b6b, 0x4ecdc4, 0xffe66d, 0xa06cd5, 0x6ba7ff, 0xff9f43, 0x54e08a, 0xff6fb5,
  0x9bd3ff, 0xd6a25a, 0x8fd694, 0xd975d9,
];

// Efectos del mundo que solo tienen sentido cerca de la cámara del jugador.
const NEAR_FX = new Set(['spawnRipple', 'spawnWaterSplashDrops', 'spawnUnderwaterBubbles']);

/**
 * Vista del mundo para el cuerpo de un bot: todo igual que para el jugador
 * (colisiones, alturas, agua, bombas de fuerza), salvo los efectos visuales
 * de agua, que solo se generan si el bot está cerca de la cámara.
 */
function makeWorldView(world, bot) {
  const bound = new Map();
  return new Proxy(world, {
    get(target, key) {
      if (NEAR_FX.has(key)) {
        return (...args) => (bot.nearCamera ? target[key]?.(...args) : undefined);
      }
      const value = target[key];
      if (typeof value !== 'function') return value;
      let fn = bound.get(key);
      if (!fn) { fn = value.bind(target); bound.set(key, fn); }
      return fn;
    },
    set(target, key, value) { target[key] = value; return true; },
  });
}

/** Sonidos del bot: solo se oyen si está cerca del jugador. */
function makeAudioView(audio, bot) {
  return {
    play(name, opts) {
      const d = bot.distToCamera;
      if (d < 35 || (d < 70 && (name === 'glide' || name === 'land'))) audio.play(name, opts);
    },
    footstep(running) {
      if (bot.distToCamera < 16) audio.footstep(running);
    },
  };
}

/** El mismo controlador que usa el jugador, sin cámara. */
class BotBody extends Player {
  constructor(bot, character, world, settings, input, audio) {
    super(new THREE.PerspectiveCamera(), character, world, settings, input, audio);
    this.bot = bot;
  }

  // Un bot no tiene cámara: no hace falta el raycast de cámara por fotograma.
  updateCamera() {}

  updateAnimation(dt) { this.bot.animate(dt); }
}

export class Bot {
  constructor(character, world, game, index, options = {}) {
    this.character = character;
    this.world = world;
    this.game = game;
    this.index = index;
    this.name = NAMES[index % NAMES.length] + (index >= NAMES.length ? `-${index}` : '');
    this.color = BOT_COLORS[index % BOT_COLORS.length];
    character.group.userData.bot = this;

    this.input = new VirtualInput();
    this.distToCamera = 0;
    this.nearCamera = false;
    this.body = new BotBody(this, character, makeWorldView(world, this), game.settings, this.input, makeAudioView(game.audio, this));
    this.body.onFallDamage = (damage) => game.onBotHit(this, damage, 'body', { name: 'la caída' }, null, 'Caída');
    this.body.onJumpPad = () => {};
    this.body.equipStarting();

    const diffKey = game.settings.get('botDifficulty');
    this.diff = DIFFICULTY[diffKey] || DIFFICULTY.normal;
    this.brain = new BotBrain(this, game, this.diff);

    this.kills = 0;
    this.deathTimer = 0;
    this.passive = false;
    this.trainingDummy = false;
    this.lastHitBy = null;
    this.lastHitAt = -10;
    this._weaponType = undefined;
    this._animAcc = 0;
    this._botState = { pos: this.body.position, vx: 0, vy: 0, vz: 0, speed: 0, sprinting: false, grounded: false, swimming: false };

    this.chute = createParachute();
    this.chute.visible = false;
    game.scene.add(this.chute);

    if (options.spawn) {
      this.body.inBus = false;
      this.body.position.set(options.spawn.x, options.spawn.y ?? 0, options.spawn.z);
      this.body.grounded = true;
      character.group.visible = true;
    }
  }

  // ---- Estado compartido con el resto del juego (mismo que un Player) ----
  get position() { return this.body.position; }
  get velocity() { return this.body.velocity; }
  get yaw() { return this.body.yaw; }
  set yaw(v) { this.body.yaw = v; }
  get pitch() { return this.body.pitch; }
  get hp() { return this.body.hp; }
  set hp(v) { this.body.hp = v; }
  get shield() { return this.body.shield; }
  set shield(v) { this.body.shield = v; }
  get maxShield() { return this.body.maxShield; }
  get alive() { return this.body.alive; }
  set alive(v) { this.body.alive = v; }
  get inBus() { return this.body.inBus; }
  get grounded() { return this.body.grounded; }
  get swimming() { return this.body.swimming; }
  get gliding() { return this.body.gliding; }
  get crouching() { return this.body.crouching; }
  get inventory() { return this.body.inventory; }
  get eye() { return this.body.eyePosition; }
  get eyePosition() { return this.body.eyePosition; }
  /** Compatibilidad con código antiguo. */
  get dropping() { return this.body.inBus || (!this.body.grounded && !this.body.swimming); }
  set dropping(_) {}

  getHitboxes(out = []) { return this.body.getHitboxes(out); }

  placeOnBus(route) {
    this.body.placeOnBus(route);
    this.brain.onBoardBus(route);
  }

  /** ESPACIO: igual que la tecla del jugador (bajar del bus, saltar, planeador). */
  pressSpace() {
    if (!this.alive) return;
    if (this.body.inBus) this.body.jumpFromBus();
    else this.body.onSpacePress();
  }

  takeDamage(amount, part, attacker) {
    if (!this.alive) return false;
    if (attacker && attacker !== this) {
      this.lastHitBy = attacker;
      this.lastHitAt = this.body.time;
    }
    const res = this.body.takeDamage(amount, attacker);
    this.brain.onDamaged(attacker, amount);
    if (res.killed) {
      this.deathTimer = 18;
      this.input.clear();
      this.chute.visible = false;
      return true;
    }
    return false;
  }

  heal(amount) { return this.body.heal(amount); }
  addShield(amount) { return this.body.addShield(amount); }

  respawn(x, y, z) {
    const b = this.body;
    b.alive = true;
    b.hp = 100;
    b.shield = 0;
    b.position.set(x, y, z);
    b.velocity.set(0, 0, 0);
    b.inBus = false;
    b.grounded = true;
    this.deathTimer = 0;
    this.character.dead = false;
    this.character.group.visible = true;
    this.character.play('idle');
    this.character.group.position.copy(b.position);
  }

  /** Animación con menos frecuencia cuando el bot está lejos de la cámara. */
  animate(dt) {
    if (this.distToCamera < 180) {
      this.character.update(dt + this._animAcc);
      this._animAcc = 0;
      return;
    }
    this._animAcc += dt;
    const step = this.distToCamera < 420 ? 0.15 : 0.35;
    if (this._animAcc >= step) {
      this.character.update(this._animAcc);
      this._animAcc = 0;
    }
  }

  update(dt, player, bots, storm) {
    const cam = this.game.camera?.position || player.position;
    this.distToCamera = distance2D(this.body.position, cam);
    this.nearCamera = this.distToCamera < 90;

    if (!this.alive) {
      this.deathTimer -= dt;
      this.chute.visible = false;
      this.animate(dt);
      return;
    }

    if (this.passive) {
      const b = this.body;
      const floor = this.world.surfaceHeightAt?.(b.position.x, b.position.z) ?? this.world.heightAt(b.position.x, b.position.z);
      b.position.y = floor;
      b.velocity.set(0, 0, 0);
      b.grounded = true;
      this.character.play('idle');
      this.character.group.position.copy(b.position);
      this.character.group.rotation.y = b.yaw + Math.PI;
      this.animate(dt);
      return;
    }

    // 1) La IA decide qué teclas pulsar y hacia dónde mirar.
    this.brain.update(dt, player, bots, storm);

    // 2) El mismo controlador que el jugador ejecuta esas teclas.
    const world = this.world;
    const humanState = world.playerState;
    const st = this._botState;
    st.vx = this.body.velocity.x; st.vy = this.body.velocity.y; st.vz = this.body.velocity.z;
    st.speed = Math.hypot(st.vx, st.vz);
    st.sprinting = this.body.sprinting; st.grounded = this.body.grounded; st.swimming = this.body.swimming;
    world.playerState = st;
    try {
      this.body.update(dt, this.input);
    } finally {
      world.playerState = humanState;
    }
    if (!this.alive) return;

    // 3) Acciones de las manos: disparar, recargar, coger botín.
    if (!this.body.inBus) {
      if (this.input.buttons.has(0)) this.game.fireWeapon(this);
      if (this.input.isDown('KeyR')) this.body.inventory.reload();
      this.game.updateBotInteraction(this, dt);
    }

    this._syncWeaponModel();

    // Planeador
    this.chute.visible = this.body.gliding && this.character.group.visible;
    if (this.chute.visible) {
      this.chute.position.copy(this.body.position).add(_chuteOffset);
      this.chute.rotation.y = this.body.yaw;
    }
    if (!this.body.inBus) this.character.group.visible = this.distToCamera < 700;
  }

  _syncWeaponModel() {
    const type = this.body.inventory.current()?.type || null;
    if (type === this._weaponType) return;
    this._weaponType = type;
    attachWeapon(this.character, type);
  }

  /** Todo lo que lleva encima, para soltarlo al morir como un jugador. */
  dropItems() {
    const inv = this.body.inventory;
    const items = [];
    for (const w of inv.slots) {
      if (!w || w.def.melee) continue;
      items.push({ kind: 'weapon', type: w.type, rarity: w.rarity, name: w.name, icon: w.def.icon, color: w.color, ammo: 0, ammoType: w.def.ammo });
    }
    for (const [type, amount] of Object.entries(inv.ammo)) {
      if (amount > 0) items.push({ kind: 'ammo', ammoType: type, amount, name: `Munición ${type}`, icon: '▣', color: '#d4b04a' });
    }
    return items;
  }

  destroy() {
    this.character.dispose();
    this.character.group.removeFromParent();
    this.chute.removeFromParent();
  }
}

const _chuteOffset = new THREE.Vector3(0, 0.4, 0);
