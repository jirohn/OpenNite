/**
 * OpenNite - Dynamic Zelda TotK Grass & Wind System
 * 
 * Implementación estilizada de hierba 3D con movimiento dinámico
 * por viento (ondas Zelda: Tears of the Kingdom / Breath of the Wild).
 * Soporta fuentes de viento locales personalizadas (objetos) y viento global.
 */

import * as THREE from 'three';
import { getCartoonGradient } from '../core/cartoon.mjs';

const MAX_WIND_SOURCES = 16;

/** Crea la geometría de una mata de hierba estilizada de varias briznas. */
export function createZeldaGrassGeometry() {
  const positions = [];
  const normals = [];
  const colors = [];
  const uvs = [];
  const heightRatios = [];
  const indices = [];

  const baseCol = new THREE.Color('#255e1c'); // Verde raíz profundo
  const midCol = new THREE.Color('#58af24');  // Verde campo TotK
  const tipCol = new THREE.Color('#a2ec3b');  // Amarillo-verde dorado iluminado por sol

  // 4 briznas por mata orientadas en varias direcciones naturales
  const bladeAngles = [0.15, 1.25, 2.45, 3.85];
  const bladeCurvatures = [0.18, -0.22, 0.25, -0.15];
  const bladeHeights = [0.55, 0.70, 0.62, 0.48];
  const bladeWidths = [0.08, 0.09, 0.075, 0.07];

  let vertOffset = 0;

  for (let b = 0; b < 4; b++) {
    const angle = bladeAngles[b];
    const curve = bladeCurvatures[b];
    const h = bladeHeights[b];
    const w = bladeWidths[b];

    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    // Vector lateral perpendicular a la brizna
    const lx = -sinA * (w * 0.5);
    const lz = cosA * (w * 0.5);

    // Segmento 0: Base en el suelo
    positions.push(-lx, 0, -lz);
    positions.push(lx, 0, lz);
    normals.push(0, 1, 0, 0, 1, 0);
    colors.push(baseCol.r, baseCol.g, baseCol.b, baseCol.r, baseCol.g, baseCol.b);
    uvs.push(0, 0, 1, 0);
    heightRatios.push(0.0, 0.0);

    // Segmento 1: Medio (con ligera curvatura natural)
    const midX = cosA * curve;
    const midZ = sinA * curve;
    const midW = w * 0.65;
    const midLx = -sinA * (midW * 0.5);
    const midLz = cosA * (midW * 0.5);
    positions.push(midX - midLx, h * 0.5, midZ - midLz);
    positions.push(midX + midLx, h * 0.5, midZ + midLz);
    normals.push(0, 0.8, 0.2, 0, 0.8, 0.2);
    colors.push(midCol.r, midCol.g, midCol.b, midCol.r, midCol.g, midCol.b);
    uvs.push(0, 0.5, 1, 0.5);
    heightRatios.push(0.5, 0.5);

    // Segmento 2: Punta afilada
    const tipX = cosA * curve * 2.2;
    const tipZ = sinA * curve * 2.2;
    positions.push(tipX, h, tipZ);
    normals.push(0, 0.7, 0.7);
    colors.push(tipCol.r, tipCol.g, tipCol.b);
    uvs.push(0.5, 1.0);
    heightRatios.push(1.0);

    // Índices para formar los quads/triángulos:
    // Quad inferior: (0, 1, 2) y (2, 1, 3)
    indices.push(vertOffset, vertOffset + 1, vertOffset + 2);
    indices.push(vertOffset + 2, vertOffset + 1, vertOffset + 3);
    // Doble cara para visualización cel-shading
    indices.push(vertOffset + 2, vertOffset + 1, vertOffset);
    indices.push(vertOffset + 3, vertOffset + 1, vertOffset + 2);

    // Triángulo superior: (2, 3, 4)
    indices.push(vertOffset + 2, vertOffset + 3, vertOffset + 4);
    indices.push(vertOffset + 4, vertOffset + 3, vertOffset + 2);

    vertOffset += 5;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('aHeightRatio', new THREE.Float32BufferAttribute(heightRatios, 1));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  return geo;
}

/**
 * Crea el material cel-shading con desplazamiento por viento
 * integrado en el vertex shader.
 */
export function createZeldaGrassMaterial(options = {}) {
  const gradient = getCartoonGradient();

  const uniforms = {
    uTime: { value: 0.0 },
    uGlobalWind: { value: new THREE.Vector2(1.2, 0.8) },
    uGlobalWindForce: { value: 1.0 },
    uNumWinds: { value: 0 },
    uWindPositions: { value: new Float32Array(MAX_WIND_SOURCES * 3) },
    uWindDirs: { value: new Float32Array(MAX_WIND_SOURCES * 2) },
    uWindStrengths: { value: new Float32Array(MAX_WIND_SOURCES) },
    uWindRadii: { value: new Float32Array(MAX_WIND_SOURCES) },
  };

  const mat = new THREE.MeshToonMaterial({
    color: 0xffffff,
    vertexColors: true,
    gradientMap: gradient,
    side: THREE.DoubleSide,
    wireframe: false,
  });

  mat.customProgramCacheKey = () => 'opennite-zelda-grass-wind-v1';

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uGlobalWind = uniforms.uGlobalWind;
    shader.uniforms.uGlobalWindForce = uniforms.uGlobalWindForce;
    shader.uniforms.uNumWinds = uniforms.uNumWinds;
    shader.uniforms.uWindPositions = uniforms.uWindPositions;
    shader.uniforms.uWindDirs = uniforms.uWindDirs;
    shader.uniforms.uWindStrengths = uniforms.uWindStrengths;
    shader.uniforms.uWindRadii = uniforms.uWindRadii;

    shader.vertexShader = `
      attribute float aHeightRatio;
      uniform float uTime;
      uniform vec2 uGlobalWind;
      uniform float uGlobalWindForce;
      uniform int uNumWinds;
      uniform vec3 uWindPositions[${MAX_WIND_SOURCES}];
      uniform vec2 uWindDirs[${MAX_WIND_SOURCES}];
      uniform float uWindStrengths[${MAX_WIND_SOURCES}];
      uniform float uWindRadii[${MAX_WIND_SOURCES}];
    ` + shader.vertexShader;

    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `
      #include <begin_vertex>

      // Altura relativa al suelo: 0 en la raíz, 1 en la punta
      float hFactor = clamp(aHeightRatio, 0.0, 1.0);
      float bend = hFactor * hFactor;

      #ifdef USE_INSTANCING
        vec4 worldP = instanceMatrix * vec4(position, 1.0);
      #else
        vec4 worldP = modelMatrix * vec4(position, 1.0);
      #endif

      // 1. Onda ambiental estilo Zelda (suave vaivén de pradera)
      float ripple = sin(uTime * 2.8 + worldP.x * 0.35 + worldP.z * 0.35) * 0.65
                   + sin(uTime * 4.6 + worldP.x * 0.65 - worldP.z * 0.5) * 0.35;

      vec2 compositeWind = uGlobalWind * (uGlobalWindForce * (1.0 + ripple * 0.35));

      // 2. Fuentes de viento locales (objetos de viento en el mapa)
      for (int i = 0; i < ${MAX_WIND_SOURCES}; i++) {
        if (i >= uNumWinds) break;
        vec3 wPos = uWindPositions[i];
        vec2 wDir = uWindDirs[i];
        float wStr = uWindStrengths[i];
        float wRad = uWindRadii[i];

        float dist = distance(worldP.xz, wPos.xz);
        if (dist < wRad) {
          float falloff = 1.0 - smoothstep(0.0, wRad, dist);
          float gust = 1.0 + 0.35 * sin(uTime * 5.5 + dist * 0.7);
          compositeWind += wDir * (wStr * falloff * gust);
        }
      }

      // Desplazamiento orgánico en el plano horizontal (X, Z)
      transformed.x += compositeWind.x * bend * 0.32;
      transformed.z += compositeWind.y * bend * 0.32;

      // Compensación de altura al doblarse para evitar estiramiento irreal
      float windLen = length(compositeWind);
      transformed.y -= clamp(windLen * bend * 0.06, 0.0, 0.25);
      `
    );
  };

  mat.userData.uniforms = uniforms;
  return mat;
}

/**
 * Gestor del sistema de hierba animada de Zelda TotK.
 */
export class ZeldaGrassSystem {
  constructor(scene, options = {}) {
    this.scene = scene;
    this.geometry = createZeldaGrassGeometry();
    this.material = createZeldaGrassMaterial(options);
    this.uniforms = this.material.userData.uniforms;
    this.mesh = null;
    this.count = 0;
    this.winds = [];
    this.dummy = new THREE.Object3D();
  }

  /** Sincroniza la lista de fuentes de viento activas con los uniforms. */
  setWinds(windsList = []) {
    this.winds = Array.isArray(windsList) ? windsList : [];
    const count = Math.min(this.winds.length, MAX_WIND_SOURCES);
    this.uniforms.uNumWinds.value = count;

    for (let i = 0; i < count; i++) {
      const w = this.winds[i];
      const idx3 = i * 3;
      const idx2 = i * 2;
      this.uniforms.uWindPositions.value[idx3] = w.x || 0;
      this.uniforms.uWindPositions.value[idx3 + 1] = w.y || 0;
      this.uniforms.uWindPositions.value[idx3 + 2] = w.z || 0;

      const rot = Number(w.rot) || 0;
      // Vector de dirección en XZ
      this.uniforms.uWindDirs.value[idx2] = -Math.sin(rot);
      this.uniforms.uWindDirs.value[idx2 + 1] = -Math.cos(rot);

      this.uniforms.uWindStrengths.value[i] = Number(w.strength) || 2.5;
      this.uniforms.uWindRadii.value[i] = Number(w.radius) || 40.0;
    }
  }

  /** Añade o actualiza una fuente de viento. */
  addOrUpdateWind(wind) {
    if (!wind) return;
    const existing = this.winds.find(w => w.id === wind.id);
    if (existing) {
      Object.assign(existing, wind);
    } else {
      this.winds.push(wind);
    }
    this.setWinds(this.winds);
  }

  /** Elimina una fuente de viento. */
  removeWind(windId) {
    this.winds = this.winds.filter(w => w.id !== windId);
    this.setWinds(this.winds);
  }

  /**
   * Pobla la malla instanciada a partir de los puntos de césped colocados
   * y las áreas verdes del terreno.
   */
  populate(instances = []) {
    if (this.mesh) {
      this.mesh.removeFromParent();
      this.mesh.dispose();
      this.mesh = null;
    }

    if (!instances || !instances.length) return;

    this.count = instances.length;
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, this.count);
    this.mesh.name = 'zelda-dynamic-grass';
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;

    for (let i = 0; i < instances.length; i++) {
      const inst = instances[i];
      this.dummy.position.set(inst.x, inst.y, inst.z);
      this.dummy.rotation.set(0, inst.rot || Math.random() * Math.PI * 2, 0);
      const s = inst.scale || (0.8 + Math.random() * 0.4);
      this.dummy.scale.set(s, s * (0.9 + Math.random() * 0.3), s);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }

    this.mesh.instanceMatrix.needsUpdate = true;
    this.scene.add(this.mesh);
  }

  /** Actualización por fotograma: avanza el tiempo de animación y ondas de viento. */
  update(dt) {
    if (this.uniforms?.uTime) {
      this.uniforms.uTime.value += dt;
    }
  }

  dispose() {
    if (this.mesh) {
      this.mesh.removeFromParent();
      this.mesh.dispose();
      this.mesh = null;
    }
    this.geometry?.dispose();
    this.material?.dispose();
  }
}

/**
 * Crea un Gizmo 3D llamativo e interactivo para visualizar una fuente de viento
 * en el editor de mapas (flecha estilizada celeste TotK con anillos de vórtice).
 */
export function createWindGizmo(wind, isSelected = false) {
  const group = new THREE.Group();
  group.name = `wind-gizmo-${wind.id}`;
  group.userData = {
    isWindGizmo: true,
    windId: wind.id,
    wind,
  };

  const rot = Number(wind.rot) || 0;
  const strength = Number(wind.strength) || 2.5;
  const radius = Number(wind.radius) || 40.0;

  const arrowLen = Math.max(1.8, Math.min(6.0, 1.2 + strength * 0.6));
  const mainColor = isSelected ? 0xffea00 : 0x00f0ff; // Amarillo si está seleccionado, celeste si no

  // 1. Cuerpo de la flecha (cilindro esbelto)
  const shaftGeo = new THREE.CylinderGeometry(0.08, 0.08, arrowLen, 8);
  shaftGeo.rotateX(Math.PI / 2);
  shaftGeo.translate(0, 0, arrowLen * 0.5);
  const shaftMat = new THREE.MeshBasicMaterial({ color: mainColor });
  const shaft = new THREE.Mesh(shaftGeo, shaftMat);
  group.add(shaft);

  // 2. Punta aerodinámica de la flecha
  const headGeo = new THREE.ConeGeometry(0.32, 0.7, 8);
  headGeo.rotateX(Math.PI / 2);
  headGeo.translate(0, 0, arrowLen + 0.35);
  const headMat = new THREE.MeshBasicMaterial({ color: mainColor });
  const head = new THREE.Mesh(headGeo, headMat);
  group.add(head);

  // 3. Dos anillos de vórtice de viento orbitando el eje
  for (let r = 0; r < 2; r++) {
    const ringGeo = new THREE.TorusGeometry(0.35 + r * 0.18, 0.03, 6, 16);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x90f7ff, transparent: true, opacity: 0.85 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.z = arrowLen * (0.3 + r * 0.35);
    ring.rotation.z = r * 0.8;
    group.add(ring);
  }

  // 4. Círculo de suelo punteado/transparente que muestra el radio de influencia
  const circleSegs = 32;
  const circlePoints = [];
  for (let i = 0; i <= circleSegs; i++) {
    const theta = (i / circleSegs) * Math.PI * 2;
    circlePoints.push(new THREE.Vector3(Math.cos(theta) * radius, 0.05, Math.sin(theta) * radius));
  }
  const circleGeo = new THREE.BufferGeometry().setFromPoints(circlePoints);
  const circleMat = new THREE.LineBasicMaterial({
    color: mainColor,
    transparent: true,
    opacity: isSelected ? 0.7 : 0.25,
  });
  const circleLine = new THREE.Line(circleGeo, circleMat);
  group.add(circleLine);

  // Posicionar y orientar según los datos del viento
  group.position.set(wind.x || 0, (wind.y || 0) + 0.5, wind.z || 0);
  group.rotation.y = rot;

  return group;
}
