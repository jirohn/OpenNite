import * as THREE from 'three';
import { clamp, lerp, smoothstep } from '../core/utils.js';
import { Inventory } from './weapons.js';

const WALK = 5.4;
const SPRINT = 8.8;
const CROUCH = 2.8;
const GLIDE_SPEED = 11;
// Salto a 3/4 de altura: con gravedad constante, la velocidad se escala por sqrt(0.75).
const JUMP = 15.5 * Math.sqrt(0.75); // 13.423 -> altura máxima 75% de la original
const GRAVITY = 23;
const FALL_SAFE = 9;    // metros de caída libre sin daño
const FALL_LETHAL = 34; // metros de caída libre que causan la muerte
const WATER_FLOAT = 1.1; // cuerpo más hundido al nadar
const WATER_SPEED = 3.7;
const WATER_ACCEL = 4.2;
const SLIDE_SPEED = 10.5;
const SLIDE_DURATION = 0.72;
const SLIDE_COOLDOWN = 0.4;
const MANTLE_MIN = 0.45;
const MANTLE_MAX = 2.9;
// Límite de pendiente caminable (~36º). Los escalones de hasta 0.45 m siguen subiéndose.
const MAX_WALK_SLOPE = 0.72;
const MAX_STEP_UP = 0.45;
const SLOPE_PROBE = 0.75;

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
    this._cameraUnderwater = false;
    this.fallPeakY = 0;
    this.onFallDamage = null;
    this.inBus = true;
    this.busSpeed = 78;
    this.gliderManualOff = false;
    this.glidePrompt = false;
    this.crouching = false;
    this.sprinting = false;
    this.ads = false;
    this.recoil = 0;
    this.recoilYaw = 0;
    this.bob = 0;
    this.landCameraKick = 0;
    this.damageShake = 0;
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
    // Movilidad avanzada
    this.sliding = false;
    this.slideTime = 0;
    this.slideCooldown = 0;
    this.coyoteTimer = 0;
    this.jumpBufferTimer = 0;
    this.slideDir = new THREE.Vector3();
    this._prevCrouchKey = false;
    this._waterRippleCd = 0;
    this._wadeRippleCd = 0;
    this._diveBoostTimer = 0;
    this._waterDiveActive = false;
    this._waterDiveHeight = 0;
    this.mantling = false;
    this.mantleTime = 0;
    this.mantleDuration = 0.45;
    this.mantleStart = new THREE.Vector3();
    this.mantleEnd = new THREE.Vector3();
    this.mantleMid = new THREE.Vector3();
    this._mantleProbeCd = 0;
    // Vehículo de EGD en el que va (ver vehicles.js): { vehicle, seat, phase, ... }.
    this.ride = null;
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

  /**
   * Sube al jugador al autobús. Si se pasa una ruta (ver Game.createBusRoute),
   * el autobús cruza el mapa siguiéndola; si no, ruta clásica norte-sur.
   * Los bots usan exactamente esta misma función.
   */
  placeOnBus(route = null) {
    this.ride = null;
    this.busRoute = route;
    if (route) this.busSpeed = route.speed;
    this.inBus = true;
    this.gliding = false;
    this.swimming = false;
    this._cameraUnderwater = false;
    this.grounded = false;
    this.fallPeakY = 220;
    this.busTime = 0;
    if (route) {
      route.positionAt(0, this.position);
      this.yaw = route.yaw;
    } else {
      this.position.set(0, 220, this.world.half + 120);
      this.yaw = Math.PI;
    }
    this.pitch = -0.55;
    this.character.group.visible = false; // oculto dentro del bus hasta saltar
  }

  jumpFromBus() {
    if (!this.inBus) return;
    this.inBus = false;
    this.grounded = false;
    this.gliding = false; // no se abre al saltar del bus; se despliega auto cerca del suelo
    this.gliderManualOff = false;
    this.swimming = false;
    this._cameraUnderwater = false;
    this.fallPeakY = this.position.y;
    this.diveStartY = null;
    this.diveApexY = null;
    this._diveBoostTimer = 0;
    this._waterDiveActive = false;
    this._waterDiveHeight = 0;
    const bdx = this.busRoute ? this.busRoute.dir.x : 0;
    const bdz = this.busRoute ? this.busRoute.dir.z : -1;
    this.velocity.set(bdx * this.busSpeed * 0.45, -3, bdz * this.busSpeed * 0.45);
    this.character.group.visible = true;
  }

  /** Activa o desactiva el paracaídas durante la caída. */
  toggleGlider() {
    if (!this.alive || this.inBus || this.grounded || this.swimming) return;
    this.gliding = !this.gliding;
    this.gliderManualOff = !this.gliding;
    // Cada cambio reinicia la referencia: al cerrarlo se empieza una caída nueva.
    this.fallPeakY = this.position.y;
    this.audio.play(this.gliding ? 'glide' : 'jump');
    if (this.gliding) this.character.play('jump');
  }

  /** ESPACIO: saltar en el suelo, trepar bordes o alternar el paracaídas en el aire. */
  onSpacePress() {
    if (!this.alive || this.inBus || this.ride) return;
    if (this.mantling) return;
    if (this.sliding) {
      // Saltar desde deslizamiento
      this.sliding = false;
      this.crouching = false;
      this.velocity.y = JUMP * 0.92;
      this.grounded = false;
      this.fallPeakY = this.position.y;
      this.audio.play('jump');
      return;
    }
    if (this.swimming) {
      const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
      const hspd = Math.hypot(this.velocity.x, this.velocity.z);
      this.world.spawnWaterSplashDrops?.(this.position, 22);
      this.velocity.y = JUMP * 1.05;
      this.character.play('jump', 0.18);
      const targetSpeed = 7.5;
      const boost = Math.max(0, targetSpeed - hspd);
      this.velocity.x += fx * boost;
      this.velocity.z += fz * boost;
      this.grounded = false;
      this.swimming = false;
      this.fallPeakY = this.position.y;
      this.diveStartY = this.position.y;
      this.diveApexY = this.position.y;
      this.audio.play('jump');
      return;
    }
    if (this.grounded || this.coyoteTimer > 0) {
      // Intentar trepar si hay borde delante al saltar
      const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
      if (this._tryMantle(fx, fz, true)) return;
      this.velocity.y = JUMP;
      this.grounded = false;
      this.coyoteTimer = 0;
      this.jumpBufferTimer = 0;
      this.fallPeakY = this.position.y;
      this.diveStartY = this.position.y;
      this.audio.play('jump');
      return;
    }
    // En el aire: intentar trepar borde cercano antes de alternar paracaídas
    this.jumpBufferTimer = 0.14;
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    if (this._tryMantle(fx, fz, true)) { this.jumpBufferTimer = 0; return; }
    if (this.gliding || this.velocity.y < -1.5) { this.jumpBufferTimer = 0; this.toggleGlider(); }
  }

  handleMouse(dx, dy) {
    const sens = this.settings.get('sensitivity');
    const inv = this.settings.get('invertY') ? -1 : 1;
    if (dx || dy) this._camInputAt = this.time;
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

  _hasClearance(x, y, z, radius = 0.34, height = 1.72) {
    for (const c of this.world.collidersNear(x, z, radius + 1.5)) {
      if (y + height <= c.minY + 0.02 || y >= c.maxY - 0.02) continue;
      if (x + radius > c.minX && x - radius < c.maxX && z + radius > c.minZ && z - radius < c.maxZ) return false;
    }
    return true;
  }

  _tryMantle(fwdX, fwdZ, wantJump = false) {
    if (this.mantling || this.sliding || this.swimming || this.gliding || this.inBus) return false;
    if (this._mantleProbeCd > 0 && !wantJump) return false;
    const planar = Math.hypot(fwdX, fwdZ);
    if (planar < 0.2) return false;
    const nx = fwdX / planar, nz = fwdZ / planar;
    const feetY = this.position.y;
    const radius = 0.34;
    // Distintas distancias hacia delante para detectar bordes de muros/ventanas
    for (const ahead of [0.55, 0.8, 1.05]) {
      const px = this.position.x + nx * ahead;
      const pz = this.position.z + nz * ahead;
      // Candidato 1: terreno por delante (subir laderas/bordes de terreno)
      const groundAhead = this.world.surfaceHeightAt ? this.world.surfaceHeightAt(px, pz) : this.world.heightAt(px, pz);
      const rise = groundAhead - feetY;
      if (rise > MANTLE_MIN && rise <= MANTLE_MAX) {
        // Debe haber un "escalón" real: espacio bloqueado a media altura delante
        const midProbeY = feetY + Math.min(rise * 0.5, 1.1);
        const blocked = !this._hasClearance(this.position.x + nx * 0.45, midProbeY, this.position.z + nz * 0.45, radius, 0.9)
          || (this.grounded && rise > 0.7) || wantJump;
        if (blocked && this._hasClearance(px, groundAhead + 0.05, pz, radius, 1.72)) {
          return this._startMantle(px + nx * 0.2, groundAhead, pz + nz * 0.2, rise);
        }
      }
      // Candidato 2: parte superior de colisionadores (muros, salientes, alféizares)
      const cols = this.world.collidersNear(px, pz, 1.2);
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
      }
    }
    this._mantleProbeCd = 0.08;
    return false;
  }

  _startMantle(tx, ty, tz, rise) {
    this.mantling = true;
    this.mantleKind = 'mantle';
    this.sliding = false;
    this.slideTime = 0;
    this.mantleTime = 0;
    const high = rise > 1.6;
    this.mantleDuration = clamp(high ? (0.34 + rise * 0.12) : (0.24 + rise * 0.11), 0.28, 0.68);
    this.mantleStart.copy(this.position);
    this.mantleEnd.set(tx, ty, tz);
    this.mantleMid.set(
      lerp(this.position.x, tx, 0.35),
      Math.max(this.position.y + 0.25, ty) + (high ? 0.55 : 0.3) + rise * 0.05,
      lerp(this.position.z, tz, 0.35),
    );
    this.velocity.set(0, 0, 0);
    this.grounded = false;
    this.gliding = false;
    // Animación de trepa: forzar bucle aéreo/mantle para que se vea durante el trepado.
    this.character.current = '';
    this.character.play('mantle', 0.1);
    return true;
  }

  _startVault(tx, ty, tz) {
    this.mantling = true;
    this.mantleKind = 'vault';
    this.sliding = false;
    this.slideTime = 0;
    this.mantleTime = 0;
    this.mantleDuration = 0.62;
    this.mantleStart.copy(this.position);
    this.mantleEnd.set(tx, ty, tz);
    this.mantleMid.set(
      lerp(this.position.x, tx, 0.5),
      Math.max(this.position.y, ty) + 0.95,
      lerp(this.position.z, tz, 0.5),
    );
    this.velocity.set(0, 0, 0);
    this.grounded = false;
    this.gliding = false;
    this.character.current = '';
    this.character.play('vault', 0.08);
    return true;
  }

  _updateMantle(dt) {
    this.mantleTime += dt;
    const t = clamp(this.mantleTime / Math.max(0.01, this.mantleDuration), 0, 1);
    const rise = this.mantleEnd.y - this.mantleStart.y;
    // Fase 1: agarre/subida, fase 2: paso sobre el borde
    const lift = smoothstep(clamp(rise > 1.4 ? t * 1.15 : t * 1.4, 0, 1));
    const fwd = smoothstep(clamp(rise > 1.4 ? (t - 0.28) / 0.72 : (t - 0.18) / 0.82, 0, 1));
    this.position.x = lerp(this.mantleStart.x, this.mantleEnd.x, fwd);
    this.position.z = lerp(this.mantleStart.z, this.mantleEnd.z, fwd);
    const baseY = lerp(this.mantleStart.y, this.mantleEnd.y, lift);
    const arc = Math.sin(t * Math.PI) * (rise > 1.4 ? 0.22 : 0.12);
    this.position.y = Math.max(baseY, lerp(baseY, this.mantleMid.y, arc + (1 - Math.abs(t - 0.45) * 1.2) * 0.15));
    this.character.group.position.copy(this.position);
    this.character.group.rotation.y = this.yaw + Math.PI;
    if (t >= 1) {
      this.position.copy(this.mantleEnd);
      this.mantling = false;
      this.grounded = true;
      this.fallPeakY = this.position.y;
      this.velocity.set(0, 0, 0);
      this.character.play('land');
      this.audio.play('land');
    } else {
      this.character.play(this.mantleKind || 'mantle', 0.08);
    }
    this.character.update(dt);
    this.updateCamera(dt);
    this.character.group.rotation.y = this.yaw + Math.PI;
    this.character.update(dt);
    this.updateCamera(dt);
  }

  update(dt, input) {
    this.time += dt;
    this.coyoteTimer = Math.max(0, (this.coyoteTimer || 0) - dt);
    this.jumpBufferTimer = Math.max(0, (this.jumpBufferTimer || 0) - dt);
    if (!this.alive) return;

    this.slideCooldown = Math.max(0, this.slideCooldown - dt);
    this._mantleProbeCd = Math.max(0, this._mantleProbeCd - dt);
    const inv = this.inventory.update(dt);
    if (inv === 'reloaded') this.audio.play('reload');

    // En un vehículo: lo conduce el sistema de vehículos con estas mismas teclas.
    if (this.ride) {
      if (this.world.vehicles) this.world.vehicles.updateRider(this, dt);
      else this.ride = null;
      this.updateCamera(dt);
      return;
    }

    if (this.inBus) {
      this.busTime = (this.busTime || 0) + dt;
      if (this.busRoute) {
        this.busRoute.positionAt(this.busTime, this.position);
        this.position.y += Math.sin(this.time * 0.8) * 1.2;
      } else {
        this.position.z -= this.busSpeed * dt;
        this.position.y = 220 + Math.sin(this.time * 0.8) * 1.2;
      }
      this.character.group.position.copy(this.position);
      this.character.grounded = this.grounded;
      this.character.group.rotation.y = this.yaw + Math.PI;
      this.character.play('idle');
      this.character.update(dt);
      this.updateCamera(dt);
      const busOver = this.busRoute
        ? this.busTime >= this.busRoute.duration
        : (this.busTime > 7 || this.position.z < -this.world.half * 0.2);
      if (busOver) {
        this.jumpFromBus();
      }
      return;
    }

    if (this.mantling) {
      this._updateMantle(dt);
      return;
    }

    let waterY = this.world.waterYAt ? this.world.waterYAt(this.position.x, this.position.z) : (this.world.waterLevel ?? -100);

    // Entrada de movimiento
    const fwdInput = (input.isDown('KeyW') ? 1 : 0) - (input.isDown('KeyS') ? 1 : 0);
    const sideInput = (input.isDown('KeyD') ? 1 : 0) - (input.isDown('KeyA') ? 1 : 0);
    const crouchKey = input.isDown('ControlLeft') || input.isDown('KeyC');
    const wantSprint = input.isDown('ShiftLeft') && fwdInput > 0 && !crouchKey && !this.ads && !this.sliding;
    this.ads = input.buttons.has(2) && !this.sliding;

    // Deslizamiento: sprint + agacharse
    if (this.sliding) {
      this.slideTime -= dt;
      const planar = Math.hypot(this.velocity.x, this.velocity.z);
      if (this.slideTime <= 0 || planar < 1.0 || !this.grounded || this.swimming) {
        this.sliding = false;
        this.crouching = crouchKey;
      } else {
        this.crouching = true;
        // Dirección con ligera guía del jugador para control durante el deslizamiento
        const steer = new THREE.Vector3().addScaledVector(this.forward, fwdInput).addScaledVector(this.right, sideInput * 0.6);
        if (steer.lengthSq() > 0.01) {
          steer.normalize();
          this.slideDir.lerp(steer, clamp(dt * 1.8, 0, 0.25)).normalize();
        }
        const target = clamp(2.0 + (this.slideTime / SLIDE_DURATION) * 6.5, 1.5, 8.5);
        this.velocity.x = lerp(this.velocity.x, this.slideDir.x * target, clamp(dt * 2.2, 0, 1));
        this.velocity.z = lerp(this.velocity.z, this.slideDir.z * target, clamp(dt * 2.2, 0, 1));
        this.velocity.x *= (1 - dt * 0.85);
        this.velocity.z *= (1 - dt * 0.85);
      }
    } else {
      // Iniciar deslizamiento al pulsar agacharse mientras se corre
      if (crouchKey && !this._prevCrouchKey && this.grounded && !this.swimming && this.slideCooldown <= 0 && (this.sprinting || Math.hypot(this.velocity.x, this.velocity.z) > 5.2)) {
        const sp = Math.hypot(this.velocity.x, this.velocity.z);
        if (sp > 4.2) {
          this.sliding = true;
          this.slideTime = SLIDE_DURATION;
          this.slideCooldown = SLIDE_COOLDOWN;
          this.slideDir.set(this.velocity.x, 0, this.velocity.z);
          if (this.slideDir.lengthSq() < 0.01) this.slideDir.copy(this.forward); else this.slideDir.normalize();
          // mezcla hacia delante para sensación más controlable
          this.slideDir.addScaledVector(this.forward, 0.25).normalize();
          this.velocity.x = this.slideDir.x * Math.max(SLIDE_SPEED, sp * 1.05);
          this.velocity.z = this.slideDir.z * Math.max(SLIDE_SPEED, sp * 1.05);
          this.crouching = true;
          this.character.play('crouch');
        } else {
          this.crouching = true;
        }
      } else {
        this.crouching = crouchKey && !this.sliding;
      }
    }
    this._prevCrouchKey = crouchKey;
    this.sprinting = wantSprint && !this.sliding;

    this.forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this.right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const move = new THREE.Vector3()
      .addScaledVector(this.forward, fwdInput)
      .addScaledVector(this.right, sideInput);
    if (move.lengthSq() > 0) move.normalize();

    let speed = this.sliding ? 0 : (this.crouching ? CROUCH : this.sprinting ? SPRINT : WALK);
    if (this.ads) speed *= 0.62;
    if (this.gliding) speed = GLIDE_SPEED;
    if (this.swimming) speed = WATER_SPEED;

    const accel = this.swimming ? WATER_ACCEL : this.grounded ? (this.sliding ? 2 : 15) : this.gliding ? 5 : 4.2;
    let targetVX = this.sliding ? this.velocity.x : move.x * speed;
    let targetVZ = this.sliding ? this.velocity.z : move.z * speed;
    if (this.swimming && (this._diveBoostTimer || 0) > 0) {
      this._diveBoostTimer = Math.max(0, this._diveBoostTimer - dt);
      // Sin entrada del jugador, conservamos el impulso del clavado.
      if (move.lengthSq() < 0.01) {
        targetVX = this.velocity.x;
        targetVZ = this.velocity.z;
      }
    }
    if (!this.sliding) {
      this.velocity.x = lerp(this.velocity.x, targetVX, clamp(accel * dt, 0, 1));
      this.velocity.z = lerp(this.velocity.z, targetVZ, clamp(accel * dt, 0, 1));
    }

    // Integración horizontal y detección de agua en la posición actual
    const beforeX = this.position.x, beforeZ = this.position.z;
    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    this.world.resolveCollision(this.position, 0.34, this.crouching || this.sliding ? 1.15 : 1.72);

    // Los acantilados son pared: se bloquea el avance cuesta arriba cuando la
    // pendiente supera el límite, pero se permiten escalones pequeños.
    if (this.grounded && !this.swimming && !this.gliding && !this.mantling && !this.sliding) {
      const dx = this.position.x - beforeX;
      const dz = this.position.z - beforeZ;
      const moved = Math.hypot(dx, dz);
      if (moved > 1e-4) {
        const ux = dx / moved, uz = dz / moved;
        const height = (x, z) => this.world.surfaceHeightAt
          ? this.world.surfaceHeightAt(x, z)
          : this.world.heightAt(x, z);
        const riseStep = height(this.position.x, this.position.z) - height(beforeX, beforeZ);
        const hBack = height(this.position.x - ux * SLOPE_PROBE, this.position.z - uz * SLOPE_PROBE);
        const hAhead = height(this.position.x + ux * SLOPE_PROBE, this.position.z + uz * SLOPE_PROBE);
        const riseProbe = hAhead - hBack;
        const grade = riseProbe / (SLOPE_PROBE * 2);
        const tooSteep = riseStep > MAX_STEP_UP
          || (grade > MAX_WALK_SLOPE && riseProbe > MAX_STEP_UP);
        if (tooSteep) {
          this.position.x = beforeX;
          this.position.z = beforeZ;
          const into = this.velocity.x * ux + this.velocity.z * uz;
          if (into > 0) {
            this.velocity.x -= ux * into;
            this.velocity.z -= uz * into;
          }
        }
      }
    }
    // El trepado (mantle/vault) solo se activa con salto (ver onSpacePress),
    // no automáticamente por caminar/correr contra un obstáculo.

    waterY = this.world.waterYAt ? this.world.waterYAt(this.position.x, this.position.z) : (this.world.waterLevel ?? -100);
    const terrainY = this.world.surfaceHeightAt ? this.world.surfaceHeightAt(this.position.x, this.position.z) : this.world.heightAt(this.position.x, this.position.z);
    const deepWater = waterY > -20 && terrainY < waterY - 0.55;
    const wasSwimming = this.swimming;
    this.swimming = deepWater && this.position.y < waterY + 0.3 && !(this.velocity.y > 3.0);
    if (this.swimming && !wasSwimming) {
      this.sliding = false;
      this.gliding = false;
      const impact = Math.abs(this.velocity.y);
      const airborne = !this.grounded && !wasSwimming;
      const hspd = Math.hypot(this.velocity.x, this.velocity.z);
      // Clavado: desde fuera del agua o tras saltar dentro del agua.
      const headFirst = airborne && impact > 2.5
        && (this.divingToWater || this.velocity.y < -Math.max(3, hspd * 0.65));
      const apex = Math.max(this.diveApexY ?? this.diveStartY ?? this.position.y, this.position.y);
      const diveHeight = headFirst ? Math.max(0, apex - waterY) : 0;
      // Hundimiento controlado: algo mayor que el original, pero sin bajar demasiado.
      const baseSubmerge = clamp(impact * 0.12, 0.35, 3.6);
      this._submerge = headFirst
        ? clamp(baseSubmerge + diveHeight * 0.14, 0.5, 4.6)
        : baseSubmerge;
      this.velocity.y = Math.min(this.velocity.y, -1.5);
      this.fallPeakY = Math.min(this.fallPeakY, waterY);
      if (headFirst) {
        const dx = hspd > 0.2 ? this.velocity.x / hspd : -Math.sin(this.yaw);
        const dz = hspd > 0.2 ? this.velocity.z / hspd : -Math.cos(this.yaw);
        const boost = Math.min(12, Math.max(hspd + 2, 3.4 + diveHeight * 0.16));
        this.velocity.x = dx * boost;
        this.velocity.z = dz * boost;
        this._diveBoostTimer = 1.15;
        this._waterDiveActive = true;
        this._waterDiveHeight = diveHeight;
        this._waterDiveTime = 0;
        this.character.play('jump', 0.18);
      } else if (!this.divingToWater) this.character.play('jump', 0.18);
      const rippleStrength = 1.2 + Math.min(1.5, impact / 16) + diveHeight * 0.04;
      this.world.spawnRipple?.(this.position.x, waterY, this.position.z, rippleStrength);
      // Burbujas al tocar el agua: se ven exactamente 1 segundo y se van.
      this.world.spawnUnderwaterBubbles?.(this.position, waterY, 1, 540);
      this._waterBubbleCd = 0.3;
    } else if (!this.swimming && wasSwimming) {
      this.fallPeakY = this.position.y;
      this._submerge = 0;
      this._diveBoostTimer = 0;
      this._waterDiveActive = false;
      this._waterDiveHeight = 0;
      this._waterBubbleCd = 0;
      this.world.spawnWaterSplashDrops?.(this.position, 12);
    }

    if (!this.grounded && !this.gliding && !this.swimming) this.fallPeakY = Math.max(this.fallPeakY, this.position.y);

    // Ondas al caminar/correr por agua poco profunda: salen desde los pies.
    const wadeSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    if (!this.swimming && this.grounded && waterY > -20 && terrainY < waterY + 0.35) {
      this._wadeRippleCd = Math.max(0, (this._wadeRippleCd || 0) - dt);
      if (this._wadeRippleCd <= 0 && wadeSpeed > 0.35) {
        this.world.spawnRipple?.(this.position.x, waterY, this.position.z, 0.3 + Math.min(0.85, wadeSpeed / 9));
        this._wadeRippleCd = 0.24;
      }
    } else this._wadeRippleCd = 0;

    const planarSpeedNow = Math.hypot(this.velocity.x, this.velocity.z);
    const aheadX = this.position.x + this.velocity.x * 0.35;
    const aheadZ = this.position.z + this.velocity.z * 0.35;
    const aheadWaterY = this.world.waterYAt ? this.world.waterYAt(aheadX, aheadZ) : waterY;
    const aheadTerrainY = this.world.surfaceHeightAt ? this.world.surfaceHeightAt(aheadX, aheadZ) : this.world.heightAt(aheadX, aheadZ);
    const aheadDeepWater = aheadWaterY > -20 && aheadTerrainY < aheadWaterY - 0.55;
    const wasDivingToWater = !!this.divingToWater;
    this.divingToWater = !this.inBus && !this.grounded && !this.swimming && !this.gliding && !this.mantling && planarSpeedNow > 1.8 && (deepWater || aheadDeepWater);
    if (this.divingToWater && this.diveStartY == null) this.diveStartY = this.position.y;
    if (this.divingToWater) this.diveApexY = Math.max(this.diveApexY ?? this.diveStartY ?? this.position.y, this.position.y);
    if (this.grounded || this.swimming) { this.diveStartY = null; this.diveApexY = null; }
    // Prompt para abrir paracaídas en caídas altas (sin auto-abrir).
    this.glidePrompt = false;
    if (!this.inBus && !this.grounded && !this.swimming && !this.gliding && !this.mantling) {
      const groundBelow = this.world.surfaceHeightAt ? this.world.surfaceHeightAt(this.position.x, this.position.z) : this.world.heightAt(this.position.x, this.position.z);
      const alt = this.position.y - Math.max(groundBelow, waterY);
      if (alt > 6 && this.velocity.y < -4) this.glidePrompt = true;
    }
    if (this.swimming) {
      this._submerge = Math.max(0, (this._submerge || 0) - dt * 1.8);
      if (this._waterDiveActive) {
        this._waterDiveTime = (this._waterDiveTime || 0) + dt;
        if (this._waterDiveTime > 2.6) this._waterDiveActive = false;
      }
      const targetY = waterY - WATER_FLOAT - (this._submerge || 0);
      let desiredV = clamp((targetY - this.position.y) * 5.5, -6.5, 3.2);
      if (this.world.isWaterfallAt?.(this.position.x, this.position.z, this.position.y + 0.5)) {
        desiredV = Math.min(desiredV, -4.5);
        this.velocity.x *= 0.85;
        this.velocity.z *= 0.85;
      }
      this.velocity.y = lerp(this.velocity.y, desiredV, clamp(dt * (this._submerge > 0.05 ? 4 : 6), 0, 1));
      this._waterRippleCd -= dt;
      const sp = Math.hypot(this.velocity.x, this.velocity.z);
      if (this._waterRippleCd <= 0) {
        // Ondas al nadar: incluso quieto se hace una onda suave; al moverse, estela mas marcada.
        const strength = sp > 0.15 ? (0.55 + Math.min(1, sp / 5) * 0.7) : 0.3;
        this.world.spawnRipple?.(this.position.x, waterY, this.position.z, strength);
        this._waterRippleCd = sp > 0.15 ? (0.28 - Math.min(0.14, sp / 45)) : 0.7;
      }
      // Burbujas continuas mientras el cuerpo siga sumergido.
      this._waterBubbleCd = (this._waterBubbleCd || 0) - dt;
      if (this._waterBubbleCd <= 0 && waterY - this.position.y > 0.35) {
        this.world.spawnUnderwaterBubbles?.(this.position, waterY, 1.5, 90);
        this._waterBubbleCd = 0.5;
      }
    } else if (this.gliding) {
      this.velocity.y = Math.max(this.velocity.y - 9 * dt, -22);
      if (this.grounded) {
        this.gliding = false;
        this.gliderManualOff = false;
        this.audio.play('land');
      }
    } else {
      this.velocity.y -= GRAVITY * dt;
    }

    // Integración vertical y colisiones
    const prevY = this.position.y;
    this.position.y += this.velocity.y * dt;
    const groundSolid = this.world.groundAt(this.position.x, this.position.z, prevY, this.position.y);
    // Al nadar ya no hay colisión con la superficie: el clavado puede bajar de verdad.
    const waterSurface = deepWater && !this.swimming ? (waterY - WATER_FLOAT) : -Infinity;
    const ground = Math.max(groundSolid, waterSurface);
    const wasGroundedBeforeResolve = this.grounded;
    const snapDist = (this.grounded && this.velocity.y <= 1.5 && !this.gliding) ? 0.75 : 0;
    if (this.position.y <= ground + snapDist && this.velocity.y <= 1.5) {
      const impact = this.velocity.y;
      const wasGliding = this.gliding;
      const landedInWater = deepWater && this.swimming;
      const hitWaterBottom = landedInWater && this._waterDiveActive
        && groundSolid > waterY - 35 && ground <= groundSolid + 0.02;
      const wasAirborne = !this.grounded && !wasSwimming;
      if (wasAirborne && impact < -8 && !landedInWater) {
        this.audio.play('land');
        this.landCameraKick = Math.min(0.22, Math.abs(impact) * 0.012);
      }
      this.position.y = ground;
      this.velocity.y = 0;
      this.grounded = !landedInWater;
      this.gliding = false;
      this.gliderManualOff = false;
      if (landedInWater) {
        this.swimming = true;
        this.fallPeakY = waterY;
        if (hitWaterBottom && impact < -1.5) {
          // Golpe contra el fondo: como una caída alta, pero amortiguada por el agua.
          const effectiveFall = Math.max(this._waterDiveHeight || 0, Math.abs(impact) * 0.85);
          const damage = Math.min(60, Math.max(0,
            (effectiveFall - FALL_SAFE) * (100 / (FALL_LETHAL - FALL_SAFE)) * 0.45));
          if (damage > 0.5) {
            if (this.onFallDamage) this.onFallDamage(damage);
            else this.takeDamage(damage);
            this.damageShake = Math.min(0.35, (this.damageShake || 0) + damage * 0.003);
          }
          this.character.play('landRoll', 0.08);
          this.audio.play('land');
          this.world.spawnRipple?.(this.position.x, waterY, this.position.z, 1.4);
          this._waterDiveActive = false;
          this._waterDiveHeight = 0;
          this._waterDiveTime = 0;
          this._submerge = 0;
        }
        if (wasAirborne && impact < -2.5) {
          this.world.spawnUnderwaterBubbles?.(this.position, waterY, 1);
        }
      } else {
        if (!wasGliding && !this.inBus && !this.swimming) {
          const fall = this.fallPeakY - ground;
          const rollThreshold = (this.character?.height || 1.8) * 2;
          if (fall > rollThreshold) {
            this.character.play('landRoll', 0.08);
            this.audio.play('land');
          }
          if (fall > FALL_SAFE) {
            const damage = Math.min(100, (fall - FALL_SAFE) * (100 / (FALL_LETHAL - FALL_SAFE)));
            if (this.onFallDamage) this.onFallDamage(damage);
            else this.takeDamage(damage);
          }
        }
        this.fallPeakY = ground;
        if (this.jumpBufferTimer > 0 && this.alive && !this.inBus && !this.sliding) {
          this.jumpBufferTimer = 0;
          this.coyoteTimer = 0;
          this.velocity.y = JUMP;
          this.grounded = false;
          this.fallPeakY = this.position.y;
          this.diveStartY = this.position.y;
          this.audio.play('jump');
        }
      }
    } else {
      this.grounded = false;
      if (wasGroundedBeforeResolve && !this.swimming && !this.gliding && this.velocity.y <= 0) this.coyoteTimer = 0.12;
    }

    // Bombas de fuerza
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
    this.character.group.rotation.order = 'YXZ';
    this.character.group.rotation.y = this.yaw + Math.PI;
    const _hspd = Math.hypot(this.velocity.x, this.velocity.z);
    if (this.divingToWater && _hspd > 0.5) {
      const arc = Math.atan2(this.velocity.y, _hspd);
      const targetX = clamp(-arc, -1.05, 0.95);
      this.character.group.rotation.x = lerp(this.character.group.rotation.x, targetX, clamp(dt * 10, 0, 1));
      this.character.group.rotation.z = 0;
    } else {
      this.character.group.rotation.x = lerp(this.character.group.rotation.x, 0, clamp(dt * 8, 0, 1));
      this.character.group.rotation.z = 0;
    }
    this.character.aimPitch = this.pitch;
    this.character.aimDir = this.getAimDirection().clone();
    const cur = this.inventory.current();
    const _diveWaterY = this.world.waterYAt ? this.world.waterYAt(this.position.x, this.position.z) : (this.world.waterLevel ?? -100);
    let diveProgress = 0;
    if (this.divingToWater && this.diveStartY != null) {
      const apex = Math.max(this.diveApexY ?? this.diveStartY, this.position.y, this.diveStartY);
      const startY = this.diveStartY;
      const ascend = Math.max(0, apex - startY);
      const descend = Math.max(0.001, apex - _diveWaterY);
      const total = ascend + descend;
      const traveled = (this.velocity.y > 0 ? Math.max(0, this.position.y - startY) : ascend + Math.max(0, apex - this.position.y));
      diveProgress = Math.max(0, Math.min(1, traveled / Math.max(0.001, total)));
    }
    const pose = {
      crouching: this.crouching || this.sliding,
      ads: this.ads,
      reloading: this.inventory.reloading,
      twoHand: !!cur && !cur.def.melee && cur.type !== 'pistol',
      armed: !!cur && !cur.def.melee,
      strafe: sideInput,
      back: fwdInput < 0,
      swimming: this.swimming,
      gliding: this.gliding,
      sliding: this.sliding,
      divingToWater: this.divingToWater,
      diveProgress,
    };
    this.character.setLocomotion(planarSpeed, this.grounded, pose);
    this.updateAnimation(dt);
    if (this.grounded && planarSpeed > 0.8 && !this.sliding) this.audio.footstep(this.sprinting);
    if (planarSpeed > 0.5) this.bob += dt * (this.sprinting ? 13 : this.sliding ? 4 : 9);

    this.recoil = Math.max(0, this.recoil - dt * 0.22);
    this.recoilYaw *= 0.9;
    this.updateCamera(dt);
  }

  /** Avanza la animación del personaje (los bots lejanos la abaratan). */
  updateAnimation(dt) {
    this.character.update(dt);
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
    // En el bus: cámara lejana, alta y centrada para que no se meta en el autobús (mide 20 m).
    // En un vehículo: detrás de él, a la distancia de EGD.
    const ride = this.ride ? this.world.vehicles?.cameraFor(this) : null;
    const dist = ride ? ride.dist : this.inBus ? 26 : this.ads ? Math.max(2.2, baseDist * 0.68) : this.gliding ? Math.max(5, baseDist * 1.45) : baseDist;
    const shoulder = ride ? 0 : this.inBus ? 0 : this.ads ? baseShoulder * 0.82 : baseShoulder;

    const camH = this.inBus ? 4.5 : this.swimming ? 0.95 : (this.crouching ? 1.05 : 1.48);
    if (ride) this.camTarget.copy(ride.target);
    else this.camTarget.set(this.position.x, this.position.y + camH, this.position.z);
    this.desiredCam.copy(this.camTarget).addScaledVector(forward, -dist).addScaledVector(right, shoulder);
    this.landCameraKick = Math.max(0, (this.landCameraKick || 0) - dt * 1.8);
    this.damageShake = Math.max(0, (this.damageShake || 0) - dt * 1.2);
    const shake = this.damageShake;
    this.desiredCam.y += (this.ads ? 0.1 : 0.16 + Math.sin(this.bob) * 0.02) - this.landCameraKick;
    if (shake > 0.001) this.desiredCam.add(new THREE.Vector3((Math.random()-0.5)*shake, (Math.random()-0.5)*shake*0.6, (Math.random()-0.5)*shake));

    if (!this.inBus) {
      const dir = this.desiredCam.clone().sub(this.camTarget);
      const len = dir.length();
      dir.normalize();
      // La caja del propio vehículo no tapa la cámara.
      const own = ride?.vehicle?.collider;
      if (own) own.enabled = false;
      const hit = this.world.raycast(this.camTarget, dir, len);
      if (own) own.enabled = true;
      if (hit && hit.distance > 0.25) {
        // Nunca meter la cámara dentro del personaje (si no, solo se ve el arma).
        this.desiredCam.copy(this.camTarget).addScaledVector(dir, Math.max(1.7, hit.distance - 0.35));
      }
    }

    const lerpT = clamp(dt * 18, 0, 1);
    this.camera.position.lerp(this.desiredCam, lerpT);

    // Burbujas 3D cuando la CÁMARA se sumerge, igual que las del jugador.
    const camWaterY = this.world.waterYAt
      ? this.world.waterYAt(this.camera.position.x, this.camera.position.z)
      : (this.world.waterLevel ?? -Infinity);
    const camUnderwater = Number.isFinite(camWaterY) && camWaterY > -20
      && this.camera.position.y < camWaterY - 0.12;
    if (camUnderwater && !this._cameraUnderwater) {
      const bubbleOrigin = this.camera.position.clone().addScaledVector(forward, 1.8);
      bubbleOrigin.y -= 0.25;
      this.world.spawnUnderwaterBubbles?.(bubbleOrigin, camWaterY, 2.6, 360);
    }
    this._cameraUnderwater = camUnderwater;

    const current = new THREE.Vector3();
    this.camera.getWorldDirection(current);
    const wanted = forward.clone();
    current.lerp(wanted, lerpT).normalize();
    this.camera.lookAt(this.camera.position.clone().add(current));
    // Sin roll: lookAt ya deja la cámara nivelada. Forzar rotation.z después
    // de lookAt producía inclinaciones raras según el ángulo de la mirada.

    const sprintFov = (this.sprinting && Math.hypot(this.velocity.x, this.velocity.z) > 4.5 && this.grounded) ? 6 : 0;
    const targetFov = this.ads ? (this.inventory.current()?.def.scope ? 22 : 55) : (this.settings.get('fov') + sprintFov);
    this.camera.fov = lerp(this.camera.fov, targetFov, clamp(dt * 12, 0, 1));
    this.camera.updateProjectionMatrix();
  }

  takeDamage(amount, source = null) {
    if (!this.alive) return { damage: 0, killed: false };
    this.lastDamageTime = this.time;
    this.damageShake = Math.min(0.35, (this.damageShake || 0) + amount * 0.0035);
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
