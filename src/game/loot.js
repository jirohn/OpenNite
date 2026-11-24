import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { distance2D, makeRandom } from '../core/utils.js';
import { randomLoot, randomWeaponLoot } from './weapons.js';

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
    this.chestParts = null;
    this.weaponTemplates = new Map();
    this.supplyGeos = {};
    this.shared = new Set([this.beamGeo, this.boxGeo, this.chestGeo]);
    this.disposables.push(this.beamGeo, this.boxGeo, this.chestGeo);
    this._initLootVisuals();
  }

  _registerShared(obj) {
    if (!obj) return;
    this.shared.add(obj);
    this.disposables.push(obj);
  }

  _initLootVisuals() {
    // Geometrías compartidas para ítems no arma
    this.supplyGeos.shield = new THREE.TorusGeometry(0.28, 0.07, 10, 24);
    this.supplyGeos.shieldCore = new THREE.CylinderGeometry(0.18, 0.18, 0.08, 16);
    this.supplyGeos.health = new THREE.BoxGeometry(0.5, 0.28, 0.36);
    this.supplyGeos.crossV = new THREE.BoxGeometry(0.08, 0.02, 0.2);
    this.supplyGeos.crossH = new THREE.BoxGeometry(0.2, 0.02, 0.08);
    this.supplyGeos.slurp = new THREE.CylinderGeometry(0.16, 0.18, 0.55, 12);
    this.supplyGeos.slurpCap = new THREE.CylinderGeometry(0.09, 0.09, 0.08, 10);
    this.supplyGeos.ammo = new THREE.BoxGeometry(0.46, 0.26, 0.3);
    this.supplyGeos.ammoLid = new THREE.BoxGeometry(0.48, 0.05, 0.32);
    Object.values(this.supplyGeos).forEach((g) => this._registerShared(g));

    // Plantillas procedurales de armas (modelos 3D de loot)
    const mk = (geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.rotation.set(rx, ry, rz);
      m.castShadow = true;
      return m;
    };
    const g = {
      boxS: new THREE.BoxGeometry(0.18, 0.1, 0.5),
      boxM: new THREE.BoxGeometry(0.16, 0.12, 0.72),
      boxL: new THREE.BoxGeometry(0.14, 0.12, 0.95),
      grip: new THREE.BoxGeometry(0.09, 0.22, 0.1),
      stock: new THREE.BoxGeometry(0.12, 0.14, 0.28),
      mag: new THREE.BoxGeometry(0.08, 0.22, 0.12),
      barrelT: new THREE.CylinderGeometry(0.03, 0.03, 0.45, 8),
      barrelM: new THREE.CylinderGeometry(0.035, 0.035, 0.55, 8),
      barrelL: new THREE.CylinderGeometry(0.03, 0.03, 0.85, 8),
      barrelSg: new THREE.CylinderGeometry(0.045, 0.045, 0.7, 8),
      scope: new THREE.CylinderGeometry(0.045, 0.045, 0.22, 10),
      pump: new THREE.BoxGeometry(0.12, 0.1, 0.22),
      tag: new THREE.BoxGeometry(0.08, 0.03, 0.18),
    };
    Object.values(g).forEach((geo) => this._registerShared(geo));
    this.tagGeo = g.tag;
    const dark = new THREE.MeshStandardMaterial({ color: 0x2f3540, metalness: 0.55, roughness: 0.45 });
    const metal = new THREE.MeshStandardMaterial({ color: 0x6b7482, metalness: 0.75, roughness: 0.3 });
    const wood = new THREE.MeshStandardMaterial({ color: 0x7a5533, metalness: 0.05, roughness: 0.8 });
    [dark, metal, wood].forEach((m) => this._registerShared(m));

    const build = (parts) => {
      const root = new THREE.Group();
      for (const p of parts) root.add(p);
      root.rotation.y = Math.PI / 2;
      root.position.y = 0.22;
      return root;
    };
    this.weaponTemplates.set('pistol', build([
      mk(g.boxS, dark, 0, 0.06, 0), mk(g.grip, dark, 0, -0.05, 0.12, -0.25), mk(g.barrelT, metal, 0, 0.07, -0.38, Math.PI / 2),
    ]));
    this.weaponTemplates.set('smg', build([
      mk(g.boxM, dark, 0, 0.06, 0), mk(g.grip, dark, 0, -0.06, 0.14, -0.2), mk(g.mag, dark, 0, -0.08, -0.05, 0.15),
      mk(g.barrelM, metal, 0, 0.07, -0.5, Math.PI / 2), mk(g.stock, dark, 0, 0.04, 0.42),
    ]));
    this.weaponTemplates.set('ar', build([
      mk(g.boxL, dark, 0, 0.06, 0), mk(g.grip, dark, 0, -0.07, 0.18, -0.25), mk(g.mag, dark, 0, -0.1, -0.02, 0.2),
      mk(g.barrelL, metal, 0, 0.08, -0.72, Math.PI / 2), mk(g.stock, dark, 0, 0.05, 0.55),
    ]));
    this.weaponTemplates.set('shotgun', build([
      mk(g.boxM, dark, 0, 0.05, 0.05), mk(g.barrelSg, metal, 0, 0.07, -0.5, Math.PI / 2), mk(g.pump, wood, 0, 0.02, -0.22),
      mk(g.stock, wood, 0, 0.03, 0.48), mk(g.grip, dark, 0, -0.06, 0.22, -0.2),
    ]));
    this.weaponTemplates.set('sniper', build([
      mk(g.boxL, dark, 0, 0.05, 0.05), mk(g.barrelL, metal, 0, 0.07, -0.82, Math.PI / 2), mk(g.scope, metal, 0, 0.16, -0.05, Math.PI / 2),
      mk(g.stock, wood, 0, 0.03, 0.58), mk(g.grip, dark, 0, -0.06, 0.22, -0.2), mk(g.mag, dark, 0, -0.08, 0.02, 0.12),
    ]));
  }

  /** Carga el cofre de madera CC0 del Fantasy Props MegaKit de Quaternius. */
  async load(modelBase = './models/quaternius/props/glTF/') {
    try {
      const gltf = await new GLTFLoader().loadAsync(`${modelBase}Chest_Wood.gltf`);
      gltf.scene.updateMatrixWorld(true);
      this.chestParts = [];
      gltf.scene.traverse((o) => {
        if (!o.isMesh) return;
        const geometry = o.geometry.clone();
        geometry.applyMatrix4(o.matrixWorld);
        this.chestParts.push({ geometry, material: o.material });
        this.shared.add(geometry);
        this.disposables.push(geometry);
      });
      for (const mat of new Set(this.chestParts.map((p) => p.material))) {
        this.shared.add(mat);
        this.disposables.push(mat);
        if (mat.map) { this.shared.add(mat.map); this.disposables.push(mat.map); }
        if (mat.normalMap) { this.shared.add(mat.normalMap); this.disposables.push(mat.normalMap); }
      }
    } catch (error) {
      console.warn('No se pudo cargar el modelo del cofre CC0:', error);
      this.chestParts = null;
    }
  }

  _createItemVisual(item) {
    const colorHex = item?.color || '#ffffff';
    const color = new THREE.Color(colorHex);
    if (item?.kind === 'weapon') {
      const tpl = this.weaponTemplates.get(item.type);
      if (tpl) {
        const g = tpl.clone(true);
        const accent = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.25, metalness: 0.5, roughness: 0.35 });
        const tag = new THREE.Mesh(this.tagGeo || new THREE.BoxGeometry(0.08, 0.03, 0.18), accent);
        tag.position.set(0, 0.14, 0.05);
        tag.castShadow = true;
        g.add(tag);
        return { body: g, baseY: 0.18, visual: 'model' };
      }
    }
    if (item?.kind === 'shield') {
      const g = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: 0x41b7ff, emissive: 0x1b6fa8, emissiveIntensity: 0.45, metalness: 0.55, roughness: 0.25, transparent: true, opacity: 0.95 });
      const coreMat = new THREE.MeshStandardMaterial({ color: 0xbfeaff, emissive: 0x4fc3ff, emissiveIntensity: 0.35, metalness: 0.4, roughness: 0.3 });
      const ring = new THREE.Mesh(this.supplyGeos.shield, mat); ring.rotation.x = Math.PI / 2; ring.position.y = 0.35; ring.castShadow = true;
      const core = new THREE.Mesh(this.supplyGeos.shieldCore, coreMat); core.position.y = 0.35; core.castShadow = true;
      g.add(ring, core);
      return { body: g, baseY: 0.35, visual: 'model' };
    }
    if (item?.kind === 'health') {
      const g = new THREE.Group();
      const boxMat = new THREE.MeshStandardMaterial({ color: 0xf3f6f8, emissive: 0x9ecfb2, emissiveIntensity: 0.12, metalness: 0.1, roughness: 0.7 });
      const crossMat = new THREE.MeshStandardMaterial({ color: 0x39b868, emissive: 0x39b868, emissiveIntensity: 0.35, metalness: 0.05, roughness: 0.5 });
      const box = new THREE.Mesh(this.supplyGeos.health, boxMat); box.position.y = 0.2; box.castShadow = true;
      const cv = new THREE.Mesh(this.supplyGeos.crossV, crossMat); cv.position.set(0, 0.351, 0);
      const ch = new THREE.Mesh(this.supplyGeos.crossH, crossMat); ch.position.set(0, 0.351, 0);
      g.add(box, cv, ch);
      return { body: g, baseY: 0.2, visual: 'model' };
    }
    if (item?.kind === 'slurp') {
      const g = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: 0xb06cff, emissive: 0x6d2fd6, emissiveIntensity: 0.45, metalness: 0.2, roughness: 0.25, transparent: true, opacity: 0.9 });
      const capMat = new THREE.MeshStandardMaterial({ color: 0xe8e8f0, metalness: 0.4, roughness: 0.35 });
      const body = new THREE.Mesh(this.supplyGeos.slurp, mat); body.position.y = 0.32; body.castShadow = true;
      const cap = new THREE.Mesh(this.supplyGeos.slurpCap, capMat); cap.position.y = 0.63;
      g.add(body, cap);
      return { body: g, baseY: 0.32, visual: 'model' };
    }
    if (item?.kind === 'ammo') {
      const g = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: 0x556b2f, emissive: 0x334016, emissiveIntensity: 0.2, metalness: 0.25, roughness: 0.7 });
      const lidMat = new THREE.MeshStandardMaterial({ color: 0xc9b458, emissive: 0x6f5a16, emissiveIntensity: 0.2, metalness: 0.35, roughness: 0.5 });
      const box = new THREE.Mesh(this.supplyGeos.ammo, mat); box.position.y = 0.18; box.castShadow = true;
      const lid = new THREE.Mesh(this.supplyGeos.ammoLid, lidMat); lid.position.y = 0.335;
      g.add(box, lid);
      return { body: g, baseY: 0.18, visual: 'model' };
    }
    const bodyMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.55, metalness: 0.45, roughness: 0.35 });
    const body = new THREE.Mesh(this.boxGeo, bodyMat);
    body.position.y = 0.45;
    body.castShadow = true;
    return { body, baseY: 0.45, visual: 'box' };
  }

  createEntity(pos, item, isChest = false) {
    const group = new THREE.Group();
    const color = new THREE.Color(isChest ? 0xffc14d : item?.color || 0xffffff);
    const realChest = isChest && this.chestParts?.length > 0;
    let body;
    let baseY = isChest ? 0.42 : 0.45;
    let edges = new THREE.Object3D();
    let visual = 'box';

    if (realChest) {
      body = new THREE.Group();
      for (const part of this.chestParts) {
        const mesh = new THREE.Mesh(part.geometry, part.material);
        mesh.castShadow = true;
        body.add(mesh);
      }
      body.scale.setScalar(1.65);
      baseY = 0;
      visual = 'chest';
    } else if (isChest) {
      const bodyMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35, metalness: 0.45, roughness: 0.35 });
      body = new THREE.Mesh(this.chestGeo, bodyMat);
      body.position.y = baseY;
      body.castShadow = true;
      visual = 'chest-fallback';
    } else {
      const made = this._createItemVisual(item || {});
      body = made.body;
      baseY = made.baseY;
      visual = made.visual;
      // Sin outlines: el estilo cartoon usa solo color y sombras de 2 tonos.
    }
    group.add(body);

    const beamMat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.14, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const beam = new THREE.Mesh(this.beamGeo, beamMat);
    beam.position.y = 1.7;
    group.add(beam);

    const label = isChest ? '▣' : (item?.icon || '•');
    const sprite = iconSprite(label, `#${color.getHexString()}`);
    sprite.position.y = 1.85;
    group.add(sprite);

    const p = pos?.isVector3 ? pos.clone() : new THREE.Vector3(pos?.x || 0, pos?.y || 0, pos?.z || 0);
    group.position.copy(p);
    group.position.y = this.world.heightAt(group.position.x, group.position.z);
    this.root.add(group);
    const entity = { group, body, edges, beam, sprite, item, isChest, baseY, pos: group.position, phase: this.rnd() * 6.28, life: isChest ? Infinity : 150, visual };
    this.items.push(entity);
    return entity;
  }

  /** Elimina todo el loot visible (lo usa el editor al refrescar el mapa). */
  clear() {
    for (const entity of [...this.items]) this.remove(entity);
    this.items.length = 0;
  }

  /**
   * Solo se coloca lo que hay en el mapa del editor: cofres, loot suelto y
   * cada arma con su munición. No hay relleno aleatorio ni probabilidades.
   */
  spawn() {
    this.clear();
    for (const spot of (this.world.chestSpots || [])) {
      this.createEntity(spot, null, true);
    }
    for (const spot of (this.world.lootSpots || [])) {
      this.createEntity(spot, randomLoot(this.rnd), false);
    }
    for (const spot of (this.world.weaponSpawnSpots || [])) {
      const item = randomWeaponLoot(this.rnd);
      this.createEntity(spot, item, false);
      const ammoType = item.ammoType;
      const ammoAmount = { light: 60, medium: 60, shells: 12, heavy: 10 }[ammoType] || 30;
      const ammoPos = spot.clone();
      ammoPos.x += 0.9;
      ammoPos.z += 0.45;
      ammoPos.y = this.world.heightAt(ammoPos.x, ammoPos.z) + 0.45;
      this.createEntity(ammoPos, { kind: 'ammo', ammoType, amount: ammoAmount, name: `Munición ${ammoType}`, icon: '▣', color: '#d4b04a' }, false);
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
      if (obj.material && !this.shared.has(obj.material)) {
        obj.material.dispose?.();
        if (obj.material.map) obj.material.map.dispose?.();
      }
      if (obj.geometry && !this.shared.has(obj.geometry)) obj.geometry.dispose?.();
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
    } else if (item.kind === 'slurp') {
      const gh = player.heal(item.amount);
      const gs = player.addShield(item.amount);
      text = `+${Math.round(gh)} vida / +${Math.round(gs)} escudo`;
      color = '#b06cff';
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
      if (!e.isChest) {
        e.body.rotation.y += dt * 0.9;
        if (e.edges) {
          e.edges.rotation.y = e.body.rotation.y;
          e.edges.position.y = e.body.position.y;
        }
      } else if (e.edges) {
        e.edges.position.y = e.body.position.y;
      }
      e.body.position.y = e.baseY + Math.sin(e.phase * 2) * (e.isChest ? 0.035 : 0.07);
      if (e.beam?.material) e.beam.material.opacity = 0.1 + Math.sin(e.phase * 2.5) * 0.04;
      if (e.sprite) e.sprite.position.y = (e.isChest ? 1.9 : 1.85) + Math.sin(e.phase * 2) * 0.1;
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
