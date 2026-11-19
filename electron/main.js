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
  ipcMain.handle('maps:download', async (_event, { id, url, version } = {}) => {
    const clean = safeId(id);
    if (!clean || !/^https:\/\//i.test(String(url))) throw new Error('URL de mapa no válida');
    const response = await fetch(url, { signal: AbortSignal.timeout(45000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { throw new Error('El mapa descargado no es JSON válido'); }
    if (!data.id || !data.seed) throw new Error('Formato de mapa no reconocido');
    await writeFile(join(mapsDir, `${clean}.json`), JSON.stringify(data, null, 2), 'utf8');
    const list = await readJSON(mapsIndex, []);
    const item = { id: clean, name: data.name || clean, version: version || data.version || 1, installedAt: Date.now() };
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
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
      backgroundThrottling: false,
    },
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
    server = await createStaticServer(dist);
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
