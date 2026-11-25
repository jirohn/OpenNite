/**
 * OpenNite - Terreno de Easy Game Developer (formato "egd-map").
 *
 * Es el MISMO código de terreno de Easy Game Developer (ver egd-engine.mjs):
 * rejilla de teselas, alturas en pasos de 0.5 m, rampas, estilo "suave"
 * (bordes redondeados) y "bloques", líquidos, caminos/puentes y hierba.
 * Lo único que cambia en OpenNite son los materiales y colores.
 */
import {
  EgdTerrain as us, egdCreateWorld as Hr, egdNormalizeWorld as M0, egdTileHeightAt as fi, egdTileIndexAt as Gi, egdTileCenter as yh, egdOrigin as hr, egdTile as Vi, egdMakeTile as gh, egdMakePath as Nn, egdGrassAt as d0, egdEnsureGrass as gl, egdSetGrass as yl, EGD_STEP as ds, EGD_MIN_HEIGHT as Ns, EGD_MAX_HEIGHT as ji, EGD_DIRS as Y1, EGD_DIR_NAMES as p0, EGD_TILE_TYPES as mt, EGD_PATH_TYPES as hn, EGD_PATH_MODES as c0, EGD_GRASS_LEVELS as h0, EGD_GRASS_UNIFORMS as io,
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
