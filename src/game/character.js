import * as THREE from 'three';
import { Character as KitCharacter, Library, catalogFromFiles } from './kit-character.js';
import { Character as UbcCharacter, loadUbcKit } from './ubc-character.js';
import { getGunPlacement, loadGunConfig } from './gun-config.js';

let kitPromise = null;

/**
 * Carga de personajes/animaciones. Prioriza Quaternius UBC + UAL (CC0, rig y
 * animaciones compatibles) y cae al kit KayKit/NLN anterior si no están.
 * Se carga una sola vez y se comparte entre los 20 jugadores.
 */
export function loadCharacterModel() {
  if (kitPromise) return kitPromise;
  kitPromise = (async () => {
    try {
      const ubc = await loadUbcKit();
      return { type: 'ubc', ubc };
    } catch (error) {
      console.warn('UBC/UAL no disponible, usando kit anterior:', error);
    }
    const catalog = await catalogFromFiles('./models/opennite/');
    // Solo los clips que usa OpenNite: menos descarga en equipos modestos.
    catalog.animations = [
      { group: 'General', file: 'Rig_Medium_General.glb' },
      { group: 'Movement Basic', file: 'Rig_Medium_MovementBasic.glb' },
      { group: 'Movement Advanced', file: 'Rig_Medium_MovementAdvanced.glb' },
      { group: 'Combat Melee', file: 'Rig_Medium_CombatMelee.glb' },
      { group: 'Combat Ranged', file: 'Rig_Medium_CombatRanged.glb' },
      { group: 'Simulation', file: 'Rig_Medium_Simulation.glb' },
      { group: 'Ours', file: 'Rig_Medium_Ours.glb' },
    ].map((f) => ({ ...f, url: `library/animations/${f.file}` }));
    catalog.roles = {};
    const library = new Library(catalog);
    // Precarga compartida: Body, piezas de los presets y todos los clips.
    await Promise.all([
      library.clips(),
      library.glb(catalog.base.url),
      ...catalog.parts.map((p) => library.glb(p.url)),
    ]);
    return { type: 'kit', library, presets: catalog.presets || [] };
  })().catch((error) => {
    kitPromise = null;
    throw error;
  });
  return kitPromise;
}

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();

/** Animaciones del motor mapeadas a clips reales del kit KayKit/NLN. */
const KIT_ANIM_MAP = {
  idle: 'Idle_A',
  walk: 'Walking_A',
  run: 'Running_A',
  jump: 'Jump_Idle',
  jumpStart: 'Jump_Start',
  fall: 'Jump_Idle',
  mantle: 'Jump_Idle',
  land: 'Jump_Land',
  swim: 'Swim_Idle',
  swimFwd: 'Swim_Forward',
  death: 'Death_A',
  death2: 'Death_B',
  dance: 'Cheering',
  punch: 'Melee_Unarmed_Attack_Punch_A',
  wave: 'Waving',
  sit: 'Sit_Chair_Idle',
  stand: 'Sit_Chair_StandUp',
  yes: 'Cheering',
  no: 'Hit_A',
  hit: 'Hit_A',
  hit2: 'Hit_B',
  pickup: 'PickUp',
  interact: 'Interact',
  fire: 'Ranged_1H_Shoot',
  fire2: 'Ranged_2H_Shoot',
  crouch: 'Crouching',
  sprint: 'Running_B',
  aim: 'Ranged_1H_Aiming',
  aim2: 'Ranged_2H_Aiming',
  reload: 'Ranged_1H_Reload',
  reload2: 'Ranged_2H_Reload',
  strafeL: 'Running_Strafe_Left',
  strafeR: 'Running_Strafe_Right',
  back: 'Walking_Backwards',
  dodge: 'Dodge_Backward',
};

/** Animaciones mapeadas a clips de Quaternius Universal Animation Library. */
export const UBC_ANIM_MAP = {
  idle: 'Idle_Loop',
  idleArmed: 'Idle_Loop',
  walk: 'Walk_Loop',
  walkArmed: 'Walk_Aim_Fwd_Loop',
  run: 'Jog_Fwd_Loop',
  sprint: 'Sprint_Loop',
  jump: 'Jump_Loop',
  jumpStart: 'Jump_Start',
  fall: 'Jump_Loop',
  mantle: 'Extra_ClimbWall',
  land: 'Jump_Land',
  landRoll: 'Roll',
  slide: 'Extra_Slide',
  vault: 'Extra_ClimbWall',
  swim: 'Swim_Idle_Loop',
  swimFwd: 'Swim_Fwd_Loop',
  dive: 'Run_To_Swim',
  death: 'Death01',
  death2: 'Death01',
  dance: 'Dance_Loop',
  punch: 'Punch_Jab',
  wave: 'Idle_Talking_Loop',
  sit: 'Sitting_Idle_Loop',
  stand: 'Sitting_Exit',
  yes: 'Idle_Talking_Loop',
  no: 'Hit_Head',
  hit: 'Hit_Chest',
  hit2: 'Hit_Head',
  pickup: 'PickUp_Table',
  interact: 'Interact',
  chestOpen: 'Fixing_Kneeling',
  fire: 'Pistol_Shoot',
  fire2: 'Shotgun_Shoot',
  crouch: 'Crouch_Fwd_Loop',
  crouchWalk: 'Crouch_Fwd_Loop',
  aim: 'Walk_Aim_Fwd_Loop',
  aim2: 'Walk_Aim_Fwd_Loop',
  reload: 'Pistol_Reload',
  reload2: 'Pistol_Reload',
  strafeL: 'Walk_Loop',
  strafeR: 'Walk_Loop',
  back: 'Walk_Bwd_Loop',
  dodge: 'Roll',
};

const ONCE_ANIMS = new Set([
  'death', 'death2', 'punch', 'fire', 'fire2', 'land', 'landRoll', 'pickup', 'interact',
  'reload', 'reload2', 'dodge', 'hit', 'hit2', 'jumpStart', 'stand', 'vault', 'chestOpen',
]);

/** Velocidades por defecto: el JSON del editor de skins las sobrescribe. */
const DEFAULT_ANIM_SPEEDS = {
  idle: 1, idleArmed: 1, walk: 1, walkArmed: 1,
  run: 1.15, sprint: 1.25, jump: 1, jumpStart: 1,
  fall: 1, mantle: 1.1, land: 1, landRoll: 1.1,
  slide: 1.2, vault: 1.1, swim: 0.9, swimFwd: 1.1,
  dive: 1.15, death: 1, death2: 1, dance: 1.1,
  punch: 1.2, wave: 1, sit: 1, stand: 1,
  yes: 1, no: 1, hit: 1.15, hit2: 1.15, pickup: 1.1,
  interact: 1.1, chestOpen: 1.1, fire: 1.3, fire2: 1.2,
  crouch: 1, crouchWalk: 1, aim: 1, aim2: 1,
  reload: 1.25, reload2: 1.2, strafeL: 1, strafeR: 1,
  back: 1, dodge: 1.2,
};

const presetFor = (kit, options = {}) => {
  const presets = kit?.presets || [];
  if (!presets.length) return { parts: {}, colors: {} };
  if (typeof options.preset === 'string') {
    const found = presets.find((p) => p.id === options.preset || p.name === options.preset);
    if (found) return found.appearance;
  }
  const index = Number.isInteger(options.presetIndex)
    ? options.presetIndex
    : Math.abs(Math.round((options.color ?? 0) >>> 0)) % presets.length;
  return presets[index % presets.length].appearance;
};

/** Envoltorio con la API que ya usa el motor (group/play/fire/hitboxes...). */
export class Character {
  constructor(kit, options = {}) {
    this.kit = kit;
    this.options = options;
    this.current = '';
    this.animSpeeds = { ...DEFAULT_ANIM_SPEEDS }; // acción/clip -> multiplicador de velocidad
    this.weaponKick = 0;
    this.fireTimer = 0;
    this.supportBase = 0;
    this.supportBoost = 0;
    this.storedSpeed = 0;
    this.storedGrounded = true;
    this.storedOpts = {};
    this.reactionTimer = 0;
    this.actionLock = 0;
    this.waterBlendTimer = 0;
    this.dead = false;
    this.height = 1.9;
    // Editor de armas: cuando true, los sliders del editor manejan el offset
    // local del arma (la alineación inicial ya no se toca).
    this.manualGunAlign = false;
    // Alinear el arma con el frente solo una vez, en la pose armada ya asentada.
    // Después acompaña al hueso de la mano.
    this.needsGunAlign = false;
    this.alwaysAlignForward = false;
    this.gunAlignTimer = 0;
  }

  static async create(kit, options = {}) {
    const self = new Character(kit, options);
    await self.init();
    return self;
  }

  async init() {
    if (this.kit?.type === 'ubc') {
      this.isUbc = true;
      this.animMap = { ...UBC_ANIM_MAP };
      const mixamoTest = typeof location !== 'undefined' && new URLSearchParams(location.search).get('mixamo') === '1';
      this.kitChar = await UbcCharacter.create(this.kit.ubc, { ...this.options, mixamoTest });
      await this._loadAnimActions();
    } else {
      this.isUbc = false;
      this.animMap = { ...KIT_ANIM_MAP };
      const preset = presetFor(this.kit, this.options);
      const appearance = {
        parts: { ...(preset.parts || {}) },
        colors: { ...(preset.colors || {}) },
        tool: null,
      };
      this.preset = preset;
      this.kitChar = await KitCharacter.create(this.kit.library, appearance);
    }
    await this._loadAnimSpeeds();
    this.kitChar.setHeight(1.9);
    this.group = this.kitChar.holder;
    this.group.traverse((obj) => {
      if (obj.isMesh) obj.frustumCulled = false;
    });

    const bones = this.kitChar.bones;
    const pick = (...names) => {
      for (const n of names) { const b = bones.get?.(n); if (b) return b; }
      return null;
    };
    this.bones = {
      spine: pick('spine_01', 'spine'),
      spine2: pick('spine_02'),
      chest: pick('spine_03', 'chest'),
      neck: pick('neck_01', 'neck'),
      head: pick('head'),
      upperR: pick('upperarmr', 'upperarm_r', 'mixamorigrightarm', 'mixamorig:rightarm'),
      lowerR: pick('lowerarmr', 'lowerarm_r', 'mixamorigrightforearm', 'mixamorig:rightforearm'),
      handR: pick('handslotr', 'handr', 'hand_r', 'handslot_r', 'mixamigorighthand', 'mixamorig:righthand', 'righthand'),
      shoulderL: pick('chest', 'spine_03', 'spine_02'),
      upperL: pick('upperarml', 'upperarm_l', 'mixamorigleftarm', 'mixamorig:leftarm'),
      lowerL: pick('lowerarml', 'lowerarm_l', 'mixamorigleftforearm', 'mixamorig:leftforearm'),
      handL: pick('handslotl', 'handl', 'hand_l', 'handslot_l', 'mixamoriglefthand', 'mixamorig:lefthand', 'lefthand'),
      thighL: pick('thigh_l', 'thighl'),
      calfL: pick('calf_l', 'calfl'),
      footL: pick('foot_l', 'footl'),
      thighR: pick('thigh_r', 'thighr'),
      calfR: pick('calf_r', 'calfr'),
      footR: pick('foot_r', 'footr'),
    };

    // El arma cuelga de la mano real del esqueleto. Se compensa la escala
    // acumulada (incluido el holder) para que mida lo mismo en cualquier skin.
    const firingHand = this.bones.handR || this.bones.lowerR;
    this.weaponMount = new THREE.Group();
    if (firingHand) {
      let accumulated = Math.abs(this.group.scale.x) || 1;
      for (let node = firingHand; node && node !== this.group; node = node.parent) {
        accumulated *= Math.abs(node.scale.x) || 1;
      }
      this.weaponMount.scale.setScalar(1 / Math.max(0.0001, accumulated));
      this.group.updateWorldMatrix(true, true);
      if (this.isUbc) {
        // Placeholder; re-ajustado dinámicamente en attachWeapon (ver abajo).
        this.handAlign = new THREE.Quaternion();
      } else {
        const handQ = firingHand.getWorldQuaternion(new THREE.Quaternion());
        const groupQ = this.group.getWorldQuaternion(new THREE.Quaternion());
        this.handAlign = groupQ.invert().multiply(handQ).invert()
          .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI));
      }
      this.weaponMount.quaternion.copy(this.handAlign);
      firingHand.add(this.weaponMount);
    } else {
      this.weaponMount.position.set(0.34, 1.24, 0.22);
      this.group.add(this.weaponMount);
    }

    this.setColor(this.options.color ?? 0xffffff);
  }

  setColor(color) {
    if (!this.kitChar || color === undefined || color === null) return;
    if (this.isUbc) {
      this.kitChar.setBodyColor(color, 0.5);
      return;
    }
    const tint = new THREE.Color(color);
    // Solo teñimos la ropa exterior: piel, pelo, pantalones y botas conservan
    // el acabado realista del preset. Antes un 72% de tinte convertía a los 20
    // personajes en muñecos de colores fluorescentes.
    for (const key of ['shirt', 'hat', 'pack', 'linen']) {
      const current = this.kitChar.colorOf(key);
      if (!current) continue;
      const base = new THREE.Color(current);
      base.lerp(tint, 0.42);
      this.kitChar.setColor(key, `#${base.getHexString()}`);
    }
  }

  /** Cambia aspecto en caliente (taquilla): reconstruye las piezas del preset. */
  async setAppearance(options = {}) {
    if (!this.kitChar) return;
    if (this.isUbc) {
      if (options.color !== undefined && options.color !== null) this.setColor(options.color);
      return;
    }
    const preset = presetFor(this.kit, options);
    this.preset = preset;
    await this.kitChar.apply({
      parts: { ...(preset.parts || {}) },
      colors: { ...(preset.colors || {}) },
      tool: null,
    });
    this.setColor(options.color ?? this.options.color ?? 0xffffff);
  }

  async _loadAnimActions() {
    try {
      let data = null;
      for (const url of ['/config/anim-actions.json', '/models/opennite/characters/100avatars/anims/overrides/anim-actions.json']) {
        try { const r = await fetch(url, { cache: 'no-store' }); if (r.ok) { data = await r.json(); break; } } catch {}
      }
      const actions = (data?.actions && typeof data.actions === 'object') ? data.actions : (data && typeof data === 'object' && !Array.isArray(data) ? data : null);
      if (!actions) return;
      let n = 0;
      for (const [action, clip] of Object.entries(actions)) {
        if (typeof clip === 'string' && clip && this.animMap) { this.animMap[action] = clip; n++; }
      }
      if (n) console.info('[character] anim actions loaded', n);
    } catch (e) { console.warn('[character] anim actions load failed', e); }
  }

  async _loadAnimSpeeds() {
    try {
      let data = null;
      for (const url of ['/config/anim-speeds.json', '/models/opennite/characters/100avatars/anims/overrides/anim-speeds.json']) {
        try { const r = await fetch(url, { cache: 'no-store' }); if (r.ok) { data = await r.json(); break; } } catch {}
      }
      if (!data || typeof data !== 'object' || Array.isArray(data)) return;
      let n = 0;
      for (const [key, value] of Object.entries(data)) {
        const speed = Number(value);
        if (!Number.isFinite(speed) || speed <= 0) continue;
        this.animSpeeds[key] = Math.min(3, Math.max(0.1, speed));
        n++;
      }
      if (n) console.info('[character] anim speeds loaded', n);
    } catch (e) { console.warn('[character] anim speeds load failed', e); }
  }

  play(name, fade = 0.25) {
    const map = this.animMap || KIT_ANIM_MAP;
    const clip = map[name] || map.idle || 'Idle_Loop';
    if (name === this.current && this.kitChar?.playing === clip) return;
    this.current = name;
    if (name === 'landRoll') this.actionLock = Math.max(this.actionLock, 0.95);
    if (name === 'vault') this.actionLock = Math.max(this.actionLock, 0.65);
    if (name === 'chestOpen') this.actionLock = Math.max(this.actionLock, 1.0);
    const speed = this.animSpeeds?.[name] ?? this.animSpeeds?.[clip] ?? 1;
    this.kitChar.playClip(clip, {
      fade,
      once: ONCE_ANIMS.has(name),
      speed,
    }).then((ok) => { if (!ok) console.warn('[anim] clip missing:', name, '->', clip); })
      .catch((error) => console.warn('Animaci?n no disponible:', clip, error));
  }

  seek(name, t01, fade = 0.12) {
    const map = this.animMap || KIT_ANIM_MAP;
    const clip = map[name] || map.idle || 'Idle_Loop';
    this.current = name;
    if (this.kitChar?.seekClip) return this.kitChar.seekClip(clip, t01, { fade });
    return this.kitChar?.playClip?.(clip, { fade, once: true, speed: 0 });
  }

  setLocomotion(speed, grounded, opts = {}) {
    this.storedSpeed = speed;
    this.storedGrounded = grounded;
    this.storedOpts = opts;
    if (this.dead || this.fireTimer > 0 || this.reactionTimer > 0 || this.actionLock > 0) return;
    // Prioridad: acciones especiales > recargar > nadar/caer > apuntar > moverse.
    const armed = !!opts.armed;
    if (opts.reloading) this.play(opts.twoHand ? 'reload2' : 'reload', 0.12);
    else if (opts.swimming) {
      if (this.current === 'dive') this.waterBlendTimer = 1.0;
      const want = speed > 0.7 ? 'swimFwd' : 'swim';
      if (this.waterBlendTimer > 0 && (this.current === 'swim' || this.current === 'swimFwd')) {
        // mantener blend suave sin reiniciar crossfade
      } else {
        this.play(want, this.waterBlendTimer > 0 ? 1.0 : 0.2);
      }
    }
    else if (opts.gliding) this.play('jump', 0.18);
    else if (!grounded) {
      // Caída/aire: dive a agua progresivo (salto 0 -> agua 1), si no pose aérea.
      if (opts.divingToWater) {
        if (typeof opts.diveProgress === 'number') this.seek('dive', opts.diveProgress, 0.1);
        else this.play('dive', 0.12);
      } else this.play(opts.mantling ? 'mantle' : 'fall', 0.15);
    }
    else if (opts.sliding) this.play('slide', 0.12);
    else if (opts.crouchActive || opts.crouching) this.play(speed > 0.5 ? 'crouchWalk' : 'crouch', 0.18);
    else if (opts.ads) this.play(opts.twoHand ? 'aim2' : 'aim', 0.14);
    else if (opts.strafe > 0.55) this.play('strafeR', 0.15);
    else if (opts.strafe < -0.55) this.play('strafeL', 0.15);
    else if (opts.back) this.play('back', 0.15);
    else if (speed > 6.4) this.play('sprint', 0.22);
    else if (speed > 4.2) this.play('run', 0.25);
    else if (speed > 0.6) this.play(armed ? 'walkArmed' : 'walk', 0.2);
    else this.play(armed ? 'idleArmed' : 'idle', 0.25);
  }

  setWeaponType(type) {
    this.weaponType = type || null;
  }

  fire(type = 'pistol') {
    if (this.dead) return;
    this.fireTimer = 0.26;
    this.weaponKick = this.isUbc
      ? Math.min(0.25, this.weaponKick + 0.12)
      : Math.min(1.5, this.weaponKick + 0.95);
    this.play(type === 'pistol' ? 'fire' : 'fire2', 0.05);
    this.setWeaponType(type);
  }

  die() {
    if (this.dead) return;
    this.dead = true;
    this.play(Math.random() < 0.5 ? 'death' : 'death2', 0.1);
  }

  /** Alinea una sola vez el mount del arma con el frente del personaje. El arma
   *  queda hija del hueso de la mano y acompaña su rotación en todas las
   *  animaciones (apuntar, recargar, correr...). No debe llamarse cada frame:
   *  si se sobreescribiera, el arma se despegaría de la mano. */
  updateWeaponMount() {
    const mount = this.weaponMount;
    const gun = mount.children[0];
    if (!gun || !mount.parent) return;
    this.group.updateWorldMatrix(true, true);
    mount.parent.updateWorldMatrix(true, true);
    gun.updateWorldMatrix(true, true);
    const boneWorldQ = mount.parent.getWorldQuaternion(new THREE.Quaternion());
    const groupQ = this.group.getWorldQuaternion(new THREE.Quaternion());
    if (!boneWorldQ || !groupQ) return;
    // El arma lleva una rotación offset (gun.quaternion, configurada por el
    // editor). Queremos gunWorldQ == groupQ * offsetQ, así que:
    // mountQ = boneWorld^-1 * groupQ  (el offset lo aporta el propio arma).
    this.handAlign.copy(boneWorldQ.invert().multiply(groupQ));
    mount.quaternion.copy(this.handAlign);
  }

  /** Reacción breve al recibir un impacto, sin cortar la animación de disparo. */
  hit(strong = false) {
    if (this.dead || this.fireTimer > 0) return;
    this.reactionTimer = strong ? 0.36 : 0.24;
    this.play(strong ? 'hit2' : 'hit', 0.08);
  }

  update(dt) {
    this._dt = dt;
    if (this.actionLock > 0) this.actionLock = Math.max(0, this.actionLock - dt);
    if (this.waterBlendTimer > 0) this.waterBlendTimer = Math.max(0, this.waterBlendTimer - dt);
    // Deshacer el pitch de apuntado aplicado en el frame anterior antes de que el
    // mixer actualice la animación, para no acumular rotación en huesos sin tracks.
    if (this.isUbc) this.undoAimPose();
    this.kitChar.update(dt);
    // El arma es hija del hueso de la mano y lo sigue rígidamente: NO
    // sobrescribimos su rotación aquí, o se despegaría de la mano en cuanto
    // la animación mueva el brazo (apuntar, recargar, correr...). La
    // alineación con el frente se hace una sola vez, tras este primer update.
    if (this.isUbc) {
      if (this.alwaysAlignForward) {
        this.updateWeaponMount();
      } else if (this.needsGunAlign) {
        this.gunAlignTimer += dt;
        if (this.current === 'idleArmed' && this.gunAlignTimer > 0.45) {
          this.updateWeaponMount();
          this.needsGunAlign = false;
        }
      }
    }
    if (this.fireTimer > 0) {
      this.fireTimer -= dt;
      if (this.fireTimer <= 0) this.setLocomotion(this.storedSpeed, this.storedGrounded, this.storedOpts);
    } else if (this.reactionTimer > 0) {
      this.reactionTimer -= dt;
      if (this.reactionTimer <= 0) this.setLocomotion(this.storedSpeed, this.storedGrounded, this.storedOpts);
    }
    this.weaponKick = Math.max(0, this.weaponKick - dt * 4.6);
    this.applyRecoil();
    if (this.isUbc) this.applyAimPose();
  }

  applyRecoil() {
    if (!this.handAlign) return;
    this.weaponMount.quaternion.copy(this.handAlign);
    if (this.isUbc) {
      // UBC: apuntado por pose de torso/cabeza (applyAimPose). Solo un pequeño
      // retroceso local estable en el arma, sin rotación por pitch (evita conflictos).
      const k = this.weaponKick;
      if (k > 0.001) {
        this.weaponMount.position.set(0, 0, k * 0.05);
      } else {
        this.weaponMount.position.set(0, 0, 0);
      }
      return;
    }
    const k = this.weaponKick;
    if (k > 0.001) {
      this.weaponMount.rotateX(-k * 0.17);
      this.weaponMount.rotateY(k * 0.055);
      this.weaponMount.position.set(0, 0, k * 0.07);
    } else {
      this.weaponMount.position.set(0, 0, 0);
    }
  }

  /** Revierte el pitch de apuntado del frame anterior (se llama antes del mixer). */
  undoAimPose() {
    if (!this._aimApplied) return;
    for (const [key, delta] of Object.entries(this._aimApplied)) {
      const bone = this.bones[key];
      if (bone && delta) bone.rotation.x -= delta;
    }
    this._aimApplied = null;
  }

  /** Apuntado estilo tercera persona: inclina torso/cabeza según el pitch de cámara. */
  applyAimPose() {
    let pitch = THREE.MathUtils.clamp(this.aimPitch || 0, -1.2, 0.8);
    const opts = this.storedOpts || {};
    const airborneFall = !this.storedGrounded && !opts.swimming && !opts.gliding && !opts.mantling;
    if (airborneFall) {
      // En caída: mirar hacia abajo por defecto y lerp suave hacia la mira del ratón.
      const target = THREE.MathUtils.clamp(this.aimPitch || 0, -0.6, 0.9);
      const baseDown = 0.55;
      const desired = this._fallAimInit ? target : baseDown;
      this._fallAimInit = true;
      this._fallPitch = THREE.MathUtils.lerp(this._fallPitch ?? baseDown, desired, 1 - Math.exp(-4 * (this._dt || 0.016)));
      this._fallPitch = THREE.MathUtils.lerp(this._fallPitch, target, 1 - Math.exp(-6 * (this._dt || 0.016)));
      pitch = this._fallPitch;
    } else {
      this._fallAimInit = false;
      this._fallPitch = pitch;
    }
    const hasWeapon = !!(this.weaponMount?.children?.length);
    const strength = hasWeapon ? (airborneFall ? 0.85 : 1) : 0.15;
    const p = pitch * strength;
    const applied = {};
    const apply = (key, factor) => {
      const bone = this.bones[key];
      if (!bone) return;
      const delta = p * factor;
      bone.rotation.x -= delta;
      bone.updateMatrixWorld(true);
      applied[key] = delta;
    };
    apply('spine', airborneFall ? 0.22 : 0.18);
    apply('spine2', airborneFall ? 0.26 : 0.22);
    apply('chest', airborneFall ? 0.34 : 0.28);
    apply('neck', airborneFall ? 0.18 : 0.12);
    apply('head', airborneFall ? 0.22 : 0.08);
    this._aimApplied = applied;
  }

  getHitboxes(out = []) {
    const { x, z } = this.group.position;
    const y = this.group.position.y;
    out.length = 0;
    out.push({ x, y: y + 1.56, z, r: 0.23, part: 'head' });
    out.push({ x, y: y + 1.08, z, r: 0.42, part: 'body' });
    out.push({ x, y: y + 0.48, z, r: 0.36, part: 'legs' });
    return out;
  }

  dispose() {
    this.kitChar?.dispose();
  }
}

export const createCharacter = (kit, options = {}) => Character.create(kit, options);

/** Armas hechas con geometría procedural: estilo low-poly limpio, sin assets propietarios. */
export function createWeaponModel(type) {
  const group = new THREE.Group();

  if (type === 'pickaxe') {
    const handle = new THREE.MeshStandardMaterial({ color: 0x7a5230, roughness: 0.86 });
    const steel = new THREE.MeshStandardMaterial({ color: 0xa9b6c2, metalness: 0.8, roughness: 0.3 });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 1.15, 10), handle);
    shaft.rotation.x = Math.PI / 2;
    shaft.position.z = -0.15;
    shaft.castShadow = true;
    group.add(shaft);
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.3, 10),
      new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.7 }));
    grip.rotation.x = Math.PI / 2;
    grip.position.z = 0.28;
    group.add(grip);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.5), steel);
    head.position.z = -0.72;
    group.add(head);
    for (const s of [-1, 1]) {
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.095, 0.42, 7), steel);
      tip.rotation.z = s * Math.PI / 2;
      tip.position.set(s * 0.28, 0, -0.78);
      tip.castShadow = true;
      group.add(tip);
    }
    group.userData.muzzle = new THREE.Vector3(0, 0, -1.05);
    group.userData.grip = new THREE.Vector3(0, -0.1, 0.28);
    group.userData.length = 1.3;
    group.scale.setScalar(0.6);
    return group;
  }

  const dark = new THREE.MeshStandardMaterial({ color: 0x22262f, metalness: 0.75, roughness: 0.35 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x4b5361, metalness: 0.85, roughness: 0.28 });
  const accent = new THREE.MeshStandardMaterial({ color: 0xff8a2b, metalness: 0.4, roughness: 0.4 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.8, metalness: 0.05 });

  const box = (w, h, d, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    mesh.castShadow = true;
    group.add(mesh);
    return mesh;
  };
  const cyl = (r1, r2, h, mat, x, y, z, rx = Math.PI / 2) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, 10), mat);
    mesh.position.set(x, y, z);
    mesh.rotation.x = rx;
    mesh.castShadow = true;
    group.add(mesh);
    return mesh;
  };

  const presets = {
    pistol: { body: [0.14, 0.18, 0.42], barrel: 0.26, scope: false, mag: 0.12 },
    smg: { body: [0.15, 0.2, 0.62], barrel: 0.3, scope: false, mag: 0.24 },
    ar: { body: [0.16, 0.22, 0.9], barrel: 0.48, scope: true, mag: 0.3 },
    shotgun: { body: [0.19, 0.24, 1.02], barrel: 0.65, scope: false, mag: 0.16, pump: true },
    sniper: { body: [0.15, 0.2, 1.22], barrel: 0.82, scope: true, mag: 0.24 },
  };
  const p = presets[type] || presets.ar;
  const [bw, bh, bd] = p.body;
  box(bw, bh, bd, dark, 0, 0, 0);
  box(bw + 0.03, 0.07, bd * 0.55, metal, 0, bh / 2 + 0.02, -0.04);
  cyl(0.045, 0.045, p.barrel, metal, 0, 0.015, -bd / 2 - p.barrel / 2);
  cyl(0.06, 0.06, 0.08, dark, 0, 0.015, -bd / 2 - p.barrel + 0.02);
  box(bw * 0.85, 0.24, 0.14, wood || dark, 0, -0.12, bd / 2 - 0.05, -0.28);
  box(bw * 0.8, 0.22, 0.12, dark, 0, -0.2, bd / 2 - 0.22, 0.22);
  if (p.mag > 0.2) box(0.1, p.mag, 0.14, metal, 0, -bh / 2 - p.mag / 2 + 0.04, -0.06, 0.08);
  if (p.scope) {
    cyl(0.055, 0.055, 0.34, dark, 0, 0.2, -0.05);
    cyl(0.075, 0.075, 0.06, accent, 0, 0.2, -0.22);
    cyl(0.075, 0.075, 0.06, accent, 0, 0.2, 0.12);
  }
  if (p.pump) box(0.2, 0.14, 0.34, wood, 0, -0.1, -bd / 2 - 0.25);

  group.userData.muzzle = new THREE.Vector3(0, 0.015, -bd / 2 - p.barrel - 0.04);
  // Empuñadura: punto que se alinea con la mano del personaje.
  group.userData.grip = type === 'pistol'
    ? new THREE.Vector3(0, -0.12, bd / 2 - 0.18)
    : new THREE.Vector3(0, -0.14, bd / 2 - 0.28);
  group.userData.length = bd + p.barrel;
  const scale = { pistol: 0.46, smg: 0.5, ar: 0.5, shotgun: 0.5, sniper: 0.52 }[type] || 0.5;
  group.scale.setScalar(scale);
  return group;
}

/** Coloca un arma en la mano real del personaje. */
export async function attachWeapon(character, type) {
  const mount = character.weaponMount;
  while (mount.children.length) mount.remove(mount.children[0]);
  if (!type) return null;
  const model = createWeaponModel(type);
  if (model.userData.grip) model.position.copy(model.userData.grip).negate();
  mount.add(model);
  character.setWeaponType?.(type);
  if (character.isUbc) {
    // Relee la config del disco (por si el editor la acaba de guardar) antes de aplicar.
    await loadGunConfig();
    const cfg = getGunPlacement(type);
    model.position.set(cfg.position[0], cfg.position[1], cfg.position[2]);
    model.quaternion.set(cfg.quaternion[0], cfg.quaternion[1], cfg.quaternion[2], cfg.quaternion[3]);
    // Ajustar el mount del arma para que el cañón apunte junto al frente del personaje.
    character.group.updateWorldMatrix(true, true);
    mount.parent?.updateWorldMatrix(true, true);
    const boneWorldQ = mount.parent?.getWorldQuaternion(new THREE.Quaternion());
    const groupQ = character.group.getWorldQuaternion(new THREE.Quaternion());
    if (boneWorldQ && groupQ) {
      character.handAlign = boneWorldQ.invert().multiply(groupQ);
      mount.quaternion.copy(character.handAlign);
    }
    // Re-alinear con la pose armada ya aplicada en el primer update (tras attach).
    character.needsGunAlign = true;
    character.gunAlignTimer = 0;
  }
  return model;
}

export function createParachute() {
  const group = new THREE.Group();
  const canopyGeo = new THREE.SphereGeometry(2.6, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.46);
  const canopyMat = new THREE.MeshStandardMaterial({
    color: 0xff8a2b, roughness: 0.85, side: THREE.DoubleSide,
    emissive: 0x341607, emissiveIntensity: 0.35,
  });
  const canopy = new THREE.Mesh(canopyGeo, canopyMat);
  canopy.position.y = 5.6;
  canopy.scale.set(1, 0.62, 1);
  group.add(canopy);
  const stripeMat = new THREE.MeshStandardMaterial({ color: 0x26d3c7, roughness: 0.8, side: THREE.DoubleSide });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const stripe = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 3.2), stripeMat);
    stripe.position.set(Math.cos(a) * 1.2, 5.25, Math.sin(a) * 1.2);
    stripe.rotation.y = -a;
    stripe.rotation.x = -0.5;
    group.add(stripe);
  }
  const cordMat = new THREE.LineBasicMaterial({ color: 0xd8d8d8, transparent: true, opacity: 0.7 });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(Math.cos(a) * 2.35, 5.2, Math.sin(a) * 2.35),
      new THREE.Vector3(0, 1.4, 0),
    ]);
    group.add(new THREE.Line(geo, cordMat));
  }
  return group;
}
