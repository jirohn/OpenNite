import { app, BrowserWindow, ipcMain, nativeImage, shell } from 'electron';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile, unlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStaticServer } from './server.js';
import { setupUpdater } from './updater.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const userDir = join(app.getPath('userData'));
const settingsFile = join(userDir, 'settings.json');
const mapsDir = join(userDir, 'maps');
const mapsIndex = join(mapsDir, 'index.json');

let mainWindow = null;
let server = null;

const safeId = (id) => String(id || '').replace(/[^a-zA-Z0-9_-]/g, '');

async function ensureDirs() {
  await mkdir(userDir, { recursive: true });
  await mkdir(mapsDir, { recursive: true });
  if (!existsSync(mapsIndex)) await writeFile(mapsIndex, '[]', 'utf8');
}

async function readJSON(file, fallback) {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { return fallback; }
}

function registerIPC() {
  ipcMain.handle('app:version', () => app.getVersion());
  ipcMain.handle('app:quit', () => app.quit());
  ipcMain.handle('app:open-external', async (_event, url) => {
    if (/^https?:\/\//i.test(String(url))) await shell.openExternal(url);
  });

  ipcMain.handle('settings:get', () => readJSON(settingsFile, null));
  ipcMain.handle('settings:set', async (_event, data) => {
    await writeFile(settingsFile, JSON.stringify(data, null, 2), 'utf8');
    return true;
  });

  ipcMain.handle('maps:list', () => readJSON(mapsIndex, []));
  ipcMain.handle('maps:read', (_event, id) => readJSON(join(mapsDir, `${safeId(id)}.json`), null));
  ipcMain.handle('maps:download', async (_event, { id, url, version, binary } = {}) => {
    const clean = safeId(id);
    if (!clean || !/^https:\/\//i.test(String(url))) throw new Error('URL de mapa no válida');
    const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const isGlb = !!binary || /\.glb(?:$|\?)/i.test(String(url));
    let data;
    let file;
    if (isGlb) {
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.subarray(0, 4).toString('ascii') !== 'glTF') {
        throw new Error('El archivo descargado no es un GLB válido');
      }
      file = `${clean}.glb`;
      await writeFile(join(mapsDir, file), bytes);
      data = { id: clean, name: clean, type: 'glb', file, version: version || 1 };
    } else {
      const text = await response.text();
      try { data = JSON.parse(text); } catch { throw new Error('El mapa descargado no es JSON válido'); }
      if (!data.id || !data.seed) throw new Error('Formato de mapa no reconocido');
      file = `${clean}.json`;
      await writeFile(join(mapsDir, file), JSON.stringify(data, null, 2), 'utf8');
    }

    const list = await readJSON(mapsIndex, []);
    const item = {
      id: clean,
      name: data.name || clean,
      version: version || data.version || 1,
      file,
      type: data.type || (isGlb ? 'glb' : 'json'),
      installedAt: Date.now(),
    };
    const idx = list.findIndex((m) => m.id === clean);
    if (idx >= 0) list[idx] = item; else list.push(item);
    await writeFile(mapsIndex, JSON.stringify(list, null, 2), 'utf8');
    return data;
  });
  ipcMain.handle('maps:remove', async (_event, id) => {
    const clean = safeId(id);
    try { await unlink(join(mapsDir, `${clean}.json`)); } catch { /* no existe */ }
    const list = (await readJSON(mapsIndex, [])).filter((m) => m.id !== clean);
    await writeFile(mapsIndex, JSON.stringify(list, null, 2), 'utf8');
    return true;
  });
}

async function createWindow() {
  const iconPath = join(rootDir, 'assets/icons/icon.ico');
  const icon = existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : undefined;
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 768,
    minWidth: 960,
    minHeight: 600,
    title: 'OpenNite',
    icon,
    backgroundColor: '#0b0d12',
    show: false,
    webPreferences: {
      preload: join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
      backgroundThrottling: false,
      nativeWindowOpen: true,
    },
  });
  // Firebase Auth abre una ventana emergente para el OAuth de Google. Debe
  // permanecer dentro de Electron para que el credential se devuelva por
  // postMessage; el resto de enlaces se abren en el navegador del sistema.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const authPopup = /^https:\/\/(accounts\.google\.com(?:[./]|$)|[a-z0-9-]+\.firebaseapp\.com(?:[./]|$)|[a-z0-9-]+\.web\.app(?:[./]|$))/i.test(url);
    if (authPopup) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 480, height: 640, minWidth: 400, minHeight: 480,
          title: 'Iniciar sesión con Google',
          autoHideMenuBar: true,
          webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: false },
        },
      };
    }
    if (/^https?:\/\//i.test(url)) shell.openExternal(url).catch(() => {});
    return { action: 'deny' };
  });
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    mainWindow?.focus();
    mainWindow?.webContents.focus();
  });
  mainWindow.on('closed', () => { mainWindow = null; });

  const devURL = process.env.VITE_DEV_SERVER_URL;
  if (devURL) {
    await mainWindow.loadURL(devURL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    const dist = join(rootDir, 'dist');
    if (!existsSync(dist)) throw new Error('No existe dist/. Ejecuta npm run build primero.');
    server = await createStaticServer(dist, mapsDir);
    await mainWindow.loadURL(`http://127.0.0.1:${server.port}/index.html`);
  }
}

app.whenReady().then(async () => {
  await ensureDirs();
  registerIPC();
  setupUpdater(() => mainWindow);
  await createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}).catch((error) => {
  console.error('No se pudo iniciar OpenNite:', error);
  app.quit();
});

app.on('window-all-closed', () => {
  server?.server.close();
  if (process.platform !== 'darwin') app.quit();
});
