/**
 * Descarga el kit de personajes usado por OpenNite.
 *
 * Cuerpo, piezas y ensamblado: NoLimitNexus/game-models (CC0, derivado de
 * Quaternius/KayKit). Animaciones y esqueleto: Kay Lousberg (kaylousberg.com),
 * CC0 1.0. Solo se guarda el subconjunto web-ready que usa el juego.
 */
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const base = resolve(root, 'public/models/opennite');
const REPO = 'https://raw.githubusercontent.com/NoLimitNexus/game-models/main';

const files = [
  'library/ours/manifest.json',
  'library/ours/presets.json',
  'library/animations/roles.json',
  'library/licenses/kaykit-character-animations.txt',
  'library/ours/body/Body.glb',
  ...[
    'back_pack', 'beard_long', 'beard_short', 'boots_low', 'boots_tall',
    'bottom_shorts', 'bottom_trousers', 'hair_balding', 'hair_bun', 'hair_long',
    'hair_ponytail', 'hair_short', 'hair_tousled', 'hat_beanie', 'hat_cap',
    'hat_straw', 'top_long', 'top_tee', 'top_tunic',
  ].map((name) => `library/ours/parts/${name}.glb`),
  ...['axe', 'hammer', 'net', 'pickaxe', 'rod', 'spoon'].map((name) => `library/ours/tools/${name}.glb`),
  ...[
    'Rig_Medium_CombatMelee', 'Rig_Medium_CombatRanged', 'Rig_Medium_General',
    'Rig_Medium_MovementAdvanced', 'Rig_Medium_MovementBasic', 'Rig_Medium_Ours',
    'Rig_Medium_Simulation', 'Rig_Medium_Special', 'Rig_Medium_Tools',
  ].map((name) => `library/animations/${name}.glb`),
];

async function exists(path) {
  try {
    return (await stat(path)).size > 100;
  } catch {
    return false;
  }
}

let downloaded = 0;
for (const file of files) {
  const target = resolve(base, file);
  if (await exists(target)) continue;
  const url = `${REPO}/${file}`;
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(60000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const bytes = Buffer.from(await res.arrayBuffer());
      if (bytes.length < 100) throw new Error('Respuesta demasiado pequeña');
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, bytes);
      downloaded++;
      console.log('OK', file, `${(bytes.length / 1024).toFixed(0)} KB`);
      lastError = null;
      break;
    } catch (error) {
      lastError = error;
      if (attempt < 2) console.warn('Reintentando', file, error.message);
    }
  }
  if (lastError) throw new Error(`No se pudo descargar ${file}: ${lastError.message}`);
}

console.log(downloaded ? `Descargados ${downloaded} archivos.` : 'Kit de personajes ya presente.');
