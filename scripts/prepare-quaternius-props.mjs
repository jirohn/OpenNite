/**
 * Copia un subconjunto ligero del Fantasy Props MegaKit de Quaternius a public/.
 * Uso: node scripts/prepare-quaternius-props.mjs <directorio-descomprimido>
 *
 * El ZIP original se puede descargar gratis (CC0 1.0) desde:
 * https://quaternius.itch.io/fantasy-props-megakit
 *
 * No se ejecuta durante el build: los archivos resultantes ya están incluidos
 * en public/models/quaternius/props y Vite los copia a dist/ automáticamente.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const sourceDir = process.argv[2];
if (!sourceDir) {
  console.error('Falta el directorio descomprimido del kit de props.');
  process.exit(1);
}

const gltfSource = path.join(sourceDir, 'Exports', 'glTF');
const outDir = path.resolve('public/models/quaternius/props/glTF');
const models = [
  'Bag',
  'Barrel',
  'Barrel_Apples',
  'Bench',
  'Bucket_Wooden_1',
  'Chest_Wood',
  'Chair_1',
  'Crate_Metal',
  'Crate_Wooden',
  'FarmCrate_Apple',
  'FarmCrate_Empty',
  'Lantern_Wall',
  'Shelf_Simple',
  'Stall_Cart_Empty',
  'Stall_Empty',
  'Table_Large',
  'Torch_Metal',
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
  const width = Math.min(meta.width || 1024, 512);
  const height = Math.min(meta.height || 1024, 512);
  await sharp(input)
    .resize(width, height, { fit: 'inside', withoutEnlargement: true })
    .png({ compressionLevel: 9, palette: true, quality: 82 })
    .toFile(output);
}

await fs.copyFile(
  path.join(sourceDir, 'License_Standard.txt'),
  path.resolve('public/models/quaternius/props/LICENSE.txt'),
);

console.log(`Copiados ${models.length} props y ${imageNames.size} texturas a ${outDir}`);
