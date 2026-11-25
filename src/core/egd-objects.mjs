/**
 * OpenNite - Objetos de Easy Game Developer (piezas modulares, decorados,
 * primitivas y objetos compuestos) construidos con el MISMO código del motor
 * (ver egd-engine.mjs), para que casas, árboles y props tengan exactamente la
 * misma forma que en EGD. Solo cambian los materiales (toon de OpenNite).
 */
import * as THREE from 'three';
import {
  EgdSurfaceMaterial, EGD_PROPS as Hn, EGD_BUILD_PIECES as Ei, egdPresetHouse as co, egdPresetHouse2 as Op, egdPresetTower as kp, EGD_BUILD_MATERIALS as Kt, egdPrimitiveGeometry as nE, egdPropObject as T0, egdBuildObject as xh, egdCompositeObject as Wi, EGD_DEG as Ht,
} from './egd-engine.mjs';

// ----------------------------------------------------------------------------
export const EGD_PROPS = Hn;
export const EGD_BUILD_PIECES = Ei;
/**
 * Conjuntos de EGD (mismas funciones del motor): devuelven la lista de piezas
 * modulares de una casa de 1 planta, casa canaria de 2 plantas o torre.
 * (x, y, z) es el centro; opts = { rot (grados), wall, roof, floor, material, name }.
 */
export const EGD_PRESETS = {
  house: { name: 'Casa (1 planta)', build: (x, y, z, opts) => co(x, y, z, opts) },
  house2: { name: 'Casa canaria (2 plantas)', build: (x, y, z, opts) => Op(x, y, z, opts) },
  tower: { name: 'Torre de vigilancia', build: (x, y, z, opts) => kp(x, y, z, opts) },
};
export const EGD_BUILD_MATERIALS = Kt;
export const EGD_RENDERABLE = ['build', 'prop', 'primitive', 'composite'];

/** Objeto 3D de una entidad de EGD (mismo resultado que Zr en el motor), o null. */
export function egdBuildEntityObject(r) {
  let n;
  switch (r.type) {
    case 'primitive': {
      n = new THREE.Mesh(nE(r.shape), new EgdSurfaceMaterial({ color: r.color || '#c8c8c8' }));
      n.castShadow = true; n.receiveShadow = true;
      break;
    }
    case 'prop': n = T0(r.prop); break;
    case 'build': n = xh(r); break;
    case 'composite': {
      n = Wi({ name: r.name, parts: r.parts || [] });
      n.traverse((i) => { if (i.isMesh) i.receiveShadow = true; });
      break;
    }
    default: return null;
  }
  const pos = r.position || [0, 0, 0], rot = r.rotation || [0, 0, 0], sc = r.scale || [1, 1, 1];
  n.position.fromArray(pos);
  n.rotation.set(rot[0] * Ht, rot[1] * Ht, rot[2] * Ht);
  n.scale.fromArray(sc);
  n.name = r.name || r.type;
  n.userData.entityId = r.id;
  n.userData.egdEntity = r;
  return n;
}
