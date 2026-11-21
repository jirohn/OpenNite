import * as THREE from 'three';
import { BUILD_PIECES, KIT_CATALOG, KIT_FLOOR_H, KIT_MODULE, KIT_SLAB_H, KIT_WALL_H, cloneKitPiece, kitPieceGameplayCollider, loadBuildingKit } from './kit-pieces.js';

const GRID = KIT_MODULE; // 2u, alineado al kit modular

export class BuildingManager {
  constructor(scene, world, settings) {
    this.scene = scene;
    this.world = world;
    this.settings = settings;
    this.enabled = false;
    this.pieces = [];
    this.placedGroups = [];
    this.ghost = null;
    this.types = Object.keys(BUILD_PIECES);
    this.selectedType = 'wall';
    this.rotY = 0;
    this.templates = {};
    this.loading = null;
    this._placed = false;
    this._keyLatch = {};
    this.ghost = new THREE.Group();
    this.ghost.visible = false;
    this.scene.add(this.ghost);
  }

  async ensureLoaded() {
    if (this.loading) return this.loading;
    this.loading = (async () => {
      try {
        const needed = [...new Set(this.types.map(t => BUILD_PIECES[t].kit))];
        const base = (this.world && this.world.buildKitBase) || './models/kits/kenney-building/';
        // reutilizar kit ya cargado por el mundo si existe
        if (this.world?.buildKitModels && Object.keys(this.world.buildKitModels).length) {
          this.templates = this.world.buildKitModels;
        }
        const models = await loadBuildingKit(base, needed);
        this.templates = { ...this.templates, ...models };
      } catch (e) {
        console.warn('BuildingManager: no se pudo cargar kit, usando primitivas', e);
      }
      this._rebuildGhost();
      return this.templates;
    })();
    return this.loading;
  }

  _kitName() {
    return BUILD_PIECES[this.selectedType]?.kit || 'wall';
  }

  _clearGhost() {
    while (this.ghost.children.length) {
      const c = this.ghost.children[0];
      this.ghost.remove(c);
      c.traverse?.((o) => { if (o.isMesh) { o.geometry?.dispose?.(); } });
    }
  }

  _ghostMaterialize(root) {
    root.traverse((o) => {
      if (o.isMesh) {
        o.material = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, depthWrite: false });
        o.castShadow = false; o.receiveShadow = false;
      }
    });
  }

  _rebuildGhost() {
    this._clearGhost();
    const kit = this._kitName();
    const tpl = this.templates[kit];
    if (tpl) {
      const g = cloneKitPiece(tpl);
      this._ghostMaterialize(g);
      this.ghost.add(g);
      return;
    }
    // fallback primitivo
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, depthWrite: false });
    if (this.selectedType === 'floor' || this.selectedType === 'roof') {
      const m = new THREE.Mesh(new THREE.BoxGeometry(2, 0.1, 2), mat); m.position.y = 0.05; this.ghost.add(m);
    } else if (this.selectedType === 'stairs') {
      const m = new THREE.Mesh(new THREE.BoxGeometry(1.3, 2.5, 4), mat); m.position.y = 1.25; this.ghost.add(m);
    } else {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.2, KIT_WALL_H, 2), mat); m.position.y = KIT_WALL_H / 2; this.ghost.add(m);
    }
  }

  setGhostType(type) {
    if (!BUILD_PIECES[type]) return;
    this.selectedType = type;
    this._rebuildGhost();
  }

  cycleType(dir = 1) {
    const i = this.types.indexOf(this.selectedType);
    const n = (i + dir + this.types.length) % this.types.length;
    this.setGhostType(this.types[n]);
  }

  toggle() {
    this.enabled = !this.enabled;
    this.ghost.visible = this.enabled;
    if (this.enabled) this.ensureLoaded();
    return this.enabled;
  }

  _edge(input, code) {
    const down = !!input.isDown?.(code);
    const was = !!this._keyLatch[code];
    this._keyLatch[code] = down;
    return down && !was;
  }

  update(player, camera, input) {
    if (!this.enabled) { this.ghost.visible = false; return; }
    this.ghost.visible = true;
    if (!this.loading) this.ensureLoaded();

    const dir = player.getAimDirection ? player.getAimDirection(0) : new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const origin = player.getEye ? player.getEye() : player.position.clone().add(new THREE.Vector3(0, 1.6, 0));
    const ray = new THREE.Raycaster(origin, dir);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();
    if (ray.ray.intersectPlane(plane, hit)) {
      // snap a grid 2u
      const gx = Math.round(hit.x / GRID) * GRID;
      const gz = Math.round(hit.z / GRID) * GRID;
      const gy = this.world.heightAt(gx, gz);
      // para muros/puertas/ventanas, permitir apilar por plantas con R/F? mantener en suelo por defecto
      this.ghost.position.set(gx, gy, gz);
    }

    // rotación 90° con Q/E
    if (this._edge(input, 'KeyQ')) this.rotY += Math.PI / 2;
    if (this._edge(input, 'KeyE')) this.rotY -= Math.PI / 2;
    // cambiar tipo con 1-6 o Z/X
    if (this._edge(input, 'Digit1')) this.setGhostType('wall');
    if (this._edge(input, 'Digit2')) this.setGhostType('wall_door');
    if (this._edge(input, 'Digit3')) this.setGhostType('wall_window');
    if (this._edge(input, 'Digit4')) this.setGhostType('floor');
    if (this._edge(input, 'Digit5')) this.setGhostType('roof');
    if (this._edge(input, 'Digit6')) this.setGhostType('stairs');
    if (this._edge(input, 'KeyZ')) this.cycleType(-1);
    if (this._edge(input, 'KeyX')) this.cycleType(1);

    this.ghost.rotation.y = this.rotY;

    // colocar con clic izquierdo (evitar repetición por mantener pulsado)
    const click = !!input.buttons?.has?.(0);
    if (click && !this._placed) {
      this._placed = true;
      this.place(this.ghost.position.clone(), this.rotY);
    }
    if (!click) this._placed = false;

    // eliminar con clic derecho apuntando cerca de una pieza
    const rclick = !!input.buttons?.has?.(2);
    if (rclick && !this._rplaced) {
      this._rplaced = true;
      this.remove(this.ghost.position.clone());
    }
    if (!rclick) this._rplaced = false;
  }

  place(pos, rot) {
    const type = this.selectedType;
    const kit = this._kitName();
    const g = new THREE.Group();
    g.position.copy(pos);
    g.rotation.y = rot;
    let placedObj = null;
    const tpl = this.templates[kit];
    if (tpl) {
      placedObj = cloneKitPiece(tpl);
      g.add(placedObj);
    } else {
      const mat = new THREE.MeshStandardMaterial({ color: 0x7b5738, roughness: 0.8, metalness: 0.05 });
      if (type === 'floor' || type === 'roof') {
        const m = new THREE.Mesh(new THREE.BoxGeometry(2, 0.1, 2), mat); m.position.y = 0.05; m.castShadow = true; g.add(m);
      } else if (type === 'stairs') {
        const m = new THREE.Mesh(new THREE.BoxGeometry(1.3, 2.5, 4), mat); m.position.y = 1.25; m.castShadow = true; g.add(m);
      } else {
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.2, KIT_WALL_H, 2), mat); m.position.y = KIT_WALL_H / 2; m.castShadow = true; g.add(m);
      }
    }
    this.scene.add(g);
    this.placedGroups.push(g);
    this.pieces.push({ type, pos: pos.clone(), rot, group: g });
    // colisión en mundo
    if (this.world?.addCollider) {
      const c = kitPieceGameplayCollider(kit, pos.x, pos.y, pos.z, rot);
      if (c) this.world.addCollider(c.minX, c.maxX, c.minY, c.maxY, c.minZ, c.maxZ);
    }
  }

  remove(pos) {
    let best = null, bestD = 2.5;
    for (const p of this.pieces) {
      const d = p.pos.distanceTo(pos);
      if (d < bestD) { bestD = d; best = p; }
    }
    if (best) {
      const idx = this.pieces.indexOf(best);
      if (idx >= 0) this.pieces.splice(idx, 1);
      if (best.group) {
        this.scene.remove(best.group);
        best.group.traverse?.((o) => { if (o.isMesh) { o.geometry?.dispose?.(); if (o.material?.dispose) o.material.dispose(); } });
      }
      const gi = this.placedGroups.indexOf(best.group);
      if (gi >= 0) this.placedGroups.splice(gi, 1);
    }
  }
}
