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

const DIFFICULTY = {
  easy: { accuracy: 0.075, reaction: 0.75, rpm: 300, damage: 0.75, view: 95 },
  normal: { accuracy: 0.038, reaction: 0.48, rpm: 420, damage: 1, view: 130 },
  hard: { accuracy: 0.019, reaction: 0.3, rpm: 540, damage: 1.2, view: 170 },
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
    this.position = new THREE.Vector3(spawn.x, spawn.y + 220 + Math.random() * 90, spawn.z);
    this.velocity = new THREE.Vector3((Math.random() - 0.5) * 5, -4, (Math.random() - 0.5) * 5);
    this.yaw = Math.random() * Math.PI * 2;
    this.dropping = true;
    this.grounded = false;
    this.target = null;
    this.thinkTimer = Math.random() * 0.5;
    this.fireCooldown = Math.random();
    this.strafe = Math.random() > 0.5 ? 1 : -1;
    this.strafeTimer = 1 + Math.random() * 2;
    this.destination = spawn.clone();
    this.kills = 0;
    this.shotsFired = 0;
    this.time = 0;
    this.lastHitBy = null;
    this.hitboxes = [];
    this.deathTimer = 0;
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
      this.game.onBotKilled(this, attacker);
      return true;
    }
    return false;
  }

  hasLOS(from, to, maxDist) {
    const dir = _v1.copy(to).sub(from);
    const dist = dir.length();
    if (dist > maxDist) return false;
    dir.divideScalar(dist);
    // Muestreo barato del terreno
    for (let i = 1; i <= 7; i++) {
      const t = (i / 8) * dist;
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

  pickTarget(player, bots) {
    const from = this.eye;
    let best = null;
    let bestDist = this.diff.view;
    const candidates = [player, ...bots];
    for (const other of candidates) {
      if (!other || !other.alive || other === this) continue;
      const d = distance2D(this.position, other.position);
      if (d >= bestDist) continue;
      const to = other.eye || other.getEye?.() || new THREE.Vector3(other.position.x, other.position.y + 1.5, other.position.z);
      if (!this.hasLOS(from, to, d + 1)) continue;
      if (other === player && player.inBus) continue;
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

  shoot(target, dt) {
    this.fireCooldown -= dt;
    if (this.fireCooldown > 0) return;
    const from = this.eye;
    const to = target.eye || new THREE.Vector3(target.position.x, target.position.y + 1.45, target.position.z);
    const dist = from.distanceTo(to);
    if (dist > 190) return;
    this.fireCooldown = 60 / this.diff.rpm * (0.85 + Math.random() * 0.3);

    const dir = _v2.copy(to).sub(from).normalize();
    const spread = this.diff.accuracy * (1 + dist / 120);
    dir.x += (Math.random() - 0.5) * spread * 2;
    dir.y += (Math.random() - 0.5) * spread * 2;
    dir.z += (Math.random() - 0.5) * spread * 2;
    dir.normalize();
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
      const mult = hitPart === 'head' ? 2.2 : hitPart === 'legs' ? 0.8 : 1;
      const dmg = 24 * this.diff.damage * mult;
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
    this.character.weaponMount.updateWorldMatrix(true, false);
    return this.character.weaponMount.getWorldPosition(new THREE.Vector3());
  }

  update(dt, player, bots, storm) {
    this.time += dt;
    if (!this.alive) {
      this.deathTimer -= dt;
      this.character.update(dt);
      return;
    }

    const floor = this.world.heightAt(this.position.x, this.position.z);
    if (this.dropping) {
      this.velocity.y = Math.max(this.velocity.y - 6 * dt, -7);
      const destDir = this.destination.clone().sub(this.position);
      destDir.y = 0;
      if (destDir.lengthSq() > 0) {
        destDir.normalize();
        this.velocity.x = lerp(this.velocity.x, destDir.x * 9, dt * 2);
        this.velocity.z = lerp(this.velocity.z, destDir.z * 9, dt * 2);
      }
      this.character.play('jump');
      if (this.position.y <= floor + 1.8) {
        this.position.y = floor;
        this.velocity.y = 0;
        this.dropping = false;
        this.grounded = true;
        this.newDestination();
      }
    } else {
      this.thinkTimer -= dt;
      if (this.thinkTimer <= 0) {
        this.thinkTimer = 0.35 + Math.random() * 0.35;
        this.target = this.pickTarget(player, bots);
      }
      this.strafeTimer -= dt;
      if (this.strafeTimer <= 0) {
        this.strafeTimer = 1 + Math.random() * 2.2;
        this.strafe *= -1;
      }

      let moveDir = new THREE.Vector3();
      if (this.target && this.target.alive) {
        const dx = this.target.position.x - this.position.x;
        const dz = this.target.position.z - this.position.z;
        const d = Math.hypot(dx, dz) || 1;
        this.yaw = Math.atan2(-dx, -dz);
        const nx = dx / d;
        const nz = dz / d;
        const approach = d > 55 ? 1 : d < 16 ? -0.8 : 0.05;
        moveDir.set(nx * approach - nz * this.strafe * 0.7, 0, nz * approach + nx * this.strafe * 0.7);
        // Evita atraventar muros mirando dónde pisa
        if (this.hasLOS(this.eye, this.target.eye || this.target.position, 190)) this.shoot(this.target, dt);
      } else {
        const dx = this.destination.x - this.position.x;
        const dz = this.destination.z - this.position.z;
        const d = Math.hypot(dx, dz);
        if (d < 12) this.newDestination();
        else {
          moveDir.set(dx / d, 0, dz / d);
          this.yaw = Math.atan2(-moveDir.x, -moveDir.z);
        }
      }

      // Huir de la tormenta
      if (storm && storm.distanceOutside(this.position) > -20) {
        const toCenter = new THREE.Vector3(storm.center.x - this.position.x, 0, storm.center.z - this.position.z).normalize();
        moveDir.lerp(toCenter, 0.85);
        this.yaw = Math.atan2(-moveDir.x, -moveDir.z);
      }

      if (moveDir.lengthSq() > 0) moveDir.normalize();
      const speed = this.target ? 4.7 : 3.6;
      this.velocity.x = lerp(this.velocity.x, moveDir.x * speed, clamp(dt * 5, 0, 1));
      this.velocity.z = lerp(this.velocity.z, moveDir.z * speed, clamp(dt * 5, 0, 1));
      this.velocity.y -= 22 * dt;
    }

    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    this.world.resolveCollision(this.position, 0.42, 1.8);
    const prevY = this.position.y;
    this.position.y += this.velocity.y * dt;
    const floor2 = this.world.groundAt(this.position.x, this.position.z, prevY, this.position.y);
    if (this.position.y <= floor2) {
      this.position.y = floor2;
      this.velocity.y = 0;
      this.grounded = true;
      this.dropping = false;
    }

    this.character.group.position.copy(this.position);
    this.character.group.rotation.y = this.yaw;
    if (!this.dropping) this.character.setLocomotion(Math.hypot(this.velocity.x, this.velocity.z), this.grounded);
    if (!this.dropping && Math.random() < dt * 0.5) this.character.play('idle');
    this.character.update(dt);
    this.character.group.visible = distance2D(this.position, player.position) < 320;
  }

  destroy() {
    this.character.dispose();
    this.character.group.removeFromParent();
  }
}
