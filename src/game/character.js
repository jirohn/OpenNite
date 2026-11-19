import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';

let cachedGLTF = null;
let loadingPromise = null;

/** Modelo RobotExpressive — Tomás Laulhé / Quaternius, CC0 1.0. */
export function loadCharacterModel() {
  if (cachedGLTF) return Promise.resolve(cachedGLTF);
  if (loadingPromise) return loadingPromise;
  loadingPromise = new Promise((resolve, reject) => {
    new GLTFLoader().load('./models/RobotExpressive.glb', (gltf) => {
      cachedGLTF = gltf;
      resolve(gltf);
    }, undefined, (error) => {
      loadingPromise = null;
      reject(error);
    });
  });
  return loadingPromise;
}

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();

const ANIM_MAP = {
  idle: 'Idle',
  walk: 'Walking',
  run: 'Running',
  jump: 'Jump',
  death: 'Death',
  dance: 'Dance',
  punch: 'Punch',
  wave: 'Wave',
  sit: 'Sitting',
  stand: 'Standing',
  yes: 'Yes',
  no: 'No',
};

export class Character {
  constructor(gltf, options = {}) {
    this.options = options;
    this.group = new THREE.Group();
    this.model = cloneSkeleton(gltf.scene);
    this.model.traverse((obj) => {
      if (obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
        obj.material = obj.material.clone();
        obj.frustumCulled = false;
      }
    });

    // Escalar a 1.9 m de altura y apoyar los pies en y=0.
    // Box3.setFromObject da cotas gigantes con SkinnedMesh/Mixamo, así que se
    // mide la geometría real de cada malla con su matriz mundial.
    this.model.updateWorldMatrix(true, true);
    let minY = Infinity;
    let maxY = -Infinity;
    this.model.traverse((obj) => {
      if (!obj.isMesh || !obj.geometry) return;
      if (!obj.geometry.boundingBox) obj.geometry.computeBoundingBox();
      const bb = obj.geometry.boundingBox;
      if (!bb) return;
      for (const x of [bb.min.x, bb.max.x]) {
        for (const y of [bb.min.y, bb.max.y]) {
          for (const z of [bb.min.z, bb.max.z]) {
            const v = new THREE.Vector3(x, y, z).applyMatrix4(obj.matrixWorld);
            minY = Math.min(minY, v.y);
            maxY = Math.max(maxY, v.y);
          }
        }
      }
    });
    if (!Number.isFinite(minY) || !Number.isFinite(maxY)) {
      minY = 0;
      maxY = 1.9;
    }
    const height = Math.max(0.001, maxY - minY);
    const scale = 1.9 / height;
    this.model.scale.setScalar(scale);
    this.model.position.y = -minY * scale;
    this.group.add(this.model);

    // Hand.R / Hand.L del GLB son marcadores estáticos (no siguen la animación).
    // La mano real es Palm1R / Palm1L, dentro del esqueleto.
    this.bones = {
      upperR: this.model.getObjectByName('UpperArmR'),
      lowerR: this.model.getObjectByName('LowerArmR'),
      handR: this.model.getObjectByName('Palm1R'),
      shoulderL: this.model.getObjectByName('ShoulderL'),
      upperL: this.model.getObjectByName('UpperArmL'),
      lowerL: this.model.getObjectByName('LowerArmL'),
      handL: this.model.getObjectByName('Palm1L'),
    };

    // El arma se empuña con la mano derecha real. El armature está en
    // centímetros (escala ~39.65x), así que se compensa esa escala para que el
    // arma mantenga su tamaño en metros dentro del grupo del personaje.
    const firingHand = this.bones.handR || this.bones.lowerR;
    this.weaponMount = new THREE.Group();
    if (firingHand) {
      let accumulated = 1;
      for (let node = firingHand; node && node !== this.group; node = node.parent) {
        accumulated *= Math.abs(node.scale.x) || 1;
      }
      this.weaponMount.scale.setScalar(1 / Math.max(0.0001, accumulated));
      this.group.updateWorldMatrix(true, true);
      const handQ = firingHand.getWorldQuaternion(new THREE.Quaternion());
      const groupQ = this.group.getWorldQuaternion(new THREE.Quaternion());
      // Orientación que devuelve el arma al frente del personaje en reposo.
      // El GLB mira hacia +Z y el arma modelo dispara hacia -Z: giro de 180º.
      this.handAlign = groupQ.invert().multiply(handQ).invert()
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI));
      this.weaponMount.quaternion.copy(this.handAlign);
      firingHand.add(this.weaponMount);
    } else {
      this.weaponMount.position.set(0.34, 1.24, 0.22);
      this.group.add(this.weaponMount);
    }
    this.weaponKick = 0;
    this.fireTimer = 0;
    this.supportBase = 0;
    this.supportBoost = 0;
    this.storedSpeed = 0;
    this.storedGrounded = true;

    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = {};
    for (const [key, clipName] of Object.entries(ANIM_MAP)) {
      const clip = THREE.AnimationClip.findByName(gltf.animations, clipName);
      if (clip) this.actions[key] = this.mixer.clipAction(clip);
    }
    for (const [key, action] of Object.entries(this.actions)) {
      action.enabled = key === 'idle';
      action.setEffectiveWeight(key === 'idle' ? 1 : 0);
      if (['idle', 'walk', 'run'].includes(key)) action.setLoop(THREE.LoopRepeat, Infinity);
      else action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      if (key === 'idle') action.play();
    }
    this.current = 'idle';
    this.tint = new THREE.Color(options.color || 0xffffff);
    this.setColor(options.color || 0xffffff);

    this.height = 1.9;
    this.dead = false;
  }

  setColor(color) {
    this.tint.set(color);
    const tintHSL = {};
    this.tint.getHSL(tintHSL);
    this.model.traverse((obj) => {
      if (!obj.isMesh || !obj.material) return;
      if (!obj.userData.baseColor) obj.userData.baseColor = obj.material.color?.clone() || new THREE.Color(0xffffff);
      const baseHSL = {};
      obj.userData.baseColor.getHSL(baseHSL);
      if (obj.material.color) {
        if (baseHSL.l < 0.16) {
          // Piezas oscuras (visera, juntas): solo un reflejo del color.
          obj.material.color.copy(obj.userData.baseColor).lerp(this.tint, 0.2);
        } else {
          // El tinte manda: se mantiene la luminosidad original para conservar el sombreado.
          const lightness = Math.min(0.92, Math.max(0.5, baseHSL.l * 1.35));
          obj.material.color.setHSL(tintHSL.h, Math.min(1, tintHSL.s * 1.05), lightness);
        }
      }
      if (obj.material.emissive) obj.material.emissive.copy(this.tint).multiplyScalar(baseHSL.l < 0.16 ? 0.04 : 0.11);
    });
  }

  play(name, fade = 0.2) {
    if (name === this.current) return;
    const next = this.actions[name] || this.actions.idle;
    if (!next) return;
    const prev = this.actions[this.current];
    next.reset();
    next.enabled = true;
    next.setEffectiveWeight(1);
    next.play();
    if (prev && prev !== next) {
      prev.crossFadeTo(next, fade, false);
      next.setEffectiveTimeScale(1);
      next.fadeIn(fade);
    }
    this.current = name;
  }

  setLocomotion(speed, grounded) {
    this.storedSpeed = speed;
    this.storedGrounded = grounded;
    // Durante el disparo manda la animación de brazos, no la de caminar.
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

  /** Disparo: el personaje hace la animación y el arma sigue la mano. */
  fire(type = 'pistol') {
    if (this.dead) return;
    this.fireTimer = 0.26;
    this.weaponKick = Math.min(1.5, this.weaponKick + 0.95);
    this.play('punch', 0.05);
    this.setWeaponType(type);
    if (type === 'pistol') {
      // Cada disparo seguido sube la influencia del IK de la mano libre.
      this.supportBoost = Math.min(0.85, this.supportBoost + 0.17);
    }
  }

  die() {
    if (this.dead) return;
    this.dead = true;
    this.play('death', 0.1);
  }

  update(dt) {
    this.mixer.update(dt);
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

  /** IK CCD de dos huesos: lleva la mano izquierda al anteempuñadura del arma. */
  applySupportIK() {
    const influence = Math.min(0.92, this.supportBase + this.supportBoost);
    const { shoulderL, upperL, lowerL, handL } = this.bones;
    const weapon = this.weaponMount.children[0];
    if (influence < 0.01 || !upperL || !lowerL || !handL || !weapon?.userData?.supportGrip) return;
    this.group.updateWorldMatrix(true, true);
    weapon.updateWorldMatrix(true, false);
    const target = weapon.localToWorld(weapon.userData.supportGrip.clone());
    // El anteempuñadura puede quedar fuera del alcance del brazo. En ese caso
    // se acerca al máximo alcanzable para estirar el brazo sin deformarlo.
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

  /** Esferas de hitbox en coordenadas del grupo (Y pies = 0). */
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
    this.mixer.stopAllAction();
    this.model.traverse((obj) => {
      if (obj.isMesh) obj.material?.dispose();
    });
  }
}

/** Armas hechas con geometría procedural: estilo low-poly limpio, sin assets propietarios. */
export function createWeaponModel(type) {
  const group = new THREE.Group();

  // Pico: herramienta inicial cuerpo a cuerpo, completamente procedural.
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
  // Culata y empuñadura
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
  // Punto donde la mano libre agarra el arma (cañón/anteempuñadura).
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
