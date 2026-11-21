import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

/**
 * Personajes Quaternius Universal Base Characters (CC0) + Universal Animation
 * Library (CC0). Ambos packs comparten exactamente el mismo rig de 65 huesos,
 * así que los clips se aplican directamente sobre el esqueleto del modelo sin
 * retargeting. Mantiene la misma interfaz que kit-character.js para que el
 * motor no tenga que saber qué pack está usando.
 */

const BODY_HEIGHT = 1.82; // alto real del GLB en sus propias unidades

let kitPromise = null;

/** Carga del pack de personajes UBC/UAL. `base` permite servir desde fuera de dist/ (tools/editor). */
export function loadUbcKit(base = './models/opennite/ubc/') {
  if (kitPromise) return kitPromise;
  kitPromise = (async () => {
    const loader = new GLTFLoader();
    const urls = {
      male: `${base}Superhero_Male_FullBody.gltf`,
      female: `${base}Superhero_Female_FullBody.gltf`,
      animations: `${base}UAL1_Standard.glb`,
    };
    const cache = new Map();
    const get = (url) => {
      if (!cache.has(url)) cache.set(url, loader.loadAsync(url));
      return cache.get(url);
    };
    const [male, female, anim] = await Promise.all([
      get(urls.male), get(urls.female), get(urls.animations),
    ]);
    const clips = new Map();
    for (const clip of anim.animations) clips.set(clip.name, clip);
    return { urls, get, clips, male, female };
  })().catch((error) => {
    kitPromise = null;
    throw error;
  });
  return kitPromise;
}

const isFemale = (options = {}) => {
  if (typeof options.gender === 'string') return /femin|female|mujer/i.test(options.gender);
  if (Number.isInteger(options.presetIndex)) return options.presetIndex % 2 === 1;
  return /femin|female|mujer/i.test(String(options.preset || ''));
};

const sanitize = (name) => String(name).replace(/[\s.:\-[\]]/g, '').toLowerCase();

export class Character {
  static async create(kit, options = {}) {
    const self = new Character(kit, options);
    await self.init();
    return self;
  }

  constructor(kit, options = {}) {
    this.kit = kit;
    this.options = options;
    this.female = isFemale(options);
    this.holder = new THREE.Group();
    this.bones = new Map();
    this._materials = new Map();
    this._clipCache = new Map();
    this._current = null;
    this._currentName = '';
    this.baseHeight = BODY_HEIGHT;
  }

  async init() {
    const source = this.female ? this.kit.female : this.kit.male;
    this.root = SkeletonUtils.clone(source.scene);
    this.root.updateMatrixWorld(true);
    this.holder.add(this.root);

    this.root.traverse((obj) => {
      if (obj.isBone) {
        this.bones.set(obj.name, obj);
        this.bones.set(sanitize(obj.name), obj);
      }
      if (!obj.isMesh) return;
      obj.frustumCulled = false;
      obj.castShadow = true;
      obj.receiveShadow = true;
      obj.material = this._own(obj.material, obj.name);
    });

    const box = new THREE.Box3().setFromObject(this.root);
    if (box && Number.isFinite(box.max.y - box.min.y) && box.max.y - box.min.y > 0.1) {
      this.baseHeight = box.max.y - box.min.y;
    }
    this.mixer = new THREE.AnimationMixer(this.root);
    this.setHeight(1.9);
    if (this.options.color) this.setBodyColor(this.options.color);
  }

  _own(material, meshName = '') {
    if (this._materials.has(material.uuid)) return this._materials.get(material.uuid);
    const m = material.clone();
    m.userData.baseColor = m.color.clone();
    const key = `${m.name || ''} ${meshName || ''}`.toLowerCase();
    if (key.includes('hair')) {
      m.roughness = 0.86;
      m.metalness = 0;
    } else if (key.includes('eye')) {
      m.roughness = 0.22;
      m.metalness = 0;
    } else {
      m.roughness = 0.68;
      m.metalness = 0.04;
      this.bodyMaterial = m;
      this.bodyBase = m.color.clone();
    }
    m.flatShading = false;
    m.needsUpdate = true;
    this._materials.set(material.uuid, m);
    return m;
  }

  /** Teñimos solo el material del cuerpo; pelo y ojos conservan su aspecto. */
  setBodyColor(color, strength = 0.48) {
    if (!this.bodyMaterial || color === undefined || color === null) return;
    const tint = new THREE.Color(color);
    this.bodyMaterial.color.copy(this.bodyBase).lerp(tint, THREE.MathUtils.clamp(strength, 0, 1));
  }

  colorOf(key = 'shirt') {
    if (!['shirt', 'hat', 'pack', 'linen', 'body'].includes(key) || !this.bodyMaterial) return null;
    return `#${this.bodyMaterial.color.getHexString()}`;
  }

  setColor(key, hex) {
    if (!this.bodyMaterial) return;
    // El wrapper del juego llama con claves del kit antiguo; todas tiñen el cuerpo.
    if (hex === null || hex === undefined) this.bodyMaterial.color.copy(this.bodyBase);
    else this.setBodyColor(hex);
  }

  async apply(appearance = {}) {
    const color = appearance.color ?? appearance.colors?.shirt;
    if (color) this.setBodyColor(color);
    return this;
  }

  clipFor(name, entry) {
    let clip = this._clipCache.get(name);
    if (!clip) {
      const tracks = entry.clip.tracks.filter((t) => this.bones.has(t.name.split('.')[0]));
      clip = new THREE.AnimationClip(name, entry.clip.duration, tracks);
      this._clipCache.set(name, clip);
    }
    return clip;
  }

  /** Reproduce un clip de UAL por nombre. once = se queda en el último fotograma. */
  async playClip(name, { fade = 0.2, once = false, speed = 1, restart = false } = {}) {
    const clip = this.kit.clips.get(name);
    if (!clip) return false;
    if (this._currentName === name && this._current && !restart) {
      this._current.timeScale = speed;
      return true;
    }
    const next = this.mixer.clipAction(this.clipFor(name, { clip }));
    next.reset();
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
    next.clampWhenFinished = once;
    next.timeScale = speed;
    next.play();
    if (this._current && this._current !== next) next.crossFadeFrom(this._current, fade, false);
    this._current = next;
    this._currentName = name;
    return true;
  }

  get playing() { return this._currentName; }

  update(dt) { this.mixer.update(dt); }

  /** Altura total en unidades del mundo. */
  setHeight(h) { this.holder.scale.setScalar(h / Math.max(0.1, this.baseHeight)); }

  dispose() {
    this.mixer?.stopAllAction();
    this.holder.removeFromParent();
    for (const m of this._materials.values()) m.dispose();
    this._materials.clear();
  }
}
