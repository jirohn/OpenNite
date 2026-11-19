import { app, ipcMain } from 'electron';
import electronUpdater from 'electron-updater';

// electron-updater es CommonJS: desestructurar evita problemas con ESM.
const { autoUpdater } = electronUpdater;

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.allowPrerelease = true;
autoUpdater.logger = console;

/** Configura el autoactualizador de GitHub Releases y sus IPC. */
export function setupUpdater(getWindow) {
  ipcMain.handle('updater:check', async () => {
    if (!app.isPackaged) return { available: false, reason: 'dev' };
    return new Promise((resolve) => {
      let done = false;
      const finish = (value) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        autoUpdater.off('update-available', onAvailable);
        autoUpdater.off('update-not-available', onNone);
        autoUpdater.off('error', onError);
        resolve(value);
      };
      const onAvailable = (info) => finish({ available: true, version: info.version, name: info.releaseName || '', notes: info.releaseNotes || '' });
      const onNone = () => finish({ available: false });
      const onError = (error) => finish({ available: false, error: String(error?.message || error) });
      const timer = setTimeout(() => finish({ available: false, reason: 'timeout' }), 20000);
      autoUpdater.on('update-available', onAvailable);
      autoUpdater.on('update-not-available', onNone);
      autoUpdater.on('error', onError);
      autoUpdater.checkForUpdates().catch(onError);
    });
  });

  ipcMain.handle('updater:download', async () => {
    if (!app.isPackaged) throw new Error('La actualización solo está disponible en la versión instalada');
    await autoUpdater.downloadUpdate();
    return true;
  });

  ipcMain.handle('updater:install', () => {
    if (app.isPackaged) setImmediate(() => autoUpdater.quitAndInstall(false, true));
    return true;
  });

  autoUpdater.on('download-progress', (progress) => {
    const win = getWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('updater:progress', {
        percent: progress.percent || 0,
        transferred: progress.transferred || 0,
        total: progress.total || 0,
      });
    }
  });

  autoUpdater.on('update-downloaded', () => {
    const win = getWindow();
    if (win && !win.isDestroyed()) win.webContents.send('updater:progress', { percent: 100, done: true });
  });
}
