import './styles.css';
import { settings } from './core/settings.js';
import { AudioEngine } from './core/audio.js';
import { Input } from './core/input.js';
import { MapManager } from './core/map-manager.js';
import { Game } from './game/game.js';
import { UI } from './ui/ui.js';

class App {
  constructor() {
    this.canvas = document.querySelector('#canvas') || document.querySelector('#game-canvas');
    this.uiRoot = document.querySelector('#ui');
    this.loading = document.querySelector('#loading-screen');
    this.loaderFill = document.querySelector('#loader-fill');
    this.loaderText = document.querySelector('#loader-text');
    this.version = '0.1.0';
    this.updateInfo = null;
    this.assetsReady = false;
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
    if (this.loaderFill) this.loaderFill.style.width = `${percent}%`;
    if (this.loaderText && text) this.loaderText.textContent = text;
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
    if (!this.loading || this.loading.classList.contains('hidden')) return;
    this.loading.classList.add('hidden');
    setTimeout(() => this.loading?.remove(), 600);
  }

  toast(text, type = '') {
    if (this.game?.hud?.el) {
      this.game.hud.toast(text, type);
      return;
    }
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.style.cssText = 'position:absolute;left:50%;top:16px;transform:translateX(-50%);z-index:80;pointer-events:none';
    el.textContent = text;
    this.uiRoot.appendChild(el);
    setTimeout(() => el.remove(), 3600);
  }

  async startMatch(mapId) {
    const id = mapId || settings.get('mapId');
    this.setLoading(5, 'Cargando mapa...');
    const loadingScreen = document.createElement('div');
    loadingScreen.id = 'loading-screen';
    loadingScreen.innerHTML = `<div class="loader-title">OPENNITE</div><div class="loader-bar"><div id="loader-fill" style="width:5%"></div></div><div id="loader-text">Preparando partida...</div>`;
    document.querySelector('#app').appendChild(loadingScreen);
    this.loading = loadingScreen;
    this.loaderFill = loadingScreen.querySelector('#loader-fill');
    this.loaderText = loadingScreen.querySelector('#loader-text');
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
        const status = document.querySelector('#update-status');
        if (status) status.textContent = `Actualización ${result.version} disponible`;
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

const app = new App();
window.openniteApp = app;
app.init().catch((error) => {
  console.error('Error al iniciar OpenNite:', error);
  const text = document.querySelector('#loader-text');
  if (text) text.textContent = `Error: ${error.message}`;
});
