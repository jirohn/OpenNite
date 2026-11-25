import { bridge } from './bridge.js';
import { bumpUi, uiStore } from './store.js';

/**
 * Controlador de la interfaz. La UI está hecha con React; esta clase mantiene
 * la API que ya usan App y Game para no tocar la lógica del motor.
 */
export class UI {
  constructor(root, app, settings, maps, audio, account) {
    this.root = root;
    this.app = app;
    this.settings = settings;
    this.maps = maps;
    this.audio = audio;
    this.account = account;
    this.current = null;
    this.selectedMap = settings.get('mapId');

    Object.assign(bridge, { app, ui: this, settings, maps, audio, account });
    settings.onChange(() => bumpUi());
  }

  clear() {
    this.current = null;
    uiStore.setState({ screen: null, props: {} });
  }

  setScreen(screen, props = {}) {
    this.current = screen;
    this.app.game?.setSkinPreview?.(screen === 'taquilla');
    uiStore.setState({ screen, props });
  }

  showMenu() {
    this.setScreen('menu', { version: this.app.version });
  }

  /** Relee el índice de mapas (p. ej. tras guardar en el editor) y repinta. */
  refreshMaps() {
    return this.maps.reloadIndex?.().then(async () => {
      // El editor de mapas marca en la configuración el último mapa guardado.
      try {
        const disk = await window.opennite?.settings?.get?.();
        if (disk?.mapId && disk.mapId !== this.settings.get('mapId') && this.maps.get(disk.mapId)) this.settings.set('mapId', disk.mapId);
      } catch { /* sin Electron */ }
      const saved = this.settings.get('mapId');
      if (saved && this.maps.get(saved)) this.selectedMap = saved;
      bumpUi();
    }).catch(() => {});
  }

  showLobby() {
    this.refreshMaps();
    const maps = this.maps.list();
    if (!maps.some((m) => m.id === this.selectedMap)) {
      this.selectedMap = maps[0]?.id || 'san-borondon';
      this.settings.set('mapId', this.selectedMap);
    }
    this.setScreen('lobby');
  }

  showSettings(back = 'menu') {
    this.setScreen('settings', { back });
  }

  showMaps(back = 'menu') {
    this.refreshMaps();
    this.setScreen('maps', { back });
  }

  showCredits() {
    this.setScreen('credits');
  }

  showTienda() {
    this.setScreen('tienda');
  }

  showTaquilla() {
    this.setScreen('taquilla');
  }

  showBattlePass() {
    this.setScreen('battlepass');
  }

  showAccount() {
    this.setScreen('account');
  }

  showPause() {
    this.setScreen('pause');
  }

  showResults(result) {
    this.setScreen('results', { result });
  }

  showUpdate(info) {
    this.setScreen('update', { info });
  }

  setUpdateProgress(percent, text) {
    uiStore.setState({
      updateProgress: { percent, text },
      updateStatus: text || '',
    });
  }
}
