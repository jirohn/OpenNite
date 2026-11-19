import * as THREE from 'three';
import { clamp, lerp } from '../core/utils.js';
import { Inventory } from './weapons.js';

const WALK = 5.4;
const SPRINT = 8.6;
const CROUCH = 2.7;
const GLIDE_SPEED = 11;
const JUMP = 7.6;
const GRAVITY = 23;
const FALL_SAFE = 9;    // metros de caída libre sin daño
const FALL_LETHAL = 34; // metros de caída libre que causan la muerte
const WATER_FLOAT = 0.45; // profundidad de los pies al flotar
const WATER_SPEED = 3.7;
const WATER_ACCEL = 4.2;

export class Player {
  constructor(camera, character, world, settings, input, audio) {
    this.camera = camera;
    this.character = character;
    this.world = world;
    this.settings = settings;
    this.input = input;
    this.audio = audio;

    this.position = new THREE.Vector3(0, 0, 0);
    this.velocity = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = -0.12;
    this.padCooldown = 0;
    this.onJumpPad = null;
    this.hp = 100;
    this.shield = 0;
    this.maxShield = 100;
    this.alive = true;
    this.grounded = true;
    this.gliding = false;
    this.swimming = false;
    this.fallPeakY = 0;
    this.onFallDamage = null;
    this.inBus = true;
    this.busSpeed = 78;
    this.crouching = false;
    this.sprinting = false;
    this.ads = false;
    this.recoil = 0;
    this.recoilYaw = 0;
    this.bob = 0;
    this.cameraDistance = 3.35;
    this.inventory = new Inventory();
    this.kills = 0;
    this.damageDealt = 0;
    this.lastDamageTime = -100;
    this.time = 0;
    this.camTarget = new THREE.Vector3();
    this.desiredCam = new THREE.Vector3();
    this.forward = new THREE.Vector3();
    this.right = new THREE.Vector3();
  }

  get eyePosition() {
    return new THREE.Vector3(this.position.x, this.position.y + (this.crouching ? 1.15 : 1.6), this.position.z);
  }

  /** Alias usado por la IA. */
  get eye() { return this.eyePosition; }

  getHitboxes(out = []) {
    const { x, y, z } = this.position;
    const s = this.crouching ? 0.65 : 1;
    out.length = 0;
    out.push({ x, y: y + 1.66 * s, z, r: 0.24, part: 'head' });
    out.push({ x, y: y + 1.16 * s, z, r: 0.45, part: 'body' });
    out.push({ x, y: y + 0.52 * s, z, r: 0.38, part: 'legs' });
    return out;
  }

  placeOnBus() {
    this.inBus = true;
    this.gliding = false;
    this.swimming = false;
    this.grounded = false;
    this.fallPeakY = 340;
    this.position.set(0, 340, this.world.half + 500);
    this.yaw = Math.PI;
    this.pitch = -0.55;
    this.character.group.visible = true;
  }

  jumpFromBus() {
    if (!this.inBus) return;
    this.inBus = false;
    this.grounded = false;
    this.gliding = true;
    this.swimming = false;
    this.fallPeakY = this.position.y;
    this.velocity.set(0, -3, -this.busSpeed * 0.45);
    this.audio.play('glide');
  }

  /** Activa o desactiva el paracaídas durante la caída. */
  toggleGlider() {
    if (!this.alive || this.inBus || this.grounded || this.swimming) return;
    this.gliding = !this.gliding;
    // Cada cambio reinicia la referencia: al cerrarlo se empieza una caída nueva.
    this.fallPeakY = this.position.y;
    this.audio.play(this.gliding ? 'glide' : 'jump');
    if (this.gliding) this.character.play('jump');
  }

  /** ESPACIO: saltar en el suelo o alternar el paracaídas en el aire. */
  onSpacePress() {
    if (!this.alive || this.inBus) return;
    if (this.swimming) {
      this.velocity.y = 4.6;
      this.audio.play('jump');
      return;
    }
    if (this.grounded) {
      this.velocity.y = JUMP;
      this.grounded = false;
      this.fallPeakY = this.position.y;
      this.audio.play('jump');
      return;
    }
    if (this.gliding || this.velocity.y < -1.5) this.toggleGlider();
  }

  handleMouse(dx, dy) {
    const sens = this.settings.get('sensitivity');
    const inv = this.settings.get('invertY') ? -1 : 1;
    this.yaw -= dx * sens;
    this.pitch = clamp(this.pitch - dy * sens * inv, -1.45, 1.35);
    this.recoil = Math.max(0, this.recoil - Math.abs(dx) * sens * 0.9);
    this.recoilYaw *= 0.85;
  }

  addRecoil(amount) {
    this.recoil = Math.min(0.09, this.recoil + amount * 0.011);
    this.recoilYaw += (Math.random() - 0.5) * amount * 0.008;
  }

  getAimDirection(spread = 0) {
    const p = this.pitch + this.recoil;
    const y = this.yaw + this.recoilYaw;
    const dir = new THREE.Vector3(-Math.sin(y) * Math.cos(p), Math.sin(p), -Math.cos(y) * Math.cos(p));
    if (spread > 0) {
      dir.x += (Math.random() - 0.5) * spread * 2;
      dir.y += (Math.random() - 0.5) * spread * 2;
      dir.z += (Math.random() - 0.5) * spread * 2;
      dir.normalize();
    }
    return dir;
  }

  getMuzzlePosition() {
    this.character.weaponMount.updateWorldMatrix(true, false);
    const weapon = this.character.weaponMount.children[0];
    if (weapon?.userData?.muzzle) {
      return weapon.localToWorld(weapon.userData.muzzle.clone());
    }
    return this.character.weaponMount.getWorldPosition(new THREE.Vector3());
  }

  update(dt, input) {
    this.time += dt;
    if (!this.alive) return;

    const inv = this.inventory.update(dt);
    if (inv === 'reloaded') this.audio.play('reload');

    if (this.inBus) {
      this.position.z -= this.busSpeed * dt;
      this.position.y = 340 + Math.sin(this.time * 0.8) * 1.2;
      this.character.group.position.copy(this.position);
      // El GLB mira hacia +Z; la cámara/frente del juego miran hacia -Z.
    this.character.group.rotation.y = this.yaw + Math.PI;
      this.character.play('idle');
      this.character.update(dt);
      this.updateCamera(dt);
      return;
    }

    const waterY = this.world.waterLevel ?? -100;
    const terrainY = this.world.heightAt(this.position.x, this.position.z);
    const deepWater = waterY > -20 && terrainY < waterY - 0.55;
    const wasSwimming = this.swimming;
    this.swimming = deepWater && this.position.y < waterY + 0.25;
    if (this.swimming && !wasSwimming) {
      // Al entrar en el agua se cancela la caída: nunca es mortal ni hace daño.
      this.gliding = false;
      this.velocity.y = Math.min(this.velocity.y, -1);
      this.fallPeakY = Math.min(this.fallPeakY, waterY);
      this.character.play('jump');
    } else if (!this.swimming && wasSwimming) {
      this.fallPeakY = this.position.y;
    }

    // Entrada de movimiento
    const fwdInput = (input.isDown('KeyW') ? 1 : 0) - (input.isDown('KeyS') ? 1 : 0);
    const sideInput = (input.isDown('KeyD') ? 1 : 0) - (input.isDown('KeyA') ? 1 : 0);
    this.crouching = input.isDown('ControlLeft') || input.isDown('KeyC');
    this.sprinting = input.isDown('ShiftLeft') && fwdInput > 0 && !this.crouching && !this.ads;
    this.ads = input.buttons.has(2);

    this.forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this.right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const move = new THREE.Vector3()
      .addScaledVector(this.forward, fwdInput)
      .addScaledVector(this.right, sideInput);
    if (move.lengthSq() > 0) move.normalize();

    let speed = this.crouching ? CROUCH : this.sprinting ? SPRINT : WALK;
    if (this.ads) speed *= 0.62;
    if (this.gliding) speed = GLIDE_SPEED;
    if (this.swimming) speed = WATER_SPEED;

    const accel = this.swimming ? WATER_ACCEL : this.grounded ? 13 : this.gliding ? 5 : 3.2;
    const targetVX = move.x * speed;
    const targetVZ = move.z * speed;
    this.velocity.x = lerp(this.velocity.x, targetVX, clamp(accel * dt, 0, 1));
    this.velocity.z = lerp(this.velocity.z, targetVZ, clamp(accel * dt, 0, 1));

    // El planeador se alterna con ESPACIO (onSpacePress); aquí solo se integra la caída.
    if (!this.grounded && !this.gliding && !this.swimming) this.fallPeakY = Math.max(this.fallPeakY, this.position.y);
    if (this.swimming) {
      // Flotación real: se amortigua la velocidad y se vuelve a la superficie.
      const targetY = waterY - WATER_FLOAT;
      const desiredV = clamp((targetY - this.position.y) * 4.5, -3.2, 3.2);
      this.velocity.y = lerp(this.velocity.y, desiredV, clamp(dt * 6, 0, 1));
    } else if (this.gliding) {
      this.velocity.y = Math.max(this.velocity.y - 5.5 * dt, -6.5);
      if (this.grounded) {
        this.gliding = false;
        this.audio.play('land');
      }
    } else {
      this.velocity.y -= GRAVITY * dt;
    }

    // Integración y colisiones
    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    this.world.resolveCollision(this.position, 0.42, this.crouching ? 1.15 : 1.8);
    const prevY = this.position.y;
    this.position.y += this.velocity.y * dt;
    const ground = this.world.groundAt(this.position.x, this.position.z, prevY, this.position.y);
    if (this.position.y <= ground) {
      const impact = this.velocity.y;
      const wasGliding = this.gliding;
      const landedInWater = ground < waterY - 0.2;
      if (!this.grounded && impact < -8 && !landedInWater) this.audio.play('land');
      this.position.y = ground;
      this.velocity.y = 0;
      this.grounded = true;
      this.gliding = false;
      // Caer al agua nunca inflige daño por impacto.
      if (!wasGliding && !this.inBus && !this.swimming && !landedInWater) {
        const fall = this.fallPeakY - ground;
        if (fall > FALL_SAFE) {
          const damage = Math.min(100, (fall - FALL_SAFE) * (100 / (FALL_LETHAL - FALL_SAFE)));
          if (this.onFallDamage) this.onFallDamage(damage);
          else this.takeDamage(damage);
        }
      }
      this.fallPeakY = landedInWater ? waterY : ground;
    } else {
      this.grounded = false;
    }

    // Bombas de fuerza: impulsos verticales para saltos grandes.
    this.padCooldown = Math.max(0, this.padCooldown - dt);
    if (this.padCooldown <= 0 && !this.gliding && !this.inBus && !this.swimming) {
      const pad = this.world.getJumpPad?.(this.position);
      if (pad && Math.abs(this.position.y - pad.y) < 2.6) {
        this.velocity.y = pad.power;
        this.grounded = false;
        this.gliding = false;
        this.fallPeakY = this.position.y;
        this.padCooldown = 0.75;
        this.audio.play('jump');
        this.character.play('jump');
        this.onJumpPad?.(this.position, pad);
      }
    }

    const planarSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    this.character.group.position.copy(this.position);
    // El GLB mira hacia +Z; la cámara/frente del juego miran hacia -Z.
    this.character.group.rotation.y = this.yaw + Math.PI;
    if (this.swimming) this.character.setLocomotion(0, false);
    else if (this.gliding) this.character.play('jump', 0.15);
    else this.character.setLocomotion(planarSpeed, this.grounded);
    this.character.update(dt);
    if (this.grounded && planarSpeed > 0.8) this.audio.footstep(this.sprinting);
    if (planarSpeed > 0.5) this.bob += dt * (this.sprinting ? 13 : 9);

    this.recoil = Math.max(0, this.recoil - dt * 0.22);
    this.recoilYaw *= 0.9;
    this.updateCamera(dt);
  }

  updateCamera(dt) {
    const p = this.pitch + this.recoil;
    const y = this.yaw + this.recoilYaw;
    const cp = Math.cos(p);
    const forward = new THREE.Vector3(-Math.sin(y) * cp, Math.sin(p), -Math.cos(y) * cp);
    const right = new THREE.Vector3(Math.cos(y), 0, -Math.sin(y));

    // CÁMARA SOBRE EL HOMBRO DERECHO. Antes el objetivo de la cámara estaba en
    // la cabeza y convergía hacia ella: la cabeza tapaba el punto de mira y la
    // bala salía en otra dirección. Ahora la cámara se desplaza a la derecha y
    // mira EN PARALELO al cañón, así el centro de la pantalla es el disparo y
    // el personaje queda a la izquierda de la mira.
    const baseDist = clamp(Number(this.settings.get('cameraDistance')) || 3.6, 1.8, 6);
    const baseShoulder = clamp(Number(this.settings.get('cameraShoulder')) || 1.15, 0.25, 2.4);
    this.cameraDistance = baseDist;
    const dist = this.ads ? Math.max(2.2, baseDist * 0.68) : this.gliding ? Math.max(5, baseDist * 1.45) : baseDist;
    const shoulder = this.ads ? baseShoulder * 0.82 : baseShoulder;

    this.camTarget.set(this.position.x, this.position.y + (this.crouching ? 1.05 : 1.48), this.position.z);
    this.desiredCam.copy(this.camTarget).addScaledVector(forward, -dist).addScaledVector(right, shoulder);
    this.desiredCam.y += this.ads ? 0.1 : 0.16 + Math.sin(this.bob) * 0.02;

    if (!this.inBus) {
      const dir = this.desiredCam.clone().sub(this.camTarget);
      const len = dir.length();
      dir.normalize();
      const hit = this.world.raycast(this.camTarget, dir, len);
      if (hit && hit.distance > 0.25) {
        // Nunca meter la cámara dentro del personaje (si no, solo se ve el arma).
        this.desiredCam.copy(this.camTarget).addScaledVector(dir, Math.max(1.7, hit.distance - 0.35));
      }
    }

    const lerpT = clamp(dt * 18, 0, 1);
    this.camera.position.lerp(this.desiredCam, lerpT);
    const current = new THREE.Vector3();
    this.camera.getWorldDirection(current);
    const wanted = forward.clone();
    current.lerp(wanted, lerpT).normalize();
    this.camera.lookAt(this.camera.position.clone().add(current));

    const targetFov = this.ads ? (this.inventory.current()?.def.scope ? 22 : 55) : this.settings.get('fov');
    this.camera.fov = lerp(this.camera.fov, targetFov, clamp(dt * 12, 0, 1));
    this.camera.updateProjectionMatrix();
  }

  takeDamage(amount, source = null) {
    if (!this.alive) return { damage: 0, killed: false };
    this.lastDamageTime = this.time;
    let remaining = amount;
    let shieldBroken = false;
    if (this.shield > 0) {
      const absorbed = Math.min(this.shield, remaining);
      this.shield -= absorbed;
      remaining -= absorbed;
      if (this.shield <= 0) shieldBroken = true;
    }
    this.hp -= remaining;
    const killed = this.hp <= 0;
    if (killed) {
      this.hp = 0;
      this.alive = false;
      this.gliding = false;
      this.character.die();
    }
    return { damage: amount, killed, shieldBroken, healthDamage: remaining };
  }

  heal(amount) {
    const before = this.hp;
    this.hp = Math.min(100, this.hp + amount);
    return this.hp - before;
  }

  addShield(amount) {
    const before = this.shield;
    this.shield = Math.min(this.maxShield, this.shield + amount);
    return this.shield - before;
  }

  equipStarting() {
    this.inventory.addWeapon('pistol', 0);
    this.inventory.addAmmo('light', 60);
    this.inventory.addWeapon('pickaxe', 0);
    this.inventory.switchTo(0);
  }
}
