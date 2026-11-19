/**
 * Descarga los modelos/animaciones CC0 que usa OpenNite.
 * RobotExpressive.glb — (c) Tomás Laulhé / Quaternius, CC0 1.0.
 * Se guarda en public/models para que Vite lo copie al build.
 */
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = resolve(root, 'public/models/RobotExpressive.glb');
const sources = [
  'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/models/gltf/RobotExpressive/RobotExpressive.glb',
  'https://threejs.org/examples/models/gltf/RobotExpressive/RobotExpressive.glb',
];

async function exists(path) {
  try {
    const s = await stat(path);
    return s.size > 100000;
  } catch {
    return false;
  }
}

if (await exists(target)) {
  console.log('Modelo CC0 ya presente:', target);
  process.exit(0);
}

await mkdir(dirname(target), { recursive: true });

for (const url of sources) {
  try {
    console.log('Descargando', url);
    const res = await fetch(url, { signal: AbortSignal.timeout(60000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length < 100000) throw new Error('Respuesta demasiado pequeña');
    await writeFile(target, bytes);
    console.log('OK ->', target, `(${(bytes.length / 1024).toFixed(0)} KB)`);
    process.exit(0);
  } catch (error) {
    console.warn('Falló:', error.message);
  }
}

console.error('No se pudo descargar el modelo CC0. Revisa tu conexión.');
process.exit(1);
