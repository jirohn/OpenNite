import * as THREE from 'three';
import {
  GRID_SIZE,
  FLOOR_HEIGHT,
  GRID_HEIGHT_STEP,
  WALL_HEIGHT,
  SLAB_HEIGHT,
  snapToGrid,
  snapHeight,
  snapFloor,
} from '../core/map-system.mjs';
import {
  BUILD_PIECES,
  KIT_CATALOG,
  cloneKitPiece,
  kitPieceGameplayColliders,
  loadBuildingKit,
} from './kit-pieces.js';

export class BuildingManager {
  constructor(scene, world, settings) {
    this.scene = scene;
    this.world = world;
    this.settings = settings;
    this.enabled = false;
    this.pieces = [];
    this.placedGroups = [];
    this.types = ['wall', 'floor', 'stairs', 'roof', 'wall_door', 'wall_window', 'column'];
    this.selectedType = 'wall';
    this.rotY = 0;
    this.templates = {};
    this.loading = null;
    this._placed = false;
    this._rplaced = false;
    this._keyLatch = {};

    this.ghost = new THREE.Group();
    this.ghost.visible = false;
    this.scene.add(this.ghost);

    // Material holográfico de plano tipo Fortnite (cel-shaded cyan blueprint)
    this.ghostMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.52,
      depthWrite: false,
      wireframe: false,
      side: THREE.DoubleSide,
    });
  }

  async ensureLoaded() {
    if (this.loading) return this.loading;
    this.loading = (async () => {
      try {
        const needed = [...new Set(this.types.map((t) => BUILD_PIECES[t]?.kit || t))];
        const base = (this.world && this.world.buildKitBase) || './models/kits/kenney-building/';
        if (this.world?.buildKitModels && Object.keys(this.world.buildKitModels).length) {
          this.templates = this.world.buildKitModels;
        }
        const models = await loadBuildingKit(base, needed);
        this.templates = { ...this.templates, ...models };
      } catch (e) {
        console.warn('BuildingManager: usando modelos de respaldo procedimentales', e);
      }
      this._rebuildGhost();
      return this.templates;
    })();
    return this.loading;
  }

  _kitName() {
    return BUILD_PIECES[this.selectedType]?.kit || this.selectedType;
  }

  _clearGhost() {
    while (this.ghost.children.length) {
      const c = this.ghost.children[0];
      this.ghost.remove(c);
      c.traverse?.((o) => {
        if (o.isMesh) o.geometry?.dispose?.();
      });
    }
  }

  _ghostMaterialize(root) {
    root.traverse((o) => {
      if (o.isMesh) {
        o.material = this.ghostMat;
        o.castShadow = false;
        o.receiveShadow = false;
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

    // Geometría procedimental limpia de fallback con medidas exactas del grid
    if (this.selectedType === 'floor' || this.selectedType === 'roof') {
      const m = new THREE.Mesh(new THREE.BoxGeometry(GRID_SIZE, SLAB_HEIGHT, GRID_SIZE), this.ghostMat);
      m.position.y = SLAB_HEIGHT / 2;
      this.ghost.add(m);
    } else if (this.selectedType === 'stairs') {
      const m = new THREE.Mesh(new THREE.BoxGeometry(GRID_SIZE, FLOOR_HEIGHT, GRID_SIZE), this.ghostMat);
      m.position.y = FLOOR_HEIGHT / 2;
      this.ghost.add(m);
    } else if (this.selectedType === 'column') {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, WALL_HEIGHT, 8), this.ghostMat);
      m.position.y = WALL_HEIGHT / 2;
      this.ghost.add(m);
    } else {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.16, WALL_HEIGHT, GRID_SIZE), this.ghostMat);
      m.position.y = WALL_HEIGHT / 2;
      this.ghost.add(m);
    }
  }

  setGhostType(type) {
    if (!this.types.includes(type)) return;
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

  /**
   * Sistema de Snapping Inteligente 3D (estilo Fortnite):
   * Conecta con la cara / socket de piezas ya construidas o se proyecta al terreno.
   */
  _computeSnapTransform(origin, dir) {
    const ray = new THREE.Raycaster(origin, dir, 0.1, 28);
    const pos = new THREE.Vector3();
    let snappedRot = this.rotY;

    // 1. Raycast contra piezas ya construidas
    let pieceHit = null;
    let minPieceDist = Infinity;

    for (const p of this.pieces) {
      if (!p.group) continue;
      const intersects = ray.intersectObjects(p.group.children, true);
      if (intersects.length && intersects[0].distance < minPieceDist) {
        minPieceDist = intersects[0].distance;
        pieceHit = { piece: p, intersect: intersects[0] };
      }
    }

    if (pieceHit && minPieceDist < 20) {
      const { piece, intersect } = pieceHit;
      const normal = intersect.face ? intersect.face.normal.clone().applyQuaternion(intersect.object.getWorldQuaternion(new THREE.Quaternion())) : new THREE.Vector3(0, 1, 0);
      const isTop = normal.y > 0.6;
      const isBottom = normal.y < -0.6;

      if (this.selectedType === 'floor' || this.selectedType === 'roof') {
        if (isTop) {
          // Encima de muro o escalera -> planta siguiente
          pos.set(piece.pos.x, piece.pos.y + (piece.type === 'floor' ? FLOOR_HEIGHT : (piece.type === 'stairs' ? FLOOR_HEIGHT : WALL_HEIGHT)), piece.pos.z);
        } else {
          // Al lado de otro suelo
          const dx = Math.round(normal.x) * GRID_SIZE;
          const dz = Math.round(normal.z) * GRID_SIZE;
          pos.set(piece.pos.x + dx, piece.pos.y, piece.pos.z + dz);
        }
      } else if (this.selectedType === 'stairs') {
        if (isTop) {
          pos.set(piece.pos.x, piece.pos.y + (piece.type === 'floor' ? 0 : FLOOR_HEIGHT), piece.pos.z);
        } else {
          const dx = Math.round(normal.x) * GRID_SIZE;
          const dz = Math.round(normal.z) * GRID_SIZE;
          pos.set(piece.pos.x + dx, piece.pos.y, piece.pos.z + dz);
        }
      } else {
        // Muros / Puertas / Ventanas
        if (isTop) {
          // Apilar segundo piso de muro
          pos.set(piece.pos.x, piece.pos.y + FLOOR_HEIGHT, piece.pos.z);
          snappedRot = piece.rot;
        } else if (Math.abs(normal.y) < 0.4) {
          // Conectar pared adyacente a lo largo del muro
          const cos = Math.cos(piece.rot);
          const sin = Math.sin(piece.rot);
          const alongZ = Math.abs(cos) > Math.abs(sin);
          const stepX = alongZ ? 0 : (normal.x > 0 ? GRID_SIZE : -GRID_SIZE);
          const stepZ = alongZ ? (normal.z > 0 ? GRID_SIZE : -GRID_SIZE) : 0;
          pos.set(piece.pos.x + stepX, piece.pos.y, piece.pos.z + stepZ);
          snappedRot = piece.rot;
        } else {
          pos.set(piece.pos.x, piece.pos.y, piece.pos.z);
        }
      }

      return { pos, rot: snappedRot };
    }

    // 2. Intersección con el terreno mediante muestreo de rayo
    let hitFound = false;
    const testRay = new THREE.Ray(origin, dir);
    const sample = new THREE.Vector3();

    for (let d = 1.0; d <= 26.0; d += 0.5) {
      testRay.at(d, sample);
      const groundY = this.world.heightAt(sample.x, sample.z);
      if (sample.y <= groundY + 0.1) {
        sample.y = groundY;
        hitFound = true;
        break;
      }
    }

    if (!hitFound) {
      // Fallback a plano horizontal a la altura de los pies del jugador
      const footY = player.position ? player.position.y : 0;
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -footY);
      hitFound = testRay.intersectPlane(plane, sample);
    }

    if (hitFound) {
      // Snap horizontal al módulo base 2u
      const gx = snapToGrid(sample.x, GRID_SIZE);
      const gz = snapToGrid(sample.z, GRID_SIZE);
      const gy = snapHeight(this.world.heightAt(gx, gz), GRID_HEIGHT_STEP);
      pos.set(gx, gy, gz);
    }

    return { pos, rot: snappedRot };
  }

  update(player, camera, input) {
    if (!this.enabled) {
      this.ghost.visible = false;
      return;
    }
    this.ghost.visible = true;
    if (!this.loading) this.ensureLoaded();

    const dir = player.getAimDirection
      ? player.getAimDirection(0)
      : new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const origin = player.getEye
      ? player.getEye()
      : player.position.clone().add(new THREE.Vector3(0, 1.6, 0));

    // Rotación manual con Q / E / R
    if (this._edge(input, 'KeyQ')) this.rotY += Math.PI / 2;
    if (this._edge(input, 'KeyE') || this._edge(input, 'KeyR')) this.rotY -= Math.PI / 2;

    // Selección de pieza rápida (estilo Fortnite: 1-Muro, 2-Suelo, 3-Escalera, 4-Techo)
    if (this._edge(input, 'Digit1')) this.setGhostType('wall');
    if (this._edge(input, 'Digit2')) this.setGhostType('floor');
    if (this._edge(input, 'Digit3')) this.setGhostType('stairs');
    if (this._edge(input, 'Digit4')) this.setGhostType('roof');
    if (this._edge(input, 'Digit5')) this.setGhostType('wall_door');
    if (this._edge(input, 'Digit6')) this.setGhostType('wall_window');
    if (this._edge(input, 'KeyZ')) this.cycleType(-1);
    if (this._edge(input, 'KeyX')) this.cycleType(1);

    // Calcular posición y orientación perfecta en el grid
    const snap = this._computeSnapTransform(origin, dir);
    this.ghost.position.copy(snap.pos);
    this.ghost.rotation.y = snap.rot;

    // Colocar pieza con clic izquierdo
    const click = !!input.buttons?.has?.(0);
    if (click && !this._placed) {
      this._placed = true;
      this.place(this.ghost.position.clone(), snap.rot);
    }
    if (!click) this._placed = false;

    // Eliminar / editar con clic derecho
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
      const mat = new THREE.MeshStandardMaterial({
        color: 0x82654a,
        roughness: 0.85,
        metalness: 0.05,
      });
      if (type === 'floor' || type === 'roof') {
        const m = new THREE.Mesh(new THREE.BoxGeometry(GRID_SIZE, SLAB_HEIGHT, GRID_SIZE), mat);
        m.position.y = SLAB_HEIGHT / 2;
        m.castShadow = true;
        m.receiveShadow = true;
        g.add(m);
      } else if (type === 'stairs') {
        const m = new THREE.Mesh(new THREE.BoxGeometry(GRID_SIZE, FLOOR_HEIGHT, GRID_SIZE), mat);
        m.position.y = FLOOR_HEIGHT / 2;
        m.castShadow = true;
        m.receiveShadow = true;
        g.add(m);
      } else if (type === 'column') {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, WALL_HEIGHT, 8), mat);
        m.position.y = WALL_HEIGHT / 2;
        m.castShadow = true;
        m.receiveShadow = true;
        g.add(m);
      } else {
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.16, WALL_HEIGHT, GRID_SIZE), mat);
        m.position.y = WALL_HEIGHT / 2;
        m.castShadow = true;
        m.receiveShadow = true;
        g.add(m);
      }
    }

    this.scene.add(g);
    this.placedGroups.push(g);
    this.pieces.push({ type, pos: pos.clone(), rot, group: g });

    // Registro de colisionadores de juego para balas, personajes y bots
    if (this.world?.addCollider) {
      const cols = kitPieceGameplayColliders(kit, pos.x, pos.y, pos.z, rot);
      for (const c of cols) {
        this.world.addCollider(c.minX, c.maxX, c.minY, c.maxY, c.minZ, c.maxZ, c.role ? { role: c.role } : null);
      }
    }
  }

  remove(pos) {
    let best = null;
    let bestD = 2.4;
    for (const p of this.pieces) {
      const d = p.pos.distanceTo(pos);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    if (best) {
      const idx = this.pieces.indexOf(best);
      if (idx >= 0) this.pieces.splice(idx, 1);
      if (best.group) {
        this.scene.remove(best.group);
        best.group.traverse?.((o) => {
          if (o.isMesh) {
            o.geometry?.dispose?.();
            if (o.material?.dispose) o.material.dispose();
          }
        });
      }
      const gi = this.placedGroups.indexOf(best.group);
      if (gi >= 0) this.placedGroups.splice(gi, 1);
    }
  }
}
