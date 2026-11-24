import * as THREE from 'three';
import { clamp, distance2D, lerp, rayAABB, raySphere } from '../core/utils.js';

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

const WATER_FLOAT = 1.1;

const DIFFICULTY = {
  easy:   { accuracy: 0.085, reaction: 0.85, aimSpeed: 2.4, rpm: 180, damage: 0.75, view: 90,  fov: 95,  burst: [2, 3], pause: [0.9, 1.8] },
  normal: { accuracy: 0.055, reaction: 0.55, aimSpeed: 3.6, rpm: 240, damage: 0.9,  view: 120, fov: 110, burst: [2, 4], pause: [0.6, 1.4] },
  hard:   { accuracy: 0.032, reaction: 0.35, aimSpeed: 5.0, rpm: 320, damage: 1.05, view: 150, fov: 125, burst: [3, 5], pause: [0.45, 1.0] },
};

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();

export class Bot {
  constructor(character, world, game, index, spawn) {
    this.character = character;
    this.world = world;
    this.game = game;
    this.index = index;
    this.name = NAMES[index % NAMES.length] + (index >= NAMES.length ? `-${index}` : '');
    this.color = BOT_COLORS[index % BOT_COLORS.length];
    this.character.setColor(this.color);
    character.group.userData.bot = this;

    this.diff = DIFFICULTY[game.settings.get('botDifficulty')] || DIFFICULTY.normal;
    this.hp = 100;
    this.shield = this.diff.reaction < 0.5 ? 75 : 50;
    this.maxShield = 100;
    this.alive = true;
    this.position = new THREE.Vector3(spawn.x, spawn.y + 120 + Math.random() * 50, spawn.z);
    this.velocity = new THREE.Vector3((Math.random() - 0.5) * 5, -6, (Math.random() - 0.5) * 5);
    this.yaw = Math.random() * Math.PI * 2;
    this.dropping = true;
    this.grounded = false;
    this.swimming = false;
    this.target = null;
    this.thinkTimer = Math.random() * 0.5;
    this.fireCooldown = 0.8 + Math.random() * 0.8;
    this.strafe = Math.random() > 0.5 ? 1 : -1;
    this.strafeTimer = 1 + Math.random() * 2;
    this.destination = new THREE.Vector3(spawn.x, spawn.y || 0, spawn.z);
    this.kills = 0;
    this.shotsFired = 0;
    this.time = 0;
    this.lastHitBy = null;
    this.lastHitAt = -10;
    this.hitboxes = [];
    this.deathTimer = 0;
    // Comportamiento humano: adquisición, ráfagas y puntería imperfecta.
    this.acquireTimer = 0;
    this.burstLeft = 0;
    this.burstPause = 0;
    this.aimYaw = this.yaw;
    this.aimErrYaw = 0;
    this.aimErrPitch = 0;
    this.aimErrTimer = 0;
    // Caché de línea de visión (costosa): evita recalcular cada frame.
    this.losTimer = 0;
    this.losFront = false;
    this.losAny = false;
    this._losTarget = null;
    this._eyeTmp = new THREE.Vector3();
    this._toTmp = new THREE.Vector3();
  }

  get eye() {
    return new THREE.Vector3(this.position.x, this.position.y + 1.55, this.position.z);
  }

  /** Hitboxes del modelo del bot, en coordenadas de mundo. */
  getHitboxes(out = []) {
    return this.character.getHitboxes(out);
  }

  takeDamage(amount, part, attacker) {
    if (!this.alive) return false;
    this.lastHitBy = attacker;
    this.lastHitAt = this.time;
    if (attacker && attacker !== this && attacker.alive !== false && !attacker.inBus) {
      // Si le disparan, puede girarse a buscar, pero necesita tiempo de reacción.
      if (this.target !== attacker) {
        this.target = attacker;
        this.acquireTimer = Math.max(this.acquireTimer, this.diff.reaction * (0.7 + Math.random() * 0.6));
      }
      this.thinkTimer = 0;
    }
    let remaining = amount;
    if (this.shield > 0) {
      const a = Math.min(this.shield, remaining);
      this.shield -= a;
      remaining -= a;
    }
    this.hp -= remaining;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.character.die();
      this.deathTimer = 18;
      return true;
    }
    return false;
  }

  canSee(from, to, maxDist, options = {}) {
    const dir = _v1.copy(to).sub(from);
    const dist = dir.length();
    if (dist > maxDist) return false;
    dir.divideScalar(dist);
    if (options.checkFov) {
      // Cono de visión frontal: sin ver por la espalda.
      const facing = Math.atan2(-dir.x, -dir.z);
      let delta = facing - this.yaw;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      const halfFov = ((this.diff.fov || 110) * Math.PI) / 360;
      if (Math.abs(delta) > halfFov) return false;
    }
    // Muestreo barato del terreno
    const steps = 5;
    for (let i = 1; i <= steps; i++) {
      const t = (i / (steps + 1)) * dist;
      const x = from.x + dir.x * t;
      const y = from.y + dir.y * t;
      const z = from.z + dir.z * t;
      if (y < this.world.heightAt(x, z) - 0.15) return false;
    }
    // Cajas de estructuras en el segmento
    const midX = (from.x + to.x) / 2;
    const midZ = (from.z + to.z) / 2;
    for (const c of this.world.collidersNear(midX, midZ, dist / 2 + 4)) {
      const t = rayAABB(from, dir, { x: c.minX, y: c.minY, z: c.minZ }, { x: c.maxX, y: c.maxY, z: c.maxZ }, dist - 0.5);
      if (t > 0) return false;
    }
    return true;
  }

  hasLOS(from, to, maxDist) { return this.canSee(from, to, maxDist); }

  pickTarget(player, bots) {
    const from = this.eye;
    let best = null;
    let bestDist = this.diff.view;
    const candidates = [player, ...bots];
    for (const other of candidates) {
      if (!other || !other.alive || other === this) continue;
      if (other === player && player.inBus) continue;
      const d = distance2D(this.position, other.position);
      if (d >= bestDist) continue;
      const to = other.eye || other.getEye?.() || new THREE.Vector3(other.position.x, other.position.y + 1.5, other.position.z);
      // Solo detecta objetivos dentro de su cono de visión frontal.
      if (!this.canSee(from, to, d + 1, { checkFov: true })) continue;
      best = other;
      bestDist = d;
    }
    return best;
  }

  newDestination() {
    const spots = this.world.spawnPoints || [];
    if (spots.length) {
      const p = spots[Math.floor(Math.random() * spots.length)];
      this.destination.set(p.x + (Math.random() - 0.5) * 30, p.y, p.z + (Math.random() - 0.5) * 30);
    } else {
      this.destination.set((Math.random() - 0.5) * this.world.size * 0.8, 0, (Math.random() - 0.5) * this.world.size * 0.8);
    }
  }

  tryShoot(target, dt) {
    this.fireCooldown -= dt;
    this.burstPause -= dt;
    this.aimErrTimer -= dt;
    if (this.aimErrTimer <= 0) {
      this.aimErrTimer = 0.25 + Math.random() * 0.55;
      const e = this.diff.accuracy;
      this.aimErrYaw = (Math.random() - 0.5) * e * 2.2;
      this.aimErrPitch = (Math.random() - 0.5) * e * 1.6;
    }
    if (this.acquireTimer > 0) { this.acquireTimer -= dt; return; }
    if (this.burstPause > 0 || this.fireCooldown > 0) return;

    if (this.burstLeft <= 0) {
      const [a, b] = this.diff.burst || [2, 4];
      this.burstLeft = a + Math.floor(Math.random() * (b - a + 1));
    }

    const from = this.eye;
    const to = target.eye || new THREE.Vector3(target.position.x, target.position.y + 1.45, target.position.z);
    const dist = from.distanceTo(to);
    if (dist > 170) return;

    // Cadencia humana por ráfagas con pausa entre ráfagas.
    this.fireCooldown = 60 / this.diff.rpm * (0.9 + Math.random() * 0.35);
    this.burstLeft -= 1;
    if (this.burstLeft <= 0) {
      const [pa, pb] = this.diff.pause || [0.6, 1.3];
      this.burstPause = pa + Math.random() * (pb - pa);
    }
    this.character.fire('ar');

    const dir = _v2.copy(to).sub(from);
    const baseDist = dir.length() || 1;
    dir.divideScalar(baseDist);
    // Error de puntería persistente (no lock-on perfecto) + imprecisión por disparo.
    const shotErr = this.diff.accuracy * (0.7 + dist / 160);
    const yaw = Math.atan2(-dir.x, -dir.z) + this.aimErrYaw + (Math.random() - 0.5) * shotErr;
    const pitch = Math.asin(clamp(dir.y, -0.99, 0.99)) + this.aimErrPitch + (Math.random() - 0.5) * shotErr * 0.7;
    const cp = Math.cos(pitch);
    dir.set(-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp).normalize();
    this.shotsFired++;

    const worldHit = this.world.raycast(from, dir, 200);
    const worldDist = worldHit ? worldHit.distance : 200;

    const boxes = target.getHitboxes ? target.getHitboxes(this.hitboxes) : null;
    let hitDist = Infinity;
    let hitPart = 'body';
    if (boxes) {
      for (const b of boxes) {
        const t = raySphere(from, dir, b, b.r);
        if (t > 0 && t < hitDist) { hitDist = t; hitPart = b.part; }
      }
    }
    if (hitDist < worldDist && hitDist < dist + 1.2) {
      const mult = hitPart === 'head' ? 1.8 : hitPart === 'legs' ? 0.8 : 1;
      const dmg = 22 * this.diff.damage * mult;
      const point = from.clone().addScaledVector(dir, hitDist);
      this.game.onBotHit(target, dmg, hitPart, this, point);
      this.game.effects.tracer(this.muzzlePosition(), point, 0xffb04a);
      this.game.effects.impact(point, dir.clone().negate(), hitPart === 'head' ? 'flesh' : 'flesh');
      this.game.audio.play('hit', { head: hitPart === 'head' });
    } else if (worldHit) {
      this.game.effects.tracer(this.muzzlePosition(), worldHit.point, 0xffb04a);
      this.game.effects.impact(worldHit.point, dir.clone().negate(), worldHit.type === 'terrain' ? 'terrain' : 'stone');
    } else {
      this.game.effects.tracer(this.muzzlePosition(), from.clone().addScaledVector(dir, 150), 0xffb04a);
    }
    if (dist < 150) this.game.audio.play('shoot', { weapon: 'ar' });
  }

  muzzlePosition() {
    const mount = this.character.weaponMount;
    const weapon = mount.children[0];
    if (weapon?.userData?.muzzle) {
      mount.updateWorldMatrix(true, true);
      return weapon.localToWorld(weapon.userData.muzzle.clone());
    }
    mount.updateWorldMatrix(true, false);
    return mount.getWorldPosition(new THREE.Vector3());
  }

  update(dt, player, bots, storm) {
    this.time += dt;
    if (!this.alive) {
      this.deathTimer -= dt;
      this.character.update(dt);
      return;
    }

    if (this.passive) {
      const floor = this.world.heightAt(this.position.x, this.position.z);
      this.position.y = floor;
      this.velocity.set(0, 0, 0);
      this.grounded = true;
      this.character.play('idle');
      this.character.group.position.copy(this.position);
      this.character.group.rotation.y = this.yaw;
      this.character.update(dt);
      return;
    }

    const floor = this.world.heightAt(this.position.x, this.position.z);
    const waterY = this.world.waterLevel ?? -100;
    const deepWater = waterY > -20 && floor < waterY - 0.55;
    this.swimming = deepWater && this.position.y < waterY + 0.25;

    if (this.dropping) {
      this.velocity.y = Math.max(this.velocity.y - 10 * dt, -22);
      const destDir = this.destination.clone().sub(this.position);
      destDir.y = 0;
      if (destDir.lengthSq() > 0) {
        destDir.normalize();
        this.velocity.x = lerp(this.velocity.x, destDir.x * 9, dt * 2);
        this.velocity.z = lerp(this.velocity.z, destDir.z * 9, dt * 2);
      }
      this.character.play('jump');
      const landY = this.swimming ? waterY - WATER_FLOAT : floor;
      if (this.position.y <= landY + (this.swimming ? 0.12 : 1.8)) {
        this.position.y = landY;
        this.velocity.y = 0;
        this.dropping = false;
        this.grounded = !this.swimming;
        this.newDestination();
      }
    } else {
      const turnTo = (desired, rate = 3.2) => {
        let delta = desired - this.yaw;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        const step = Math.sign(delta) * Math.min(Math.abs(delta), rate * dt);
        this.yaw += step;
      };

      this.thinkTimer -= dt;
      this.losTimer -= dt;
      if (this.thinkTimer <= 0) {
        this.thinkTimer = 0.35 + Math.random() * 0.45;
        const prev = this.target;
        this.target = this.pickTarget(player, bots);
        if (this.target && this.target !== prev) {
          // Tiempo de reacción/adquisición antes de disparar (humano).
          this.acquireTimer = Math.max(this.acquireTimer, this.diff.reaction * (0.8 + Math.random() * 0.7));
          this.burstLeft = 0;
          this.burstPause = Math.max(this.burstPause, 0.15 + Math.random() * 0.25);
          this.losTimer = 0; // recalcular LOS con nuevo objetivo
        }
      }
      this.strafeTimer -= dt;
      if (this.strafeTimer <= 0) {
        this.strafeTimer = 1 + Math.random() * 2.2;
        this.strafe *= -1;
      }

      // Gracia inicial: no acosan al jugador nada más empezar/caer.
      const grace = (this.game.matchTime || 0) < 12;
      if (grace && this.target === player) this.target = null;

      let moveDir = new THREE.Vector3();
      if (this.target && this.target.alive) {
        const dx = this.target.position.x - this.position.x;
        const dz = this.target.position.z - this.position.z;
        const d = Math.hypot(dx, dz) || 1;
        const desiredYaw = Math.atan2(-dx, -dz);
        const nx = dx / d;
        const nz = dz / d;
        const approach = d > 55 ? 1 : d < 12 ? -0.45 : 0.2;
        moveDir.set(nx * approach - nz * this.strafe * 0.55, 0, nz * approach + nx * this.strafe * 0.55);

        // LOS costosa: cachear y recalcular a intervalos (o al cambiar objetivo).
        if (this._losTarget !== this.target || this.losTimer <= 0) {
          const to = this.target.eye || this.target.position;
          // Chequeo frontal primero: evita doble canSee cuando no hay FOV.
          this.losFront = this.canSee(this.eye, to, 170, { checkFov: true });
          this.losAny = this.losFront ? true : this.canSee(this.eye, to, 170);
          this._losTarget = this.target;
          this.losTimer = 0.12 + Math.random() * 0.08;
        }
        const visibleFront = this.losFront;
        const visibleAny = this.losAny;

        // Girar para encarar: rápido si le acaban de disparar, si no humano.
        const turnRate = (this.time - this.lastHitAt < 1.5) ? Math.max(4.5, this.diff.aimSpeed) : this.diff.aimSpeed;
        turnTo(desiredYaw, turnRate);

        // Solo dispara si lo tiene de frente y en línea de visión.
        if (visibleFront && !grace) {
          this.tryShoot(this.target, dt);
        } else {
          // Si lo ha perdido de frente pero sabe que está ahí (p.ej. le dispararon), busca girándose.
          if (!visibleFront && this.acquireTimer <= 0) this.acquireTimer = 0.2 + Math.random() * 0.3;
          // Si no lo ve en absoluto, enfriar el objetivo.
          if (!visibleAny && this.time - this.lastHitAt > 2.5) this.target = null;
        }
      } else {
        const dx = this.destination.x - this.position.x;
        const dz = this.destination.z - this.position.z;
        const d = Math.hypot(dx, dz);
        if (d < 12) this.newDestination();
        else {
          moveDir.set(dx / d, 0, dz / d);
          turnTo(Math.atan2(-moveDir.x, -moveDir.z), 2.6);
        }
        // Reducir temporizadores de combate cuando no hay objetivo.
        this.acquireTimer = Math.max(0, this.acquireTimer - dt * 0.5);
        this._losTarget = null;
      }

      // Huir de la tormenta
      if (storm && storm.distanceOutside(this.position) > -20) {
        const toCenter = new THREE.Vector3(storm.center.x - this.position.x, 0, storm.center.z - this.position.z).normalize();
        moveDir.lerp(toCenter, 0.85);
        turnTo(Math.atan2(-toCenter.x, -toCenter.z), 4.0);
      }

      if (this.swimming) {
        // Los bots nadan hacia la orilla en lugar de hundirse.
        const toShore = new THREE.Vector3(-this.position.x, 0, -this.position.z);
        if (toShore.lengthSq() > 1) moveDir.lerp(toShore.normalize(), 0.75);
      }
      if (moveDir.lengthSq() > 0) moveDir.normalize();
      const speed = this.swimming ? 3.2 : this.target ? 4.5 : 3.4;
      this.velocity.x = lerp(this.velocity.x, moveDir.x * speed, clamp(dt * 5, 0, 1));
      this.velocity.z = lerp(this.velocity.z, moveDir.z * speed, clamp(dt * 5, 0, 1));
      if (this.swimming) {
        const targetY = waterY - WATER_FLOAT;
        const desiredV = clamp((targetY - this.position.y) * 4.5, -3.2, 3.2);
        this.velocity.y = lerp(this.velocity.y, desiredV, clamp(dt * 6, 0, 1));
      } else {
        this.velocity.y -= 22 * dt;
      }
    }

    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    this.world.resolveCollision(this.position, 0.34, 1.8);
    const prevY = this.position.y;
    this.position.y += this.velocity.y * dt;
    const floor2 = this.world.groundAt(this.position.x, this.position.z, prevY, this.position.y);
    if (this.position.y <= floor2) {
      this.position.y = floor2;
      this.velocity.y = 0;
      this.grounded = !this.swimming;
      this.dropping = false;
    }

    this.character.group.position.copy(this.position);
    // El GLB mira hacia +Z; el frente del bot es -Z.
    this.character.group.rotation.y = this.yaw + Math.PI;
    if (!this.dropping) {
      const planarSpeed = Math.hypot(this.velocity.x, this.velocity.z);
      const pose = { twoHand: true, armed: true, strafe: this.target ? this.strafe : 0, swimming: this.swimming };
      this.character.setLocomotion(planarSpeed, this.grounded, pose);
    }
    this.character.grounded = this.grounded;
    const dPlayer = distance2D(this.position, player.position);
    const nearPlayer = dPlayer < 180;
    const midPlayer = dPlayer < 420;
    this.character.group.visible = dPlayer < 700;
    if (nearPlayer) {
      this.character.update(dt);
      this._animAcc = 0;
    } else if (midPlayer) {
      // Lejos de cámara: animación a menor tasa para ahorrar CPU.
      this._animAcc = (this._animAcc || 0) + dt;
      if (this._animAcc >= 0.15) {
        this.character.update(this._animAcc);
        this._animAcc = 0;
      }
    } else {
      this._animAcc = (this._animAcc || 0) + dt;
      if (this._animAcc >= 0.35) {
        this.character.update(this._animAcc);
        this._animAcc = 0;
      }
    }
  }

  destroy() {
    this.character.dispose();
    this.character.group.removeFromParent();
  }
}
