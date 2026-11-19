import * as THREE from 'three';
import { Character as KitCharacter, Library, catalogFromFiles } from './kit-character.js';

let kitPromise = null;

/**
 * Personajes humanoides animados (cuerpo + piezas CC0 de NoLimitNexus/Quaternius
 * y animaciones KayKit CC0). Se carga una sola vez y se comparte entre los 20
 * jugadores; cada personaje clona el esqueleto y recoloriza sus materiales.
 */
export function loadCharacterModel() {
  if (kitPromise) return kitPromise;
  kitPromise = (async () => {
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
    return { library, presets: catalog.presets || [] };
  })().catch((error) => {
    kitPromise = null;
    throw error;
  });
  return kitPromise;
}

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();

/** Animaciones del motor mapeadas a clips reales del kit. */
const ANIM_MAP = {
  idle: 'Idle_A',
  walk: 'Walking_A',
  run: 'Running_A',
  jump: 'Jump_Full_Short',
  death: 'Death_A',
  dance: 'Cheering',
  punch: 'Melee_Unarmed_Attack_Punch_A',
  wave: 'Waving',
  sit: 'Sit_Chair_Idle',
  stand: 'Sit_Chair_StandUp',
  yes: 'Cheering',
  no: 'Hit_A',
  hit: 'Hit_A',
  pickup: 'PickUp',
  interact: 'Interact',
  fire: 'Ranged_1H_Shoot',
  fire2: 'Ranged_2H_Shoot',
};
const ONCE_ANIMS = new Set(['death', 'punch', 'fire', 'fire2', 'jump', 'pickup', 'interact']);

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
    this.current = 'idle';
    this.weaponKick = 0;
    this.fireTimer = 0;
    this.supportBase = 0;
    this.supportBoost = 0;
    this.storedSpeed = 0;
    this.storedGrounded = true;
    this.dead = false;
    this.height = 1.9;
  }

  static async create(kit, options = {}) {
    const self = new Character(kit, options);
    await self.init();
    return self;
  }

  async init() {
    const preset = presetFor(this.kit, this.options);
    const appearance = {
      parts: { ...(preset.parts || {}) },
      colors: { ...(preset.colors || {}) },
      tool: null,
    };
    this.preset = preset;
    this.kitChar = await KitCharacter.create(this.kit.library, appearance);
    this.kitChar.setHeight(1.9);
    this.group = this.kitChar.holder;
    this.group.traverse((obj) => {
      if (obj.isMesh) obj.frustumCulled = false;
    });

    const bones = this.kitChar.bones;
    this.bones = {
      upperR: bones.get('upperarmr'),
      lowerR: bones.get('lowerarmr'),
      handR: bones.get('handslotr') || bones.get('handr'),
      shoulderL: bones.get('chest'),
      upperL: bones.get('upperarml'),
      lowerL: bones.get('lowerarml'),
      handL: bones.get('handslotl') || bones.get('handl'),
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
      const handQ = firingHand.getWorldQuaternion(new THREE.Quaternion());
      const groupQ = this.group.getWorldQuaternion(new THREE.Quaternion());
      this.handAlign = groupQ.invert().multiply(handQ).invert()
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI));
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
    const preset = presetFor(this.kit, options);
    this.preset = preset;
    await this.kitChar.apply({
      parts: { ...(preset.parts || {}) },
      colors: { ...(preset.colors || {}) },
      tool: null,
    });
    this.setColor(options.color ?? this.options.color ?? 0xffffff);
  }

  play(name, fade = 0.2) {
    if (name === this.current) return;
    const clip = ANIM_MAP[name] || ANIM_MAP.idle;
    this.current = name;
    this.kitChar.playClip(clip, {
      fade,
      once: ONCE_ANIMS.has(name),
      speed: 1,
    }).catch((error) => console.warn('Animación no disponible:', clip, error));
  }

  setLocomotion(speed, grounded) {
    this.storedSpeed = speed;
    this.storedGrounded = grounded;
    if (this.dead || this.fireTimer > 0) return;
    if (!grounded) this.play('jump', 0.15);
    else if (speed > 4.2) this.play('run', 0.25);
    else if (speed > 0.6) this.play('walk', 0.2);
    else this.play('idle', 0.25);
  }

  setWeaponType(type) {
    this.supportBase = (type === 'pistol' || type === 'pickaxe') ? 0 : 0.82;
    if (type !== 'pistol') this.supportBoost = 0;
  }

  fire(type = 'pistol') {
    if (this.dead) return;
    this.fireTimer = 0.26;
    this.weaponKick = Math.min(1.5, this.weaponKick + 0.95);
    this.play(type === 'pistol' ? 'fire' : 'fire2', 0.05);
    this.setWeaponType(type);
    if (type === 'pistol') this.supportBoost = Math.min(0.85, this.supportBoost + 0.17);
  }

  die() {
    if (this.dead) return;
    this.dead = true;
    this.play('death', 0.1);
  }

  update(dt) {
    this.kitChar.update(dt);
    if (this.fireTimer > 0) {
      this.fireTimer -= dt;
      if (this.fireTimer <= 0) this.setLocomotion(this.storedSpeed, this.storedGrounded);
    }
    this.weaponKick = Math.max(0, this.weaponKick - dt * 4.6);
    this.supportBoost = Math.max(0, this.supportBoost - dt * 0.4);
    this.applyRecoil();
    this.applySupportIK();
  }

  applyRecoil() {
    if (!this.handAlign) return;
    this.weaponMount.quaternion.copy(this.handAlign);
    const k = this.weaponKick;
    if (k > 0.001) {
      this.weaponMount.rotateX(-k * 0.17);
      this.weaponMount.rotateY(k * 0.055);
      this.weaponMount.position.set(0, 0, k * 0.07);
    } else {
      this.weaponMount.position.set(0, 0, 0);
    }
  }

  applySupportIK() {
    const influence = Math.min(0.92, this.supportBase + this.supportBoost);
    const { shoulderL, upperL, lowerL, handL } = this.bones;
    const weapon = this.weaponMount.children[0];
    if (influence < 0.01 || !upperL || !lowerL || !handL || !weapon?.userData?.supportGrip) return;
    this.group.updateWorldMatrix(true, true);
    weapon.updateWorldMatrix(true, false);
    const target = weapon.localToWorld(weapon.userData.supportGrip.clone());
    if (!this.supportReach) {
      const a = upperL.getWorldPosition(new THREE.Vector3());
      const b = lowerL.getWorldPosition(new THREE.Vector3());
      const c = handL.getWorldPosition(new THREE.Vector3());
      this.supportReach = (a.distanceTo(b) + b.distanceTo(c)) * 0.97;
    }
    const shoulder = upperL.getWorldPosition(new THREE.Vector3());
    const toTarget = target.clone().sub(shoulder);
    const distance = toTarget.length();
    if (distance > this.supportReach) {
      target.copy(shoulder).addScaledVector(toTarget, this.supportReach / distance);
    }
    for (let i = 0; i < 2; i++) {
      this.rotateBoneTowards(lowerL, handL, target, influence * 0.8);
      this.rotateBoneTowards(upperL, lowerL, target, influence * 0.55);
      if (shoulderL) this.rotateBoneTowards(shoulderL, upperL, target, influence * 0.3);
    }
  }

  rotateBoneTowards(bone, effector, target, influence) {
    if (!bone?.parent || !effector || influence <= 0) return;
    const origin = bone.getWorldPosition(_v1);
    const end = effector.getWorldPosition(_v2).sub(origin);
    const to = target.clone().sub(origin);
    if (end.lengthSq() < 1e-6 || to.lengthSq() < 1e-6) return;
    const delta = new THREE.Quaternion().setFromUnitVectors(end.normalize(), to.normalize());
    const blended = new THREE.Quaternion().slerp(delta, influence);
    const worldQ = bone.getWorldQuaternion(new THREE.Quaternion());
    const parentQ = bone.parent.getWorldQuaternion(new THREE.Quaternion());
    bone.quaternion.copy(parentQ.invert().multiply(blended.multiply(worldQ)));
    bone.updateWorldMatrix(false, true);
  }

  getHitboxes(out = []) {
    const { x, z } = this.group.position;
    const y = this.group.position.y;
    out.length = 0;
    out.push({ x, y: y + 1.66, z, r: 0.24, part: 'head' });
    out.push({ x, y: y + 1.16, z, r: 0.45, part: 'body' });
    out.push({ x, y: y + 0.52, z, r: 0.38, part: 'legs' });
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
    group.userData.grip = new THREE.Vector3(0, -0.13, 0.28);
    group.userData.supportGrip = new THREE.Vector3(0, -0.12, -0.22);
    group.userData.length = 1.3;
    group.scale.setScalar(1.35);
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
  group.userData.grip = new THREE.Vector3(0, -0.19, bd / 2 - 0.22);
  group.userData.supportGrip = type === 'pistol'
    ? new THREE.Vector3(0, -0.1, 0.02)
    : new THREE.Vector3(0, -0.07, -bd * 0.12);
  group.userData.length = bd + p.barrel;
  group.scale.setScalar(type === 'pistol' ? 1 : type === 'sniper' ? 1.05 : 1.1);
  return group;
}

/** Coloca un arma en la mano real del personaje y actualiza el modo de IK. */
export function attachWeapon(character, type) {
  const mount = character.weaponMount;
  while (mount.children.length) mount.remove(mount.children[0]);
  if (!type) return null;
  const model = createWeaponModel(type);
  if (model.userData.grip) model.position.copy(model.userData.grip).negate();
  mount.add(model);
  character.setWeaponType?.(type);
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
