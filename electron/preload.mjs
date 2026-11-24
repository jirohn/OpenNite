import { contextBridge, ipcRenderer } from 'electron';

const safe = (channel, ...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld('opennite', {
  app: {
    getVersion: () => safe('app:version'),
    quit: () => safe('app:quit'),
    openExternal: (url) => safe('app:open-external', url),
    writeFile: (relativePath, text) => safe('app:writeFile', relativePath, text),
    readFile: (relativePath) => safe('app:readFile', relativePath),
    saveMapFile: (relativePath, text) => safe('app:saveMapFile', relativePath, text),
    openMapFile: () => safe('app:openMapFile'),
  },
  window: {
    setDisplayMode: (mode) => safe('window:set-display-mode', mode),
  },
  settings: {
    get: () => safe('settings:get'),
    set: (data) => safe('settings:set', data),
  },
  account: {
    get: () => safe('account:get'),
    set: (data) => safe('account:set', data),
  },
  maps: {
    list: () => safe('maps:list'),
    read: (id) => safe('maps:read', id),
    download: (opts) => safe('maps:download', opts),
    remove: (id) => safe('maps:remove', id),
  },
  updater: {
    check: () => safe('updater:check'),
    download: () => safe('updater:download'),
    install: () => safe('updater:install'),
    onProgress: (callback) => {
      ipcRenderer.on('updater:progress', (_event, data) => callback(data));
      return () => ipcRenderer.removeAllListeners('updater:progress');
    },
  },
});
