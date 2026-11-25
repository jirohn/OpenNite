import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { UnderwaterPass } from './underwater-pass.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { clamp, distance2D, raySphere } from '../core/utils.js';
import { applyCartoonStyle } from '../core/cartoon.mjs';
import { randomLoot } from './weapons.js';
import { loadCharacterModel, Character, createParachute, attachWeapon } from './character.js';
import { World } from './world.js';
import { Player } from './player.js';
import { Bot } from './bot.js';
import { Effects } from './effects.js';
import { LootManager } from './loot.js';
import { Storm } from './storm.js';
import { HUD } from './hud.js';
import { WEAPONS } from './weapons.js';
import { WorldDebug } from './debug.js';
import { BuildingManager } from './building.js';
import { findBuildings, ensureMatchLoot, isLand, isSafeLand } from './map-pois.js';

const DEFAULT_SKIN_CATALOG = [
  { id: '100avatars_003_jimmy', name: 'Jimmy', color: 0x1e88e5, modelPath: '/models/opennite/characters/100avatars/100Avatars_003_Jimmy.fbx', anim: 'idle' },
];

async function loadSkinCatalog() {
  try {
    const r = await fetch('/config/character-skins.json', { cache: 'no-store' });
    if (r.ok) {
      const d = await r.json();
      const skins = Array.isArray(d?.skins) ? d.skins : Array.isArray(d) ? d : [];
      if (skins.length) {
        return skins.map((s, i) => ({
          id: s.id || `skin_${i}`,
          name: s.name || `Skin ${i + 1}`,
          color: typeof s.color === 'string' ? parseInt(s.color.replace('#',''), 16) : (Number(s.color) || DEFAULT_SKIN_CATALOG[i % DEFAULT_SKIN_CATALOG.length].color),
          modelPath: s.modelPath || DEFAULT_SKIN_CATALOG[0].modelPath,
          anim: s.anim || DEFAULT_SKIN_CATALOG[i % DEFAULT_SKIN_CATALOG.length].anim,
          rarity: s.rarity || 'common',
        }));
      }
    }
  } catch {}
  return DEFAULT_SKIN_CATALOG;
}

export class Game {
  constructor(canvas, uiRoot, settings, audio, input, app) {
    this.canvas = canvas;
    this.uiRoot = uiRoot;
    this.settings = settings;
    this.audio = audio;
    this.input = input;
    this.app = app;
    this.clock = new THREE.Clock();
    this.mode = 'preview';
    this.previewSkins = [];
    this.previewDebug = null;
    this.skinPreviewMode = false;
    this.selectedPreviewColor = settings.get('playerColor');
    this.running = false;
    this.paused = false;
    this.bots = [];
    this.hitboxes = [];
    this.matchTime = 0;
    this.firedThisFrame = false;
    this.lastWeaponType = null;
    this.stormDamageTimer = 0;
    this._cartoonCache = new Map();
    this._cartoonTimer = 0;

    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: true, powerPreference: 'high-performance', stencil: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Colores planos saturados: sin compresión de tonos.
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.shadowMap.type = THREE.BasicShadowMap;

    // Textura de escena sin agua para la refracción de la superficie.
    this.refractionTarget = new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      depthBuffer: true,
      stencilBuffer: false,
    });
    this.reflectionTarget = new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      depthBuffer: true,
      stencilBuffer: false,
    });
    this.reflectionCamera = new THREE.PerspectiveCamera(70, 1, 0.1, 8000);
    this.reflectionMatrix = new THREE.Matrix4();
    this._reflectPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this._reflectNormal = new THREE.Vector3(0, 1, 0);
    this._reflectPos = new THREE.Vector3();
    this._reflectView = new THREE.Vector3();
    this._reflectLook = new THREE.Vector3();
    this._reflectTarget = new THREE.Vector3();
    this._reflectRotation = new THREE.Matrix4();
    this._biasMatrix = new THREE.Matrix4().set(
      0.5, 0, 0, 0.5,
      0, 0.5, 0, 0.5,
      0, 0, 0.5, 0.5,
      0, 0, 0, 1,
    );
    this._drawSize = new THREE.Vector2(1, 1);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(this.settings.get('fov'), window.innerWidth / window.innerHeight, 0.1, 8000);
    this.camera.position.set(4, 3, 7);
    this.camera.lookAt(0, 1.5, 0);

    this.setupPreview();
    this.setupComposer();
    this.applyQuality();

    this.hud = new HUD(uiRoot, settings);
    this.hud.input = this.input;
    this.settings.onChange((_, key) => {
      this.applyQuality();
      if (key === 'waterQuality') this.resize();
      const color = this.settings.get('playerColor');
      const preset = this.settings.get('playerPreset');
      if (this.previewCharacter && this.mode === 'preview') {
        if (preset !== this.previewPreset) {
          this.previewPreset = preset;
          this.previewCharacter.setAppearance({ preset, color }).catch((error) => {
            console.warn('No se pudo cambiar el aspecto:', error);
          });
        } else this.previewCharacter.setColor(color);
      }
      if (this.mode === 'preview') this.setPreviewSkin(color);
      if (this.player?.character && (this.mode === 'playing' || this.mode === 'paused')) {
        this.player.character.setColor(color);
      }
    });
    window.addEventListener('resize', () => this.resize());
    this.resize();

    // F5 activa/desactiva el modo debug (cajas rojas de colisionadores + ejes XYZ del mundo/preview).
    const debugTarget = () => this.world?.debug || this.previewDebug;
    const onDebugKey = () => {
      const dbg = debugTarget();
      if (!dbg) return;
      dbg.toggle();
      this.settings.set('debugMode', dbg.enabled);
    };
    document.addEventListener('keydown', (e) => {
      if (e.code !== 'F5') return;
      if (!this.world?.debug && !this.previewDebug) return;
      e.preventDefault();
      e.stopPropagation();
      onDebugKey();
    }, true);
    this.settings.onChange((_, key) => {
      if (key === 'debugMode') debugTarget()?.setEnabled(!!this.settings.get('debugMode'));
      if (key === 'renderDistance' || key === 'detailDistance' || key === 'quality') this.applyViewDistances();
    });
    this.input.on('keydown', (code) => {
      if (code === 'F5') onDebugKey();
    });

    this.input.on('lockchange', (locked) => {
      // Al iniciar partida el cambio de foco puede soltar el puntero antes del primer frame.
      if (this.mode !== 'playing' || locked || this.ending) return;
      if (performance.now() < (this._lockGraceUntil || 0)) return;
      this.app.requestPause();
    });

    // ESPACIO por pulsación: salir del bus, saltar o alternar el paracaídas.
    this.input.on('keydown', (code) => {
      if (this.mode !== 'playing' || this.paused || !this.player) return;
      if (code === 'Escape') {
        this.app.requestPause();
        return;
      }
      if (code !== 'Space') return;
      if (this.player.inBus) this.player.jumpFromBus();
      else this.player.onSpacePress();
    });
  }

  setupComposer() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 0.28, 0.4, 0.92);
    this.composer.addPass(this.bloomPass);
    this.underwaterPass = new UnderwaterPass();
    this.underwaterPass.setSize(w, h);
    this.composer.addPass(this.underwaterPass);
    this.composer.addPass(new OutputPass());
    // Siempre por composer: el efecto de agua del HUD necesita el pase.
    this.useComposer = true;
  }

  applyQuality() {
    const s = this.settings.all();
    const dpr = window.devicePixelRatio || 1;
    const maxDpr = s.quality === 'low' ? 1 : s.quality === 'medium' ? 1.25 : 1.5;
    const pr = Math.min(dpr, maxDpr) * (s.resolutionScale || 1);
    this.renderer.setPixelRatio(Math.min(pr, 1.25));
    this.renderer.shadowMap.enabled = !!s.shadows;
    if (this.world?.sun) {
      this.world.sun.castShadow = !!s.shadows;
      const size = s.shadowMapSize || 512;
      if (this.world.sun.shadow.mapSize.x !== size) {
        this.world.sun.shadow.mapSize.set(size, size);
        this.world.sun.shadow.map?.dispose();
        this.world.sun.shadow.map = null;
      }
    }
    if (this.bloomPass) {
      this.bloomPass.strength = 0.1 + 0.14 * (s.effects || 1);
      this.bloomPass.enabled = !!s.bloom;
    }
    this.bloomEnabled = !!s.bloom;
    // El composer solo se usa cuando hace falta (bloom o efecto de agua).
    this.useComposer = this.bloomEnabled;
    this.renderer.info.autoReset = true;
    this.applyViewDistances(s);
    this.resize();
  }

  applyViewDistances(s = this.settings.all()) {
    const renderDist = Math.max(120, Number(s.renderDistance) || 320);
    const detailDist = Math.min(renderDist, Math.max(60, Number(s.detailDistance) || 180));
    if (this.camera) {
      this.camera.far = Math.max(this.camera.far, renderDist + 80);
      // Keep far at least renderDist+margin but also allow larger if needed
      this.camera.far = renderDist + 120;
      this.camera.updateProjectionMatrix();
    }
    if (this.scene?.fog) {
      this.scene.fog.near = Math.max(30, renderDist * 0.25);
      this.scene.fog.far = renderDist + 60;
    }
    if (this.world?.applyViewDistances) this.world.applyViewDistances(renderDist, detailDist);
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.composer?.setSize(w, h);
    this.renderer.getDrawingBufferSize(this._drawSize);
    this.refractionTarget.setSize(
      Math.max(1, Math.floor(this._drawSize.x * 0.5)),
      Math.max(1, Math.floor(this._drawSize.y * 0.5)),
    );
    const waterQuality = Number(this.settings.get('waterQuality') || 0);
    const reflectionScale = waterQuality >= 2 ? 0.5 : 0.35;
    this.reflectionTarget.setSize(
      Math.max(1, Math.floor(this._drawSize.x * reflectionScale)),
      Math.max(1, Math.floor(this._drawSize.y * reflectionScale)),
    );
    this.world?.setRefractionTexture?.(this.refractionTarget.texture, this._drawSize.x, this._drawSize.y);
    this.world?.setReflectionTexture?.(
      waterQuality >= 1 ? this.reflectionTarget.texture : null,
      this.reflectionMatrix,
      waterQuality >= 1,
    );
  }

  // ---------------------- Vista previa del menú ----------------------

  async setupPreview() {
    this.preview = new THREE.Group();
    this.scene.add(this.preview);
    const hemi = new THREE.HemisphereLight(0xa8c8ff, 0x30302c, 1.1);
    const key = new THREE.DirectionalLight(0xffd8a0, 1.8);
    key.position.set(5, 8, 4);
    const rim = new THREE.DirectionalLight(0x26d3c7, 0.6);
    rim.position.set(-5, 3, -4);
    this.preview.add(hemi, key, rim);
    const pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(2.1, 2.4, 0.5, 32),
      new THREE.MeshStandardMaterial({ color: 0x1b202b, metalness: 0.6, roughness: 0.35 }),
    );
    pedestal.position.y = -0.25;
    this.preview.add(pedestal);
    this.previewPedestal = pedestal;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(2.25, 0.045, 8, 64),
      new THREE.MeshBasicMaterial({ color: 0xff8a2b }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.02;
    this.preview.add(ring);
    this.previewRing = ring;

    try {
      const kit = await loadCharacterModel();
      if (this.mode !== 'preview') return;
      const _cat = this.skinCatalog || DEFAULT_SKIN_CATALOG;
      const _sel = _cat.find(s => s.color === this.settings.get('playerColor')) || _cat[0] || {};
      const ch = await Character.create(kit, {
        color: _sel.color ?? this.settings.get('playerColor'),
        preset: this.settings.get('playerPreset'),
        modelPath: _sel.modelPath,
      });
      ch.group.position.set(0, 0, 0);
      ch.group.rotation.y = -0.5;
      ch.play('idle');
      attachWeapon(ch, 'ar');
      this.preview.add(ch.group);
      this.previewCharacter = ch;
      this.previewPreset = this.settings.get('playerPreset');
      this.previewDebug = new WorldDebug(null, this.preview, this.camera);
      this.previewDebug.setMarkers(() => [this.previewCharacter, ...(this.previewSkins || [])].filter(Boolean));
      this.previewDebug.setEnabled(!!this.settings.get('debugMode'));

      // Ocho maniquíes 3D animados, uno por aspecto, para elegir en el lobby.
      // Skins de lobby: desde config/character-skins.json o defaults.
      const catalog = await loadSkinCatalog();
      this.skinCatalog = catalog;
      this.app.skinCatalog = catalog;
      try { window.dispatchEvent(new CustomEvent('opennite:skins', { detail: catalog })); } catch {}
      const skins = await Promise.all(catalog.map(async (entry, i) => {
        const color = entry.color ?? DEFAULT_SKIN_CATALOG[i % DEFAULT_SKIN_CATALOG.length].color;
        const opts = { color, presetIndex: i % 8 };
        if (entry.modelPath) opts.modelPath = entry.modelPath;
        const skin = await Character.create(kit, opts);
        const centerX = catalog.length === 1 ? 3.0 : 3.85;
        skin.group.position.set(centerX + i * 0.5, 0, 0);
        skin.group.rotation.y = -0.35;
        skin.group.scale.setScalar(1.05);
        skin.play(entry.anim || 'idle');
        await attachWeapon(skin, i % 3 === 0 ? 'pistol' : i % 3 === 1 ? 'smg' : 'ar');
        skin.alwaysAlignForward = true;
        const disc = new THREE.Mesh(
          new THREE.CylinderGeometry(0.66, 0.72, 0.09, 24),
          new THREE.MeshStandardMaterial({ color: 0x12161f, emissive: color, emissiveIntensity: 0.25, metalness: 0.5, roughness: 0.4 }),
        );
        disc.position.y = -0.05;
        skin.group.add(disc);
        skin.group.userData.color = color;
        skin.group.userData.skinId = entry.id;
        skin.group.userData.modelPath = entry.modelPath || '';
        skin.group.userData.disc = disc;
        skin.group.visible = this.skinPreviewMode;
        this.preview.add(skin.group);
        return skin;
      }));
      this.previewSkins = skins;
      this.setSkinPreview(this.skinPreviewMode);
      this.app.onAssetsReady?.();
    } catch (error) {
      console.error('No se pudo cargar el modelo CC0:', error);
      this.app.onAssetsError?.(error);
    }
  }

  /** Activa la galería de skins 3D (lobby) o el héroe singular (menú). */
  setSkinPreview(active) {
    this.skinPreviewMode = !!active;
    const showGallery = this.skinPreviewMode;
    if (this.previewCharacter) this.previewCharacter.group.visible = !showGallery;
    for (const skin of this.previewSkins) skin.group.visible = showGallery;
    if (this.previewPedestal) this.previewPedestal.visible = !showGallery;
    if (this.previewRing) this.previewRing.visible = !showGallery;
    this.setPreviewSkin(this.selectedPreviewColor);
  }

  setPreviewSkin(color) {
    this.selectedPreviewColor = color;
    for (const skin of this.previewSkins) {
      const active = skin.group.userData.color === color;
      skin.group.userData.targetScale = active ? 1.3 : 1.05;
      if (skin.group.userData.disc) skin.group.userData.disc.material.emissiveIntensity = active ? 1.1 : 0.2;
    }
  }

  updatePreview(dt, elapsed) {
    this.previewDebug?.update(dt);
    if (this.skinPreviewMode) {
      this.camera.position.set(3.0 + Math.sin(elapsed * 0.12) * 0.16, 2.6, 7.5);
      this.camera.lookAt(3.0, 1.1, 0);
      this.previewSkins.forEach((skin, i) => {
        skin.update(dt);
        skin.group.rotation.y = -0.35 + Math.sin(elapsed * 0.5 + i * 0.6) * 0.18;
        skin.group.position.y = Math.sin(elapsed * 1.1 + i) * 0.03;
        const target = skin.group.userData.targetScale ?? 1.05;
        const s = THREE.MathUtils.lerp(skin.group.scale.x, target, Math.min(1, dt * 8));
        skin.group.scale.setScalar(s);
      });
    } else {
      this.camera.position.set(3.1 + Math.sin(elapsed * 0.15) * 0.4, 2.3 + Math.sin(elapsed * 0.22) * 0.12, 4.15);
      this.camera.lookAt(0, 1.2, 0);
      if (this.previewCharacter) {
        this.previewCharacter.update(dt);
        this.previewCharacter.group.rotation.y = -0.5 + Math.sin(elapsed * 0.3) * 0.35;
      }
      if (this.previewRing) this.previewRing.rotation.z += dt * 0.25;
    }
    this.camera.fov = 46;
    this.camera.updateProjectionMatrix();
  }

  // ---------------------- Partida ----------------------

  async startMatch(config) {
    this.ending = false;
    this.paused = false;
    this.mode = 'loading';
    this.app.setLoading?.(20, 'Descargando mapa desde GitHub...');

    const kit = await loadCharacterModel();
    if (this.preview) this.preview.visible = false;
    this.previewDebug?.setEnabled(!!this.settings.get('debugMode'));
    this.hud.unmount();

    this.world = new World(this.scene, config.map, this.settings);
    this.world.debug = new WorldDebug(this.world, this.scene, this.camera);
    if (this.previewCharacter) this.previewCharacter.world = this.world;
    for (const sk of (this.previewSkins || [])) sk.world = this.world;
    this.world.debug.setEnabled(!!this.settings.get('debugMode'));
    this.app.setLoading?.(40, config.map.type === 'glb' ? 'Cargando escena 3D completa...' : 'Creando San Borondon y colocando la naturaleza...');
    await this.world.load();
    applyCartoonStyle(this.scene, this._cartoonCache);
    this.world.setRefractionTexture?.(this.refractionTarget.texture, this._drawSize.x, this._drawSize.y);
    this.world.setReflectionTexture?.(
      Number(this.settings.get('waterQuality') || 0) >= 1 ? this.reflectionTarget.texture : null,
      this.reflectionMatrix,
      Number(this.settings.get('waterQuality') || 0) >= 1,
    );
    this.building = new BuildingManager(this.scene, this.world, this.settings);
    this.app.setLoading?.(55, 'Colocando botín y jugadores...');

    this.effects = new Effects(this.scene, this.settings);
    const _cat = this.skinCatalog || DEFAULT_SKIN_CATALOG;
    const _sel = _cat.find(s => s.color === this.settings.get('playerColor')) || _cat[0] || {};
    const playerCharacter = await Character.create(kit, {
      color: _sel.color ?? this.settings.get('playerColor'),
      preset: this.settings.get('playerPreset'),
      modelPath: _sel.modelPath,
    });
    this.player = new Player(this.camera, playerCharacter, this.world, this.settings, this.input, this.audio);
    this.player.onFallDamage = (damage) => {
      if (damage >= 99) this.hud.toast('¡Caída mortal!', 'warn');
      this.onBotHit(this.player, damage, 'body', { name: 'la caída' }, null);
    };
    this.player.onJumpPad = (position, pad) => {
      this.effects.burst(new THREE.Vector3(pad.x, pad.y + 0.5, pad.z), 22, [0x4ff0ff, 0xffffff, 0x2a8dff],
        { speed: 7, size: 0.22, life: 0.65, lift: 6, gravity: 3 });
      this.hud.toast('¡Bomba de fuerza!', 'good');
    };
    this.scene.add(this.player.character.group);
    this.player.character.world = this.world;
    this.player.character.group.castShadow = true;
    this.training = !!config.training || config.map?.type === 'training';
    this.player.equipStarting();
    await this.syncWeaponModel();

    this.chute = createParachute();
    this.chute.visible = false;
    this.scene.add(this.chute);

    this.bus = this.createBus();
    this.scene.add(this.bus);
    this.bus.visible = !this.training;

    this.loot = new LootManager(this.scene, this.world, this);
    await this.loot.load();
    this.buildings = findBuildings(this.world);
    this._landingSpots = null;
    if (!this.training) {
      // Botín garantizado: cofres en las casas y armas por tierra firme si el mapa trae poco.
      ensureMatchLoot(this.world, this.buildings, 1 + clamp(config.bots ?? this.settings.get('maxBots'), 0, 19));
      this.loot.spawn(Math.round(78 * (config.map.lootDensity || 1)));
    }
    this.storm = new Storm(this.scene, this.world, this);
    this.storm.onStormEvent = (text, type) => this.hud.toast(text, type);
    this.storm.onStormFinal = () => this.hud.toast('La tormenta ha terminado', 'good');

    this.bots = [];
    this.noiseEvents = [];
    this._landingClaims = [];
    const count = this.training ? 0 : clamp(config.bots ?? this.settings.get('maxBots'), 0, 19);
    const spots = this.world.spawnPoints || [];
    const botColors = [0xff5f6d, 0x4fa8ff, 0x54d17a, 0xf5b83d, 0xb07bff, 0x2fd6d0];
    // Una sola ruta de autobús por partida: la comparten el jugador y los bots.
    this.busRoute = this.training ? null : this.createBusRoute();
    this.busTime = 0;
    for (let i = 0; i < count; i++) {
      const sp = spots.length ? spots[(i * 7 + 3) % spots.length] : { x: 0, y: 0, z: 0 };
      const _cat = this.skinCatalog || DEFAULT_SKIN_CATALOG;
      const _botSkin = _cat[(i + 1) % _cat.length] || _cat[0] || {};
      const ch = await Character.create(kit, {
        color: this.training ? 0x7fd0ff : (_botSkin.color ?? botColors[i % botColors.length]),
        presetIndex: i + 1,
        modelPath: _botSkin.modelPath,
      });
      ch.world = this.world;
      this.scene.add(ch.group);
      const bot = new Bot(ch, this.world, this, i, this.training ? { spawn: { x: sp.x, y: 0, z: sp.z } } : {});
      bot.trainingDummy = !!this.training;
      bot.passive = !!this.training;
      if (this.training) {
        ch.group.traverse((o) => {
          if (o.isMesh) {
            const mats = Array.isArray(o.material) ? o.material : [o.material];
            o.material = mats.map((m) => {
              const mm = m.clone ? m.clone() : m;
              mm.transparent = true;
              mm.opacity = 0.45;
              mm.emissive = new THREE.Color(0x4fbaff);
              mm.emissiveIntensity = 0.35;
              mm.depthWrite = false;
              return mm;
            });
            if (!Array.isArray(mats)) o.material = o.material[0];
          }
        });
        attachWeapon(ch, 'ar');
      } else {
        // Todos suben al autobús, como el jugador; cada uno decide dónde saltar.
        bot.placeOnBus(this.busRoute);
      }
      this.bots.push(bot);
    }

    if (this.training) {
      this.player.inBus = false;
      this.player.gliding = false;
      this.player.character.group.visible = true;
      const ps = spots[0] || { x: 0, y: 0, z: 34 };
      // Sobre el suelo del mapa (los mapas de teselas no están a altura 0).
      const groundY = this.world.surfaceHeightAt?.(ps.x, ps.z) ?? this.world.heightAt?.(ps.x, ps.z);
      this.player.position.set(ps.x, Number.isFinite(groundY) ? Math.max(groundY, ps.y || 0) : (ps.y || 0), ps.z);
      this.player.velocity.set(0, 0, 0);
      this.player.yaw = Math.PI;
      this.player.pitch = 0;
      this.player.character.group.position.copy(this.player.position);
      // Postura inicial ya aplicada: si entra en pausa antes del primer update, no se ve en T-pose.
      this.player.character.setLocomotion(0, true, { armed: true, twoHand: false, crouching: false, ads: false });
      this.player.character.update(0.016);
      this.player.updateCamera(0.016);
    } else {
      this.player.placeOnBus(this.busRoute);
    }

    this.world.debug?.setMarkers(() => [
      this.player?.character, ...(this.bots || []).map((b) => b.character),
    ].filter(Boolean));
    this.world.debug?.rebuild();
    this.audio.applyDeaf(!!this.settings.get('deafMode'));

    this.hud.mount(config.map.name);
    if (this.training) {
      this.hud.banner('MODO ENTRENAMIENTO', 'Bots holográficos pasivos · Sin tormenta', 3.2);
      this.hud.toast('Modo entrenamiento: practica movimiento, puntería y construcción.', 'good');
    } else {
      this.hud.banner('PREPARA EL SALTO', `${count} rivales · ${config.map.name}`, 3.2);
      this.hud.toast('Pulsa ESPACIO para saltar del autobús (o se abrirá solo sobre la isla). Clic para controlar la cámara.', 'good');
    }
    this.matchTime = 0;
    this.mode = 'playing';
    this.running = true;
    this.input.autoLock = true;
    this._lockGraceUntil = performance.now() + 1800;
    this.app.setLoading?.(100, 'Listo');
    this.clock.getDelta();
    this.input.requestLock();
    // Pintar ya el primer frame con la postura inicial, antes de cualquier update/pausa.
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Ruta recta del autobús: cruza el mapa con una dirección aleatoria cada
   * partida, pasando cerca del centro. La usan el jugador y los bots.
   */
  createBusRoute() {
    const half = this.world.half;
    const ang = Math.random() * Math.PI * 2;
    const dir = new THREE.Vector3(Math.sin(ang), 0, Math.cos(ang));
    const perp = new THREE.Vector3(-dir.z, 0, dir.x);
    const offset = (Math.random() - 0.5) * half * 0.5;
    const before = half + 120;
    const start = perp.multiplyScalar(offset).addScaledVector(dir, -before);
    start.y = 220;
    const length = before + half + 40;
    // Al menos ~14 s de viaje para poder elegir dónde saltar.
    const speed = Math.min(78, Math.max(26, length / 14));
    return {
      start, dir, speed, length,
      duration: length / speed,
      yaw: Math.atan2(-dir.x, -dir.z),
      positionAt(t, out = new THREE.Vector3()) {
        return out.copy(this.start).addScaledVector(this.dir, Math.min(this.length, Math.max(0, t) * this.speed));
      },
    };
  }

  /** Sitios con botín (cofres, armas, objetos) y cuánto botín hay alrededor. */
  /** Sitios en tierra firme con botín (cofres, armas, objetos, casas) y cuánto botín hay cerca. */
  getLandingSpots() {
    if (this._landingSpots) return this._landingSpots;
    const w = this.world;
    const loot = [...(w.chestSpots || []), ...(w.weaponSpawnSpots || []), ...(w.lootSpots || [])];
    const raw = [...loot, ...(this.buildings || []).map((b) => b.center)];
    const spots = raw
      .filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.z) && isSafeLand(w, p.x, p.z))
      .map((p) => ({ pos: new THREE.Vector3(p.x, w.surfaceHeightAt?.(p.x, p.z) ?? 0, p.z), density: 0 }));
    for (const a of spots) {
      for (const q of loot) if (Math.hypot(q.x - a.pos.x, q.z - a.pos.z) < 30) a.density++;
    }
    this._landingSpots = spots;
    return spots;
  }

  isLand(x, z) { return isLand(this.world, x, z); }

  /** Tierra firme lejos de la orilla (para aterrizar). */
  isSafeLand(x, z) { return isSafeLand(this.world, x, z); }

  createBus() {
    const group = new THREE.Group();
    group.name = 'drop-bus';
    // Placeholder simple mientras carga el modelo real.
    const placeholder = new THREE.Mesh(
      new THREE.BoxGeometry(6, 4, 20),
      new THREE.MeshStandardMaterial({ color: 0x3a6b3a, metalness: 0.2, roughness: 0.7, transparent: true, opacity: 0.35 })
    );
    group.add(placeholder);

    const loader = new FBXLoader();
    loader.setResourcePath('/models/opennite/props/bus/');
    loader.load('/models/opennite/props/bus/Meshy_AI_Green_City_Bus_20261121_texture.fbx', (fbx) => {
      try {
        group.remove(placeholder);
        placeholder.geometry.dispose();
        placeholder.material.dispose();
        const box = new THREE.Box3().setFromObject(fbx);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        // Normalizar: longitud objetivo ~20 unidades en el eje Z del autobús del juego.
        const targetLen = 20;
        const longest = Math.max(size.x, size.y, size.z, 0.001);
        const s = targetLen / longest;
        fbx.scale.setScalar(s);
        // Recalcular tras escalar
        const box2 = new THREE.Box3().setFromObject(fbx);
        const c2 = box2.getCenter(new THREE.Vector3());
        fbx.position.sub(c2); // centrar
        // Orientación: Meshy suele exportar con eje hacia adelante variable; ajustar si hace falta.
        // El bus del juego avanza hacia -Z (ver player position.z -= busSpeed*dt) y cámara detrás en +Z.
        fbx.rotation.y = -Math.PI / 2; // 180° desde la orientación anterior (mirando dirección contraria corregida)
        const box3 = new THREE.Box3().setFromObject(fbx);
        const c3 = box3.getCenter(new THREE.Vector3());
        fbx.position.sub(c3);
        fbx.position.y += 0; // centrado vertical en el grupo

        fbx.traverse((o) => {
          if (o.isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
            if (o.material) {
              const mats = Array.isArray(o.material) ? o.material : [o.material];
              for (const m of mats) { m.needsUpdate = true; }
            }
          }
        });
        group.add(fbx);
        group.userData.busModel = fbx;
      } catch (err) {
        console.warn('No se pudo integrar modelo de bus:', err);
      }
    }, undefined, (err) => console.warn('No se pudo cargar bus FBX:', err));

    return group;
  }

  async syncWeaponModel() {
    const inv = this.player?.inventory;
    const type = inv?.current()?.type || null;
    if (type === this.lastWeaponType) return;
    this.lastWeaponType = type;
    await attachWeapon(this.player.character, type);
  }

  // ---------------------- Combate ----------------------

  fire() {
    this.fireWeapon(this.player);
  }

  /**
   * Disparo de cualquier jugador (persona o bot) con su arma real: misma
   * munición, cadencia, dispersión, retroceso, alcance y daño para todos.
   */
  fireWeapon(shooter) {
    const isHuman = shooter === this.player;
    const body = isHuman ? this.player : shooter.body;
    const inv = body.inventory;
    const shot = inv.fire(body.ads);
    if (!shot) {
      if (isHuman && inv.current()?.ammo === 0) this.audio.play('empty');
      return;
    }
    const camDist = isHuman ? 0 : distance2D(body.position, this.camera.position);
    const visible = isHuman || camDist < 260;
    if (isHuman || camDist < 110) this.audio.play('shoot', { weapon: shot.weapon.type });
    body.addRecoil(shot.recoil);
    body.character.fire(shot.weapon.type);
    // Ruido: los bots cercanos lo oyen.
    const loud = { sniper: 220, shotgun: 110, ar: 130, smg: 100, pistol: 90, pickaxe: 12 }[shot.weapon.type] || 90;
    this.noiseEvents.push({ x: body.position.x, y: body.position.y, z: body.position.z, time: this.matchTime, shooter, radius: loud });
    if (this.noiseEvents.length > 64) this.noiseEvents.splice(0, this.noiseEvents.length - 64);

    const origin = isHuman ? this.camera.position.clone() : body.eyePosition;
    const muzzle = visible ? (isHuman ? this.player.getMuzzlePosition() : shooter.body.getMuzzlePosition()) : null;
    const dirBase = body.getAimDirection(0);
    const targets = [];
    if (!isHuman && this.player.alive && !this.player.inBus) targets.push(this.player);
    for (const bot of this.bots) if (bot !== shooter && bot.alive && !bot.inBus) targets.push(bot);

    for (let p = 0; p < shot.pellets; p++) {
      const dir = body.getAimDirection(shot.spread);
      const worldHit = this.world.raycast(origin, dir, shot.range);
      let nearest = worldHit ? worldHit.distance : shot.range;
      let hitTarget = null;
      let hitPart = 'body';
      let hitPoint = null;

      for (const t of targets) {
        const d2 = distance2D(t.position, body.position);
        if (d2 > shot.range + 4) continue;
        const boxes = t.getHitboxes(this.hitboxes);
        for (const b of boxes) {
          const hit = raySphere(origin, dir, b, b.r);
          if (hit > 0 && hit < nearest) { nearest = hit; hitTarget = t; hitPart = b.part; }
        }
      }

      if (hitTarget) {
        hitPoint = origin.clone().addScaledVector(dir, nearest);
        const falloff = Math.max(0.4, 1 - nearest * shot.falloff);
        const mult = hitPart === 'head' ? 2.15 : hitPart === 'legs' ? 0.85 : 1;
        const dmg = shot.damage * falloff * mult;
        if (visible) this.effects.impact(hitPoint, dir.clone().negate(), 'flesh');
        this.onBotHit(hitTarget, dmg, hitPart, shooter, hitPoint, shot.weapon.name);
      } else if (worldHit) {
        hitPoint = worldHit.point;
        if (worldHit.type === 'glass' && worldHit.glassKey) {
          this.world.breakGlass(worldHit.glassKey, worldHit.point);
          if (visible) this.effects.impact(worldHit.point, dir.clone().negate(), 'stone');
        } else if (visible) {
          const surf = worldHit.type === 'terrain' ? 'terrain' : 'stone';
          this.effects.impact(worldHit.point, dir.clone().negate(), surf);
        }
      } else {
        hitPoint = origin.clone().addScaledVector(dir, shot.range);
      }
      if (visible) this.effects.tracer(muzzle, hitPoint, isHuman ? 0xffe08a : 0xffb04a);
    }
    if (visible) this.effects.muzzle(muzzle, dirBase, 0xffbb55);
  }

  /**
   * Tecla E de un bot: mismas reglas que el jugador (coger al momento,
   * cofres manteniendo 1 s, puertas manteniendo 0,5 s o corriendo contra ellas).
   */
  updateBotInteraction(bot, dt) {
    const body = bot.body;
    const st = bot._interact || (bot._interact = { chest: null, door: null, latch: false });
    const holdE = bot.input.isDown('KeyE');
    const nearDoor = this.world.findNearestDoor ? this.world.findNearestDoor(body.position, 2.6) : null;
    if (nearDoor && !nearDoor.targetOpen && body.sprinting && body.grounded
      && Math.hypot(body.velocity.x, body.velocity.z) > 3.5) {
      this.world.setDoorOpen(nearDoor, true);
      nearDoor.autoClose = 2.5;
    }
    if (!holdE || !body.alive) { st.chest = null; st.door = null; st.latch = false; return; }
    if (st.chest) {
      const e = st.chest.entity;
      if (!e.group?.parent || e.pos.distanceToSquared(body.position) > 3.6 * 3.6) { st.chest = null; return; }
      st.chest.time += dt;
      body.character.play('chestOpen', 0.08);
      if (st.chest.time >= st.chest.duration) {
        this.loot.interact(e, body, { silent: bot.distToCamera > 30 });
        st.chest = null;
        st.latch = true;
      }
      return;
    }
    if (st.door) {
      if (this.world.findNearestDoor(body.position, 3.0) !== st.door.entity) { st.door = null; return; }
      st.door.time += dt;
      if (st.door.time >= st.door.duration) {
        this.world.toggleDoor(st.door.entity);
        st.door.entity.autoClose = 2.5;
        st.door = null;
        st.latch = true;
      }
      return;
    }
    if (st.latch) return;
    const near = this.loot.findNear(body.position, 3.4);
    if (near) {
      if (near.isChest) {
        st.chest = { entity: near, time: 0, duration: 1.0 };
        body.character.play('chestOpen', 0.08);
      } else {
        this.loot.interact(near, body, { silent: bot.distToCamera > 30 });
        st.latch = true;
      }
    } else if (nearDoor && !nearDoor.targetOpen) {
      st.door = { entity: nearDoor, time: 0, duration: 0.5 };
    }
  }

  onBotHit(target, damage, part, attacker, point, weaponName = 'Fusil AR') {
    if (target === this.player) {
      const result = this.player.takeDamage(damage, attacker);
      if (result.shieldBroken) {
        this.audio.play('shieldbreak');
        this.hud.toast('¡Escudo roto!', 'warn');
      } else this.audio.play('hurt');
      this.hud.damageFlash(clamp(damage / 55, 0.15, 0.7));
      if (!result.killed) this.player.character?.hit?.(damage > 35);
      if (result.killed) {
        if (this.training) {
          this.player.alive = true;
          this.player.character.health = this.player.character.maxHealth || 100;
          const sp = (this.world?.spawnPoints || [{x:0,y:0,z:34}])[0];
          this.player.position.set(sp.x, 0, sp.z);
          this.player.velocity.set(0, 0, 0);
          this.player.character.group.position.copy(this.player.position);
          this.hud.toast('Reaparecido en entrenamiento', 'good');
        } else {
          this.endMatch(false, attacker?.name || 'Tormenta');
        }
      }
      return;
    }
    if (!target?.alive) return;
    const byPlayer = attacker === this.player;
    if (byPlayer) {
      this.player.damageDealt += damage;
      this.hud.hitMarker();
      this.audio.play('hit', { head: part === 'head' });
      if (this.settings.get('showDamageNumbers') && point) {
        this.effects.floatingText(point, `${Math.round(damage)}${part === 'head' ? '!' : ''}`, part === 'head' ? '#ffdb4d' : '#ffffff');
      }
    }
    const killed = target.takeDamage(damage, part, attacker);
    if (!killed) target.character?.hit?.(part === 'head' || damage > 35);
    if (killed) this.handleBotDeath(target, attacker, weaponName);
  }

  handleBotDeath(bot, attacker, weaponName = 'AR') {
    const isPlayer = attacker === this.player;
    if (isPlayer) {
      this.player.kills++;
      this.audio.play('kill');
      this.hud.banner('ELIMINADO', bot.name, 1.4);
    }
    if (!isPlayer && attacker && attacker !== bot && typeof attacker.kills === 'number') attacker.kills++;
    this.hud.kill(isPlayer ? 'Tú' : attacker?.name || '???', bot.name, isPlayer ? weaponName : weaponName || 'AR');
    this.effects.burst(bot.position.clone().add(new THREE.Vector3(0, 1.2, 0)), 22, [0xff4d5e, 0x9b1c2e], { speed: 4, life: 0.8 });
    if (!this.training && this.loot) {
      // Suelta lo que llevaba encima, como un jugador.
      const drops = bot.dropItems ? bot.dropItems() : [randomLoot(Math.random)];
      if (!drops.length) drops.push(randomLoot(Math.random));
      drops.forEach((drop, i) => {
        const angle = (i / drops.length) * Math.PI * 2 + Math.random() * 0.4;
        const pos = bot.position.clone().add(new THREE.Vector3(Math.cos(angle) * 1.5, 0.2, Math.sin(angle) * 1.5));
        this.loot.createEntity(pos, drop, false);
      });
    }
    if (this.training) {
      setTimeout(() => {
        if (this.mode !== 'playing') return;
        const spots = this.world?.spawnPoints || [{ x: 0, y: 0, z: 0 }];
        const sp = spots[Math.floor(Math.random() * spots.length)];
        bot.character.health = bot.character.maxHealth || 100;
        if (bot.respawn) bot.respawn(sp.x, 0, sp.z);
      }, 1500);
      return;
    }
    if (this.bots.every((b) => !b.alive)) this.endMatch(true);
  }

  onBotKilled(bot, attacker, weaponName = 'AR') {
    if (bot?.alive) return;
    this.handleBotDeath(bot, attacker, weaponName);
  }

  onStormEvent(text, type) { this.hud.toast(text, type); }

  endMatch(victory, killer = '') {
    if (this.ending) return;
    this.ending = true;
    this.mode = 'results';
    this.input.autoLock = false;
    this.input.releaseLock();
    this.audio.play(victory ? 'victory' : 'defeat');
    this.hud.banner(victory ? '¡VICTORIA!' : 'ELIMINADO', victory ? 'Último jugador en pie' : `Por ${killer}`, 3);
    const result = {
      victory,
      kills: this.player.kills,
      damage: Math.round(this.player.damageDealt),
      time: this.matchTime,
      rank: victory ? 1 : 1 + this.bots.filter((b) => b.alive).length,
      map: this.world.map.name,
    };
    setTimeout(() => this.app.onMatchEnd?.(result), victory ? 2600 : 2200);
  }

  // ---------------------- Bucle ----------------------

  start() {
    if (this.running) return;
    this.running = true;
    this.clock.getDelta();
    this.loop();
  }

  renderWaterRefraction() {
    if (this.paused || !this.world) return;
    const needWater = !!this.world.hasWater?.() && Number(this.settings.get('waterQuality') || 0) >= 1;
    const storm = this.mode === 'playing' ? this.storm : null;
    const needStorm = !!storm?.needsRefraction(this.camera);
    if (!needWater && !needStorm) {
      storm?.dome.setSceneTexture(null, this._drawSize.x, this._drawSize.y);
      return;
    }
    const stormWasVisible = storm ? storm.mesh.visible : false;
    try {
      this.world.setWaterVisible?.(false);
      if (storm) storm.mesh.visible = false;
      this.renderer.setRenderTarget(this.refractionTarget);
      this.renderer.render(this.scene, this.camera);
    } finally {
      this.renderer.setRenderTarget(null);
      this.world.setWaterVisible?.(true);
      if (storm) storm.mesh.visible = stormWasVisible;
    }
    if (needWater) this.world.setRefractionTexture(this.refractionTarget.texture, this._drawSize.x, this._drawSize.y);
    if (storm) {
      storm.dome.setSceneTexture(this.refractionTarget.texture, this._drawSize.x, this._drawSize.y);
      storm.dome.uniforms.uFar.value = this.camera.far;
    }
  }

  renderWaterReflections() {
    if (!this.world?.hasWater?.() || this.paused) return;
    const waterQuality = Number(this.settings.get('waterQuality') || 0);
    if (waterQuality < 1) {
      this.world.setReflectionTexture?.(null, this.reflectionMatrix, false);
      return;
    }
    const planeY = this.world.getReflectionPlaneY?.(this.player?.position || this.camera.position);
    if (!Number.isFinite(planeY) || planeY <= -20) {
      this.world.setReflectionTexture?.(null, this.reflectionMatrix, false);
      return;
    }

    const camera = this.camera;
    camera.updateMatrixWorld();
    const reflector = this._reflectPos.set(camera.position.x, planeY, camera.position.z);
    const view = this._reflectView.copy(camera.position).sub(reflector);
    view.reflect(this._reflectNormal).negate().add(reflector);

    this._reflectRotation.extractRotation(camera.matrixWorld);
    const lookAt = this._reflectLook.set(0, 0, -1).applyMatrix4(this._reflectRotation).add(camera.position);
    const target = this._reflectTarget.copy(reflector).sub(lookAt);
    target.reflect(this._reflectNormal).negate().add(reflector);

    const virtual = this.reflectionCamera;
    virtual.position.copy(view);
    virtual.up.set(0, 1, 0).applyMatrix4(this._reflectRotation).reflect(this._reflectNormal);
    virtual.lookAt(target);
    virtual.near = camera.near;
    virtual.far = camera.far;
    virtual.fov = camera.fov;
    virtual.aspect = camera.aspect;
    virtual.projectionMatrix.copy(camera.projectionMatrix);
    virtual.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
    virtual.updateMatrixWorld();

    this.reflectionMatrix.copy(this._biasMatrix)
      .multiply(virtual.projectionMatrix)
      .multiply(virtual.matrixWorldInverse);

    const prevTarget = this.renderer.getRenderTarget();
    const prevClipping = this.renderer.clippingPlanes;
    this._reflectPlane.set(this._reflectNormal, -planeY);
    const stormMesh = this.storm?.mesh;
    const stormWasVisible = stormMesh ? stormMesh.visible : false;
    try {
      this.world.setWaterVisible(false);
      if (stormMesh) stormMesh.visible = false;
      this.renderer.clippingPlanes = [this._reflectPlane];
      this.renderer.setRenderTarget(this.reflectionTarget);
      this.renderer.render(this.scene, virtual);
    } finally {
      this.renderer.setRenderTarget(prevTarget);
      this.renderer.clippingPlanes = prevClipping;
      this.world.setWaterVisible(true);
      if (stormMesh) stormMesh.visible = stormWasVisible;
    }
    this.world.setReflectionTexture(this.reflectionTarget.texture, this.reflectionMatrix, true, planeY);
  }

  loop = () => {
    if (!this.running) return;
    requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, this.clock.getDelta());
    const elapsed = this.clock.elapsedTime;
    if (!this.paused) {
      this._cartoonTimer -= dt;
      if (this._cartoonTimer <= 0) {
        this._cartoonTimer = 0.75;
        applyCartoonStyle(this.scene, this._cartoonCache);
      }
      if (this.mode === 'preview') {
        this.updatePreview(dt, elapsed);
      } else if (this.mode === 'playing' && this.world && this.player) {
        this.updateMatch(dt);
      }
    }
    this.renderWaterRefraction();
    this.renderWaterReflections();
    const uw = this.underwaterPass?.uniforms;
    const uwActive = uw && (uw.uUnderwater.value > 0.002 || uw.uDropCount.value > 0);
    this.useComposer = !!(this.bloomEnabled || uwActive);
    if (this.useComposer) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
  };

  updateMatch(dt) {
    const player = this.player;
    this.matchTime += dt;

    const mouse = this.input.consumeMouse();
    if (this.mode === 'playing' && player.alive && (this.input.locked || this.input.autoLock)) {
      player.handleMouse(mouse.x, mouse.y);
      if (mouse.wheel) player.inventory.cycle(mouse.wheel > 0 ? 1 : -1);
    }

    if (this.mode === 'playing' && player.alive) {
      this.syncWeaponModel();
      this.world.playerState = { pos: player.position, vx: player.velocity.x, vy: player.velocity.y, vz: player.velocity.z, speed: Math.hypot(player.velocity.x, player.velocity.z), sprinting: player.sprinting, grounded: player.grounded, swimming: player.swimming };
      player.update(dt, this.input);

      if (player.inBus) {
        this.chute.visible = false;
      } else {
        this.chute.visible = player.gliding;
        if (player.gliding) {
          this.chute.position.copy(player.position).add(new THREE.Vector3(0, 0.4, 0));
          this.chute.rotation.y = player.yaw;
        }
        if (this.input.buttons.has(0)) this.fire();
        if (this.input.isDown('KeyR')) player.inventory.reload();
        const near = this.loot.findNear(player.position, 3.4);
        const nearDoor = this.world.findNearestDoor ? this.world.findNearestDoor(player.position, 2.6) : null;
        this.pickupLatch = this.pickupLatch || false;
        this.doorOpening = this.doorOpening || null;
        if (this.input.isDown('KeyB') && !this.buildToggleLatch) { this.buildToggleLatch = true; const on = this.building.toggle(); this.hud.toast(on ? 'Modo construcción ON (Q/E rotar, clic colocar)' : 'Modo construcción OFF', on ? 'good' : 'warn'); }
        if (!this.input.isDown('KeyB')) this.buildToggleLatch = false;
        if (this.building?.enabled) this.building.update(this.player, this.camera, this.input);

        // Auto-abrir puertas al correr (solo en suelo, para no atravesarlas saltando)
        if (nearDoor && !nearDoor.targetOpen) {
          const sp = Math.hypot(player.velocity.x, player.velocity.z);
          if (player.sprinting && sp > 3.5 && player.grounded && !player.jumping) { this.world.setDoorOpen(nearDoor, true); nearDoor.autoClose = 2.5; }
        }

        // Interacción: cofres/puertas con canalización + progreso circular
        const holdE = this.input.isDown('KeyE');
        if (this.chestOpening) {
          const co = this.chestOpening;
          const stillNear = co.entity && !co.entity.dead && co.entity.pos.distanceToSquared(player.position) < 3.6 * 3.6;
          if (!holdE || !stillNear || !player.alive) {
            this.chestOpening = null;
          } else {
            co.time += dt;
            player.character.play('chestOpen', 0.08);
            if (co.time >= co.duration) {
              const res = this.loot.interact(co.entity, player);
              if (res) this.hud.toast(res.text, res.color === '#5bd88a' ? 'good' : '');
              this.audio.play('click');
              this.syncWeaponModel();
              this.chestOpening = null;
              this.pickupLatch = true;
            }
          }
        } else if (this.doorOpening) {
          const od = this.doorOpening;
          const stillNearDoor = od.entity && this.world.findNearestDoor(player.position, 3.0) === od.entity;
          if (!holdE || !stillNearDoor || !player.alive) {
            this.doorOpening = null;
          } else {
            od.time += dt;
            if (od.time >= od.duration) {
              const opened = this.world.toggleDoor(od.entity);
              if (od.entity) od.entity.autoClose = 2.5;
              this.hud.toast(opened ? 'Puerta abierta' : 'Puerta cerrada', 'good');
              this.audio.play('click');
              this.doorOpening = null;
              this.pickupLatch = true;
            }
          }
        } else if (holdE && near && !this.pickupLatch) {
          if (near.isChest) {
            this.chestOpening = { entity: near, time: 0, duration: 1.0 };
            player.character.play('chestOpen', 0.08);
          } else {
            const res = this.loot.interact(near, player);
            if (res) this.hud.toast(res.text, res.color === '#5bd88a' ? 'good' : '');
            this.audio.play('click');
            this.pickupLatch = true;
            this.syncWeaponModel();
          }
        } else if (holdE && nearDoor && !this.pickupLatch) {
          this.doorOpening = { entity: nearDoor, time: 0, duration: 0.5 };
        }
        if (!holdE) { this.pickupLatch = false; if (this.chestOpening) this.chestOpening = null; if (this.doorOpening) this.doorOpening = null; }
      }
    } else if (player && !player.alive) {
      player.character.update(dt);
      this.camera.position.lerp(new THREE.Vector3(player.position.x + 3, player.position.y + 2.5, player.position.z + 3), dt * 1.5);
      this.camera.lookAt(player.position.x, player.position.y + 1, player.position.z);
    }

    // Autobús: sigue su ruta aunque el jugador ya haya saltado (los bots siguen dentro).
    if (this.busRoute && this.bus) {
      this.busTime += dt;
      const r = this.busRoute;
      const onBoard = player.inBus || this.bots.some((b) => b.inBus);
      this.bus.visible = this.busTime < r.duration + 1 && onBoard;
      if (this.bus.visible) {
        // Detrás y por debajo de la plaza del jugador: la cámara nunca queda dentro.
        r.positionAt(this.busTime, this.bus.position).addScaledVector(r.dir, -13);
        this.bus.position.y += -2.2 + Math.sin(player.time * 0.8) * 1.2;
        this.bus.rotation.y = r.yaw;
      }
    } else if (this.bus) this.bus.visible = false;

    // Bots
    if (this.noiseEvents?.length && this.matchTime - this.noiseEvents[0].time > 2) {
      this.noiseEvents = this.noiseEvents.filter((n) => this.matchTime - n.time < 2);
    }
    for (const bot of this.bots) bot.update(dt, player, this.bots, this.storm);
    if (player.alive) this.audio.applyDeaf(!!this.settings.get('deafMode'));

    // Tormenta y daño ambiental
    if (!this.training) {
      // Una sola vez: a los 8 s o cuando el jugador salta, lo que pase antes.
      if (!this.storm.active && (this.matchTime > 8 || !player.inBus)) this.storm.start();
      this.storm.update(dt, player.position);
      this.stormDamageTimer -= dt;
      if (this.stormDamageTimer <= 0 && this.storm.active) {
      this.stormDamageTimer = 0.5;
      if (player.alive) {
        const dmg = this.storm.damageAt(player.position);
        if (dmg > 0) this.onBotHit(player, dmg * 0.5, 'body', { name: 'la tormenta' }, null);
      }
      for (const bot of this.bots) {
        if (!bot.alive) continue;
        const dmg = this.storm.damageAt(bot.position);
        if (dmg > 0) {
          const killed = bot.takeDamage(dmg * 0.5, 'body', { name: 'la tormenta' });
          if (killed) this.handleBotDeath(bot, { name: 'la tormenta' }, 'Tormenta');
        }
      }
      }
    }

    this.world.update(player.position);
    this.world.tick(dt);
    this.world.updateDetailVisibility(player.position);
    this.loot.update(dt, this.matchTime);
    this.effects.update(dt);
    this.hud.update(this, dt);
  }

  setPaused(value) {
    this.paused = value;
    if (value) {
      this.input.autoLock = false;
      this.input.releaseLock();
    } else if (this.mode === 'playing') {
      this.input.autoLock = true;
      this.input.requestLock();
    }
  }

  resume() {
    this.paused = false;
    this.input.autoLock = true;
    this.input.requestLock();
  }

  disposeMatch() {
    this.input.autoLock = false;
    this.input.releaseLock();
    this.hud.unmount();
    for (const bot of this.bots) bot.destroy();
    this.bots.length = 0;
    this.loot?.dispose();
    this.storm?.dispose();
    this.effects?.dispose();
    this.world?.dispose();
    this.player?.character.dispose();
    this.player?.character.group.removeFromParent();
    this.chute?.removeFromParent();
    this.bus?.removeFromParent();
    this.lastWeaponType = null;
    this.player = null;
    this.world = null;
    this.mode = 'preview';
    this.paused = false;
    this.ending = false;
    if (this.preview) this.preview.visible = true;
    this.previewDebug?.setEnabled(!!this.settings.get('debugMode'));
  }
}
