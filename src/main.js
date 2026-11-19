import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { settings } from './core/settings.js';
import { AudioEngine } from './core/audio.js';
import { Input } from './core/input.js';
import { MapManager } from './core/map-manager.js';
import { Game } from './game/game.js';
import { UI } from './ui/ui.js';
import { App } from './ui/App.jsx';
import { pushHudToast, uiStore } from './ui/store.js';

class AppController {
  constructor() {
    this.canvas = document.querySelector('#canvas') || document.querySelector('#game-canvas');
    this.uiRoot = document.querySelector('#ui');
    this.version = '0.1.0';
    this.updateInfo = null;
    this.assetsReady = false;

    createRoot(this.uiRoot).render(createElement(App));
  }

  async init() {
    this.setLoading(8, 'Cargando configuración...');
    await settings.load();
    settings.onChange(() => this.audio?.applyVolumes());

    this.setLoading(18, 'Leyendo mapas...');
    this.maps = await new MapManager().init();

    this.audio = new AudioEngine(settings);
    this.input = new Input(this.canvas);
    this.ui = new UI(this.uiRoot, this, settings, this.maps, this.audio);
    this.game = new Game(this.canvas, this.uiRoot, settings, this.audio, this.input, this);

    if (window.opennite?.app?.getVersion) {
      try { this.version = await window.opennite.app.getVersion(); } catch { /* ignore */ }
    }

    this.game.start();
    this.setLoading(85, 'Cargando modelo CC0...');
    this.ui.showMenu();
    this.checkUpdates(false);

    // Si el modelo tarda, el menú sigue siendo usable.
    setTimeout(() => this.hideLoading(), 7000);
  }

  setLoading(percent, text) {
    uiStore.setState((s) => ({
      loading: { ...s.loading, mounted: true, visible: true, percent, text },
    }));
  }

  onAssetsReady() {
    this.assetsReady = true;
    this.setLoading(100, 'Listo');
    setTimeout(() => this.hideLoading(), 350);
  }

  onAssetsError(error) {
    console.error(error);
    this.setLoading(100, 'Modelo no disponible: ejecuta npm run assets');
    this.toast('Falta el modelo CC0. Ejecuta npm run assets y reinicia.', 'warn');
    setTimeout(() => this.hideLoading(), 1500);
  }

  hideLoading() {
    const loading = uiStore.getState().loading;
    if (!loading.mounted || !loading.visible) return;
    uiStore.setState({ loading: { ...loading, visible: false } });
    setTimeout(() => {
      const current = uiStore.getState().loading;
      if (!current.visible) uiStore.setState({ loading: { ...current, mounted: false } });
    }, 600);
  }

  toast(text, type = '') {
    pushHudToast(text, type);
  }

  async startMatch(mapId) {
    const id = mapId || settings.get('mapId');
    this.setLoading(5, 'Cargando mapa...');
    try {
      const map = await this.maps.getMapData(id);
      this.ui.clear();
      await this.game.startMatch({
        map,
        bots: settings.get('maxBots'),
        difficulty: settings.get('botDifficulty'),
      });
      this.hideLoading();
    } catch (error) {
      console.error(error);
      this.toast(`No se pudo iniciar: ${error.message}`, 'warn');
      this.hideLoading();
      this.ui.showLobby();
    }
  }

  requestPause() {
    if (!this.game || this.game.mode !== 'playing' || this.game.ending || this.game.paused) return;
    this.game.setPaused(true);
    this.ui.showPause();
  }

  resumeGame() {
    this.ui.clear();
    this.game.resume();
  }

  returnToMenu() {
    this.game.disposeMatch();
    this.ui.showMenu();
  }

  onMatchEnd(result) {
    if (this.game) this.game.paused = true;
    this.ui.showResults(result);
  }

  async checkUpdates(manual = false) {
    const api = window.opennite?.updater;
    if (!api?.check) {
      if (manual) this.toast('La autoactualización funciona en la versión instalada (release).');
      return;
    }
    try {
      const result = await api.check();
      if (result?.available) {
        this.updateInfo = result;
        uiStore.setState({ updateStatus: `Actualización ${result.version} disponible` });
        if (manual) this.ui.showUpdate(result);
        else this.toast(`Nueva versión ${result.version} disponible`, 'good');
      } else if (manual) {
        this.toast('Ya tienes la última versión.', 'good');
      }
    } catch (error) {
      console.warn('Error comprobando actualizaciones:', error);
      if (manual) this.toast('No se pudo contactar con GitHub.', 'warn');
    }
  }

  async downloadUpdate() {
    const api = window.opennite?.updater;
    if (!api?.download) return;
    try {
      await api.download();
      this.ui.setUpdateProgress(100, 'Descarga completada. Se instalará al cerrar el juego.');
      this.toast('Actualización descargada; se instalará al salir.', 'good');
      await api.install();
    } catch (error) {
      this.ui.setUpdateProgress(0, `Error: ${error.message}`);
      this.toast(`Error descargando: ${error.message}`, 'warn');
    }
  }

  quit() {
    if (window.opennite?.app?.quit) window.opennite.app.quit();
    else window.close();
  }
}

const app = new AppController();
window.openniteApp = app;
app.init().catch((error) => {
  console.error('Error al iniciar OpenNite:', error);
  uiStore.setState((s) => ({
    loading: { ...s.loading, mounted: true, visible: true, text: `Error: ${error.message}` },
  }));
});
