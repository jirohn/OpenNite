import { app, BrowserWindow, ipcMain, nativeImage, screen, shell } from 'electron';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile, unlink } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStaticServer } from './server.js';
import { setupUpdater } from './updater.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const userDir = join(app.getPath('userData'));
const settingsFile = join(userDir, 'settings.json');
const accountFile = join(userDir, 'account.json');
const mapsDir = join(userDir, 'maps');
const mapsIndex = join(mapsDir, 'index.json');

let mainWindow = null;
let server = null;
let currentDisplayMode = 'fullscreen';

const DISPLAY_MODES = new Set(['fullscreen', 'windowed', 'borderless']);

const safeId = (id) => String(id || '').replace(/[^a-zA-Z0-9_-]/g, '');

async function ensureDirs() {
  await mkdir(userDir, { recursive: true });
  await mkdir(mapsDir, { recursive: true });
  if (!existsSync(mapsIndex)) await writeFile(mapsIndex, '[]', 'utf8');
}

async function readJSON(file, fallback) {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { return fallback; }
}

function normalizeDisplayMode(mode) {
  return DISPLAY_MODES.has(String(mode || '')) ? String(mode) : 'fullscreen';
}

function applyDisplayMode(win, mode) {
  if (!win || win.isDestroyed()) return;
  const m = normalizeDisplayMode(mode);
  currentDisplayMode = m;
  try {
    win.setAutoHideMenuBar(true);
    win.setMenuBarVisibility(false);
    if (m === 'fullscreen') {
      if (win.isMaximized()) win.unmaximize();
      win.setResizable(true);
      win.setFullScreen(true);
      return;
    }
    if (win.isFullScreen()) win.setFullScreen(false);
    if (m === 'borderless') {
      const { bounds } = screen.getPrimaryDisplay();
      if (win.isMaximized()) win.unmaximize();
      win.setResizable(false);
      win.setBounds(bounds);
      win.show();
      return;
    }
    // windowed
    win.setResizable(true);
    if (win.isMaximized()) win.unmaximize();
    if (!win.isVisible()) win.show();
    const [w, h] = [1366, 768];
    const cur = win.getBounds();
    if (cur.width < 960 || cur.height < 600) win.setSize(w, h);
    else if (win.getBounds().width > 0) {
      // keep current size if reasonable, but ensure within screen
      const { workArea } = screen.getPrimaryDisplay();
      if (cur.width > workArea.width || cur.height > workArea.height) win.setSize(Math.min(cur.width, w), Math.min(cur.height, h));
    } else {
      win.setSize(w, h);
    }
    win.center();
  } catch (error) {
    console.warn('No se pudo aplicar el modo de pantalla:', error);
  }
}

function registerIPC() {
  ipcMain.handle('app:version', () => app.getVersion());
  ipcMain.handle('app:quit', () => app.quit());
  ipcMain.handle('app:open-external', async (_event, url) => {
    if (/^https?:\/\//i.test(String(url))) await shell.openExternal(url);
  });
  ipcMain.handle('app:writeFile', async (_event, relativePath, text) => {
    const target = join(rootDir, String(relativePath || ''));
    if (!target.startsWith(rootDir + sep)) throw new Error('Ruta no permitida');
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, String(text ?? ''), 'utf8');
    return target;
  });
  ipcMain.handle('app:readFile', async (_event, relativePath) => {
    const target = join(rootDir, String(relativePath || ''));
    if (!target.startsWith(rootDir + sep)) throw new Error('Ruta no permitida');
    try { return await readFile(target, 'utf8'); } catch { return null; }
  });
  ipcMain.handle('app:saveMapFile', async (_event, relativePath, text) => {
    const target = join(rootDir, String(relativePath || ''));
    if (!target.startsWith(rootDir + sep)) throw new Error('Ruta no permitida');
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, String(text ?? ''), 'utf8');
    return target;
  });
  ipcMain.handle('app:openMapFile', async () => {
    const { dialog } = await import('electron');
    const result = await dialog.showOpenDialog({ filters: [{ name: 'Mapa OpenNite', extensions: ['json'] }] });
    if (result.canceled || !result.filePaths?.length) return null;
    const target = resolve(result.filePaths[0]);
    if (!target.startsWith(rootDir + sep)) throw new Error('Ruta no permitida');
    return await readFile(target, 'utf8');
  });
  ipcMain.handle('window:set-display-mode', async (_event, mode) => {
    const m = normalizeDisplayMode(mode);
    currentDisplayMode = m;
    if (mainWindow && !mainWindow.isDestroyed()) applyDisplayMode(mainWindow, m);
    return m;
  });

  ipcMain.handle('settings:get', () => readJSON(settingsFile, null));
  ipcMain.handle('settings:set', async (_event, data) => {
    await writeFile(settingsFile, JSON.stringify(data, null, 2), 'utf8');
    return true;
  });

  ipcMain.handle('account:get', () => readJSON(accountFile, null));
  ipcMain.handle('account:set', async (_event, data) => {
    await writeFile(accountFile, JSON.stringify(data, null, 2), 'utf8');
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
  const saved = await readJSON(settingsFile, null);
  const displayMode = normalizeDisplayMode(saved?.displayMode || 'fullscreen');
  currentDisplayMode = displayMode;
  const iconPath = join(rootDir, 'assets/icons/icon.ico');
  const icon = existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : undefined;
  // Sin marco en fullscreen/borderless por defecto para evitar bordes; en ventana se mantiene marco.
  const framed = displayMode === 'windowed';
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 768,
    minWidth: 960,
    minHeight: 600,
    title: 'OpenNite',
    icon,
    frame: framed,
    autoHideMenuBar: true,
    fullscreen: displayMode === 'fullscreen',
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
    applyDisplayMode(mainWindow, currentDisplayMode);
    mainWindow?.show();
    mainWindow?.focus();
    mainWindow?.webContents.focus();
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    // Permitir navegar a páginas fuera del origen del juego.
    if (!url.startsWith(`http://127.0.0.1:${server?.port || 0}/`)) event.preventDefault();
  });
  mainWindow.on('closed', () => { mainWindow = null; });

  const devURL = process.env.VITE_DEV_SERVER_URL;
  if (devURL) {
    await mainWindow.loadURL(devURL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    const dist = join(rootDir, 'dist');
    if (!existsSync(dist)) throw new Error('No existe dist/. Ejecuta npm run build primero.');
    server = await createStaticServer(dist, mapsDir, [
      { prefix: 'config/', dir: join(rootDir, 'config') },
      { prefix: 'tools/', dir: join(rootDir, 'tools') },
      { prefix: 'src/', dir: join(rootDir, 'src') },
      { prefix: 'node_modules/', dir: join(rootDir, 'node_modules') },
    ]);
    let startUrl = `http://127.0.0.1:${server.port}/index.html`;
    if (process.argv.includes('--studio')) startUrl = `http://127.0.0.1:${server.port}/tools/studio.html`;
    if (process.argv.includes('--editor')) startUrl = `http://127.0.0.1:${server.port}/tools/studio.html?tab=equipment`;
    if (process.argv.includes('--map-editor')) startUrl = `http://127.0.0.1:${server.port}/tools/studio.html`;
    if (process.argv.includes('--parts-editor')) startUrl = `http://127.0.0.1:${server.port}/tools/studio.html?tab=models`;
    if (process.argv.includes('--character-editor')) startUrl = `http://127.0.0.1:${server.port}/tools/studio.html?tab=characters`;
    await mainWindow.loadURL(startUrl);
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
