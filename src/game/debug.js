import * as THREE from 'three';

const BOX_COLOR = 0xff3333;
const AXIS_COLORS = { x: 0xff4444, y: 0x3ccb3c, z: 0x445bff };
const MARKER_COLOR = 0x00ffff;
const AXIS_LEN = 2.8;

const AXES_DEFS = [
  [new THREE.Vector3(1, 0, 0), AXIS_COLORS.x, 'X'],
  [new THREE.Vector3(0, 1, 0), AXIS_COLORS.y, 'Y'],
  [new THREE.Vector3(0, 0, 1), AXIS_COLORS.z, 'Z'],
];

function makeLabelSprite(text, color) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 128, 128);
  ctx.font = 'bold 40px sans-serif';
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = '#00000099';
  ctx.shadowBlur = 8;
  ctx.fillText(text, 64, 70);
  const tex = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sprite.scale.setScalar(0.5);
  return sprite;
}

function makeAxisLine(from, to, color) {
  const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false, linewidth: 3 });
  return new THREE.Line(geo, mat);
}

function makeAxisBall(pos, color) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 1, depthWrite: false,
  }));
  mesh.position.copy(pos);
  mesh.frustumCulled = false;
  return mesh;
}

/** Caja roja del colisionador: líneas rojas + caja sólida translúcida (más visible). */
function addColliderVisuals(min, max, scene) {
  const cx = (min.x + max.x) / 2;
  const cy = (min.y + max.y) / 2;
  const cz = (min.z + max.z) / 2;
  const geo = new THREE.BoxGeometry(max.x - min.x, max.y - min.y, max.z - min.z);
  geo.translate(cx, cy, cz);
  const edges = new THREE.EdgesGeometry(geo);
  const lineMat = new THREE.LineBasicMaterial({ color: BOX_COLOR, transparent: true, opacity: 0.9, depthWrite: false });
  const line = new THREE.LineSegments(edges, lineMat);
  line.frustumCulled = false;
  scene.add(line);

  const solid = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    color: BOX_COLOR, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false,
  }));
  solid.position.set(cx, cy, cz);
  solid.frustumCulled = false;
  scene.add(solid);
  geo.dispose();

  return { line, solid };
}

/** Ejes X/Y/Z locales en un punto (líneas + esferas en los extremos + sprite). */
function addLocalAxes(pos, rot, scene, groupOut, len = 1.1, color = 0x00ffff) {
  const group = new THREE.Group();
  group.position.copy(pos);
  group.quaternion.copy(rot || new THREE.Quaternion());
  scene.add(group);
  for (const [dir, col, label] of AXES_DEFS) {
    const to = new THREE.Vector3().copy(dir).multiplyScalar(len);
    const line = makeAxisLine(new THREE.Vector3(), to.clone(), col);
    group.add(line);
    group.add(makeAxisBall(to.clone(), col));
    const sprite = makeLabelSprite(label, col);
    sprite.position.copy(to);
    group.add(sprite);
  }
  if (groupOut) groupOut.push({ group, line: null, sprite: null, ballNeg: null, ballPos: null });
  return group;
}

/** Ejes locales (rotación del hueso en espacio local + posición mundial) para cada hueso. */
function addSkeletonAxes(character, scene, groupOut) {
  const bones = character?.kitChar?.bones;
  const list = bones instanceof Map ? [...bones.entries()]
    : bones && typeof bones === 'object' ? Object.entries(bones).filter(([n, b]) => typeof n === 'string' && b?.updateWorldMatrix)
    : [];
  for (const [name, bone] of list) {
    bone.updateWorldMatrix(true, true);
    const pos = bone.getWorldPosition(new THREE.Vector3());
    const rot = bone.quaternion.clone(); // ejes locales del hueso
    if (pos.lengthSq() > 0.0001) addLocalAxes(pos, rot, scene, groupOut, 0.9);
  }
}

/** Overlay de desarrollo: cajas rojas de colisionadores, ejes XYZ de objetos y huesos. F5 en-game lo activa. */
export class WorldDebug {
  constructor(world = null, scene = null, camera = null) {
    this.world = world;
    this.scene = scene;
    this.camera = camera;
    this.enabled = false;
    this.items = [];    // { group, line, sprite, ballNeg, ballPos } marcadores de ejes
    this.boxes = [];    // { line, solid, min, max } cajas de colisionadores
    this.getMarkers = null; // () => Object3D[]
  }

  setMarkers(fn) { this.getMarkers = fn; }

  toggle() { this.setEnabled(!this.enabled); }

  setEnabled(v) {
    this.enabled = !!v;
    if (this.enabled) this.rebuild();
    else this.clear();
  }

  disposeItems() {
    for (const it of this.items) {
      if (it.group?.parent) it.group.parent.remove(it.group);
      for (const child of it.group?.children || []) {
        child.geometry?.dispose?.();
        child.material?.dispose?.();
      }
      it.group?.traverse((o) => {
        o.geometry?.dispose?.();
        o.material?.dispose?.();
      });
    }
    this.items.length = 0;
    for (const b of this.boxes) {
      for (const part of [b.line, b.solid]) {
        if (part?.parent) part.parent.remove(part);
        part?.geometry?.dispose?.();
        part?.material?.dispose?.();
      }
    }
    this.boxes.length = 0;
  }

  clear() { this.disposeItems(); }

  addColliderBox(c) {
    const min = new THREE.Vector3(c.minX, c.minY, c.minZ);
    const max = new THREE.Vector3(c.maxX, c.maxY, c.maxZ);
    const { line, solid } = addColliderVisuals(min, max, this.scene);
    this.boxes.push({ line, solid, min, max });
    const center = new THREE.Vector3().addVectors(min, max).multiplyScalar(0.5);
    addLocalAxes(center, new THREE.Quaternion(), this.scene, this.items, 1.4);
  }

  rebuild() {
    this.disposeItems();
    if (!this.enabled || !this.scene) return;
    for (const c of this.world?.colliders || []) this.addColliderBox(c);
    for (const mesh of this.world?.structures?.children || []) {
      if (!mesh.isMesh) continue;
      const b = new THREE.Box3().setFromObject(mesh);
      if (b.isEmpty()) continue;
      const center = b.getCenter(new THREE.Vector3());
      if (center.lengthSq() > 0.5) {
        const rot = mesh.quaternion.clone();
        addLocalAxes(center, rot, this.scene, this.items, 1.4, 0xffaa00);
      }
    }
    const markers = typeof this.getMarkers === 'function' ? this.getMarkers() : null;
    for (const obj of markers || []) {
      const group = obj?.group || obj;
      if (!group?.updateWorldMatrix) continue;
      group.updateWorldMatrix(true, true);
      const b = new THREE.Box3().setFromObject(group);
      if (!b.isEmpty()) {
        const center = b.getCenter(new THREE.Vector3());
        if (center.lengthSq() > 0.0001) addLocalAxes(center, group.quaternion.clone(), this.scene, this.items, 1.5, 0x00ffff);
      }
      addSkeletonAxes(obj, this.scene, this.items);
      const weaponMount = obj?.weaponMount;
      if (weaponMount?.updateWorldMatrix) {
        weaponMount.updateWorldMatrix(true, true);
        addLocalAxes(
          weaponMount.getWorldPosition(new THREE.Vector3()),
          weaponMount.getWorldQuaternion(new THREE.Quaternion()),
          this.scene, this.items, 0.8, 0x00ffff,
        );
      }
    }
  }

  update(dt) {
    if (!this.enabled || !this.camera) return;
    for (const it of this.items) {
      for (const sprite of (it.group?.children || []).filter((c) => c.type === 'Sprite')) {
        sprite.lookAt(this.camera.position);
      }
    }
  }
}
