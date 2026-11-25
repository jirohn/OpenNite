import * as THREE from 'three';

/**
 * Cúpula de la tormenta: muro cilíndrico + casquete, hecho de cristales hexagonales
 * casi reflectantes y semitransparentes que refractan lo que hay detrás.
 *
 * - Patrón: textura SVG (public/textures/storm-hex.svg, generada por scripts/build-storm-hex.mjs).
 *   R,G = inclinación aleatoria de cada cristal, B = marco con bisel.
 * - Refracción: muestrea la textura de escena que el juego ya renderiza para el agua
 *   (game.refractionTarget, a media resolución, sin agua ni cúpula).
 * - Reflejo: cielo cartoon de dos bandas + brillo de sol escalonado (estilo toon, sin outline).
 */

const HEX_URL = './textures/storm-hex.svg';
const HEX_ASPECT = 121.2436 / 120; // ancho/alto de un periodo del SVG
const TILE_H = 36;                 // metros de alto de un periodo del SVG (8 filas: hexágonos de ~4,5 m)
const TILE_W = TILE_H * HEX_ASPECT;
const SEGMENTS = 160;
const WALL_RINGS = 2;
const CAP_RINGS = 28;

let hexTexture = null;
function getHexTexture() {
  if (hexTexture) return hexTexture;
  hexTexture = new THREE.TextureLoader().load(HEX_URL);
  hexTexture.wrapS = hexTexture.wrapT = THREE.RepeatWrapping;
  hexTexture.colorSpace = THREE.NoColorSpace; // datos, no color
  hexTexture.anisotropy = 4;
  return hexTexture;
}

/** Geometría unitaria: aTheta (0..1 alrededor) y aProfile (0..1 muro, 1..2 casquete). */
function buildGeometry() {
  const profile = [];
  for (let i = 0; i <= WALL_RINGS; i++) profile.push(i / WALL_RINGS);
  for (let i = 1; i <= CAP_RINGS; i++) profile.push(1 + i / CAP_RINGS);
  const cols = SEGMENTS + 1;
  const theta = new Float32Array(cols * profile.length);
  const prof = new Float32Array(cols * profile.length);
  const pos = new Float32Array(cols * profile.length * 3); // se recalcula en el shader
  let k = 0;
  for (let r = 0; r < profile.length; r++) {
    for (let c = 0; c < cols; c++, k++) {
      theta[k] = c / SEGMENTS;
      prof[k] = profile[r];
    }
  }
  const index = [];
  for (let r = 0; r < profile.length - 1; r++) {
    for (let c = 0; c < SEGMENTS; c++) {
      const a = r * cols + c;
      const b = a + 1;
      const d = a + cols;
      const e = d + 1;
      index.push(a, d, b, b, d, e);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aTheta', new THREE.BufferAttribute(theta, 1));
  geo.setAttribute('aProfile', new THREE.BufferAttribute(prof, 1));
  geo.setIndex(index);
  return geo;
}

const vertexShader = /* glsl */`
  attribute float aTheta;
  attribute float aProfile;
  uniform vec3 uCenter;
  uniform float uRadius;
  uniform float uBaseY;
  uniform float uWallTop;
  uniform float uCapH;
  uniform float uRepeatU;
  varying vec2 vUv;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying vec3 vTangentW;
  varying vec3 vBitanW;
  varying float vCap;
  varying float vRim;
  #include <logdepthbuf_pars_vertex>
  void main() {
    float ang = aTheta * 6.28318530718;
    vec3 radial = vec3(cos(ang), 0.0, sin(ang));
    vec3 tangent = vec3(-sin(ang), 0.0, cos(ang));
    vec3 p;
    vec3 n;
    vec3 bitan;
    if (aProfile <= 1.0) {
      p = uCenter + radial * uRadius;
      p.y = mix(uBaseY, uWallTop, aProfile);
      n = radial;
      bitan = vec3(0.0, 1.0, 0.0);
      vUv = vec2(aTheta * uRepeatU, p.y / ${TILE_H.toFixed(2)});
      vCap = 0.0;
    } else {
      // Casquete elíptico: del borde del muro hasta la cima.
      float phi = (aProfile - 1.0) * 1.5707963;
      float rr = uRadius * cos(phi);
      p = uCenter + radial * rr;
      p.y = uWallTop + uCapH * sin(phi);
      n = normalize(radial * cos(phi) * uCapH + vec3(0.0, 1.0, 0.0) * sin(phi) * uRadius);
      bitan = normalize(cross(tangent, n));
      vUv = (p.xz - uCenter.xz) / vec2(${TILE_W.toFixed(3)}, ${TILE_H.toFixed(2)});
      vCap = 1.0;
    }
    vRim = p.y - uWallTop;
    vWorld = p;
    vNormalW = n;
    vTangentW = tangent;
    vBitanW = bitan;
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
    #include <logdepthbuf_vertex>
  }`;

const fragmentShader = /* glsl */`
  uniform sampler2D uHex;
  uniform sampler2D uScene;
  uniform float uHasScene;
  uniform vec2 uResolution;
  uniform vec3 uColor;
  uniform vec3 uSkyTop;
  uniform vec3 uSkyHorizon;
  uniform vec3 uSunDir;
  uniform float uTime;
  uniform float uFlash;
  uniform float uFar;
  uniform float uOpacity;
  uniform float uRefract;
  varying vec2 vUv;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying vec3 vTangentW;
  varying vec3 vBitanW;
  varying float vCap;
  varying float vRim;
  #include <logdepthbuf_pars_fragment>

  void main() {
    #include <logdepthbuf_fragment>
    vec4 hx = texture2D(uHex, vUv);
    float frame = hx.b;                       // 1 en el marco, bisel hacia dentro
    vec2 tilt = hx.rg * 2.0 - 1.0;            // inclinación propia de cada cristal
    // Gradiente del bisel para que el borde de cada hexágono curve la luz.
    vec2 du = vec2(0.004, 0.0);
    vec2 dv = vec2(0.0, 0.004);
    vec2 bevel = vec2(texture2D(uHex, vUv + du).b - texture2D(uHex, vUv - du).b,
                      texture2D(uHex, vUv + dv).b - texture2D(uHex, vUv - dv).b);

    vec3 nT = normalize(vec3(tilt * 0.22 + bevel * 2.6, 1.0));
    vec3 N = normalize(vNormalW);
    if (!gl_FrontFacing) N = -N;
    vec3 nW = normalize(vTangentW * nT.x + vBitanW * nT.y + N * nT.z);

    vec3 toCam = cameraPosition - vWorld;
    float dist = length(toCam);
    vec3 V = toCam / dist;
    float ndv = clamp(dot(nW, V), 0.0, 1.0);
    // Cada cristal refleja un poco distinto: unos casi espejo, otros más transparentes.
    float mirror = 0.18 + 0.32 * hx.g;
    float fresnel = mirror + (0.9 - mirror) * pow(1.0 - ndv, 3.0);

    // --- Refracción: lo de detrás, desplazado por la cara de cada cristal ---
    vec2 screenUv = gl_FragCoord.xy / uResolution;
    vec3 nV = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
    float near = clamp(60.0 / dist, 0.25, 1.0);
    vec2 offs = nV.xy * uRefract * near;
    vec3 behind;
    if (uHasScene > 0.5) {
      // Ligera dispersión cromática en los biseles.
      float ca = 0.004 * frame * near;
      behind.r = texture2D(uScene, screenUv + offs + nV.xy * ca).r;
      behind.g = texture2D(uScene, screenUv + offs).g;
      behind.b = texture2D(uScene, screenUv + offs - nV.xy * ca).b;
    } else {
      behind = mix(uSkyHorizon, uColor, 0.35);
    }
    float cellShade = 0.78 + 0.3 * hx.r;     // cada cristal con un tono algo distinto
    vec3 glassTint = mix(vec3(1.0), uColor * 1.5, 0.55) * cellShade;
    vec3 refr = behind * glassTint;

    // --- Reflejo: cielo cartoon + sol escalonado ---
    vec3 R = reflect(-V, nW);
    float skyT = smoothstep(-0.05, 0.55, R.y);
    vec3 refl = mix(uSkyHorizon, uSkyTop, skyT);
    refl = mix(refl, uColor * 1.2, 0.35) * (0.9 + 0.25 * hx.r);
    float sun = max(dot(R, normalize(uSunDir)), 0.0);
    float spec = step(0.985, sun) * 0.9 + step(0.93, sun) * 0.25;   // dos bandas, toon

    vec3 col = mix(refr, refl, fresnel) + spec * vec3(1.0, 0.97, 0.9);

    // Marco luminoso de los hexágonos (núcleo duro + halo suave).
    float core = smoothstep(0.82, 0.97, frame);
    float halo = smoothstep(0.25, 0.8, frame);
    vec3 edgeCol = mix(uColor, vec3(1.0), 0.45);
    col = mix(col, edgeCol * 1.25, core * 0.85);
    col += uColor * halo * 0.18;

    // Barrido de luz que recorre la cúpula de vez en cuando.
    float sweep = sin(vWorld.y * 0.03 - uTime * 0.8);
    col += edgeCol * smoothstep(0.96, 1.0, sweep) * (0.12 + core * 0.4);

    // Aro donde el muro se une al casquete (oculta el cambio de mapeado).
    float rim = 1.0 - smoothstep(0.0, 2.2, abs(vRim));
    col = mix(col, edgeCol * 1.3, rim * 0.9);

    col += uColor * uFlash * 1.5;

    float alpha = uOpacity + core * 0.1 + rim * 0.1 + fresnel * 0.08;
    alpha *= 1.0 - smoothstep(uFar * 0.72, uFar * 0.97, dist);
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
    #include <colorspace_fragment>
  }`;

export class StormDome {
  constructor(scene) {
    this.geo = buildGeometry();
    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uHex: { value: getHexTexture() },
        uScene: { value: null },
        uHasScene: { value: 0 },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uCenter: { value: new THREE.Vector3() },
        uRadius: { value: 100 },
        uBaseY: { value: -80 },
        uWallTop: { value: 140 },
        uCapH: { value: 200 },
        uRepeatU: { value: 10 },
        uColor: { value: new THREE.Color(0x8a43ff) },
        uSkyTop: { value: new THREE.Color(0x8ec8f2) },
        uSkyHorizon: { value: new THREE.Color(0xdcefff) },
        uSunDir: { value: new THREE.Vector3(0.4, 0.8, 0.3) },
        uTime: { value: 0 },
        uFlash: { value: 0 },
        uFar: { value: 1000 },
        uOpacity: { value: 0.86 },
        uRefract: { value: 0.06 },
      },
      vertexShader,
      fragmentShader,
    });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.name = 'storm-dome';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  get uniforms() { return this.mat.uniforms; }

  setSky(top, sunDir) {
    if (top) {
      this.uniforms.uSkyTop.value.set(top);
      this.uniforms.uSkyHorizon.value.set(top).lerp(new THREE.Color(0xffffff), 0.62);
    }
    if (sunDir) this.uniforms.uSunDir.value.copy(sunDir);
  }

  /** Coloca la cúpula: centro y radio de la zona segura. */
  setShape(center, radius) {
    const u = this.uniforms;
    u.uCenter.value.set(center.x, 0, center.z);
    u.uRadius.value = radius;
    u.uBaseY.value = -80;
    u.uWallTop.value = 150;
    u.uCapH.value = THREE.MathUtils.clamp(radius * 0.42, 30, 900);
    // Número entero de periodos alrededor para que no haya costura.
    u.uRepeatU.value = Math.max(3, Math.round((Math.PI * 2 * radius) / TILE_W));
  }

  /** Textura de escena (sin agua ni cúpula) para la refracción. */
  setSceneTexture(texture, width, height) {
    this.uniforms.uScene.value = texture;
    this.uniforms.uHasScene.value = texture ? 1 : 0;
    this.uniforms.uResolution.value.set(width, height);
  }

  dispose() {
    this.mesh.removeFromParent();
    this.geo.dispose();
    this.mat.dispose();
  }
}
