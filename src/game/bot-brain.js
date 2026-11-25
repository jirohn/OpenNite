import * as THREE from 'three';
import { clamp, distance2D, rayAABB } from '../core/utils.js';

/**
 * Cerebro de un bot: percibe como un jugador (lo que ve, lo que oye, la
 * tormenta del HUD, los brillos del botín) y responde pulsando teclas y
 * moviendo el "ratón". No toca la física ni la vida: eso lo hace el mismo
 * controlador `Player` que usa una persona.
 */

export const DIFFICULTY = {
  //            reacción  giro rad/s  error  cabeza  retroceso  vista  campo
  easy:   { reaction: 0.75, aimSpeed: 3.2, aimError: 0.075, headshot: 0.08, recoilComp: 0.35, view: 110, fov: 100, smart: 0.55 },
  normal: { reaction: 0.45, aimSpeed: 4.6, aimError: 0.048, headshot: 0.16, recoilComp: 0.6,  view: 150, fov: 115, smart: 0.8 },
  hard:   { reaction: 0.26, aimSpeed: 6.5, aimError: 0.028, headshot: 0.28, recoilComp: 0.85, view: 200, fov: 125, smart: 1.0 },
};

const SPRINT = 8.8;
const MANTLE_MAX = 2.9;
const STEP_UP = 0.45;
const SAFE_DROP = 8;

// Distancia preferida de combate según el arma.
const PREF_RANGE = { pickaxe: 1.6, shotgun: 6, smg: 13, pistol: 16, ar: 30, sniper: 75 };
// Alcance a partir del cual un jugador sensato ya no dispara con esa arma.
const EFFECTIVE_RANGE = { pickaxe: 3, shotgun: 16, smg: 38, pistol: 48, ar: 120, sniper: 400 };
// Valor base de cada arma para decidir qué recoger.
const WEAPON_VALUE = { pistol: 1, smg: 2.3, ar: 3.1, shotgun: 2.9, sniper: 2.5 };

const _v = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _probe = new THREE.Vector3();

const rand = (a, b) => a + Math.random() * (b - a);
const yawTo = (dx, dz) => Math.atan2(-dx, -dz);
function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Idoneidad de un arma a una distancia (0..1). */
function weaponSuit(type, d) {
  switch (type) {
    case 'shotgun': return d < 8 ? 1 : d < 15 ? 0.6 : 0.08;
    case 'smg': return d < 20 ? 0.85 : d < 40 ? 0.5 : 0.2;
    case 'pistol': return d < 25 ? 0.5 : d < 60 ? 0.42 : 0.2;
    case 'ar': return d < 10 ? 0.62 : d < 90 ? 0.92 : 0.6;
    case 'sniper': return d < 20 ? 0.12 : d < 50 ? 0.6 : 1;
    default: return 0;
  }
}

export class BotBrain {
  constructor(bot, game, diff) {
    this.bot = bot;
    this.game = game;
    this.diff = diff;
    // Personalidad: cada bot juega distinto.
    this.aggression = rand(0.15, 0.95);
    this.caution = rand(0.2, 0.9);
    this.greed = rand(0.3, 1);
    this.time = 0;

    this.landing = new THREE.Vector3();
    this.jumpAt = 0;
    this.skydiving = false;
    this.gliderCd = 0;

    this.thinkTimer = rand(0, 0.3);
    this.memory = new Map(); // actor -> { pos, t, seen }
    this.target = null;
    this.targetVisible = false;
    this.reactTimer = 0;
    this.trackTime = 0;
    this.errYaw = 0; this.errPitch = 0;
    this.errGoalYaw = 0; this.errGoalPitch = 0;
    this.errTimer = 0;
    this.aimHead = false;
    this.burstTimer = 0;
    this.burstPause = 0;
    this.adsTime = 0;
    this.switchCd = 0;

    this.goal = { type: 'roam', pos: new THREE.Vector3(), entity: null, since: 0 };
    this.roamPos = null;
    this.cover = null;      // { pos, from, until }
    this.coverCheckAt = -10;
    this.lastDamageAt = -10;
    this.damageWindow = 0;  // daño reciente acumulado
    this.strafeSign = Math.random() < 0.5 ? -1 : 1;
    this.strafeTimer = 0;

    this.avoidSide = Math.random() < 0.5 ? -1 : 1;
    this.stuckCheckAt = 0;
    this.stuckFrom = new THREE.Vector3();
    this.stuckCount = 0;
    this.detourYaw = null;
    this.detourUntil = 0;
    this.badSpots = [];
    this.spaceCd = 0;
    this.wantMove = false;
  }

  // ------------------------------------------------------------------
  // Autobús y caída
  // ------------------------------------------------------------------

  onBoardBus(route) {
    this.skydiving = false;
    const spot = this.chooseLanding(route);
    this.landing.copy(spot);
    const s = _v.copy(spot).sub(route.start).dot(route.dir);
    const t = (s - 6) / route.speed + rand(-0.5, 0.5);
    this.jumpAt = clamp(t, 0.8 + Math.random() * 0.6, route.duration - 0.25);
  }

  /** Elige dónde aterrizar entre los sitios con botín alcanzables desde la ruta. */
  chooseLanding(route) {
    const game = this.game;
    const world = this.bot.world;
    const spots = game.getLandingSpots();
    const claims = game._landingClaims || (game._landingClaims = []);
    const perp = _dir.set(-route.dir.z, 0, route.dir.x);
    let best = null;
    let bestScore = -Infinity;
    for (const sp of spots) {
      const rel = _v.copy(sp.pos).sub(route.start);
      const along = rel.x * route.dir.x + rel.z * route.dir.z;
      if (along < 0 || along > route.length) continue;
      const lateral = Math.abs(rel.x * perp.x + rel.z * perp.z);
      const groundY = sp.pos.y || 0;
      const reach = 0.5 * Math.max(40, route.start.y - groundY) * 0.85 + 12;
      if (lateral > reach) continue;
      let crowd = 0;
      for (const c of claims) if (distance2D(c, sp.pos) < 40) crowd++;
      const score = Math.random() * 0.9
        + sp.density * 0.07 * (0.4 + this.aggression)
        - crowd * (0.55 * (1 - this.aggression) + 0.12)
        - (lateral / reach) * 0.25;
      if (score > bestScore) { bestScore = score; best = sp.pos; }
    }
    if (!best) {
      // Mapa sin botín cerca de la ruta: un punto de tierra cualquiera.
      for (let i = 0; i < 40 && !best; i++) {
        const along = rand(0.25, 0.85) * route.length;
        const off = rand(-60, 60);
        const x = route.start.x + route.dir.x * along - route.dir.z * off;
        const z = route.start.z + route.dir.z * along + route.dir.x * off;
        const g = world.surfaceHeightAt?.(x, z) ?? world.heightAt(x, z);
        const w = world.waterYAt?.(x, z) ?? world.waterLevel ?? -100;
        if (Math.abs(x) < world.half && Math.abs(z) < world.half && g > w + 0.3) best = new THREE.Vector3(x, g, z);
      }
      if (!best) best = new THREE.Vector3(route.start.x + route.dir.x * route.length * 0.5, 0, route.start.z + route.dir.z * route.length * 0.5);
    }
    const chosen = best.clone();
    // Un poco de dispersión: no todos al mismo cofre exacto.
    chosen.x += rand(-4, 4);
    chosen.z += rand(-4, 4);
    claims.push(chosen);
    return chosen;
  }

  _updateSkydive(dt) {
    const bot = this.bot;
    const b = bot.body;
    const input = bot.input;
    const world = bot.world;
    const dx = this.landing.x - b.position.x;
    const dz = this.landing.z - b.position.z;
    const D = Math.hypot(dx, dz);
    // Ratón: mirar hacia el destino.
    this._turnYaw(yawTo(dx, dz), 3.2, dt);
    b.pitch = -0.4;
    if (D > 2.5) {
      input.key('KeyW', true);
      input.key('ShiftLeft', true);
    }
    const ground = Math.max(
      world.surfaceHeightAt?.(b.position.x, b.position.z) ?? world.heightAt(b.position.x, b.position.z),
      world.waterYAt?.(b.position.x, b.position.z) ?? -100,
    );
    const alt = b.position.y - ground;
    const vy = b.velocity.y;
    if (this.gliderCd > 0) return;
    if (!b.gliding) {
      const tFree = Math.sqrt(2 * Math.max(0, alt - 30) / 23);
      const reach = SPRINT * tFree + 8;
      const mustOpen = alt < 26 + Math.max(0, -vy) * 0.45;
      if (vy < -1.5 && (mustOpen || (D > reach && alt > 35))) {
        bot.pressSpace();
        this.gliderCd = 0.8;
      }
    } else if (D < 14 && alt > 75) {
      // Sobre el objetivo y muy alto: cerrar para caer rápido y volver a abrir.
      bot.pressSpace();
      this.gliderCd = 1.2;
    }
  }

  // ------------------------------------------------------------------
  // Bucle principal
  // ------------------------------------------------------------------

  update(dt, player, bots, storm) {
    const bot = this.bot;
    const b = bot.body;
    const input = bot.input;
    this.time += dt;
    this.gliderCd -= dt;
    this.spaceCd -= dt;
    this.switchCd -= dt;
    this.damageWindow = Math.max(0, this.damageWindow - dt * 12);

    input.releaseMovement();
    input.button(0, false);
    input.button(2, false);
    input.key('KeyE', false);
    input.key('KeyR', false);

    if (b.inBus) {
      if ((b.busTime || 0) >= this.jumpAt) {
        bot.pressSpace();
        this.skydiving = true;
      }
      return;
    }
    if (b.mantling) return;

    if (this.skydiving) {
      if (b.grounded || b.swimming) {
        this.skydiving = false;
        this.goal.type = 'roam';
        this.thinkTimer = 0;
      } else {
        this._updateSkydive(dt);
        return;
      }
    }

    // Caída fuera del autobús (acantilado, bomba de fuerza): abrir planeador si es peligrosa.
    if (!b.grounded && !b.swimming && !b.gliding && b.velocity.y < -9 && this.gliderCd <= 0) {
      const g = bot.world.surfaceHeightAt?.(b.position.x, b.position.z) ?? bot.world.heightAt(b.position.x, b.position.z);
      if (b.fallPeakY - g > SAFE_DROP + 2) { bot.pressSpace(); this.gliderCd = 1; }
    }

    this.thinkTimer -= dt;
    if (this.thinkTimer <= 0) {
      this.thinkTimer = rand(0.18, 0.32);
      this._perceive(player, bots);
      this._chooseTarget();
      this._chooseWeapon();
      this._chooseGoal(storm);
    }

    this._act(dt, storm);
  }

  // ------------------------------------------------------------------
  // Percepción
  // ------------------------------------------------------------------

  onDamaged(attacker, amount) {
    this.lastDamageAt = this.time;
    this.damageWindow += amount;
    if (attacker && attacker.position && attacker !== this.bot && attacker.alive !== false) {
      // Sabe más o menos desde dónde le disparan (como el indicador de daño).
      const mem = this.memory.get(attacker) || { pos: new THREE.Vector3(), t: 0, seen: false };
      mem.pos.copy(attacker.position);
      mem.t = this.time;
      this.memory.set(attacker, mem);
      if (!this.target || !this.targetVisible) {
        this.target = attacker;
        this.reactTimer = Math.max(this.reactTimer, this.diff.reaction * rand(0.6, 1.1));
      }
      this.thinkTimer = Math.min(this.thinkTimer, 0.08);
    }
  }

  _perceive(player, bots) {
    const bot = this.bot;
    const b = bot.body;
    const eye = b.eyePosition;
    const cands = [];
    const view = this.diff.view;
    const halfFov = (this.diff.fov * Math.PI) / 360;
    const consider = (a) => {
      if (!a || a === bot || !a.alive || a.inBus) return;
      const d = distance2D(b.position, a.position);
      if (d > view * (a.gliding ? 1.4 : 1)) return;
      if (d > 9) {
        const facing = yawTo(a.position.x - b.position.x, a.position.z - b.position.z);
        if (Math.abs(angleDiff(facing, b.yaw)) > halfFov) return;
      }
      cands.push({ a, d });
    };
    consider(player);
    for (const o of bots) consider(o);
    cands.sort((p, q) => p.d - q.d);
    for (let i = 0; i < cands.length && i < 5; i++) {
      const { a, d } = cands[i];
      const to = a.eye || a.position;
      if (!this.canSee(eye, to, d + 2)) continue;
      const mem = this.memory.get(a) || { pos: new THREE.Vector3(), t: 0, seen: true };
      mem.pos.copy(a.position);
      mem.t = this.time;
      mem.seen = true;
      this.memory.set(a, mem);
    }
    // Lo que oye: disparos cercanos.
    for (const n of this.game.noiseEvents || []) {
      if (n.shooter === bot || this.game.matchTime - n.time > 0.6) continue;
      const d = Math.hypot(n.x - b.position.x, n.z - b.position.z);
      if (d > n.radius) continue;
      const mem = this.memory.get(n.shooter);
      if (mem && this.time - mem.t < 0.5) continue;
      const m = mem || { pos: new THREE.Vector3(), t: 0, seen: false };
      const err = d * 0.12;
      m.pos.set(n.x + rand(-err, err), n.y, n.z + rand(-err, err));
      m.t = this.time;
      m.seen = false;
      this.memory.set(n.shooter, m);
    }
    for (const [a, m] of this.memory) {
      if (!a.alive || this.time - m.t > 15) this.memory.delete(a);
    }
  }

  _chooseTarget() {
    const b = this.bot.body;
    let best = null;
    let bestScore = Infinity;
    for (const [a, m] of this.memory) {
      if (!m.seen || this.time - m.t > 0.45) continue;
      const d = distance2D(b.position, a.position);
      let score = d * (0.55 + ((a.hp || 0) + (a.shield || 0)) / 250);
      if (a === this.target) score *= 0.7; // no cambia de objetivo cada segundo
      if (score < bestScore) { bestScore = score; best = a; }
    }
    const prev = this.target;
    if (best) {
      this.target = best;
      this.targetVisible = true;
      if (best !== prev || !this._hadVisible) {
        this.reactTimer = Math.max(this.reactTimer, this.diff.reaction * rand(0.75, 1.3));
        this.trackTime = 0;
        this.aimHead = Math.random() < this.diff.headshot;
      }
    } else {
      this.targetVisible = false;
      if (this.target && (!this.target.alive || !this.memory.has(this.target))) this.target = null;
    }
    this._hadVisible = this.targetVisible;
  }

  /** Línea de visión con terreno y estructuras. */
  canSee(from, to, maxDist) {
    const world = this.bot.world;
    const dir = _dir.copy(to).sub(from);
    const dist = dir.length();
    if (dist > maxDist || dist < 0.01) return dist <= maxDist;
    dir.divideScalar(dist);
    const steps = Math.min(10, 3 + Math.floor(dist / 15));
    for (let i = 1; i <= steps; i++) {
      const t = (i / (steps + 1)) * dist;
      const x = from.x + dir.x * t;
      const z = from.z + dir.z * t;
      const y = from.y + dir.y * t;
      const g = world.surfaceHeightAt?.(x, z) ?? world.heightAt(x, z);
      if (y < g - 0.1) return false;
    }
    const midX = (from.x + to.x) / 2;
    const midZ = (from.z + to.z) / 2;
    const cols = world.collidersNear(midX, midZ, dist / 2 + 3);
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i];
      if (c.role === 'windowGlass') continue;
      const t = rayAABB(from, dir, { x: c.minX, y: c.minY, z: c.minZ }, { x: c.maxX, y: c.maxY, z: c.maxZ }, dist - 0.4);
      if (t > 0) return false;
    }
    return true;
  }

  // ------------------------------------------------------------------
  // Decisiones
  // ------------------------------------------------------------------

  _rangedWeapons() {
    const inv = this.bot.body.inventory;
    const out = [];
    inv.slots.forEach((w, i) => {
      if (!w || w.def.melee) return;
      const reserve = inv.ammo[w.def.ammo] || 0;
      if (w.ammo > 0 || reserve > 0) out.push({ w, i });
    });
    return out;
  }

  _chooseWeapon() {
    if (this.switchCd > 0) return;
    const inv = this.bot.body.inventory;
    const b = this.bot.body;
    const d = this.target ? distance2D(b.position, this.target.position) : 40;
    let bestIdx = -1;
    let bestScore = -1;
    for (const { w, i } of this._rangedWeapons()) {
      let s = weaponSuit(w.type, d) * (1 + w.rarity * 0.08);
      if (w.ammo <= 0) s *= this.targetVisible ? 0.35 : 0.9; // en pleno combate mejor cambiar que recargar
      if (s > bestScore) { bestScore = s; bestIdx = i; }
    }
    if (bestIdx < 0) bestIdx = inv.slots.findIndex((w) => w && w.def.melee);
    if (bestIdx >= 0 && bestIdx !== inv.active && !inv.reloading) {
      inv.switchTo(bestIdx);
      this.switchCd = 0.7;
    }
  }

  _stormInfo(storm) {
    if (!storm || !storm.active) return null;
    const b = this.bot.body;
    const shrinking = storm.state === 'shrinking';
    const c = shrinking ? storm.nextCenter : storm.center;
    const r = shrinking ? storm.nextRadius : storm.radius;
    const distC = Math.hypot(b.position.x - c.x, b.position.z - c.z);
    const outside = distC - r * 0.78;
    const timeLeft = shrinking ? storm.timer : storm.timer + storm.shrinkTime * 0.6;
    const inStorm = storm.distanceOutside(b.position) > -2;
    let urgency = 0;
    if (inStorm) urgency = 1;
    else if (outside > 0) urgency = clamp(outside / (SPRINT * 0.8 * Math.max(1, timeLeft - 6)), 0, 1);
    return { c, r, distC, outside, inStorm, urgency, timeLeft };
  }

  _itemValue(e) {
    const b = this.bot.body;
    const inv = b.inventory;
    if (e.isChest) return 1.1;
    const it = e.item;
    if (!it) return 0;
    switch (it.kind) {
      case 'health': return Math.min(it.amount, 100 - b.hp) / 30;
      case 'shield': return Math.min(it.amount, b.maxShield - b.shield) / 45;
      case 'slurp': return (Math.min(it.amount, 100 - b.hp) + Math.min(it.amount, b.maxShield - b.shield)) / 50;
      case 'ammo': {
        const uses = inv.slots.some((w) => w && w.def.ammo === it.ammoType);
        const max = { light: 240, medium: 270, heavy: 40, shells: 50 }[it.ammoType] || 100;
        return uses ? clamp(1 - (inv.ammo[it.ammoType] || 0) / (max * 0.6), 0, 1) * 0.8 : 0.05;
      }
      case 'weapon': {
        const val = (WEAPON_VALUE[it.type] || 1) * (1 + it.rarity * 0.15);
        let current = 0;
        let worst = Infinity;
        let free = false;
        for (const w of inv.slots) {
          if (!w) { free = true; continue; }
          if (w.def.melee) continue;
          const v = (WEAPON_VALUE[w.type] || 1) * (1 + w.rarity * 0.15);
          if (w.type === it.type) current = Math.max(current, v);
          worst = Math.min(worst, v);
        }
        if (current >= val) return 0.12; // ya la tiene igual o mejor: solo munición
        const gain = free ? val - current : val - Math.min(worst, current || worst);
        return clamp(gain / 2.2, 0, 1.4);
      }
      default: return 0;
    }
  }

  _bestItem(maxDist, filter) {
    const loot = this.game.loot;
    if (!loot) return null;
    const b = this.bot.body;
    let best = null;
    let bestScore = 0;
    for (const e of loot.items) {
      const d = distance2D(e.pos, b.position);
      if (d > (e.isChest ? maxDist * 0.75 : maxDist)) continue;
      if (Math.abs(e.pos.y - b.position.y) > 12) continue;
      if (e._botClaim && e._botClaim.bot !== this.bot && e._botClaim.until > this.game.matchTime) continue;
      if (this._isBad(e.pos)) continue;
      if (filter && !filter(e)) continue;
      const v = this._itemValue(e);
      if (v <= 0.05) continue;
      const score = v / (1 + d / 18);
      if (score > bestScore) { bestScore = score; best = e; }
    }
    return best ? { e: best, score: bestScore } : null;
  }

  _chooseGoal(storm) {
    const bot = this.bot;
    const b = bot.body;
    const g = this.goal;
    const total = b.hp + b.shield;
    const ranged = this._rangedWeapons().length > 0;
    const st = this._stormInfo(storm);
    const recentlyHit = this.time - this.lastDamageAt < 2.2;
    const tgt = this.target;
    const dT = tgt ? distance2D(b.position, tgt.position) : Infinity;

    const options = [];
    // Tormenta
    if (st && st.urgency > 0) options.push({ type: 'storm', score: st.inStorm ? 1.25 : 0.25 + st.urgency * 0.9 });

    if (tgt && this.targetVisible) {
      let fight = 0.62 + this.aggression * 0.3;
      if (!ranged) fight = dT < 5 ? 0.7 : 0.05;
      if (total < 45 && recentlyHit) fight -= 0.4 * this.caution;
      // Demasiado lejos para su mejor arma y nadie le dispara: mejor seguir a lo suyo.
      const bestEff = Math.max(3, ...this._rangedWeapons().map(({ w }) => EFFECTIVE_RANGE[w.type] || 40));
      if (dT > bestEff * 1.4 && !recentlyHit) fight -= 0.45;
      options.push({ type: 'fight', score: fight });

      const exposed = recentlyHit && (total < 80 || this.damageWindow > 25 || b.inventory.reloading);
      if (exposed && this.diff.smart > Math.random() * 0.9) {
        options.push({ type: 'cover', score: 0.7 + this.caution * 0.35 + (b.inventory.reloading ? 0.15 : 0) });
      }
      if (total < 35 && (recentlyHit || dT < 25)) {
        options.push({ type: 'flee', score: 0.7 + this.caution * 0.45 - (dT < 6 ? 0.4 : 0) });
      }
      if (!ranged) options.push({ type: 'flee', score: 0.75 });
    } else if (tgt && this.memory.has(tgt)) {
      const m = this.memory.get(tgt);
      const age = this.time - m.t;
      if (age < 9 && ranged && total >= 60) options.push({ type: 'hunt', score: 0.3 + this.aggression * 0.4 - age * 0.03 });
      if (age < 6 && total < 45) options.push({ type: 'flee', score: 0.45 + this.caution * 0.3 });
    }

    // Botín: salud primero si hace falta.
    const heal = (b.hp < 90 || b.shield < 60)
      ? this._bestItem(55, (e) => !e.isChest && ['health', 'shield', 'slurp'].includes(e.item?.kind))
      : null;
    if (heal) options.push({ type: 'loot', score: 0.25 + heal.score * (total < 60 ? 1.1 : 0.6), entity: heal.e });
    const item = this._bestItem(ranged ? 45 : 70);
    if (item) options.push({ type: 'loot', score: 0.2 + item.score * (0.35 + this.greed * 0.35) * (ranged ? 1 : 1.8), entity: item.e });

    options.push({ type: 'roam', score: 0.16 });

    // Seguir con lo que estaba haciendo un poco más (no cambiar de idea cada tick).
    for (const o of options) {
      if (o.type === g.type && (o.entity == null || o.entity === g.entity)) o.score += 0.1;
      // Si estaba en cobertura y aún no se ha recuperado, se queda.
      if (o.type === 'cover' && this.cover && this.time < this.cover.until) o.score += 0.2;
    }
    options.sort((p, q) => q.score - p.score);
    const pick = options[0];

    if (pick.type !== g.type || pick.entity !== g.entity) {
      g.type = pick.type;
      g.entity = pick.entity || null;
      g.since = this.time;
      if (g.entity) g.entity._botClaim = { bot, until: this.game.matchTime + 8 };
      if (pick.type === 'cover') this._findCover(true);
    }

    // Posición objetivo del movimiento según la meta.
    switch (g.type) {
      case 'storm': {
        const k = Math.max(0, st.distC - st.r * 0.55) / Math.max(1, st.distC);
        g.pos.set(b.position.x + (st.c.x - b.position.x) * k, 0, b.position.z + (st.c.z - b.position.z) * k);
        break;
      }
      case 'loot': g.pos.copy(g.entity.pos); break;
      case 'hunt': g.pos.copy(this.memory.get(tgt).pos); break;
      case 'cover':
        if (!this.cover || this.time - this.coverCheckAt > 1.6) this._findCover(false);
        if (this.cover) g.pos.copy(this.cover.pos);
        else g.type = 'fight';
        break;
      case 'flee': {
        const from = tgt ? (this.memory.get(tgt)?.pos || tgt.position) : b.position;
        _v.set(b.position.x - from.x, 0, b.position.z - from.z);
        if (_v.lengthSq() < 0.01) _v.set(Math.random() - 0.5, 0, Math.random() - 0.5);
        _v.normalize();
        // Huir hacia la zona segura, no hacia la tormenta.
        if (st) {
          const toC = _dir.set(st.c.x - b.position.x, 0, st.c.z - b.position.z).normalize();
          _v.addScaledVector(toC, st.outside > -20 ? 1.2 : 0.35).normalize();
        }
        g.pos.set(b.position.x + _v.x * 30, 0, b.position.z + _v.z * 30);
        break;
      }
      case 'roam': {
        if (!this.roamPos || distance2D(this.roamPos, b.position) < 8 || (st && Math.hypot(this.roamPos.x - st.c.x, this.roamPos.z - st.c.z) > st.r * 0.8)) {
          this.roamPos = this._pickRoam(st);
        }
        g.pos.copy(this.roamPos);
        break;
      }
      default: break;
    }
  }

  _pickRoam(st) {
    const b = this.bot.body;
    const world = this.bot.world;
    const spots = this.game.getLandingSpots();
    let best = null;
    let bestScore = -Infinity;
    for (let i = 0; i < 14 && spots.length; i++) {
      const sp = spots[Math.floor(Math.random() * spots.length)].pos;
      const d = distance2D(sp, b.position);
      if (d < 15 || this._isBad(sp)) continue;
      let score = -d / 120 + Math.random() * 0.5;
      if (st) {
        const dc = Math.hypot(sp.x - st.c.x, sp.z - st.c.z);
        if (dc > st.r * 0.8) score -= 2;
      }
      if (score > bestScore) { bestScore = score; best = sp; }
    }
    if (best) return best.clone();
    const c = st ? st.c : { x: 0, z: 0 };
    const r = st ? st.r * 0.6 : world.half * 0.6;
    const a = Math.random() * Math.PI * 2;
    const rr = Math.sqrt(Math.random()) * r;
    return new THREE.Vector3(c.x + Math.cos(a) * rr, 0, c.z + Math.sin(a) * rr);
  }

  /** Busca un punto cercano donde el enemigo no le vea. */
  _findCover(force) {
    const b = this.bot.body;
    const world = this.bot.world;
    const tgt = this.target;
    this.coverCheckAt = this.time;
    if (!tgt) { this.cover = null; return; }
    const enemyEye = _probe.copy(tgt.position);
    enemyEye.y += 1.6;
    if (!force && this.cover) {
      const p = this.cover.pos;
      const eye = _v.set(p.x, p.y + 1.0, p.z);
      if (!this.canSee(enemyEye, eye, 400)) return;
    }
    let best = null;
    let bestScore = Infinity;
    const base = Math.random() * Math.PI * 2;
    for (const r of [3, 6, 10]) {
      for (let k = 0; k < 10; k++) {
        const a = base + (k / 10) * Math.PI * 2;
        const x = b.position.x + Math.cos(a) * r;
        const z = b.position.z + Math.sin(a) * r;
        const gy = world.surfaceHeightAt?.(x, z) ?? world.heightAt(x, z);
        if (Math.abs(gy - b.position.y) > MANTLE_MAX) continue;
        const wy = world.waterYAt?.(x, z) ?? -100;
        if (wy > -20 && gy < wy - 0.55) continue;
        if (this._insideCollider(x, gy, z)) continue;
        const eye = _v.set(x, gy + 1.0, z);
        if (this.canSee(enemyEye, eye, 400)) continue;
        // Mejor cerca de mí y no más cerca del enemigo.
        const dEnemyNow = distance2D(b.position, tgt.position);
        const dEnemy = Math.hypot(x - tgt.position.x, z - tgt.position.z);
        const score = r + Math.max(0, dEnemyNow - dEnemy) * 1.5;
        if (score < bestScore) { bestScore = score; best = new THREE.Vector3(x, gy, z); }
      }
      if (best) break;
    }
    this.cover = best ? { pos: best, until: this.time + rand(1.8, 3.5) + this.caution * 2 } : null;
  }

  _insideCollider(x, y, z) {
    const cols = this.bot.world.collidersNear(x, z, 1.5);
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i];
      if (y + 1.6 <= c.minY || y >= c.maxY - 0.05) continue;
      if (x > c.minX - 0.4 && x < c.maxX + 0.4 && z > c.minZ - 0.4 && z < c.maxZ + 0.4) return true;
    }
    return false;
  }

  _isBad(p) {
    for (const s of this.badSpots) if (s.until > this.time && distance2D(s.pos, p) < 4) return true;
    return false;
  }

  // ------------------------------------------------------------------
  // Acción: teclas y ratón
  // ------------------------------------------------------------------

  _act(dt, storm) {
    const bot = this.bot;
    const b = bot.body;
    const input = bot.input;
    const g = this.goal;
    const tgt = this.target;
    const inv = b.inventory;
    const cur = inv.current();
    const dT = tgt ? distance2D(b.position, tgt.position) : Infinity;

    // ¿Apunta a alguien en este momento?
    const engage = tgt && this.targetVisible && g.type !== 'flee'
      && !(g.type === 'storm' && this.goal && storm && storm.distanceOutside(b.position) > 0 && dT > 25)
      && !(g.type === 'loot' && dT > 60);

    let moveX = 0;
    let moveZ = 0;
    let sprint = false;
    let crouch = false;
    let stopAndUse = false;

    // --- Movimiento según la meta ---
    if (g.type === 'fight' && tgt) {
      const pref = PREF_RANGE[cur?.type] || 20;
      const dx = tgt.position.x - b.position.x;
      const dz = tgt.position.z - b.position.z;
      const d = Math.hypot(dx, dz) || 1;
      const nx = dx / d;
      const nz = dz / d;
      const approach = d > pref * 1.35 ? 1 : d < pref * 0.6 ? -0.8 : 0;
      // Fuera de alcance eficaz: correr hacia él sin apuntar con la mira.
      this.closingIn = d > (EFFECTIVE_RANGE[cur?.type] || 40);
      if (this.closingIn) sprint = true;
      this.strafeTimer -= dt;
      if (this.strafeTimer <= 0) {
        this.strafeTimer = rand(0.45, 1.5);
        this.strafeSign = Math.random() < 0.75 ? -this.strafeSign : this.strafeSign;
        // Saltar de vez en cuando en combate cercano, como un jugador.
        if (d < 25 && b.grounded && Math.random() < 0.15 + this.aggression * 0.2) this._space();
      }
      const strafe = this.closingIn ? 0.3 : cur?.def.scope && d > 40 ? 0.25 : 0.85;
      moveX = nx * approach - nz * this.strafeSign * strafe;
      moveZ = nz * approach + nx * this.strafeSign * strafe;
      if (!this.targetVisible) {
        const m = this.memory.get(tgt);
        if (m) { moveX = m.pos.x - b.position.x; moveZ = m.pos.z - b.position.z; }
      }
      // Francotirador a larga distancia: agachado y quieto.
      if (cur?.def.scope && d > 45 && this.targetVisible) { moveX = 0; moveZ = 0; crouch = true; }
    } else if (g.type !== 'fight') {
      const dx = g.pos.x - b.position.x;
      const dz = g.pos.z - b.position.z;
      const d = Math.hypot(dx, dz);
      if (g.type === 'loot' && g.entity) {
        if (d < 1.8) stopAndUse = true;
        else { moveX = dx; moveZ = dz; }
        // El objeto ya no existe (otro lo cogió).
        if (!g.entity.group?.parent) { g.type = 'roam'; this.thinkTimer = 0; }
      } else if (g.type === 'cover') {
        if (d < 0.9) {
          crouch = true;
          if (cur && !cur.def.melee && cur.ammo < cur.def.mag) input.key('KeyR', true);
          if (this.time > (this.cover?.until || 0) && !inv.reloading) { g.type = 'fight'; this.cover = null; }
        } else { moveX = dx; moveZ = dz; sprint = !engage || d > 4; }
      } else if (d > 1.5) {
        moveX = dx; moveZ = dz;
      }
      const far = d > 18;
      sprint = sprint || g.type === 'flee' || g.type === 'storm' || (far && !engage);
    }

    // Recargar con calma si no hay nadie a la vista.
    if (!engage && cur && !cur.def.melee && cur.ammo < cur.def.mag * 0.5 && (inv.ammo[cur.def.ammo] || 0) > 0) {
      input.key('KeyR', true);
    }

    // --- Ratón: apuntar ---
    if (engage) {
      this._aimAt(tgt, dt, dT);
    } else if (tgt && this.memory.has(tgt) && g.type !== 'flee' && this.time - this.memory.get(tgt).t < 4 && moveX * moveX + moveZ * moveZ < 1) {
      // Preapuntar hacia donde lo vio por última vez.
      const m = this.memory.get(tgt).pos;
      this._turnYaw(yawTo(m.x - b.position.x, m.z - b.position.z), this.diff.aimSpeed * 0.7, dt);
      b.pitch += (0 - b.pitch) * Math.min(1, dt * 4);
    } else if (moveX * moveX + moveZ * moveZ > 0.01) {
      this._turnYaw(yawTo(moveX, moveZ), 4.2, dt);
      b.pitch += (-0.05 - b.pitch) * Math.min(1, dt * 4);
      this.trackTime = 0;
    }

    // --- Navegación: esquivar obstáculos y desatascarse ---
    this.wantMove = moveX * moveX + moveZ * moveZ > 0.01;
    if (this.wantMove) {
      const len = Math.hypot(moveX, moveZ);
      _dir.set(moveX / len, 0, moveZ / len);
      this._steer(_dir, dt);
      moveX = _dir.x;
      moveZ = _dir.z;
    }
    this._checkStuck(dt);

    // --- Teclado: convertir dirección deseada a W/A/S/D según hacia dónde mira ---
    if (this.wantMove) {
      const fx = -Math.sin(b.yaw);
      const fz = -Math.cos(b.yaw);
      const rx = Math.cos(b.yaw);
      const rz = -Math.sin(b.yaw);
      const f = moveX * fx + moveZ * fz;
      const s = moveX * rx + moveZ * rz;
      if (f > 0.38) input.key('KeyW', true);
      else if (f < -0.38) input.key('KeyS', true);
      if (s > 0.38) input.key('KeyD', true);
      else if (s < -0.38) input.key('KeyA', true);
      if (sprint && f > 0.38 && !crouch) input.key('ShiftLeft', true);
    }
    if (crouch && !b.sprinting) input.key('ControlLeft', true);

    // --- Manos: coger botín / abrir puertas ---
    if (stopAndUse) {
      // Si lleva el inventario lleno, saca el arma peor para cambiarla.
      if (g.entity?.item?.kind === 'weapon') this._prepareSwap();
      input.key('KeyE', true);
    } else if ((this.stuckCount > 0 || this.time - (this._doorAhead ?? -10) < 0.5) && bot.world.findNearestDoor?.(b.position, 2.4)) {
      input.key('KeyE', true);
    }

    // --- Disparo ---
    if (engage) this._fireControl(dt, dT);
    else this.adsTime = 0;
  }

  _prepareSwap() {
    const inv = this.bot.body.inventory;
    if (inv.slots.some((s) => !s)) return;
    let worst = -1;
    let worstV = Infinity;
    inv.slots.forEach((w, i) => {
      if (!w || w.def.melee) return;
      const v = (WEAPON_VALUE[w.type] || 1) * (1 + w.rarity * 0.15);
      if (v < worstV) { worstV = v; worst = i; }
    });
    if (worst >= 0 && worst !== inv.active) inv.switchTo(worst);
  }

  _space() {
    if (this.spaceCd > 0) return;
    this.spaceCd = 0.5;
    this.bot.pressSpace();
  }

  _turnYaw(desired, maxRate, dt) {
    const b = this.bot.body;
    const d = angleDiff(desired, b.yaw);
    const step = clamp(d * Math.min(1, dt * 9), -maxRate * dt, maxRate * dt);
    b.yaw += step;
  }

  _aimAt(tgt, dt, dist) {
    const b = this.bot.body;
    const diff = this.diff;
    this.trackTime += dt;
    // El error de puntería se mueve poco a poco (como una mano) y se reduce al seguirlo.
    this.errTimer -= dt;
    if (this.errTimer <= 0) {
      this.errTimer = rand(0.25, 0.6);
      const moving = Math.hypot(b.velocity.x, b.velocity.z) > 3 ? 1.35 : 1;
      const tMove = tgt.velocity ? Math.hypot(tgt.velocity.x, tgt.velocity.z) : 0;
      const mag = diff.aimError * (0.45 + 1.3 * Math.exp(-this.trackTime * 1.4)) * moving * (1 + tMove / 12);
      this.errGoalYaw = rand(-mag, mag);
      this.errGoalPitch = rand(-mag, mag) * 0.7;
      if (Math.random() < 0.25) this.aimHead = Math.random() < diff.headshot;
    }
    const k = Math.min(1, dt * 3);
    this.errYaw += (this.errGoalYaw - this.errYaw) * k;
    this.errPitch += (this.errGoalPitch - this.errPitch) * k;

    const eye = b.eyePosition;
    const crouchK = tgt.crouching ? 0.65 : 1;
    const aimY = tgt.position.y + (this.aimHead ? 1.6 : 1.1) * crouchK;
    const dx = tgt.position.x - eye.x;
    const dz = tgt.position.z - eye.z;
    const horiz = Math.hypot(dx, dz) || 0.01;
    const wantYaw = yawTo(dx, dz) + this.errYaw;
    const wantPitch = Math.atan2(aimY - eye.y, horiz) + this.errPitch - b.recoil * diff.recoilComp;
    // Tiempo de reacción: antes de reaccionar solo empieza a girarse despacio.
    const rate = this.reactTimer > 0 ? diff.aimSpeed * 0.45 : diff.aimSpeed;
    this._turnYaw(wantYaw, rate, dt);
    const dp = clamp(wantPitch - b.pitch, -rate * dt, rate * dt);
    b.pitch = clamp(b.pitch + dp * Math.min(1, dt * 12 + 0.3), -1.45, 1.35);
    this.reactTimer = Math.max(0, this.reactTimer - dt);
    this._aimErr = Math.abs(angleDiff(yawTo(dx, dz), b.yaw));
    this._aimTol = Math.atan2(0.55, horiz) + 0.012 + diff.aimError * 0.5;
  }

  _fireControl(dt, dist) {
    const b = this.bot.body;
    const input = this.bot.input;
    const cur = b.inventory.current();
    if (!cur) return;
    const melee = !!cur.def.melee;
    if (melee && dist > 3.2) return;
    if (!melee && dist > Math.min(cur.def.range, EFFECTIVE_RANGE[cur.type] || 60)) return;
    // Apuntar con la mira (clic derecho) a media/larga distancia.
    const wantAds = !melee && cur.type !== 'shotgun' && b.grounded && !b.swimming && (dist > 16 || cur.def.scope);
    if (wantAds) {
      input.button(2, true);
      this.adsTime += dt;
    } else this.adsTime = 0;
    if (this.reactTimer > 0) return;
    if (cur.def.scope && this.adsTime < 0.35) return;
    if (this._aimErr > this._aimTol * 1.8) return;

    // Ráfagas controladas a distancia (para dominar el retroceso).
    this.burstPause -= dt;
    if (this.burstPause > 0) return;
    if (cur.def.auto && dist > 22) {
      this.burstTimer += dt;
      if (this.burstTimer > rand(0.25, 0.6)) {
        this.burstTimer = 0;
        this.burstPause = rand(0.15, 0.35) * (1.3 - this.diff.smart * 0.4);
        return;
      }
    }
    input.button(0, true);
  }

  _steer(dir, dt) {
    const b = this.bot.body;
    if (this.detourYaw != null && this.time < this.detourUntil) {
      dir.set(-Math.sin(this.detourYaw), 0, -Math.cos(this.detourYaw));
      return;
    }
    this.detourYaw = null;
    const base = Math.atan2(dir.x, dir.z);
    const angles = [0, 0.45, -0.45, 0.9, -0.9, 1.4, -1.4, 2.0, -2.0];
    for (const a0 of angles) {
      const a = base + a0 * this.avoidSide;
      _probe.set(Math.sin(a), 0, Math.cos(a));
      const res = this._probeDir(_probe);
      if (res === 'ok' || res === 'step' || (res === 'water' && b.swimming)) {
        if (res === 'step' && a0 === 0 && b.grounded) {
          // Escalón o muro bajo: saltar para trepar (mirando hacia allí).
          if (Math.abs(angleDiff(yawTo(_probe.x, _probe.z), b.yaw)) < 0.5) this._space();
        }
        if (a0 !== 0 && Math.random() < 0.02) this.avoidSide *= -1;
        dir.copy(_probe);
        return;
      }
      if (res === 'water' && a0 === 0) {
        // Agua delante: se acepta si no hay alternativa por tierra cercana.
        this._waterAhead = true;
      }
    }
    // Nada despejado: seguir recto (el desatasco se encargará).
  }

  _probeDir(dir) {
    const b = this.bot.body;
    const world = this.bot.world;
    const y = b.position.y;
    for (const dist of [1.1, 2.4]) {
      const x = b.position.x + dir.x * dist;
      const z = b.position.z + dir.z * dist;
      const g = world.surfaceHeightAt?.(x, z) ?? world.heightAt(x, z);
      const w = world.waterYAt?.(x, z) ?? -100;
      if (w > -20 && g < w - 0.55 && !b.swimming) return 'water';
      const rise = g - y;
      if (!b.swimming) {
        if (rise > MANTLE_MAX) return 'blocked';
        if (y - g > SAFE_DROP + 1 && !(w > -20 && g < w - 1.5)) return 'cliff';
      }
      const cols = world.collidersNear(x, z, 1.2);
      for (let i = 0; i < cols.length; i++) {
        const c = cols[i];
        if (y + 1.7 <= c.minY || y + 0.35 >= c.maxY) continue;
        if (x < c.minX - 0.36 || x > c.maxX + 0.36 || z < c.minZ - 0.36 || z > c.maxZ + 0.36) continue;
        if (c.role === 'doorPanel') { this._doorAhead = this.time; continue; }
        return c.maxY - y <= MANTLE_MAX && dist < 2 ? 'step' : 'blocked';
      }
      if (rise > STEP_UP && dist < 2) return 'step';
    }
    return 'ok';
  }

  _checkStuck(dt) {
    const b = this.bot.body;
    if (this.time < this.stuckCheckAt) return;
    this.stuckCheckAt = this.time + 0.8;
    const moved = distance2D(b.position, this.stuckFrom);
    this.stuckFrom.copy(b.position);
    const expecting = this.wantMove && b.grounded && !b.crouching && this.goal.type !== 'fight';
    if (!expecting || moved > 0.9) {
      if (moved > 2) this.stuckCount = 0;
      return;
    }
    this.stuckCount++;
    this._space();
    if (this.stuckCount >= 2) {
      this.detourYaw = b.yaw + (Math.random() < 0.5 ? -1 : 1) * rand(1.2, 2.6);
      this.detourUntil = this.time + rand(0.8, 1.6);
    }
    if (this.stuckCount >= 5) {
      // Este destino no es alcanzable: olvidarlo un rato.
      this.badSpots.push({ pos: this.goal.pos.clone(), until: this.time + 25 });
      if (this.badSpots.length > 12) this.badSpots.shift();
      if (this.goal.type === 'roam') this.roamPos = null;
      this.goal.type = 'roam';
      this.goal.entity = null;
      this.stuckCount = 0;
      this.thinkTimer = 0;
    }
  }
}
