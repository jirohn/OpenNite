import * as THREE from 'three';
import { clamp, lerp } from '../core/utils.js';

const PHASES = 9;

/** Tormenta: círculo que se cierra por fases con daño creciente. */
export class Storm {
  constructor(scene, world, game) {
    this.world = world;
    this.game = game;
    this.center = new THREE.Vector3(0, 0, 0);
    this.nextCenter = new THREE.Vector3(0, 0, 0);
    this.radius = Math.min(world.size * 0.72, 3000);
    this.nextRadius = this.radius;
    this.phase = 0;
    this.state = 'waiting';
    this.waitTime = 42;
    this.shrinkTime = 58;
    this.timer = this.waitTime;
    this.dps = 1;
    this.active = false;
    this.lastDamageSound = -100;
    this.time = 0;

    const geo = new THREE.CylinderGeometry(1, 1, 1, 96, 1, true);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(0x8a43ff) },
        uFlash: { value: 0 },
      },
      vertexShader: `
        varying vec2 vUv; varying vec3 vPos;
        void main() {
          vUv = uv; vPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        varying vec2 vUv; varying vec3 vPos;
        uniform float uTime; uniform vec3 uColor; uniform float uFlash;
        void main() {
          float cols = 64.0;
          float rows = 26.0;
          vec2 g = vec2(fract(vUv.x * cols), fract(vUv.y * rows + uTime * 0.09));
          vec2 cell = vec2(floor(vUv.x * cols), floor(vUv.y * rows + uTime * 0.09));
          float jitter = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
          g.y += (jitter - 0.5) * 0.4;
          vec2 d = abs(fract(g) - 0.5);
          float hex = 1.0 - smoothstep(0.34, 0.48, max(d.x, d.y));
          float scan = sin(vUv.y * 120.0 - uTime * 3.0) * 0.5 + 0.5;
          float edge = pow(1.0 - abs(vUv.y - 0.5) * 2.0, 2.0);
          float a = (0.12 + hex * 0.3 + scan * 0.06) * (0.5 + edge * 0.5) + uFlash;
          gl_FragColor = vec4(uColor * (0.8 + hex * 0.6), clamp(a, 0.0, 0.75));
        }`,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.geo = geo;
    this.mat = mat;
  }

  start() {
    this.active = true;
    this.mesh.visible = true;
    this.timer = this.waitTime;
    this.game.onStormEvent?.(`La tormenta empieza en ${Math.ceil(this.timer)}s`, 'warn');
  }

  distanceOutside(pos) {
    if (!this.active) return -Infinity;
    return Math.hypot(pos.x - this.center.x, pos.z - this.center.z) - this.radius;
  }

  damageAt(pos) {
    return this.distanceOutside(pos) > 0 ? this.dps : 0;
  }

  update(dt, playerPos) {
    this.time += dt;
    this.mat.uniforms.uTime.value += dt;
    this.mat.uniforms.uFlash.value = Math.max(0, this.mat.uniforms.uFlash.value - dt * 0.9);
    if (!this.active) return;

    this.timer -= dt;
    if (this.timer <= 0) {
      if (this.state === 'waiting') {
        this.state = 'shrinking';
        this.timer = this.shrinkTime;
        this.phase++;
        const t = this.phase / PHASES;
        this.nextRadius = Math.max(18, this.radius * lerp(0.72, 0.48, t));
        const angle = Math.random() * Math.PI * 2;
        const offset = this.radius * 0.12;
        this.nextCenter.set(this.center.x + Math.cos(angle) * offset, 0, this.center.z + Math.sin(angle) * offset);
        this._shrinkFrom = this.radius;
        this._centerFrom = this.center.clone();
        this.dps = 1 + this.phase * 1.7;
        this.mat.uniforms.uFlash.value = 0.25;
        this.game.audio.play('storm');
        this.game.onStormEvent?.(`Fase ${this.phase}: la tormenta se cierra`, 'warn');
      } else {
        this.state = 'waiting';
        this.timer = Math.max(24, this.waitTime - this.phase * 3);
        this.radius = this.nextRadius;
        this.center.copy(this.nextCenter);
        this.game.onStormEvent?.(`Zona segura: ${Math.round(this.radius)} m`, 'good');
        if (this.phase >= PHASES) {
          this.game.onStormFinal?.();
        }
      }
    }

    if (this.state === 'shrinking') {
      const t = clamp(1 - this.timer / this.shrinkTime, 0, 1);
      this.radius = (this._shrinkFrom ?? this.radius) + (this.nextRadius - (this._shrinkFrom ?? this.radius)) * t;
      this.center.lerpVectors(this._centerFrom || this.center, this.nextCenter, t);
    }

    // Visual: cilindro centrado en el jugador
    const height = 520;
    this.mesh.scale.set(this.radius, height, this.radius);
    this.mesh.position.set(playerPos.x, height / 2 - 90, playerPos.z);
    this.mesh.material.uniforms.uColor.value.setHSL(0.76 - this.phase * 0.012, 0.75, 0.55);
  }

  beginShrinkValues() {
    // Se llama justo después de cambiar a estado shrinking.
    this._shrinkFrom = this.radius;
    this._centerFrom = this.center.clone();
  }

  get timeText() {
    if (!this.active) return '';
    return `${this.state === 'shrinking' ? 'Cerrando' : 'Siguiente'} ${Math.ceil(this.timer)}s · Zona ${Math.round(this.radius)}m`;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.geo.dispose();
    this.mat.dispose();
  }
}
