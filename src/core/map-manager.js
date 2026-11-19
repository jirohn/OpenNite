const LOCAL_KEY = 'opennite.installed-maps.v1';
const REMOTE_KEY = 'opennite.remote-catalog.v1';

/** Gestiona los mapas incluidos, descargados desde GitHub y la cache local. */
export class MapManager {
  constructor() {
    this.bundledIndex = null;
    this.installed = new Map();
    this.remote = null;
    this.entries = new Map();
  }

  get api() { return window.opennite?.maps; }

  async init() {
    try {
      const res = await fetch('./maps/index.json');
      this.bundledIndex = await res.json();
    } catch (error) {
      console.warn('No se pudo leer el índice de mapas incluido:', error);
      this.bundledIndex = { maps: [], baseUrl: '' };
    }

    try {
      let list = this.api ? await this.api.list() : JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
      if (!Array.isArray(list)) list = [];
      for (const item of list) {
        let data = null;
        try {
          data = this.api ? await this.api.read(item.id) : JSON.parse(localStorage.getItem(`${LOCAL_KEY}.${item.id}`) || 'null');
        } catch { /* ignore */ }
        // Los mapas GLB no se guardan como JSON: el índice local guarda sus metadatos.
        if (!data && item.type === 'glb') data = { ...item };
        if (data) this.installed.set(item.id, data);
      }
    } catch (error) {
      console.warn('Error leyendo mapas instalados:', error);
    }

    try {
      const raw = localStorage.getItem(REMOTE_KEY);
      if (raw) this.remote = JSON.parse(raw);
    } catch { /* ignore */ }

    this.refresh();
    return this;
  }

  refresh() {
    this.entries.clear();
    for (const m of this.bundledIndex?.maps || []) this.entries.set(m.id, { ...m, bundled: true, installed: this.installed.has(m.id) });
    for (const m of this.remote?.maps || []) {
      if (!this.entries.has(m.id)) this.entries.set(m.id, { ...m, bundled: false, installed: this.installed.has(m.id) });
      else Object.assign(this.entries.get(m.id), m);
    }
    for (const [id, data] of this.installed) {
      if (!this.entries.has(id)) {
        this.entries.set(id, {
          id, name: data.name || id, description: data.description || 'Mapa descargado',
          file: `${id}.json`, size: data.size || 4096, theme: data.theme || 'temperate',
          gradient: 'linear-gradient(135deg,#35405a,#7390b5)', tags: ['Descargado'], bundled: false, installed: true,
        });
      } else {
        this.entries.get(id).installed = true;
      }
    }
  }

  list() {
    return [...this.entries.values()];
  }

  get(id) {
    return this.entries.get(id) || null;
  }

  isInstalled(id) {
    return this.installed.has(id);
  }

  async getMapData(id) {
    const installed = this.installed.get(id);
    const entry = this.entries.get(id);
    const bundledVersion = Number(entry?.version || 0);
    const installedVersion = Number(installed?.version || 0);
    // Si hay una versión incluida más nueva, se usa aunque el jugador tuviera
    // una copia antigua descargada. Así los cambios de tamaño llegan siempre.
    if (installed && (!bundledVersion || installedVersion >= bundledVersion)) return installed;

    const res = await fetch(`./maps/${id}.json`);
    if (!res.ok) {
      if (installed) return installed;
      throw new Error(`Mapa "${id}" no encontrado`);
    }
    const data = await res.json();
    if (installed) this.installed.set(id, data);
    return data;
  }

  async refreshCatalog(force = true) {
    const url = `${this.bundledIndex?.baseUrl || ''}index.json`;
    if (!url || url === 'index.json') return null;
    try {
      const res = await fetch(`${url}?t=${force ? Date.now() : 0}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.remote = await res.json();
      localStorage.setItem(REMOTE_KEY, JSON.stringify(this.remote));
      this.refresh();
      return this.remote;
    } catch (error) {
      console.warn('No se pudo actualizar el catálogo remoto:', error);
      return null;
    }
  }

  async install(id) {
    const entry = this.entries.get(id);
    if (!entry) throw new Error('Mapa no encontrado en el catálogo');
    const url = entry.url || `${this.bundledIndex?.baseUrl || ''}${entry.file}`;
    const isGlb = entry.type === 'glb' || /\.glb(?:$|\?)/i.test(entry.file || '');
    let data;

    if (isGlb) {
      // El archivo completo se descarga y se guarda en userData/maps.
      // El juego lo sirve desde /installed-maps/<archivo>.
      if (this.api?.download) {
        await this.api.download({ id, url, version: entry.version || 1, binary: true });
      } else {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      }
      data = { ...entry, type: 'glb', version: entry.version || 1 };
    } else if (this.api?.download) {
      data = await this.api.download({ id, url, version: entry.version || 1 });
    } else {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = await res.json();
      localStorage.setItem(`${LOCAL_KEY}.${id}`, JSON.stringify(data));
      const list = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
      const exists = list.findIndex((m) => m.id === id);
      const item = { id, name: data.name || id, version: data.version || 1 };
      if (exists >= 0) list[exists] = item; else list.push(item);
      localStorage.setItem(LOCAL_KEY, JSON.stringify(list));
    }

    if (!data || (!data.seed && data.type !== 'glb')) throw new Error('El archivo descargado no es un mapa válido');
    this.installed.set(id, data);
    this.refresh();
    return data;
  }

  async uninstall(id) {
    if (this.api?.remove) await this.api.remove(id);
    else {
      localStorage.removeItem(`${LOCAL_KEY}.${id}`);
      const list = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]').filter((m) => m.id !== id);
      localStorage.setItem(LOCAL_KEY, JSON.stringify(list));
    }
    this.installed.delete(id);
    this.refresh();
  }
}
