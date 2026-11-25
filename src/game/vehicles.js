/**
 * OpenNite - Vehículos de Easy Game Developer (EGD).
 *
 * Es el sistema de vehículos de EGD llevado al juego: los mismos tipos (coche,
 * buggy, lancha, helicóptero y avioneta), los mismos modelos (egd-engine.mjs),
 * la misma física de conducción, los mismos asientos con IK de manos, piernas y
 * cadera (los del editor de Vehículos del Studio, `vehicleRide` de
 * config/egd-studio.json), daños, deformación, humo y atropellos.
 *
 * Los vehículos salen de las entidades `vehicle` del mapa egd-map (se colocan
 * en la pestaña Escena del OpenNite Studio). Quien conduce es un `Player`
 * (la persona o el cuerpo de un bot): el vehículo lee sus teclas (`input`), así
 * que los bots lo manejan pulsando las mismas teclas que una persona.
 *
 * Teclas (como en EGD): E subir/bajar, W/S acelerar/frenar, A/D girar,
 * Espacio freno de mano (subir en helicóptero, morro arriba en avioneta),
 * Shift bajar (helicóptero) o morro abajo (avioneta), F claxon.
 */
import * as THREE from 'three';
import { egdVehicleObject } from '../core/egd-engine.mjs';

// ------------------------------------------------------------------ datos de EGD
/** Tipos de vehículo de EGD (mismos valores que el motor). */
export const VEHICLE_DEFS = {
  car: { name: 'Coche', mode: 'ground', health: 250, deform: 0.7, color: '#d6332f', maxSpeed: 24, accel: 11, turn: 1.8, climb: 0.7, radius: 1.3, camDist: 8, camHeight: 1.6, grip: 6, ram: 1 },
  buggy: { name: 'Buggy todoterreno', mode: 'ground', health: 320, deform: 0.5, color: '#f2a71b', maxSpeed: 19, accel: 14, turn: 2.3, climb: 1.2, radius: 1.2, camDist: 7.5, camHeight: 1.6, grip: 4, ram: 1.5 },
  boat: { name: 'Lancha', mode: 'water', health: 200, deform: 0.5, color: '#f4f4f4', maxSpeed: 17, accel: 7, turn: 1.3, radius: 1.5, camDist: 9, camHeight: 1.8, grip: 1.5, ram: 0.6 },
  helicopter: { name: 'Helicóptero', mode: 'heli', health: 220, deform: 0.6, color: '#2f6fd6', maxSpeed: 18, accel: 8, turn: 1.6, lift: 8, radius: 1.8, camDist: 11, camHeight: 2.4, grip: 2, ram: 1 },
  plane: { name: 'Avioneta', mode: 'plane', health: 180, deform: 0.6, color: '#e8e8e8', maxSpeed: 42, accel: 9, turn: 1, takeoff: 17, radius: 2.2, camDist: 13, camHeight: 2.6, grip: 3, ram: 2 },
};

const HELP = {
  ground: 'W acelerar · S frenar/atrás · A/D girar · Espacio freno de mano · F claxon · E bajar',
  water: 'W acelerar · S atrás · A/D girar · F bocina · E bajar (solo navega por el agua)',
  heli: 'W/S adelante/atrás · A/D girar · Espacio subir · Shift bajar · E bajar',
  plane: 'W/S potencia · A/D girar · Espacio subir el morro · Shift bajarlo · E bajar',
};

/** Asientos por defecto de EGD (el editor de Vehículos del Studio los cambia). */
const SEATS = {
  car: {
    seats: [
      { name: 'Conductor', pos: [0.4, 0.62, -0.45], yaw: 0, driver: true, door: [1.45, 0, -0.35] },
      { name: 'Copiloto', pos: [-0.4, 0.62, -0.45], yaw: 0, door: [-1.45, 0, -0.35] },
    ],
    wheel: { pos: [0.4, 1.1, 0], radius: 0.17, tilt: 60 },
  },
  buggy: {
    seats: [{ name: 'Conductor', pos: [0, 0.92, -0.35], yaw: 0, driver: true, door: [1.3, 0, -0.3] }],
    wheel: { pos: [0, 1.2, 0.12], radius: 0.17, tilt: 55 },
  },
  boat: {
    seats: [{ name: 'Piloto', pos: [0, 0.78, -0.75], yaw: 0, driver: true, door: [1.4, 0, -0.75] }],
    wheel: { pos: [0, 1.08, -0.25], radius: 0.18, tilt: 50 },
  },
  helicopter: {
    seats: [{ name: 'Piloto', pos: [0.32, 0.95, 0.55], yaw: 0, driver: true, door: [1.6, 0, 0.5] }],
    wheel: { pos: [0.32, 1.05, 0.95], radius: 0.12, tilt: 80 },
  },
  plane: {
    seats: [{ name: 'Piloto', pos: [0, 1.05, 0.2], yaw: 0, driver: true, door: [1.4, 0, 0.2] }],
    wheel: { pos: [0, 1.3, 0.6], radius: 0.15, tilt: 75 },
  },
};
const RIDE_IK = { hands: true, handsW: 1, legs: true, legsW: 1, hips: true, hipsW: 1, enterTime: 1.1 };
const SEAT_IK = { hands: true, handsW: 1, legs: true, legsW: 1, hips: true, hipsW: 1 };

// ------------------------------------------------------------------ utilidades
const V3 = THREE.Vector3;
const clamp = (a, lo, hi) => Math.max(lo, Math.min(hi, a));
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const lerpAngle = (a, b, t) => a + wrap(b - a) * t;
const smooth01 = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const worldPos = (o) => o.getWorldPosition(new V3());

/** Nombre de hueso normalizado (mismo criterio que EGD: Mixamo, UE, Kaykit...). */
const boneKey = (a) => String(a).toLowerCase()
  .replace(/^.*mixamorig\d*[:_]?/, '')
  .replace(/^.*[:|]/, '')
  .replace(/^(armature|root|skeleton)[._]/, '')
  .replace(/[._](\d{2,3}|\d+_?end)$/, (e) => (/end$/.test(e) ? '_end' : ''))
  .replace(/\.\d+$/, '')
  .replace(/[^a-z0-9]/g, '');

/** Asientos, volante e IK de un tipo de vehículo (EGD: Il). */
export function rideConfig(vehicleRide, kind) {
  const base = SEATS[kind] || SEATS.car;
  const custom = vehicleRide?.[kind] || {};
  const ik = { ...RIDE_IK, ...(custom.ik || {}) };
  return {
    seats: (custom.seats || base.seats).map((s) => ({ ...s, ik: { ...SEAT_IK, ...(s.driver && custom.ik ? custom.ik : {}), ...(s.ik || {}) } })),
    wheel: { ...base.wheel, ...(custom.wheel || {}) },
    ik,
  };
}

/** Puntos de IK por defecto de un asiento (EGD: Ug). */
function seatIkPoints(seat) {
  const a = ((seat.yaw || 0) * Math.PI) / 180;
  const c = Math.cos(a), s = Math.sin(a);
  const at = ([x, y, z]) => [seat.pos[0] + x * c + z * s, seat.pos[1] + y, seat.pos[2] - x * s + z * c];
  const ik = seat.ik || {};
  return {
    handL: ik.handL || at([0.16, 0.08, 0.34]),
    handR: ik.handR || at([-0.16, 0.08, 0.34]),
    footL: ik.footL || at([0.12, -0.34, 0.55]),
    footR: ik.footR || at([-0.12, -0.34, 0.55]),
  };
}

/** Huesos que mueve la IK del asiento (EGD: Ku), con nombres de varios esqueletos. */
function rideBones(root) {
  const map = new Map();
  root.traverse((o) => {
    if (!o.isBone) return;
    const k = boneKey(o.name);
    if (!map.has(k)) map.set(k, o);
  });
  const pick = (...names) => { for (const n of names) { const b = map.get(n); if (b) return b; } return null; };
  return {
    hips: pick('hips', 'pelvis'),
    legL: [pick('leftupleg', 'thighl', 'upperlegl'), pick('leftleg', 'calfl', 'lowerlegl'), pick('leftfoot', 'footl')],
    legR: [pick('rightupleg', 'thighr', 'upperlegr'), pick('rightleg', 'calfr', 'lowerlegr'), pick('rightfoot', 'footr')],
    armL: [pick('leftarm', 'upperarml'), pick('leftforearm', 'lowerarml'), pick('lefthand', 'handl', 'wristl')],
    armR: [pick('rightarm', 'upperarmr'), pick('rightforearm', 'lowerarmr'), pick('righthand', 'handr', 'wristr')],
  };
}

function aimBone(bone, from, to, w) {
  if (from.lengthSq() < 1e-10 || to.lengthSq() < 1e-10) return;
  const q = new THREE.Quaternion().setFromUnitVectors(from.clone().normalize(), to.clone().normalize());
  const world = bone.getWorldQuaternion(new THREE.Quaternion());
  const parentInv = (bone.parent ? bone.parent.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion()).invert();
  bone.quaternion.slerp(parentInv.multiply(q.multiply(world)), w);
  bone.updateMatrixWorld(true);
}

/** IK de dos huesos (brazo o pierna) hacia `target`, doblando hacia `pole` (EGD: Ng). */
function twoBoneIK(a, b, c, target, pole, w = 1) {
  if (!a || !b || !c || w <= 0) return;
  a.updateMatrixWorld(true);
  const pa = worldPos(a), pb = worldPos(b), pc = worldPos(c);
  const l1 = pa.distanceTo(pb), l2 = pb.distanceTo(pc);
  const to = target.clone().sub(pa);
  const len = Math.min(l1 + l2 - 1e-4, Math.max(Math.abs(l1 - l2) + 1e-4, to.length()));
  const dir = to.normalize();
  const pv = pole.clone().sub(pa);
  const bend = pv.addScaledVector(dir, -pv.dot(dir));
  if (bend.lengthSq() < 1e-8) { const ob = pb.clone().sub(pa); bend.copy(ob).addScaledVector(dir, -ob.dot(dir)); }
  bend.normalize();
  const cos = clamp((l1 * l1 + len * len - l2 * l2) / (2 * l1 * len), -1, 1);
  const ang = Math.acos(cos);
  const knee = pa.clone().addScaledVector(dir, Math.cos(ang) * l1).addScaledVector(bend, Math.sin(ang) * l1);
  const end = pa.clone().addScaledVector(dir, len);
  aimBone(a, pb.clone().sub(pa), knee.clone().sub(pa), w);
  const nb = worldPos(b), nc = worldPos(c);
  aimBone(b, nc.clone().sub(nb), end.clone().sub(nb), w);
}

/** Posición y ejes del asiento en el mundo (EGD: Dl). */
function seatFrame(obj, cfg, seat) {
  obj.updateMatrixWorld(true);
  const q = obj.getWorldQuaternion(new THREE.Quaternion());
  const L = (m) => obj.localToWorld(new V3().fromArray(m));
  const rot = q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new V3(0, 1, 0), ((seat.yaw || 0) * Math.PI) / 180));
  const fwd = new V3(0, 0, 1).applyQuaternion(rot);
  const left = new V3(1, 0, 0).applyQuaternion(rot);
  const up = new V3(0, 1, 0).applyQuaternion(q);
  const wh = cfg.wheel;
  const tilt = ((wh.tilt ?? 60) * Math.PI) / 180;
  const ik = seatIkPoints(seat);
  return {
    pos: L(seat.pos), door: L(seat.door || [1.4, 0, 0]), rot, fwd, left, up,
    wheel: L(wh.pos), wheelLeft: left.clone(), wheelUp: up.clone().multiplyScalar(Math.sin(tilt)).addScaledVector(fwd, -Math.cos(tilt)).normalize(),
    wheelR: wh.radius ?? 0.18, driver: !!seat.driver,
    handL: L(ik.handL), handR: L(ik.handR), footL: L(ik.footL), footR: L(ik.footR),
    customFeet: !!(seat.ik?.footL || seat.ik?.footR),
  };
}

/** Personaje sentado: cadera en el asiento, pies a los pedales y manos al volante (EGD: Ll). */
function poseSeated(root, bones, f, ik, handsOn = 1) {
  root.quaternion.copy(f.rot);
  root.position.copy(f.pos);
  root.updateMatrixWorld(true);
  const hipsW = ik.hips ? 1 : 0;
  const legsW = ik.legs ? ik.legsW : 0;
  const handsW = (ik.hands ? Math.max(ik.handsW, 0.001) : 0) * handsOn;
  if (bones.hips && hipsW > 0) {
    root.position.add(f.pos.clone().sub(worldPos(bones.hips)));
    root.updateMatrixWorld(true);
  }
  if (legsW > 0) {
    for (const [leg, side] of [[bones.legL, 1], [bones.legR, -1]]) {
      if (!leg[0]) continue;
      const hip = worldPos(leg[0]);
      const foot = f.customFeet || !f.driver
        ? (side > 0 ? f.footL : f.footR).clone()
        : hip.clone().addScaledVector(f.fwd, 0.55).addScaledVector(f.up, -0.34).addScaledVector(f.left, side * 0.04);
      const pole = hip.clone().addScaledVector(f.fwd, 1).addScaledVector(f.up, 0.6);
      twoBoneIK(leg[0], leg[1], leg[2], foot, pole, legsW);
    }
  }
  if (handsW > 0) {
    for (const [arm, side] of [[bones.armL, 1], [bones.armR, -1]]) {
      if (!arm[0]) continue;
      const hand = f.driver
        ? f.wheel.clone().addScaledVector(f.wheelLeft, side * f.wheelR * 0.95).addScaledVector(f.wheelUp, f.wheelR * 0.25)
        : (side > 0 ? f.handL : f.handR).clone();
      const pole = worldPos(arm[0]).addScaledVector(f.up, -0.6).addScaledVector(f.left, side * 0.35).addScaledVector(f.fwd, -0.2);
      twoBoneIK(arm[0], arm[1], arm[2], hand, pole, handsW);
    }
  }
}

/** Subida: de la puerta al asiento (EGD: uh sin animación propia). k = 0..1. */
function poseEntering(root, bones, f, ik, k) {
  if (k < 0.35) {
    const h = k / 0.35;
    const d = f.pos.clone().sub(f.door); d.y = 0;
    root.position.copy(f.door);
    root.quaternion.setFromAxisAngle(new V3(0, 1, 0), Math.atan2(d.x, d.z)).slerp(f.rot, h * 0.5);
    root.updateMatrixWorld(true);
    return;
  }
  const c = (k - 0.35) / 0.65;
  poseSeated(root, bones, f, ik, Math.max(0, c * 1.4 - 0.4));
  const seat = root.position.clone();
  const door = f.door.clone();
  const mid = door.clone().lerp(seat, 0.5);
  mid.y = Math.max(door.y, seat.y) + 0.15;
  const p = door.clone().lerp(mid, c);
  const q = mid.clone().lerp(seat, c);
  root.position.copy(p.lerp(q, c));
  root.updateMatrixWorld(true);
}

function snapshot(root) {
  const list = [];
  root.traverse((o) => { if (o !== root && o.isBone) list.push([o, o.quaternion.clone(), o.position.clone()]); });
  return { pos: root.position.clone(), quat: root.quaternion.clone(), list };
}

function blendFrom(root, snap, t) {
  if (!snap || t >= 1) return;
  t = smooth01(t);
  const q = new THREE.Quaternion();
  root.position.lerpVectors(snap.pos, root.position.clone(), t);
  q.copy(root.quaternion); root.quaternion.copy(snap.quat).slerp(q, t);
  for (const [b, bq, bp] of snap.list) { q.copy(b.quaternion); b.quaternion.copy(bq).slerp(q, t); b.position.lerpVectors(bp, b.position.clone(), t); }
  root.updateMatrixWorld(true);
}

// ------------------------------------------------------------------ vehículo
class Vehicle {
  constructor(entity, object, def, cfg) {
    this.entity = entity;
    this.id = entity.id;
    this.kind = entity.vehicle?.kind || 'car';
    this.def = def;
    this.cfg = cfg;
    this.name = entity.name || def.name;
    this.object = object;
    this.parts = object.userData.vehicle || {};
    this.scale = Math.abs(object.scale.x) || 1;
    this.radius = def.radius * this.scale;
    this.riders = cfg.seats.map(() => null);
    this.maxHealth = def.health;
    this.health = def.health;
    this.wrecked = false;
    this.yaw = object.rotation.y;
    this.speed = 0; this.vy = 0; this.pitch = 0; this.roll = 0; this.throttle = 0; this.spin = 0;
    this.realSpeed = 0;
    this.lastPos = object.position.clone();
    this.collider = null;
    this.crashT = -10;
    this.smokeT = 0;
    // Caja del vehículo en sus coordenadas (para colisiones y balas).
    object.updateMatrixWorld(true);
    const inv = object.matrixWorld.clone().invert();
    const box = new THREE.Box3();
    const tmp = new THREE.Box3();
    object.traverse((m) => {
      if (!m.isMesh || !m.geometry) return;
      m.geometry.computeBoundingBox?.();
      tmp.copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld).applyMatrix4(inv);
      box.union(tmp);
    });
    this.localBox = box.isEmpty() ? new THREE.Box3(new V3(-1, 0, -2), new V3(1, 1.6, 2)) : box;
  }

  get position() { return this.object.position; }
  get driverSeat() { const i = this.cfg.seats.findIndex((s) => s.driver); return i >= 0 ? i : 0; }
  get driver() { return this.riders[this.driverSeat]; }
  get occupied() { return this.riders.some(Boolean); }
  freeSeat(preferDriver = true) {
    const d = this.driverSeat;
    if (preferDriver && !this.riders[d]) return d;
    const i = this.riders.findIndex((r) => !r);
    return i;
  }
  /** Punto de la puerta de un asiento en el mundo. */
  doorPoint(seatIndex = this.driverSeat) {
    const s = this.cfg.seats[seatIndex] || this.cfg.seats[0];
    this.object.updateMatrixWorld(true);
    return this.object.localToWorld(new V3().fromArray(s.door || [1.4, 0, 0]));
  }
}

// ------------------------------------------------------------------ sistema
export class VehicleManager {
  constructor(game, world, scene) {
    this.game = game;
    this.world = world;
    this.scene = scene;
    this.list = [];
    this.knocks = [];
    this.smoke = [];
    this.vehicleRide = {};
    this.group = new THREE.Group();
    this.group.name = 'opennite-vehicles';
    scene.add(this.group);
    world.vehicles = this;
  }

  /** Vehículos del mapa (entidades `vehicle` del egd-map) y asientos del Studio. */
  async load(map) {
    try {
      const res = await fetch('./config/egd-studio.json', { cache: 'no-cache' });
      if (res.ok) this.vehicleRide = (await res.json())?.vehicleRide || {};
    } catch { this.vehicleRide = {}; }
    const ents = (map?.egd?.extraEntities || []).filter((e) => e && e.type === 'vehicle');
    for (const e of ents) {
      try { this.spawn(e); } catch (err) { console.warn('[vehicles] no se pudo crear', e?.name, err); }
    }
    if (this.list.length) console.info('[vehicles]', this.list.map((v) => v.kind));
  }

  spawn(e) {
    const kind = VEHICLE_DEFS[e.vehicle?.kind] ? e.vehicle.kind : 'car';
    const def = { ...VEHICLE_DEFS[kind], ...(e.vehicle || {}) };
    const obj = egdVehicleObject(kind, e.vehicle?.color);
    const pos = e.position || [0, 0, 0], rot = e.rotation || [0, 0, 0], sc = e.scale || [1, 1, 1];
    obj.position.set(+pos[0] || 0, +pos[1] || 0, +pos[2] || 0);
    obj.rotation.set(0, ((+rot[1] || 0) * Math.PI) / 180, 0, 'YXZ');
    obj.scale.set(+sc[0] || 1, +sc[1] || 1, +sc[2] || 1);
    obj.name = e.name || def.name;
    obj.traverse((m) => { if (m.isMesh) { m.castShadow = !!this.game.settings?.get?.('shadows'); m.receiveShadow = true; } });
    const v = new Vehicle(e, obj, def, rideConfig(this.vehicleRide, kind));
    // Apoyado en el suelo (la lancha, en el agua).
    const p = obj.position;
    if (def.mode === 'water') {
      const wy = this.world.waterYAt(p.x, p.z);
      if (Number.isFinite(wy)) p.y = wy - 0.25;
      else p.y = this.ground(p.x, p.z, p.y + 3, v);
    } else p.y = this.ground(p.x, p.z, p.y + 3, v);
    v.lastPos.copy(p);
    this.group.add(obj);
    this.list.push(v);
    this._syncCollider(v);
    return v;
  }

  // ---------------------------------------------------------------- consultas del mundo
  /** Suelo bajo (x, z) por debajo de `fromY`: terreno, puentes y tejados (EGD: _groundProbe). */
  ground(x, z, fromY, self = null) {
    let g = this.world.surfaceHeightAt?.(x, z) ?? this.world.heightAt(x, z);
    if (!Number.isFinite(g)) g = -60;
    const cols = this.world.collidersNear(x, z, 0.5);
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i];
      if (c.vehicle === self || (c.vehicle && c.vehicle === self)) continue;
      if (x < c.minX || x > c.maxX || z < c.minZ || z > c.maxZ) continue;
      if (c.maxY <= fromY + 0.01 && c.maxY > g) g = c.maxY;
    }
    return g;
  }

  /** Obstáculo (caja de colisión) que toca un círculo a esa altura (EGD: _hits). */
  hits(x, z, y, r, h = 1.4, self = null) {
    const cols = this.world.collidersNear(x, z, r + 1);
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i];
      if (self && c.vehicle === self) continue;
      if (y + 0.35 >= c.maxY || y + h <= c.minY) continue;
      const cx = clamp(x, c.minX, c.maxX), cz = clamp(z, c.minZ, c.maxZ);
      if ((x - cx) ** 2 + (z - cz) ** 2 < r * r) return c;
    }
    return null;
  }

  waterAt(x, z) {
    const wy = this.world.waterYAt?.(x, z);
    return Number.isFinite(wy) && wy > -50 ? wy : null;
  }

  /** Agua navegable para la lancha: profunda y sin lava. */
  navigable(x, z) {
    const wy = this.waterAt(x, z);
    if (wy === null) return false;
    const g = this.world.surfaceHeightAt?.(x, z) ?? this.world.heightAt(x, z);
    if (!(g < wy - 0.3)) return false;
    return !(this.world.lavaDamageAt?.({ x, y: wy - 0.2, z }) > 0);
  }

  // ---------------------------------------------------------------- subir y bajar
  /** Vehículo al que puede subir alguien que está en `pos` (el más cercano). */
  nearest(pos, maxDist = 3.4, filter = null) {
    let best = null, bestD = maxDist;
    for (const v of this.list) {
      if (v.wrecked || v.freeSeat() < 0) continue;
      if (filter && !filter(v)) continue;
      const p = v.position;
      if (Math.abs(pos.y - p.y) > 3.5) continue;
      let d = Math.hypot(pos.x - p.x, pos.z - p.z) - v.radius;
      for (let i = 0; i < v.cfg.seats.length; i++) {
        if (v.riders[i]) continue;
        const dp = v.doorPoint(i);
        d = Math.min(d, Math.hypot(pos.x - dp.x, pos.z - dp.z));
      }
      if (d < bestD) { bestD = d; best = v; }
    }
    return best;
  }

  /** Sube a `actor` (un Player o el cuerpo de un bot). Devuelve true si ha subido. */
  enter(v, actor, seatIndex = null) {
    if (!v || v.wrecked || actor.ride || !actor.alive) return false;
    let i = seatIndex ?? v.freeSeat(true);
    if (i < 0 || v.riders[i]) i = v.freeSeat(false);
    if (i < 0) return false;
    v.riders[i] = actor;
    const seat = v.cfg.seats[i];
    const ch = actor.character;
    const root = ch.group;
    const nearCam = this._nearCamera(actor);
    actor.ride = {
      vehicle: v, seatIndex: i, seat, phase: 'enter', t: 0,
      dur: nearCam ? v.cfg.ik.enterTime : 0.01,
      bones: rideBones(root),
      snap: nearCam ? snapshot(root) : null,
    };
    actor.velocity.set(0, 0, 0);
    actor.sprinting = false; actor.crouching = false; actor.sliding = false; actor.ads = false; actor.gliding = false; actor.swimming = false;
    if (ch.weaponMount) ch.weaponMount.visible = false;
    ch.play('idle', 0.15);
    if (actor === this.game.player) {
      const help = seat.driver ? `${v.name}: ${HELP[v.def.mode] || HELP.ground}` : `Vas de pasajero en ${v.name} · E para bajar`;
      this.game.hud?.toast(help, 'good');
      this.game.audio?.play('click');
    }
    return true;
  }

  /** Baja a `actor`. `instant`: sin animación (muerte, explosión). */
  exit(actor, instant = false) {
    const r = actor.ride;
    if (!r || r.phase === 'exit') return;
    const v = r.vehicle;
    if (v.riders[r.seatIndex] === actor) v.riders[r.seatIndex] = null;
    const spot = this._exitSpot(v, r.seatIndex);
    const nearCam = this._nearCamera(actor);
    if (instant || !nearCam || !actor.alive) { this._finishExit(actor, spot); return; }
    r.phase = 'exit';
    r.t = 0;
    r.dur = v.cfg.ik.enterTime;
    r.from = actor.position.clone();
    r.spot = spot;
    r.snap = snapshot(actor.character.group);
  }

  _finishExit(actor, spot) {
    const r = actor.ride;
    const v = r?.vehicle;
    actor.ride = null;
    actor.position.copy(spot);
    actor.velocity.set(0, 0, 0);
    if (v) {
      // Del lado contrario al vehículo, mirando hacia fuera.
      const d = new V3(spot.x - v.position.x, 0, spot.z - v.position.z);
      if (actor.bot && d.lengthSq() > 1e-4) actor.yaw = Math.atan2(-d.x, -d.z);
      // En el aire (helicóptero, avioneta): cae y puede abrir el planeador.
      const g = this.ground(spot.x, spot.z, spot.y + 0.5);
      actor.grounded = spot.y - g < 0.2;
      actor.fallPeakY = spot.y;
      if (!actor.grounded && v.def.mode !== 'ground') actor.velocity.set(Math.sin(v.yaw) * v.speed * 0.5, v.vy * 0.5, Math.cos(v.yaw) * v.speed * 0.5);
    }
    const ch = actor.character;
    const root = ch.group;
    root.quaternion.setFromAxisAngle(new V3(0, 1, 0), actor.yaw + Math.PI);
    root.rotation.order = 'YXZ';
    root.position.copy(actor.position);
    root.visible = true;
    if (ch.weaponMount) ch.weaponMount.visible = true;
    if (actor.alive) ch.play('idle', 0.2);
    if (actor === this.game.player) this.game.audio?.engine?.(false);
  }

  /** Dónde se baja: la puerta del asiento o, si está tapada, otro lado libre (EGD: exit). */
  _exitSpot(v, seatIndex) {
    const p = v.position;
    const out = [];
    out.push(v.doorPoint(seatIndex));
    const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
    const rx = Math.cos(v.yaw), rz = -Math.sin(v.yaw);
    const r = v.radius;
    out.push(new V3(p.x - rx * (r + 0.9), p.y, p.z - rz * (r + 0.9)));
    out.push(new V3(p.x + rx * (r + 0.9), p.y, p.z + rz * (r + 0.9)));
    out.push(new V3(p.x - fx * (r + 2.2), p.y, p.z - fz * (r + 2.2)));
    out.push(new V3(p.x + fx * (r + 2.2), p.y, p.z + fz * (r + 2.2)));
    const airborne = p.y - this.ground(p.x, p.z, p.y + 0.5, v) > 2;
    for (const c of out) {
      const g = this.ground(c.x, c.z, p.y + 1.2, v);
      if (!airborne && Math.abs(g - p.y) > 1.2) continue;
      if (this.hits(c.x, c.z, airborne ? c.y : g, 0.4, 1.7, v)) continue;
      if (v.def.mode === 'water' && this.waterAt(c.x, c.z) !== null && !this._landAt(c.x, c.z)) continue;
      return new V3(c.x, airborne ? p.y : g + 0.02, c.z);
    }
    const c = out[0];
    if (airborne) return new V3(c.x, p.y, c.z);
    // Lancha en mar abierto: al agua.
    const wy = this.waterAt(c.x, c.z);
    return new V3(c.x, wy !== null ? wy : this.ground(c.x, c.z, p.y + 1.2, v) + 0.02, c.z);
  }

  _landAt(x, z) {
    const wy = this.waterAt(x, z);
    if (wy === null) return true;
    const g = this.world.surfaceHeightAt?.(x, z) ?? this.world.heightAt(x, z);
    return g > wy - 0.4;
  }

  _nearCamera(actor) {
    const cam = this.game.camera?.position;
    if (!cam) return true;
    return Math.hypot(actor.position.x - cam.x, actor.position.z - cam.z) < 70;
  }

  /** Dueño de un cuerpo (el Bot de un BotBody o el propio jugador). */
  owner(actor) { return actor?.bot || actor; }

  // ---------------------------------------------------------------- jinete (lo llama Player.update)
  /**
   * Coloca al jinete en su asiento (o en la puerta al subir/bajar) con la IK de
   * EGD. Su posición pasa a ser la del asiento (balas, tormenta, minimapa).
   */
  updateRider(actor, dt) {
    const r = actor.ride;
    if (!r) return;
    const v = r.vehicle;
    const ch = actor.character;
    const root = ch.group;
    ch.aimPitch = 0;
    actor.updateAnimation(dt);
    r.t += dt;
    const f = seatFrame(v.object, v.cfg, r.seat);
    const ik = { ...r.seat.ik, enterTime: v.cfg.ik.enterTime };
    const cheap = actor.bot && actor.bot.distToCamera > 120;
    if (r.phase === 'exit') {
      const k = Math.min(1, r.t / r.dur);
      if (!cheap) poseEntering(root, r.bones, f, ik, 1 - k);
      const c = r.t / 0.3;
      if (c < 1 && !cheap) blendFrom(root, r.snap, c);
      actor.position.lerpVectors(r.from, r.spot, smooth01(k));
      if (k >= 1) this._finishExit(actor, r.spot);
      return;
    }
    if (r.phase === 'enter' && r.t >= r.dur) { r.phase = 'seated'; r.snap2 = cheap ? null : snapshot(root); r.blendT = 0; }
    if (cheap) {
      root.quaternion.copy(f.rot);
      root.position.copy(f.pos).addScaledVector(f.up, -0.9);
    } else if (r.phase === 'enter') {
      poseEntering(root, r.bones, f, ik, Math.min(1, r.t / r.dur));
      if (r.snap) blendFrom(root, r.snap, r.t / 0.4);
    } else {
      poseSeated(root, r.bones, f, ik, 1);
    }
    root.updateMatrixWorld(true);
    actor.position.copy(f.pos).addScaledVector(f.up, -0.55);
    actor.velocity.set(Math.sin(v.yaw) * v.speed, v.vy, Math.cos(v.yaw) * v.speed);
    actor.grounded = true;
    actor.swimming = false;
  }

  /** Cámara del jinete: detrás del vehículo, a la distancia de EGD. */
  cameraFor(actor) {
    const v = actor.ride?.vehicle;
    if (!v) return null;
    return {
      vehicle: v,
      dist: v.def.camDist * Math.max(1, v.scale * 0.8),
      height: v.def.camHeight,
      target: new V3(v.position.x, v.position.y + v.def.camHeight * 0.55 + 0.6, v.position.z),
    };
  }

  // ---------------------------------------------------------------- daños
  damage(v, amount, attacker = null) {
    if (!v || v.wrecked || amount <= 0) return;
    v.health = Math.max(0, v.health - amount);
    v.lastAttacker = attacker || v.lastAttacker;
    if (v.health <= 0) this.wreck(v);
  }

  /** Explota: los ocupantes reciben daño y salen despedidos (EGD: wreck). */
  wreck(v) {
    if (v.wrecked) return;
    v.wrecked = true;
    const g = this.game;
    const p = v.position.clone().add(new V3(0, 1, 0));
    g.effects?.explosion?.(p, 5);
    g.audio?.play('explode');
    for (const a of v.riders) {
      if (!a) continue;
      this.exit(a, true);
      g.onBotHit(this.owner(a), 35, 'body', v.lastAttacker ? this.owner(v.lastAttacker) : { name: 'la explosión' }, null, v.name);
    }
    v.speed = 0;
    v.object.traverse((n) => {
      if (!n.isMesh || !n.material) return;
      const mats = (Array.isArray(n.material) ? n.material : [n.material]).map((m) => {
        const c = m.clone();
        c.color?.multiplyScalar?.(0.18);
        c.emissive?.setRGB?.(0, 0, 0);
        return c;
      });
      n.material = mats.length === 1 ? mats[0] : mats;
    });
    for (let i = 0; i < 3; i++) this.deform(v, new V3(p.x + (Math.random() - 0.5) * 3, p.y, p.z + (Math.random() - 0.5) * 3), 0.8);
  }

  /** Abolla la carrocería alrededor del golpe (EGD: deform). */
  deform(v, point, k) {
    const amount = v.def.deform ?? 0.6;
    if (amount <= 0) return;
    const s = v.object;
    s.updateMatrixWorld(true);
    const inv = s.matrixWorld.clone().invert();
    const o = point.clone().applyMatrix4(inv);
    const center = v.localBox.getCenter(new V3());
    const radius = 0.7 + k * 0.9;
    const push = k * amount * 0.55;
    const maxOff = 0.25 + amount * 0.75;
    const toLocal = new THREE.Matrix4(), toMesh = new THREE.Matrix4(), n3 = new THREE.Matrix3();
    const m = new V3(), f = new V3();
    s.traverse((b) => {
      if (!b.isMesh || !b.visible || !b.geometry?.attributes?.position) return;
      toLocal.multiplyMatrices(inv, b.matrixWorld);
      toMesh.copy(toLocal).invert();
      n3.setFromMatrix4(toMesh);
      if (!b.userData.ownGeo) { b.geometry = b.geometry.clone(); b.userData.ownGeo = true; }
      const pos = b.geometry.attributes.position;
      b.geometry.userData.orig ??= pos.array.slice();
      const orig = b.geometry.userData.orig;
      let changed = false;
      for (let i = 0; i < pos.count; i++) {
        m.fromBufferAttribute(pos, i).applyMatrix4(toLocal);
        const d = m.distanceTo(o);
        if (d > radius) continue;
        const w = Math.pow(1 - d / radius, 2) * (0.75 + 0.5 * Math.sin(i * 12.9898) ** 2);
        f.subVectors(center, o).normalize().multiplyScalar(push * w).applyMatrix3(n3);
        let x = pos.getX(i) + f.x, y = pos.getY(i) + f.y, z = pos.getZ(i) + f.z;
        const ox = orig[i * 3], oy = orig[i * 3 + 1], oz = orig[i * 3 + 2];
        const dl = Math.hypot(x - ox, y - oy, z - oz);
        if (dl > maxOff) { const q = maxOff / dl; x = ox + (x - ox) * q; y = oy + (y - oy) * q; z = oz + (z - oz) * q; }
        pos.setXYZ(i, x, y, z);
        changed = true;
      }
      if (changed) { pos.needsUpdate = true; b.geometry.computeVertexNormals(); b.geometry.computeBoundingSphere(); }
    });
  }

  /** Choque: daño al vehículo, a los ocupantes y a lo golpeado (EGD: crash). */
  crash(v, point, speed, other = null) {
    const g = this.game;
    const now = g.matchTime || 0;
    if (speed < 3.5 || now - v.crashT < 0.25) return;
    v.crashT = now;
    const dmg = Math.max(0, speed - 3.5) * 3.2;
    this.deform(v, point, Math.min(1, speed / 22));
    if (this._nearCamera({ position: v.position })) {
      g.effects?.burst?.(point, Math.min(24, Math.round(speed)), [0xffd060, 0xff8a2a], { speed: 6, size: 0.08, life: 0.5, gravity: 10 });
      g.audio?.play(speed > 16 ? 'explode' : 'land');
    }
    const hurt = Math.max(0, (speed - 9) * 1.2);
    if (hurt > 0) for (const a of v.riders) if (a) g.onBotHit(this.owner(a), hurt, 'body', { name: 'el choque' }, null, v.name);
    if (other?.vehicle && other.vehicle !== v) {
      this.deform(other.vehicle, point, Math.min(1, speed / 22) * Math.min(1.6, 0.5 + (v.def.ram ?? 1) * 0.5));
      this.damage(other.vehicle, dmg * 0.8 * (v.def.ram ?? 1), v.driver);
    }
    this.damage(v, dmg, null);
  }

  /** Atropellos: daño y empujón a quien esté delante (EGD: _runOver). */
  _runOver(v, dt) {
    const s = v.position;
    const spd = v.realSpeed;
    if (spd < 2.5) return;
    const g = this.game;
    const fwd = new V3(Math.sin(v.yaw), 0, Math.cos(v.yaw));
    const now = g.matchTime || 0;
    const ram = v.def.ram ?? 1;
    const driver = v.driver;
    const targets = [];
    if (g.player?.alive && !g.player.inBus) targets.push(g.player);
    for (const b of g.bots || []) if (b.alive && !b.inBus) targets.push(b);
    for (const t of targets) {
      const body = t.body || t;
      if (body.ride) continue;
      const p = t.position;
      const dx = p.x - s.x, dz = p.z - s.z;
      if (Math.hypot(dx, dz) > v.radius * 0.9 + 0.45 || p.y > s.y + 2.2 || p.y < s.y - 1.5) continue;
      if (body._ranT && now - body._ranT < 0.8) continue;
      body._ranT = now;
      const dir = new V3(dx, 0, dz);
      (dir.lengthSq() > 1e-4 ? dir.normalize() : dir.copy(fwd)).addScaledVector(fwd, 0.8).normalize();
      const k = Math.min(1.8, 0.4 + ram * 0.4);
      body.velocity.copy(dir.multiplyScalar(spd * 0.55 * k)).setY(Math.min(9, 2 + spd * 0.22 * k));
      body.grounded = false;
      body.fallPeakY = body.position.y;
      const dmg = Math.max(0, spd - 2) * 2.6 * ram;
      if (dmg > 0) g.onBotHit(t, dmg, 'body', driver ? this.owner(driver) : { name: v.name }, p.clone().add(new V3(0, 1, 0)), v.name);
      v.speed *= ram >= 2 ? 0.96 : 0.82;
    }
  }

  horn(v) {
    const g = this.game;
    const now = g.matchTime || 0;
    if (v.hornT && now - v.hornT < 0.45) return;
    v.hornT = now;
    if (this._nearCamera({ position: v.position })) g.audio?.play('horn', { big: v.kind === 'boat' });
    // Los bots cercanos lo oyen como un ruido.
    g.noiseEvents?.push({ x: v.position.x, y: v.position.y, z: v.position.z, time: g.matchTime, shooter: v.driver ? this.owner(v.driver) : null, radius: 60 });
  }

  // ---------------------------------------------------------------- física (EGD: update)
  update(dt) {
    dt = Math.min(dt, 0.05);
    for (const v of this.list) {
      // Ocupantes muertos: fuera del vehículo.
      for (const a of v.riders) if (a && !a.alive) this.exit(a, true);
      const driver = v.driver;
      const moving = Math.abs(v.speed) > 0.05 || Math.abs(v.vy) > 0.05 || v.spin > 0.02;
      if (!v.wrecked && (driver || moving || v.airborne)) this._drive(v, dt, driver);
      else if (v.wrecked && v.airborne) this._fall(v, dt);
      this._smoke(v, dt);
    }
    this._updateSmoke(dt);
    // Motor del vehículo del jugador.
    const pr = this.game.player?.ride;
    if (pr && pr.phase !== 'exit' && pr.vehicle.driver === this.game.player && !pr.vehicle.wrecked) {
      const v = pr.vehicle;
      this.game.audio?.engine?.(true, clamp(Math.abs(v.speed) / v.def.maxSpeed, 0, 1), v.def.mode);
    } else this.game.audio?.engine?.(false);
  }

  _input(driver) {
    const k = driver?.input;
    if (!k || !driver.alive || driver.ride?.phase === 'exit') return { fwd: 0, steer: 0, up: false, down: false, horn: false };
    let fwd = 0, steer = 0;
    if (k.isDown('KeyW') || k.isDown('ArrowUp')) fwd += 1;
    if (k.isDown('KeyS') || k.isDown('ArrowDown')) fwd -= 1;
    if (k.isDown('KeyA') || k.isDown('ArrowLeft')) steer += 1;
    if (k.isDown('KeyD') || k.isDown('ArrowRight')) steer -= 1;
    const up = k.isDown('Space');
    const down = k.isDown('ShiftLeft') || k.isDown('ShiftRight') || k.isDown('ControlLeft');
    return { fwd, steer, up, down, horn: k.isDown('KeyF') };
  }

  _drive(v, dt, driver) {
    const o = this._input(driver);
    if (o.horn) this.horn(v);
    const r = v.def;
    const l = v.position;
    const half = (this.world.half || 200) - v.radius;
    const R = v.radius;
    if (r.mode === 'ground' || r.mode === 'water') {
      const want = o.fwd > 0 ? r.maxSpeed * o.fwd : o.fwd < 0 ? (v.speed > 0.5 ? 0 : -r.maxSpeed * 0.4 * -o.fwd) : 0;
      const acc = o.fwd < 0 && v.speed > 0.5 ? r.accel * 2.2 : o.fwd !== 0 ? r.accel : r.accel * 0.45;
      v.speed = damp(v.speed, want, (acc / Math.max(4, r.maxSpeed)) * 2.2, dt);
      if (o.up && r.mode === 'ground') v.speed = damp(v.speed, 0, 4, dt);
      const turn = r.turn * clamp(Math.abs(v.speed) / 6, 0, 1) * Math.sign(v.speed || 1);
      v.yaw = wrap(v.yaw + o.steer * turn * dt * (o.up && r.mode === 'ground' ? 1.6 : 1));
      const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
      const sg = Math.sign(v.speed || 1);
      let nx = clamp(l.x + fx * v.speed * dt, -half, half);
      let nz = clamp(l.z + fz * v.speed * dt, -half, half);
      if (r.mode === 'water') {
        if (this.navigable(nx, nz) && this.navigable(nx + fx * R * sg, nz + fz * R * sg)) { l.x = nx; l.z = nz; }
        else v.speed *= -0.2;
        const wy = this.waterAt(l.x, l.z) ?? l.y + 0.25;
        l.y = damp(l.y, wy - 0.25 + Math.sin((this.game.matchTime || 0) * 2.4) * 0.06, 8, dt);
        v.pitch = damp(v.pitch, -clamp(v.speed / r.maxSpeed, -0.3, 1) * 0.12, 3, dt);
        v.roll = damp(v.roll, o.steer * clamp(v.speed / r.maxSpeed, 0, 1) * 0.18, 3, dt);
        v.airborne = false;
      } else {
        const gp = (x, z) => this.ground(x, z, l.y + r.climb, v);
        const gNew = gp(nx, nz);
        const gFront = gp(nx + fx * R * sg, nz + fz * R * sg);
        const hit = this.hits(nx, nz, l.y, R * 0.8, 1.4, v);
        const newHit = hit && !this.hits(l.x, l.z, l.y, R * 0.8, 1.4, v);
        if (gNew > l.y + r.climb || gFront > l.y + r.climb + 0.4 || newHit) {
          const p = newHit
            ? new V3(clamp(l.x, hit.minX, hit.maxX), clamp(l.y + 0.7, hit.minY, hit.maxY), clamp(l.z, hit.minZ, hit.maxZ))
            : new V3(l.x + fx * R * sg, l.y + 0.7, l.z + fz * R * sg);
          this.crash(v, p, Math.abs(v.speed), newHit ? hit : null);
          v.speed *= -0.25;
        } else { l.x = nx; l.z = nz; }
        const T = gp(l.x, l.z);
        if (l.y > T + 0.05) {
          v.vy -= 22 * dt;
          l.y = Math.max(T, l.y + v.vy * dt);
          if (l.y <= T) { if (v.vy < -9) this.crash(v, new V3(l.x, l.y, l.z), -v.vy * 0.8); v.vy = 0; }
          v.airborne = l.y > T + 0.05;
        } else { l.y = T; v.vy = 0; v.airborne = false; }
        const M = 1.4;
        const E = gp(l.x + fx * M, l.z + fz * M), Z = gp(l.x - fx * M, l.z - fz * M);
        const A = gp(l.x + fz * 0.9, l.z - fx * 0.9), I = gp(l.x - fz * 0.9, l.z + fx * 0.9);
        v.pitch = damp(v.pitch, -Math.atan2(E - Z, M * 2), 10, dt);
        v.roll = damp(v.roll, Math.atan2(A - I, 1.8) + o.steer * clamp(v.speed / r.maxSpeed, 0, 1) * 0.05, 10, dt);
        const wy = this.waterAt(l.x, l.z);
        if (wy !== null && l.y < wy - 0.4) v.speed = damp(v.speed, 0, 3, dt);
        // Hundido del todo: se ahoga el motor.
        if (wy !== null && l.y < wy - 1.6) { v.speed = 0; if (!v.drowned) { v.drowned = true; this.damage(v, v.health * 0.5); } }
      }
    } else if (r.mode === 'heli') {
      const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
      v.yaw = wrap(v.yaw + o.steer * r.turn * dt);
      const g0 = this.ground(l.x, l.z, l.y + 0.5, v);
      const flying = l.y > g0 + 0.3 || o.up;
      v.spin = damp(v.spin, driver && flying ? 1 : driver ? 0.15 : 0, 1.5, dt);
      v.speed = damp(v.speed, flying ? o.fwd * r.maxSpeed : 0, 1.6, dt);
      const lift = (o.up ? r.lift : 0) - (o.down ? r.lift * 0.8 : 0);
      v.vy = damp(v.vy, v.spin > 0.7 ? lift : -6, 2.5, dt);
      const nx = clamp(l.x + fx * v.speed * dt, -half, half), nz = clamp(l.z + fz * v.speed * dt, -half, half);
      const hit = this.hits(nx, nz, l.y, R * 0.6, 2.4, v);
      if (hit && !this.hits(l.x, l.z, l.y, R * 0.6, 2.4, v)) {
        this.crash(v, new V3(clamp(l.x, hit.minX, hit.maxX), clamp(l.y + 1.4, hit.minY, hit.maxY), clamp(l.z, hit.minZ, hit.maxZ)), Math.abs(v.speed), hit);
        v.speed *= -0.3;
      } else { l.x = nx; l.z = nz; }
      const b = this.ground(l.x, l.z, l.y + 0.5, v);
      if (l.y + v.vy * dt <= b && v.vy < -7) this.crash(v, new V3(l.x, b, l.z), -v.vy);
      l.y = clamp(l.y + v.vy * dt, b, 140);
      if (l.y <= b + 0.01) { v.vy = Math.max(0, v.vy); v.speed = damp(v.speed, 0, 4, dt); }
      v.airborne = l.y > b + 0.05;
      v.pitch = damp(v.pitch, (v.speed / r.maxSpeed) * 0.25, 4, dt);
      v.roll = damp(v.roll, -o.steer * 0.15 * v.spin, 4, dt);
    } else if (r.mode === 'plane') {
      v.throttle = clamp(v.throttle + o.fwd * 0.5 * dt, 0, 1);
      if (!driver) v.throttle = Math.max(0, v.throttle - dt * 0.3);
      const d0 = this.ground(l.x, l.z, l.y + 0.5, v);
      const onGround = l.y <= d0 + 0.05;
      v.speed = damp(v.speed, v.throttle * r.maxSpeed, onGround ? 0.45 : 0.3, dt);
      const p = clamp((v.speed - r.takeoff * 0.75) / (r.takeoff * 0.5), 0, 1);
      v.yaw = wrap(v.yaw + o.steer * r.turn * dt * (onGround ? clamp(v.speed / 6, 0, 1) * 0.9 : 1));
      if (!onGround && (Math.abs(l.x) > half - 12 || Math.abs(l.z) > half - 12)) {
        v.yaw = lerpAngle(v.yaw, Math.atan2(-l.x, -l.z), 1 - Math.exp(-1.6 * dt));
        if (!v.edgeWarn && driver === this.game.player) { this.game.hud?.toast('Límite del mapa', 'warn'); v.edgeWarn = true; }
      } else v.edgeWarn = false;
      const want = onGround ? (o.up && v.speed > r.takeoff ? 0.25 : 0) : (o.up ? 0.45 : o.down ? -0.45 : 0) * p;
      v.pitch = damp(v.pitch, want, 2, dt);
      v.roll = damp(v.roll, onGround ? 0 : -o.steer * 0.55, 3, dt);
      v.spin = v.throttle;
      const m = new V3(Math.sin(v.yaw) * Math.cos(v.pitch), Math.sin(v.pitch), Math.cos(v.yaw) * Math.cos(v.pitch));
      const sink = (1 - p) * (onGround ? 0 : 7);
      const nx = clamp(l.x + m.x * v.speed * dt, -half, half), nz = clamp(l.z + m.z * v.speed * dt, -half, half);
      let ny = l.y + (m.y * v.speed - sink) * dt;
      const hit = this.hits(nx, nz, ny, R * 0.5, 2, v);
      if (hit && !this.hits(l.x, l.z, l.y, R * 0.5, 2, v)) {
        this.crash(v, new V3(clamp(l.x, hit.minX, hit.maxX), clamp(l.y + 1.3, hit.minY, hit.maxY), clamp(l.z, hit.minZ, hit.maxZ)), v.speed, hit);
        if (v.speed > 12) v.throttle *= 0.3;
        v.speed = 0;
      } else { l.x = nx; l.z = nz; }
      const gy = this.ground(l.x, l.z, ny + 0.5, v);
      if (ny <= gy) {
        if (!onGround && v.pitch < -0.12 && v.speed > 8) { this.crash(v, new V3(l.x + m.x * 2, gy, l.z + m.z * 2), v.speed * (0.4 - v.pitch)); v.speed *= 0.3; }
        ny = gy;
        if (v.pitch < 0) v.pitch = 0;
      }
      l.y = Math.min(ny, 220);
      v.airborne = l.y > gy + 0.05;
    }
    const s = v.object;
    s.rotation.set(v.pitch, v.yaw, v.roll, 'YXZ');
    const parts = v.parts;
    for (const w of parts.wheels || []) for (const c of w.children) c.rotation.x += (v.speed * dt) / 0.4;
    if (r.mode === 'ground') for (const w of parts.frontWheels || []) w.rotation.y = o.steer * 0.45;
    if (parts.rotor) parts.rotor.rotation.y += dt * 30 * (v.spin || 0);
    if (parts.tailRotor) parts.tailRotor.rotation.x += dt * 40 * (v.spin || 0);
    if (parts.prop) parts.prop.rotation.z += dt * (8 + 50 * (v.spin || 0));
    v.realSpeed = Math.hypot(l.x - v.lastPos.x, l.y - v.lastPos.y, l.z - v.lastPos.z) / Math.max(dt, 1e-4);
    v.lastPos.copy(l);
    this._runOver(v, dt);
    this._syncCollider(v);
    // Cámara que se pone detrás del vehículo cuando el jugador no mueve el ratón.
    const pl = this.game.player;
    if (driver === pl && Math.abs(v.speed) > 2 && pl.time - (pl._camInputAt ?? -9) > 1.2) {
      pl.yaw = lerpAngle(pl.yaw, v.yaw + Math.PI + (v.speed < 0 ? Math.PI : 0), 1 - Math.exp(-2.2 * dt));
    }
  }

  /** Restos de un vehículo destrozado cayendo. */
  _fall(v, dt) {
    const l = v.position;
    v.vy -= 22 * dt;
    const g = this.ground(l.x, l.z, l.y + 0.5, v);
    l.y = Math.max(g, l.y + v.vy * dt);
    if (l.y <= g) { v.vy = 0; v.airborne = false; }
    this._syncCollider(v);
  }

  /** Caja de colisión del vehículo (para jugadores, balas y otros vehículos). */
  _syncCollider(v) {
    const o = v.object;
    o.updateMatrixWorld(true);
    const b = v.localBox.clone().applyMatrix4(o.matrixWorld);
    const sh = 0.1;
    const box = [b.min.x + sh, b.max.x - sh, b.min.y + 0.15, b.max.y, b.min.z + sh, b.max.z - sh];
    if (!v.collider) {
      this.world.addCollider(...box, { role: 'vehicle', vehicle: v });
      v.collider = this.world.colliders[this.world.colliders.length - 1];
    } else if (this.world.moveCollider) {
      this.world.moveCollider(v.collider, ...box);
    }
  }

  _smoke(v, dt) {
    const k = v.maxHealth > 0 ? v.health / v.maxHealth : 1;
    if (k > 0.4 && !v.wrecked) return;
    v.smokeT -= dt;
    if (v.smokeT > 0) return;
    if (!this._nearCamera({ position: v.position })) { v.smokeT = 0.5; return; }
    v.smokeT = v.wrecked ? 0.12 : 0.25 + k * 0.4;
    const r = v.position;
    const off = new V3(Math.sin(v.yaw), 0, Math.cos(v.yaw)).multiplyScalar(v.wrecked ? 0 : 1.2 * v.scale);
    const fire = v.wrecked || k < 0.15;
    const mat = new THREE.MeshBasicMaterial({
      color: fire && Math.random() < 0.4 ? '#ff7a20' : (k < 0.2 || v.wrecked ? '#2a2a2a' : '#8c8c8c'),
      transparent: true, opacity: 0.6, depthWrite: false,
    });
    this._smokeGeo ??= new THREE.SphereGeometry(0.3, 7, 5);
    const m = new THREE.Mesh(this._smokeGeo, mat);
    m.position.set(r.x + off.x + (Math.random() - 0.5) * 0.4, r.y + 1.1, r.z + off.z + (Math.random() - 0.5) * 0.4);
    this.scene.add(m);
    this.smoke.push({ m, life: 1.6 + Math.random(), v: 0.9 + Math.random() * 0.8 });
    if (this.smoke.length > 80) { const s = this.smoke.shift(); s.m.removeFromParent(); s.m.material.dispose(); }
  }

  _updateSmoke(dt) {
    for (const s of this.smoke) {
      s.life -= dt;
      s.m.position.y += s.v * dt;
      s.m.scale.multiplyScalar(1 + dt * 0.9);
      s.m.material.opacity = Math.max(0, Math.min(0.6, s.life * 0.4));
      if (s.life <= 0) { s.m.removeFromParent(); s.m.material.dispose(); }
    }
    this.smoke = this.smoke.filter((s) => s.life > 0);
  }

  dispose() {
    for (const s of this.smoke) { s.m.removeFromParent(); s.m.material.dispose(); }
    this.smoke = [];
    this.group.removeFromParent();
    this.group.traverse((o) => { if (o.isMesh) { o.geometry?.dispose?.(); } });
    this.list = [];
    if (this.world?.vehicles === this) this.world.vehicles = null;
    this.game.audio?.engine?.(false);
  }

  /** Texto del HUD para el jugador (cerca de un vehículo o conduciendo). */
  hudText(player) {
    const r = player.ride;
    if (r) {
      const v = r.vehicle;
      const kmh = Math.round(Math.abs(v.realSpeed || 0) * 3.6);
      const hp = Math.round((v.health / v.maxHealth) * 100);
      const alt = v.def.mode === 'heli' || v.def.mode === 'plane'
        ? ` · ${Math.max(0, Math.round(v.position.y - this.ground(v.position.x, v.position.z, v.position.y + 0.5, v)))} m` : '';
      return r.seat.driver ? `${v.name} · ${kmh} km/h${alt} · ${hp}% · E bajar` : `Pasajero en ${v.name} · E bajar`;
    }
    const v = this.nearest(player.position, 3.2);
    if (!v) return null;
    return v.riders[v.driverSeat] ? `E: subir de pasajero (${v.name})` : `E: conducir ${v.name}`;
  }
}

export { HELP as VEHICLE_HELP };
