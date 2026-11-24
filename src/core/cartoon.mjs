import * as THREE from 'three';

let toonGradient = null;

/**
 * Gradiente de iluminación cel-shaded estilo Zelda: Tears of the Kingdom.
 * 3 bandas calibradas con micro-suavizado en los umbrales para eliminar el aliasing:
 *   - Sombra ambiental (tintada por el cielo, suave, sin negros muertos)
 *   - Tono medio (color albedo vibrante)
 *   - Luz solar directa (resalte cálido)
 * Sin contornos negros artificiales (no outline), destacando la geometría low-poly estilizada.
 */
export function getCartoonGradient() {
  if (toonGradient) return toonGradient;

  // Rampa de 16 valores para transición escalonada perfecta sin aliasing
  // 0..6: Sombra suave (~130) | 7..11: Tono medio (~210) | 12..15: Luz solar directa (255)
  const ramp = new Uint8Array([
    128, 128, 130, 134, 140, 148, 185, 210,
    212, 215, 220, 235, 252, 255, 255, 255,
  ]);
  toonGradient = new THREE.DataTexture(ramp, ramp.length, 1, THREE.RedFormat);
  toonGradient.minFilter = THREE.LinearFilter;
  toonGradient.magFilter = THREE.LinearFilter;
  toonGradient.generateMipmaps = false;
  toonGradient.needsUpdate = true;
  return toonGradient;
}

/** Sube la saturación manteniendo luminosidad para el look vivo de Zelda TotK. */
export function saturateColor(color, amount = 0.32) {
  const out = color.isColor ? color.clone() : new THREE.Color(color);
  const hsl = { h: 0, s: 0, l: 0 };
  out.getHSL(hsl);
  out.setHSL(hsl.h, Math.min(1, hsl.s + (1 - hsl.s) * amount), Math.min(0.95, hsl.l * 1.05));
  return out;
}

const CONVERTIBLE = new Set(['MeshStandardMaterial', 'MeshPhongMaterial', 'MeshLambertMaterial', 'MeshPhysicalMaterial']);

function toonFrom(source) {
  const params = {
    color: saturateColor(source.color || 0xffffff),
    map: source.map || null,
    lightMap: source.lightMap || null,
    lightMapIntensity: source.lightMapIntensity ?? 1,
    aoMap: source.aoMap || null,
    aoMapIntensity: source.aoMapIntensity ?? 1,
    emissive: source.emissive ? source.emissive.clone() : new THREE.Color(0x000000),
    emissiveMap: source.emissiveMap || null,
    emissiveIntensity: source.emissiveIntensity ?? 1,
    alphaMap: source.alphaMap || null,
    bumpMap: source.bumpMap || null,
    bumpScale: source.bumpScale ?? 1,
    normalMap: source.normalMap || null,
    normalMapType: source.normalMapType ?? THREE.TangentSpaceNormalMap,
    normalScale: source.normalScale ? source.normalScale.clone() : new THREE.Vector2(1, 1),
    displacementMap: source.displacementMap || null,
    displacementScale: source.displacementScale ?? 1,
    displacementBias: source.displacementBias ?? 0,
    transparent: !!source.transparent,
    opacity: source.opacity ?? 1,
    alphaTest: source.alphaTest ?? 0,
    side: source.side ?? THREE.FrontSide,
    vertexColors: !!source.vertexColors,
    fog: source.fog !== false,
    gradientMap: getCartoonGradient(),
  };
  const m = new THREE.MeshToonMaterial(params);
  m.name = source.name || '';
  m.flatShading = !!source.flatShading;
  m.depthWrite = source.depthWrite;
  m.depthTest = source.depthTest;
  m.blending = source.blending;
  m.renderOrder = source.renderOrder;
  m.needsUpdate = true;
  return m;
}

function convertMesh(mesh, cache) {
  const replace = (mat) => {
    if (!mat) return mat;
    if (Array.isArray(mat)) return mat.map(replace);
    if (!CONVERTIBLE.has(mat.type)) {
      // Toon ya existente: aseguramos el gradiente TotK compartido
      if (mat.isMeshToonMaterial && mat.gradientMap && mat.gradientMap !== getCartoonGradient()) {
        mat.gradientMap = getCartoonGradient();
        mat.needsUpdate = true;
      }
      return mat;
    }
    let toon = cache.get(mat.uuid);
    if (!toon) {
      toon = toonFrom(mat);
      cache.set(mat.uuid, toon);
    }
    return toon;
  };
  const next = replace(mesh.material);
  if (next !== mesh.material) mesh.material = next;
}

/**
 * Convierte los materiales en toon estilizado estilo Zelda TotK sin outlines.
 * Los ShaderMaterial (agua, cielo, partículas) se dejan intactos. Idempotente.
 */
export function applyCartoonStyle(root, cache = new Map()) {
  if (!root) return cache;
  root.traverse((obj) => {
    if (obj.isMesh || obj.isSkinnedMesh || obj.isInstancedMesh) convertMesh(obj, cache);
  });
  return cache;
}
