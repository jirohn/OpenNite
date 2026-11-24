import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { settings } from './core/settings.js';
import { account } from './core/account.js';
import { AudioEngine } from './core/audio.js';
import { Input } from './core/input.js';
import { MapManager } from './core/map-manager.js';
import { loadGunConfig } from './game/gun-config.js';
import { Game } from './game/game.js';
import { UI } from './ui/ui.js';
import { App } from './ui/App.jsx';
import { accountStore, pushHudToast, uiStore } from './ui/store.js';

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

    this.setLoading(12, 'Preparando cuenta...');
    account.subscribe((snapshot) => accountStore.setState(snapshot));
    await account.init();

    // Colocación del arma exportada desde el editor (tools/gun-config.json).
    await loadGunConfig();

    this.setLoading(18, 'Leyendo mapas...');
    this.maps = await new MapManager().init();
    // Un mapa guardado en versiones anteriores puede ya no existir. Corregirlo
    // aquí evita que "JUGAR AHORA" intente cargar un JSON inexistente.
    this.resolveMapId(settings.get('mapId'));

    this.audio = new AudioEngine(settings);
    this.input = new Input(this.canvas);
    this.ui = new UI(this.uiRoot, this, settings, this.maps, this.audio, account);
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

  /** Devuelve un id de mapa instalado y lo persiste si el guardado era obsoleto. */
  resolveMapId(requested) {
    const maps = this.maps?.list?.() || [];
    const valid = requested && maps.some((m) => m.id === requested);
    const id = valid ? requested : (maps[0]?.id || 'san-borondon');
    if (settings.get('mapId') !== id) settings.set('mapId', id);
    return id;
  }

  async startMatch(mapId) {
    const id = this.resolveMapId(mapId || settings.get('mapId'));
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

  async startTraining() {
    this.setLoading(5, 'Cargando entrenamiento en la isla...');
    try {
      const id = this.resolveMapId(settings.get('mapId'));
      const map = await this.maps.getMapData(id);
      this.ui.clear();
      await this.game.startMatch({
        map,
        training: true,
        bots: 0,
        difficulty: 'easy',
      });
      this.hideLoading();
    } catch (error) {
      console.error(error);
      this.toast(`No se pudo iniciar entrenamiento: ${error.message}`, 'warn');
      this.hideLoading();
      this.ui.showMenu();
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
    this.awardMatch(result);
  }

  async awardMatch(result) {
    const matchId = result.matchId || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    result.matchId = matchId;
    try {
      const reward = await account.awardMatch({ ...result, matchId });
      if (reward.alreadyAwarded) return;
      if (reward.levelsGained > 0) {
        this.toast(`Pase de batalla: nivel ${account.profile.battlePass.level} desbloqueado`, 'good');
      } else {
        this.toast(`+${reward.xp} XP de partida`, 'good');
      }
    } catch (error) {
      console.warn('No se pudo registrar la partida:', error);
      this.toast('Progreso no sincronizado. Revisa tu cuenta.', 'warn');
    }
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

  /** Abre la app aparte del Editor de armas (servida desde /tools/gun-editor.html). */
  openEditor() {
    if (this.input?.releaseLock) this.input.releaseLock();
    setTimeout(() => { window.location.assign('/tools/gun-editor.html'); }, 30);
  }

  /** Abre la app aparte del Editor de mapa (servida desde /tools/map-editor.html). */
  openMapEditor() {
    if (this.input?.releaseLock) this.input.releaseLock();
    setTimeout(() => { window.location.assign('/tools/map-editor.html'); }, 30);
  }

  /** Abre la app aparte del Editor de partes/piezas (servida desde /tools/parts-editor.html). */
  openPartsEditor() {
    if (this.input?.releaseLock) this.input.releaseLock();
    setTimeout(() => { window.location.assign('/tools/parts-editor.html'); }, 30);
  }

  /** Abre el Editor de Skins/Personajes (servido desde /tools/character-editor.html). */
  openCharacterEditor() {
    if (this.input?.releaseLock) this.input.releaseLock();
    setTimeout(() => { window.location.assign('/tools/character-editor.html'); }, 30);
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
