import * as THREE from 'three';
import { makeRandom } from '../core/utils.js';

/**
 * Lugares interesantes del mapa para los bots (y botín de partida):
 *  - casas y construcciones (piezas "build" de EGD agrupadas por nombre/cercanía),
 *  - cofres y puntos de arma colocados en el editor.
 * Si el mapa apenas trae botín, se reparte dentro de las casas y por tierra
 * firme, para que haya algo que buscar en cualquier mapa.
 */

/** ¿Se puede pisar este punto? (dentro del mapa, no vacío y sin agua profunda) */
export function isLand(world, x, z) {
  const half = world.egdWorld ? world.egdWorld.size * world.egdWorld.tileSize / 2 - 1 : world.half - 2;
  if (Math.abs(x) > half || Math.abs(z) > half) return false;
  const g = world.surfaceHeightAt?.(x, z) ?? world.heightAt(x, z);
  if (!Number.isFinite(g) || g < -25) return false;
  const w = world.waterYAt?.(x, z) ?? world.waterLevel ?? -100;
  return !(Number.isFinite(w) && w > -50 && g < w - 0.35);
}

/**
 * Tierra firme de verdad: el punto y un anillo a su alrededor son tierra, y bien
 * por encima del agua (sin orillas, bordes de acantilado ni arena que moja).
 */
export function isSafeLand(world, x, z, ring = 3.5, margin = 0.6) {
  const ok = (px, pz) => {
    if (!isLand(world, px, pz)) return false;
    const g = world.surfaceHeightAt?.(px, pz) ?? world.heightAt(px, pz);
    const w = world.waterYAt?.(px, pz);
    if (world.lavaDamageAt?.({ x: px, y: g, z: pz }) > 0) return false;
    const sea = Number.isFinite(world.waterLevel) && world.waterLevel > -50 ? world.waterLevel : -Infinity;
    const top = Math.max(Number.isFinite(w) ? w : -Infinity, sea);
    return !(top > -50 && g < top + margin);
  };
  if (!ok(x, z)) return false;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    if (!ok(x + Math.cos(a) * ring, z + Math.sin(a) * ring)) return false;
  }
  return true;
}

/** Altura del suelo pisable en (x, z) cerca de la altura `y` (suelos de casas incluidos). */
function floorY(world, x, z, y) {
  return world.groundAt ? world.groundAt(x, z, y + 2.2, y - 2.5) : (world.surfaceHeightAt?.(x, z) ?? world.heightAt(x, z));
}

/** Agrupa las piezas de construcción en edificios. */
export function findBuildings(world) {
  const groups = new Map();
  for (const p of world.customPieces || []) {
    const e = p?.egd;
    const isBuild = e ? e.type === 'build' : ['house', 'wall', 'floor', 'roof', 'stairs', 'column'].includes(p?.type);
    if (!isBuild || !Number.isFinite(+p.x) || !Number.isFinite(+p.z)) continue;
    const name = String(e?.name || p.type || '').split(' · ')[0];
    // Mismo nombre y cerca: mismo edificio. Sin nombre: por cercanía.
    let g = null;
    for (const cand of groups.values()) {
      if (cand.name === name && Math.hypot(cand.cx - p.x, cand.cz - p.z) < 16) { g = cand; break; }
    }
    if (!g) {
      g = { name, pieces: [], cx: +p.x, cz: +p.z };
      groups.set(`${name}#${groups.size}`, g);
    }
    g.pieces.push(p);
    g.cx = g.pieces.reduce((s, q) => s + +q.x, 0) / g.pieces.length;
    g.cz = g.pieces.reduce((s, q) => s + +q.z, 0) / g.pieces.length;
  }
  const out = [];
  for (const g of groups.values()) {
    if (g.pieces.length < 3) continue;
    const floors = g.pieces.filter((p) => (p.egd?.piece || p.type) === 'floor');
    let radius = 3;
    for (const p of g.pieces) radius = Math.max(radius, Math.hypot(p.x - g.cx, p.z - g.cz) + 1.5);
    const baseY = Math.min(...g.pieces.map((p) => (Number.isFinite(+p.y) ? +p.y : 0)));
    out.push({
      name: g.name,
      center: new THREE.Vector3(g.cx, baseY, g.cz),
      radius,
      floors: floors.map((p) => new THREE.Vector3(+p.x, Number.isFinite(+p.y) ? +p.y : baseY, +p.z)),
    });
  }
  return out;
}

/**
 * Asegura botín suficiente: cofres dentro de las casas y armas/objetos por tierra.
 * Solo añade lo que falta; lo puesto en el editor se respeta.
 */
export function ensureMatchLoot(world, buildings, players = 20) {
  const rnd = makeRandom(((world.seed || 1234) * 7 + 99) >>> 0);
  const chests = world.chestSpots || (world.chestSpots = []);
  const loot = world.lootSpots || (world.lootSpots = []);
  const weapons = world.weaponSpawnSpots || (world.weaponSpawnSpots = []);
  const near = (list, x, z, r) => list.some((p) => Math.hypot(p.x - x, p.z - z) < r);
  const all = () => [...chests, ...loot, ...weapons];

  // 1) Cada casa con al menos un cofre y algo de botín en sus suelos.
  for (const b of buildings) {
    // Solo suelos de planta baja: nada de cofres en lo alto de torres.
    const ground = b.floors.filter((f) => f.y <= b.center.y + 0.8);
    const spots = ground.length ? ground : [b.center];
    const insideChest = chests.some((c) => Math.hypot(c.x - b.center.x, c.z - b.center.z) < b.radius);
    if (!insideChest) {
      const f = spots[Math.floor(rnd() * spots.length)];
      const y = floorY(world, f.x, f.z, f.y);
      if (Number.isFinite(y)) chests.push(new THREE.Vector3(f.x, y, f.z));
    }
    const extra = Math.min(3, Math.max(1, Math.round(spots.length / 2)));
    for (let i = 0; i < extra; i++) {
      const f = spots[Math.floor(rnd() * spots.length)];
      const x = f.x + (rnd() - 0.5) * 1.6;
      const z = f.z + (rnd() - 0.5) * 1.6;
      if (near(all(), x, z, 1.4)) continue;
      const y = floorY(world, x, z, f.y);
      if (!Number.isFinite(y)) continue;
      (rnd() < 0.5 ? weapons : loot).push(new THREE.Vector3(x, y + 0.9, z));
    }
  }

  // 2) Por tierra firme, hasta tener botín para todos los jugadores.
  const want = Math.max(players * 2, 14);
  const half = world.egdWorld ? world.egdWorld.size * world.egdWorld.tileSize / 2 : world.half;
  let tries = 0;
  while (all().length < want && tries++ < 4000) {
    const x = (rnd() * 2 - 1) * half * 0.95;
    const z = (rnd() * 2 - 1) * half * 0.95;
    if (!isSafeLand(world, x, z, 2.5) || near(all(), x, z, 7)) continue;
    const y = world.surfaceHeightAt?.(x, z) ?? world.heightAt(x, z);
    const roll = rnd();
    if (roll < 0.2) chests.push(new THREE.Vector3(x, y, z));
    else if (roll < 0.6) weapons.push(new THREE.Vector3(x, y + 0.9, z));
    else loot.push(new THREE.Vector3(x, y + 0.9, z));
  }
}
