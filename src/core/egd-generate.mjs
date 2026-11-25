/**
 * OpenNite - Generador de terreno de Easy Game Developer (mismo código que el
 * motor, ver egd-engine.mjs): llano, colinas, isla, montañas, cañón y San Borondón.
 * Rellena world.tiles de un mundo egd-map.
 */
import {
  egdGenerateInto as dr,
} from './egd-engine.mjs';

export const EGD_GENERATORS = { flat: 'Llano', hills: 'Colinas', island: 'Isla', mountains: 'Montañas', canyon: 'Cañón', sanborondon: 'San Borondón' };
/** Genera el terreno de `world` (igual que "Generar" en EGD). */
export function egdGenerate(world, kind = 'island', seed = 1) { dr(world, kind, seed); return world; }
