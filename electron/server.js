import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
};

/**
 * Servidor local mínimo: evita problemas de CORS con módulos ES en file://.
 * `mapsDir` se sirve bajo /installed-maps/ para los mapas descargados completos.
 */
export function createStaticServer(rootDir, mapsDir = null) {
  const root = resolve(rootDir);
  const mapsRoot = mapsDir ? resolve(mapsDir) : null;
  const server = http.createServer(async (req, res) => {
    try {
      const raw = decodeURIComponent((req.url || '/').split('?')[0]);
      let rel = normalize(raw).replace(/^([/\\])+/, '');
      let base = root;

      if (mapsRoot && /^installed-maps[/\\]/i.test(rel)) {
        base = mapsRoot;
        rel = rel.replace(/^installed-maps[/\\]/i, '');
      }

      if (rel === '' || rel.endsWith('/')) rel = join(rel, 'index.html');
      let file = resolve(base, rel);
      if (file !== base && !file.startsWith(base + sep)) {
        res.writeHead(403).end('Forbidden');
        return;
      }
      try {
        const info = await stat(file);
        if (info.isDirectory()) file = join(file, 'index.html');
      } catch {
        file = join(root, 'index.html');
      }
      const data = await readFile(file);
      res.writeHead(200, {
        'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(data);
    } catch (error) {
      res.writeHead(500).end(String(error));
    }
  });
  return new Promise((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolvePromise({ server, port: server.address().port }));
  });
}
