import * as THREE from 'three';
import { distance2D, makeRandom, shuffle } from '../core/utils.js';
import { randomLoot } from './weapons.js';

function iconSprite(text, color = '#ffffff') {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 128, 128);
  ctx.font = 'bold 76px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = color;
  ctx.shadowBlur = 20;
  ctx.fillStyle = color;
  ctx.fillText(text, 64, 68);
  const tex = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sprite.scale.set(0.9, 0.9, 1);
  return sprite;
}

export class LootManager {
  constructor(scene, world, game) {
    this.scene = scene;
    this.world = world;
    this.game = game;
    this.root = new THREE.Group();
    scene.add(this.root);
    this.items = [];
    this.rnd = makeRandom(world.seed + 555);
    this.disposables = [];
    this.beamGeo = new THREE.CylinderGeometry(0.32, 0.5, 3.2, 8, 1, true);
    this.boxGeo = new THREE.BoxGeometry(0.62, 0.42, 0.38);
    this.chestGeo = new THREE.BoxGeometry(1.25, 0.75, 0.85);
    this.disposables.push(this.beamGeo, this.boxGeo, this.chestGeo);
  }

  createEntity(pos, item, isChest = false) {
    const group = new THREE.Group();
    const color = new THREE.Color(isChest ? 0xffc14d : item.color || 0xffffff);
    const bodyMat = new THREE.MeshStandardMaterial({
      color, emissive: color, emissiveIntensity: isChest ? 0.35 : 0.55,
      metalness: 0.45, roughness: 0.35,
    });
    const body = new THREE.Mesh(isChest ? this.chestGeo : this.boxGeo, bodyMat);
    body.position.y = isChest ? 0.42 : 0.45;
    body.castShadow = true;
    group.add(body);

    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(isChest ? this.chestGeo : this.boxGeo),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 }),
    );
    edges.position.copy(body.position);
    group.add(edges);

    const beamMat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.14, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const beam = new THREE.Mesh(this.beamGeo, beamMat);
    beam.position.y = 1.7;
    group.add(beam);

    const sprite = iconSprite(isChest ? '▣' : item.icon || '◆', `#${color.getHexString()}`);
    sprite.position.y = 1.75;
    group.add(sprite);

    group.position.copy(pos);
    group.position.y = this.world.heightAt(pos.x, pos.z);
    this.root.add(group);
    const entity = { group, body, edges, beam, sprite, item, isChest, pos: group.position, phase: this.rnd() * 6.28, life: isChest ? Infinity : 150 };
    this.items.push(entity);
    return entity;
  }

  spawn(count = 95) {
    const spots = shuffle(this.rnd, this.world.lootSpots || []);
    const n = Math.min(count, spots.length);
    for (let i = 0; i < n; i++) {
      const spot = spots[i];
      const isChest = this.rnd() < 0.22;
      const item = isChest ? null : randomLoot(this.rnd);
      this.createEntity(spot, item, isChest);
    }
  }

  findNear(position, radius = 3.2) {
    let best = null;
    let bestD = radius;
    for (const e of this.items) {
      const d = distance2D(e.pos, position);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  remove(entity) {
    const idx = this.items.indexOf(entity);
    if (idx >= 0) this.items.splice(idx, 1);
    entity.group.traverse((obj) => {
      if (obj.material && obj.material !== this.beamMat) {
        obj.material.dispose?.();
        if (obj.material.map) obj.material.map.dispose?.();
      }
      if (obj.geometry && obj.geometry !== this.beamGeo && obj.geometry !== this.boxGeo && obj.geometry !== this.chestGeo) obj.geometry.dispose?.();
    });
    entity.group.removeFromParent();
  }

  interact(entity, player) {
    if (!entity || !entity.group.parent) return null;
    if (entity.isChest) {
      this.game.audio.play('chest');
      this.game.effects.burst(entity.pos.clone().add(new THREE.Vector3(0, 1, 0)), 22, [0xffd166, 0xffa23a], { speed: 4, life: 0.7 });
      this.remove(entity);
      const lootCount = 2 + Math.floor(this.rnd() * 2);
      for (let i = 0; i < lootCount; i++) {
        const a = (i / lootCount) * Math.PI * 2;
        const p = entity.pos.clone().add(new THREE.Vector3(Math.cos(a) * 2, 0.2, Math.sin(a) * 2));
        this.createEntity(p, randomLoot(this.rnd), false);
      }
      return { text: 'Cofre abierto', color: '#ffd166' };
    }

    const item = entity.item;
    const inv = player.inventory;
    let text = '';
    let color = '#ffffff';
    if (item.kind === 'weapon') {
      const slot = inv.addWeapon(item.type, item.rarity);
      inv.addAmmo(item.ammoType, item.ammo);
      inv.switchTo(slot);
      text = `+ ${item.name}`;
      color = item.color;
    } else if (item.kind === 'shield') {
      const got = player.addShield(item.amount);
      text = `+${Math.round(got)} escudo`;
      color = '#41b7ff';
    } else if (item.kind === 'health') {
      const got = player.heal(item.amount);
      text = `+${Math.round(got)} vida`;
      color = '#5bd88a';
    } else if (item.kind === 'ammo') {
      inv.addAmmo(item.ammoType, item.amount);
      text = `+${item.amount} munición`;
      color = '#e6c05c';
    }
    this.game.audio.play('pickup');
    this.game.effects.burst(entity.pos.clone().add(new THREE.Vector3(0, 0.8, 0)), 14, [color, 0xffffff], { speed: 3, life: 0.5, gravity: 4 });
    this.remove(entity);
    return { text, color };
  }

  update(dt, time) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const e = this.items[i];
      e.phase += dt;
      e.body.rotation.y += dt * 0.9;
      e.edges.rotation.y = e.body.rotation.y;
      e.body.position.y = (e.isChest ? 0.42 : 0.45) + Math.sin(e.phase * 2) * 0.07;
      e.edges.position.y = e.body.position.y;
      e.beam.material.opacity = 0.1 + Math.sin(e.phase * 2.5) * 0.04;
      e.sprite.position.y = (e.isChest ? 1.9 : 1.75) + Math.sin(e.phase * 2) * 0.1;
      if (e.life !== Infinity) {
        e.life -= dt;
        if (e.life <= 0) this.remove(e);
      }
    }
  }

  dispose() {
    this.root.removeFromParent();
    for (const e of [...this.items]) this.remove(e);
    for (const d of this.disposables) d.dispose?.();
  }
}
