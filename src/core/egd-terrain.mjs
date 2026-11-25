/**
 * OpenNite - Terreno de Easy Game Developer (formato "egd-map").
 *
 * Es el MISMO código de terreno de Easy Game Developer (ver egd-engine.mjs):
 * rejilla de teselas, alturas en pasos de 0.5 m, rampas, estilo "suave"
 * (bordes redondeados) y "bloques", líquidos, caminos/puentes y hierba.
 * Lo único que cambia en OpenNite son los materiales y colores.
 */
import {
  us, Hr, M0, fi, Gi, yh, hr, Vi, gh, Nn, d0, gl, yl,
  ds, Ns, ji, Y1, p0, mt, hn, c0, h0, io,
} from './egd-engine.mjs';

export { EgdSurfaceMaterial, EgdGrassMaterial, EGD_ORIGINAL_TILE_COLORS, applyOpenNiteLook } from './egd-engine.mjs';

export const EGD_MAP_FORMAT = 'egd-map';
export const EGD_HEIGHT_STEP = ds; // 0.5 m por unidad de altura
export const EGD_MIN_HEIGHT = Ns;
export const EGD_MAX_HEIGHT = ji;
export const EGD_DIRS = Y1; // 0 = +Z, 1 = +X, 2 = -Z, 3 = -X
export const EGD_DIR_NAMES = p0;
export const EGD_TILE_TYPES = mt;
export const EGD_PATH_TYPES = hn;
export const EGD_PATH_MODES = c0;
export const EGD_GRASS_LEVELS = h0;
export const EGD_GRASS_UNIFORMS = io;
export {
  us as EgdTerrain,
  Hr as egdCreateWorld,
  M0 as egdNormalizeWorld,
  fi as egdTileHeightAt,
  Gi as egdTileIndexAt,
  yh as egdTileCenter,
  hr as egdOrigin,
  Vi as egdTile,
  gh as egdMakeTile,
  Nn as egdMakePath,
  d0 as egdGrassAt,
  gl as egdEnsureGrass,
  yl as egdSetGrass,
};
