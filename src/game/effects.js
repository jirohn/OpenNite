import * as THREE from 'three';
import { clamp } from '../core/utils.js';

function radialTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, inner);
  grad.addColorStop(0.35, inner);
  grad.addColorStop(1, outer);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

function bulletHoleTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(10,10,12,0.95)');
  grad.addColorStop(0.35, 'rgba(30,28,26,0.75)');
  grad.addColorStop(0.7, 'rgba(120,110,95,0.28)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

/** Sistema de partículas, trazadoras, impactos y destellos agrupados en pocos draws. */
export class Effects {
  constructor(scene, settings) {
    this.scene = scene;
    this.settings = settings;
    this.root = new THREE.Group();
    scene.add(this.root);
    const fx = this.scale;
    this.maxParticles = Math.max(48, settings.get('maxParticles') || 320);
    this.maxTracers = fx <= 0.3 ? 24 : fx <= 0.6 ? 48 : 96;
    this.maxDecals = fx <= 0.3 ? 12 : fx <= 0.6 ? 24 : 48;
    this.maxFlashes = fx <= 0.3 ? 8 : fx <= 0.6 ? 14 : 24;
    this.maxWaves = fx <= 0.3 ? 2 : fx <= 0.6 ? 4 : 8;
    this.time = 0;
    this.floatingTexts = [];
    this.disposables = [];
    this.initParticles();
    this.initTracers();
    this.initDecals();
    this.initFlashes();
    this.initShockwaves();
  }

  get scale() { return this.settings.get('effects') ?? 1; }

  initParticles() {
    const n = this.maxParticles;
    this.pPos = new Float32Array(n * 3);
    this.pCol = new Float32Array(n * 3);
    this.pSize = new Float32Array(n);
    this.pAlpha = new Float32Array(n);
    this.pVel = new Float32Array(n * 3);
    this.pLife = new Float32Array(n);
    this.pMax = new Float32Array(n);
    this.pGrav = new Float32Array(n);
    this.pCursor = 0;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.pCol, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.pSize, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.pAlpha, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {},
      vertexShader: `
        attribute vec3 aColor; attribute float aSize; attribute float aAlpha;
        varying vec3 vColor; varying float vAlpha;
        void main() {
          vColor = aColor; vAlpha = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * (320.0 / max(1.0, -mv.z));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vColor; varying float vAlpha;
        void main() {
          vec2 d = gl_PointCoord - 0.5;
          float r = length(d);
          if (r > 0.5) discard;
          float a = smoothstep(0.5, 0.05, r) * vAlpha;
          gl_FragColor = vec4(vColor, a);
        }`,
    });
    this.particles = new THREE.Points(geo, mat);
    this.particles.frustumCulled = false;
    this.root.add(this.particles);
    this.disposables.push(geo, mat);
  }

  initTracers() {
    const n = this.maxTracers;
    this.tPos = new Float32Array(n * 6);
    this.tCol = new Float32Array(n * 6);
    this.tLife = new Float32Array(n);
    this.tMax = new Float32Array(n);
    this.tCursor = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.tPos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.tCol, 3));
    const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    this.tracers = new THREE.LineSegments(geo, mat);
    this.tracers.frustumCulled = false;
    this.root.add(this.tracers);
    this.disposables.push(geo, mat);
  }

  initDecals() {
    const tex = bulletHoleTexture();
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.8, polygonOffset: true, polygonOffsetFactor: -4 });
    const geo = new THREE.PlaneGeometry(0.42, 0.42);
    this.decalPool = [];
    for (let i = 0; i < this.maxDecals; i++) {
      const mesh = new THREE.Mesh(geo, mat.clone());
      mesh.visible = false;
      mesh.renderOrder = 3;
      this.root.add(mesh);
      this.decalPool.push({ mesh, life: 0, max: 14 });
    }
    this.decalCursor = 0;
    this.disposables.push(tex, geo, mat);
  }

  initFlashes() {
    const tex = radialTexture('rgba(255,224,150,1)', 'rgba(255,110,20,0)');
    const geo = new THREE.PlaneGeometry(1, 1);
    this.flashPool = [];
    for (let i = 0; i < this.maxFlashes; i++) {
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      this.root.add(mesh);
      this.flashPool.push({ mesh, life: 0, max: 0.09 });
    }
    this.flashCursor = 0;
    this.disposables.push(tex, geo);
  }

  initShockwaves() {
    const geo = new THREE.RingGeometry(0.6, 0.85, 32);
    this.wavePool = [];
    for (let i = 0; i < this.maxWaves; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffb45a, transparent: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      this.root.add(mesh);
      this.wavePool.push({ mesh, life: 0, max: 0.5, size: 1 });
    }
    this.waveCursor = 0;
    this.disposables.push(geo);
  }

  particle(pos, vel, color, size = 0.16, life = 0.6, gravity = 9) {
    const i = this.pCursor++ % this.maxParticles;
    const c = new THREE.Color(color);
    this.pPos[i * 3] = pos.x; this.pPos[i * 3 + 1] = pos.y; this.pPos[i * 3 + 2] = pos.z;
    this.pVel[i * 3] = vel.x; this.pVel[i * 3 + 1] = vel.y; this.pVel[i * 3 + 2] = vel.z;
    this.pCol[i * 3] = c.r; this.pCol[i * 3 + 1] = c.g; this.pCol[i * 3 + 2] = c.b;
    this.pSize[i] = size;
    this.pLife[i] = life;
    this.pMax[i] = life;
    this.pAlpha[i] = 1;
    this.pGrav[i] = gravity;
  }

  burst(pos, count, color, opts = {}) {
    const n = Math.max(1, Math.floor(count * this.scale));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = (Math.random() - 0.2) * Math.PI * 0.7;
      const s = (opts.speed || 4) * (0.35 + Math.random() * 0.9);
      const vel = new THREE.Vector3(Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s + (opts.lift || 1.5), Math.sin(a) * Math.cos(e) * s);
      const p = pos.clone().addScaledVector(vel, Math.random() * 0.03);
      this.particle(p, vel, Array.isArray(color) ? color[Math.floor(Math.random() * color.length)] : color,
        (opts.size || 0.18) * (0.5 + Math.random()), (opts.life || 0.55) * (0.6 + Math.random() * 0.8), opts.gravity ?? 9);
    }
  }

  tracer(from, to, color = 0xffd27a) {
    const i = this.tCursor++ % this.maxTracers;
    this.tPos.set([from.x, from.y, from.z, to.x, to.y, to.z], i * 6);
    const c = new THREE.Color(color);
    const fade = clamp(0.55 + this.scale * 0.35, 0.4, 1);
    this.tCol.set([c.r * fade, c.g * fade, c.b * fade, c.r * fade * 0.25, c.g * fade * 0.25, c.b * fade * 0.25], i * 6);
    this.tLife[i] = 0.12;
    this.tMax[i] = 0.12;
  }

  muzzle(pos, dir, color = 0xffc158) {
    const facing = new THREE.Vector3(0, 0, 1);
    const s = (0.42 + Math.random() * 0.32) * (0.5 + this.scale * 0.5);
    // Núcleo blanco caliente + cola ámbar: el disparo se lee incluso de día.
    const core = this.flashPool[this.flashCursor++ % this.flashPool.length];
    core.mesh.position.copy(pos).addScaledVector(dir, 0.14);
    core.mesh.quaternion.setFromUnitVectors(facing, dir);
    core.mesh.scale.set(s * 0.72, s * 0.72, s * 0.72);
    core.mesh.material.color.set(0xfff3cf);
    core.mesh.material.opacity = 1;
    core.mesh.visible = true;
    core.life = core.max;

    if (this.scale > 0.35) {
      const tail = this.flashPool[this.flashCursor++ % this.flashPool.length];
      tail.mesh.position.copy(pos).addScaledVector(dir, 0.36);
      tail.mesh.quaternion.setFromUnitVectors(facing, dir);
      tail.mesh.scale.set(s * 1.6, s * 0.95, s);
      tail.mesh.material.color.set(color);
      tail.mesh.material.opacity = 0.88;
      tail.mesh.visible = true;
      tail.life = tail.max * 0.8;
    }

    this.burst(pos, this.scale <= 0.3 ? 3 : 9, [color, 0xfff0b0], { speed: 4.2, size: 0.12, life: 0.14, gravity: 2 });
    if (this.scale > 0.35) this.burst(pos, 4, 0x6b6258, { speed: 1.1, size: 0.22, life: 0.28, gravity: -0.3 });
  }

  impact(pos, normal, surface = 'stone') {
    const colors = {
      stone: [0xbdb6a3, 0x8e887c, 0xd8d0bd],
      wood: [0x9c7048, 0xc39a68, 0x6b4a30],
      metal: [0xfff0b0, 0xffae45, 0xd8dde4],
      terrain: [0x8a7b5e, 0x6e8f59, 0xa8a08a],
      flesh: [0xff4d5e, 0xd42c45, 0xff8a8a],
      shield: [0x4dc8ff, 0xa2e8ff, 0x2a8dff],
    }[surface] || [0xbfb7a5];
    const low = this.scale <= 0.3;
    this.burst(pos, surface === 'flesh' ? (low ? 6 : 16) : (low ? 5 : 12), colors, { speed: surface === 'flesh' ? 3 : 5.5, size: 0.13, life: 0.45, gravity: 12 });
    if ((surface === 'metal' || surface === 'stone') && !low) {
      // Chispas breves y destello en impactos duros.
      this.burst(pos, 8, [0xfff2b0, 0xffa83c], { speed: 7, size: 0.07, life: 0.16, gravity: 18 });
      const glow = this.flashPool[this.flashCursor++ % this.flashPool.length];
      glow.mesh.position.copy(pos).addScaledVector(normal, 0.06);
      glow.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
      glow.mesh.scale.setScalar(0.3 + this.scale * 0.16);
      glow.mesh.material.color.set(surface === 'metal' ? 0xffd98a : 0xd8c8a8);
      glow.mesh.material.opacity = 0.75;
      glow.mesh.visible = true;
      glow.life = glow.max * 0.55;
    } else if (surface === 'terrain' && !low) {
      this.burst(pos, 10, [0x9c8b68, 0x75835c], { speed: 2.4, size: 0.3, life: 0.6, gravity: 3 });
    }
    if (surface !== 'flesh' && surface !== 'shield') {
      const item = this.decalPool[this.decalCursor++ % this.decalPool.length];
      item.mesh.position.copy(pos).addScaledVector(normal, 0.035);
      item.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
      item.mesh.rotateZ(Math.random() * Math.PI * 2);
      const s = 0.7 + Math.random() * 0.6;
      item.mesh.scale.set(s, s, s);
      item.mesh.material.opacity = 0.85;
      item.mesh.visible = true;
      item.life = item.max;
    }
  }

  explosion(pos, radius = 5) {
    // Bola de fuego, humo, escombros y dos ondas de choque concéntricas.
    this.burst(pos, 110 * this.scale, [0xfff4c0, 0xffdd66, 0xff8a2b], { speed: 14, size: 0.5, life: 0.55, gravity: 5 });
    this.burst(pos, 70 * this.scale, [0xff8a2b, 0xff4b25, 0x7a2c18], { speed: 8, size: 0.75, life: 1.1, gravity: 7 });
    this.burst(pos, 55 * this.scale, [0x6c6a64, 0x3d3b39], { speed: 3.4, size: 1.3, life: 2.2, gravity: -0.25 });
    this.burst(pos, 45 * this.scale, [0x8f7355, 0x5e4a35], { speed: 9, size: 0.22, life: 1.4, gravity: 16 });

    for (const [key, size, color, opacity] of [
      ['outer', radius, 0xffb45a, 0.95],
      ['inner', radius * 0.55, 0xfff0c0, 0.8],
    ]) {
      const item = this.wavePool[this.waveCursor++ % this.wavePool.length];
      item.mesh.position.copy(pos);
      item.mesh.rotation.set(-Math.PI / 2, 0, 0);
      item.mesh.material.color.set(color);
      item.mesh.visible = true;
      item.mesh.material.opacity = opacity;
      item.life = item.max * (key === 'inner' ? 0.7 : 1);
      item.size = size;
    }

    const core = this.flashPool[this.flashCursor++ % this.flashPool.length];
    core.mesh.position.copy(pos);
    core.mesh.quaternion.identity();
    core.mesh.scale.setScalar(radius * 0.65);
    core.mesh.material.color.set(0xfff2c0);
    core.mesh.material.opacity = 0.9;
    core.mesh.visible = true;
    core.life = core.max * 1.6;
  }

  floatingText(pos, text, color = '#ffffff') {
    this.floatingTexts.push({ pos: pos.clone(), text, color, life: 1.05, max: 1.05 });
    if (this.floatingTexts.length > 40) this.floatingTexts.shift();
  }

  update(dt) {
    this.time += dt;
    // Partículas
    let pActive = false;
    for (let i = 0; i < this.maxParticles; i++) {
      if (this.pLife[i] <= 0) { if (this.pAlpha[i] !== 0) { this.pAlpha[i] = 0; pActive = true; } continue; }
      pActive = true;
      this.pLife[i] -= dt;
      const k = i * 3;
      this.pVel[k + 1] -= this.pGrav[i] * dt;
      this.pPos[k] += this.pVel[k] * dt;
      this.pPos[k + 1] += this.pVel[k + 1] * dt;
      this.pPos[k + 2] += this.pVel[k + 2] * dt;
      const t = clamp(this.pLife[i] / this.pMax[i], 0, 1);
      this.pAlpha[i] = t * t;
    }
    if (pActive) {
      this.particles.geometry.attributes.position.needsUpdate = true;
      this.particles.geometry.attributes.aAlpha.needsUpdate = true;
      this.particles.geometry.attributes.aColor.needsUpdate = true;
      this.particles.geometry.attributes.aSize.needsUpdate = true;
    }

    // Trazadoras
    let tActive = false;
    for (let i = 0; i < this.maxTracers; i++) {
      if (this.tLife[i] <= 0) continue;
      tActive = true;
      this.tLife[i] -= dt;
      const t = clamp(this.tLife[i] / this.tMax[i], 0, 1);
      for (let j = 0; j < 6; j++) this.tCol[i * 6 + j] *= t > 0 ? 1 - dt * 2.2 : 0;
      if (this.tLife[i] <= 0) {
        for (let j = 0; j < 6; j++) this.tCol[i * 6 + j] = 0;
      }
    }
    if (tActive) {
      this.tracers.geometry.attributes.color.needsUpdate = true;
      this.tracers.geometry.attributes.position.needsUpdate = true;
    }

    // Decals
    for (const d of this.decalPool) {
      if (d.life <= 0) continue;
      d.life -= dt;
      d.mesh.material.opacity = clamp(d.life / d.max, 0, 1) * 0.85;
      if (d.life <= 0) d.mesh.visible = false;
    }
    // Destellos
    for (const f of this.flashPool) {
      if (f.life <= 0) continue;
      f.life -= dt;
      f.mesh.material.opacity = clamp(f.life / f.max, 0, 1);
      if (f.life <= 0) f.mesh.visible = false;
    }
    // Ondas
    for (const w of this.wavePool) {
      if (w.life <= 0) continue;
      w.life -= dt;
      const t = 1 - clamp(w.life / w.max, 0, 1);
      const s = 0.5 + t * w.size;
      w.mesh.scale.set(s, s, s);
      w.mesh.material.opacity = (1 - t) * 0.9;
      if (w.life <= 0) w.mesh.visible = false;
    }
    // Textos flotantes
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.life -= dt;
      ft.pos.y += dt * 0.9;
      if (ft.life <= 0) this.floatingTexts.splice(i, 1);
    }
  }

  clear() {
    this.pLife.fill(0);
    this.pAlpha.fill(0);
    this.tLife.fill(0);
    this.tCol.fill(0);
    this.floatingTexts.length = 0;
    for (const d of this.decalPool) { d.life = 0; d.mesh.visible = false; }
    for (const f of this.flashPool) { f.life = 0; f.mesh.visible = false; }
    for (const w of this.wavePool) { w.life = 0; w.mesh.visible = false; }
  }

  dispose() {
    this.root.removeFromParent();
    for (const d of this.disposables) d.dispose?.();
    for (const f of this.flashPool) f.mesh.material.dispose();
    for (const d of this.decalPool) d.mesh.material.dispose();
    for (const w of this.wavePool) w.mesh.material.dispose();
  }
}
