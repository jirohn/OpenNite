import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

/** Postprocesado: desenfoque/tenaz submarino y lentes de gotas sobre la imagen. */
export class UnderwaterPass extends Pass {
  constructor() {
    super();
    const drops = Array.from({ length: 12 }, () => new THREE.Vector4(0, 0, 0, 0));
    this.uniforms = {
      tDiffuse: { value: null },
      uTime: { value: 0 },
      uUnderwater: { value: 0 },
      uAspect: { value: 1 },
      uResolution: { value: new THREE.Vector2(1280, 720) },
      uDrops: { value: drops },
      uDropCount: { value: 0 },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      depthTest: false,
      depthWrite: false,
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float uTime;
        uniform float uUnderwater;
        uniform float uAspect;
        uniform vec2 uResolution;
        uniform vec4 uDrops[12];
        uniform float uDropCount;
        varying vec2 vUv;

        vec3 sampleBlur(vec2 uv, float radiusPx) {
          vec2 px = radiusPx / uResolution;
          vec3 sum = texture2D(tDiffuse, uv).rgb * 0.22;
          sum += texture2D(tDiffuse, uv + vec2( px.x, 0.0)).rgb * 0.10;
          sum += texture2D(tDiffuse, uv + vec2(-px.x, 0.0)).rgb * 0.10;
          sum += texture2D(tDiffuse, uv + vec2(0.0,  px.y)).rgb * 0.10;
          sum += texture2D(tDiffuse, uv + vec2(0.0, -px.y)).rgb * 0.10;
          sum += texture2D(tDiffuse, uv + px * 0.7).rgb * 0.095;
          sum += texture2D(tDiffuse, uv - px * 0.7).rgb * 0.095;
          sum += texture2D(tDiffuse, uv + vec2(px.x, -px.y) * 0.7).rgb * 0.095;
          sum += texture2D(tDiffuse, uv + vec2(-px.x, px.y) * 0.7).rgb * 0.095;
          return sum;
        }

        void main() {
          vec2 uv = vUv;
          vec3 col = texture2D(tDiffuse, uv).rgb;
          float uw = clamp(uUnderwater, 0.0, 1.0);

          if (uw > 0.001) {
            col = sampleBlur(uv, 3.4 * uw);
            // Tin azul submarino
            col = mix(col, col * vec3(0.52, 0.86, 1.28) + vec3(0.01, 0.045, 0.10), 0.48 * uw);
            float d = length((uv - 0.5) * vec2(uAspect, 1.0));
            col *= 1.0 - 0.32 * uw * smoothstep(0.25, 0.85, d);
          }

          // Gotas: lentes que deforman la imagen bajo ellas.
          for (int i = 0; i < 12; i++) {
            if (float(i) >= uDropCount) break;
            vec4 drop = uDrops[i];
            if (drop.w <= 0.001) continue;
            vec2 diff = (uv - drop.xy) * vec2(uAspect, 1.0);
            diff.y *= 0.88;
            float dist = length(diff);
            float r = max(drop.z, 0.0001);
            if (dist >= r) continue;
            float k = 1.0 - dist / r;
            vec2 lensUv = drop.xy + (uv - drop.xy) * (1.0 - 0.30 * k * k);
            vec3 lens = texture2D(tDiffuse, clamp(lensUv, 0.001, 0.999)).rgb;
            float rim = smoothstep(0.70, 1.0, dist / r);
            lens += vec3(0.09, 0.15, 0.20) * rim * drop.w;
            lens += vec3(0.05) * pow(k, 5.0);
            col = mix(col, lens, drop.w * smoothstep(0.0, 0.18, k));
          }
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    this.fsQuad = new FullScreenQuad(this.material);
  }

  render(renderer, writeBuffer, readBuffer) {
    this.uniforms.tDiffuse.value = readBuffer.texture;
    if (this.renderToScreen) renderer.setRenderTarget(null);
    else renderer.setRenderTarget(writeBuffer);
    this.fsQuad.render(renderer);
  }

  setSize(width, height) {
    this.uniforms.uResolution.value.set(width, height);
    this.uniforms.uAspect.value = width / Math.max(1, height);
  }

  dispose() {
    this.material.dispose();
    this.fsQuad.dispose();
  }
}
