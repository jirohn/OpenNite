import * as THREE from 'three';
import { clamp, lerp } from '../core/utils.js';
import { StormDome } from './storm-dome.js';

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

    // Cúpula de cristales hexagonales (ver storm-dome.js).
    this.dome = new StormDome(scene);
    this.dome.setSky(world.theme?.sky, world.sunDirection);
    this.mesh = this.dome.mesh;
    this.mat = this.dome.mat;
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

    // Visual: cúpula centrada en la zona segura.
    this.dome.setShape(this.center, this.radius);
    this.mat.uniforms.uColor.value.setHSL(0.76 - this.phase * 0.012, 0.75, 0.55);
  }

  /** ¿Necesita la cúpula la textura de refracción este frame? (solo si está al alcance de la cámara) */
  needsRefraction(camera) {
    if (!this.active || !this.mesh.visible) return false;
    const p = camera.position;
    const d = Math.abs(Math.hypot(p.x - this.center.x, p.z - this.center.z) - this.radius);
    const capTop = 150 + this.dome.uniforms.uCapH.value;
    return d < camera.far || Math.abs(p.y - capTop) < camera.far;
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
    this.dome.dispose();
  }
}
