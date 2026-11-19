/**
 * Copia un subconjunto ligero del Stylized Nature MegaKit de Quaternius a public/.
 * Uso: node scripts/prepare-quaternius.mjs <directorio-descomprimido>
 *
 * El ZIP original se puede descargar gratis (CC0 1.0) desde:
 * https://quaternius.itch.io/stylized-nature-megakit
 *
 * No se ejecuta durante el build: los archivos resultantes ya están incluidos en
 * public/models/quaternius y se copian a dist/ automáticamente con Vite.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const sourceDir = process.argv[2];
if (!sourceDir) {
  console.error('Falta el directorio descomprimido del kit.');
  process.exit(1);
}

const gltfSource = path.join(sourceDir, 'glTF');
const outDir = path.resolve('public/models/quaternius/glTF');
const models = [
  'Bush_Common',
  'Bush_Common_Flowers',
  'Clover_1',
  'CommonTree_1',
  'CommonTree_2',
  'CommonTree_3',
  'Flower_3_Group',
  'Flower_4_Group',
  'Fern_1',
  'Grass_Common_Short',
  'Grass_Wispy_Tall',
  'Mushroom_Common',
  'Pebble_Round_1',
  'Pebble_Square_1',
  'Pine_1',
  'Pine_2',
  'Pine_4',
  'Rock_Medium_1',
  'Rock_Medium_2',
  'Rock_Medium_3',
];

await fs.rm(outDir, { recursive: true, force: true });
await fs.mkdir(outDir, { recursive: true });

const imageNames = new Set();
for (const name of models) {
  const json = JSON.parse(await fs.readFile(path.join(gltfSource, `${name}.gltf`), 'utf8'));
  for (const image of json.images || []) if (image.uri) imageNames.add(image.uri);
  await fs.copyFile(path.join(gltfSource, `${name}.gltf`), path.join(outDir, `${name}.gltf`));
  await fs.copyFile(path.join(gltfSource, `${name}.bin`), path.join(outDir, `${name}.bin`));
}

for (const name of imageNames) {
  const input = path.join(gltfSource, name);
  const output = path.join(outDir, name);
  const meta = await sharp(input).metadata();
  const width = Math.min(meta.width || 1024, 1024);
  const height = Math.min(meta.height || 1024, 1024);
  await sharp(input)
    .resize(width, height, { fit: 'inside', withoutEnlargement: true })
    .png({ compressionLevel: 9, palette: true, quality: 88 })
    .toFile(output);
}

await fs.copyFile(
  path.join(sourceDir, 'License_Standard.txt'),
  path.resolve('public/models/quaternius/LICENSE.txt'),
);

console.log(`Copiados ${models.length} modelos y ${imageNames.size} texturas a ${outDir}`);
