import React, { useEffect, useState } from 'react';
import { QUALITY_PRESETS } from '../core/settings.js';
import {
  BATTLE_PASS_LEVELS, BATTLE_PASS_PRICE, FREE_TIER_CREDITS, PREMIUM_TIER_CREDITS,
  PRESETS, SHOP_ITEMS, XP_PER_LEVEL, matchXp, passRewards, xpProgress,
} from '../core/economy.js';
import { formatTime } from '../core/utils.js';
import { bridge, click, hover } from './bridge.js';
import { bumpUi, useAccount, useUi } from './store.js';

const DEFAULT_SKINS_UI = [
  { id: 'skin_preset_1', name: 'Ámbar', color: 0xffb45c },
  { id: 'skin_preset_2', name: 'Musgo', color: 0x6f8a5b },
  { id: 'skin_preset_3', name: 'Acero', color: 0x5f83a6 },
  { id: 'skin_preset_4', name: 'Teja', color: 0xa35f52 },
  { id: 'skin_preset_5', name: 'Arena', color: 0x7a6b4e },
  { id: 'skin_preset_6', name: 'Pizarra', color: 0x4e6470 },
  { id: 'skin_preset_7', name: 'Oro viejo', color: 0xb59a5e },
  { id: 'skin_preset_8', name: 'Piedra', color: 0x8b7a6a },
];
const hexColor = (c) => `#${Number(c).toString(16).padStart(6, '0')}`;
function normalizeSkinColor(s, i) {
  if (typeof s?.color === 'string') return parseInt(s.color.replace('#', ''), 16) || DEFAULT_SKINS_UI[i % DEFAULT_SKINS_UI.length].color;
  return Number(s?.color) || DEFAULT_SKINS_UI[i % DEFAULT_SKINS_UI.length].color;
}
function useSkinCatalog() {
  const [skins, setSkins] = useState(DEFAULT_SKINS_UI);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch('/config/character-skins.json', { cache: 'no-store' });
        if (!r.ok) return;
        const d = await r.json();
        const list = Array.isArray(d?.skins) ? d.skins : Array.isArray(d) ? d : [];
        if (alive && list.length) setSkins(list.map((s, i) => ({ id: s.id || `skin_${i}`, name: s.name || `Skin ${i+1}`, color: normalizeSkinColor(s, i), modelPath: s.modelPath })));
      } catch {}
    };
    load();
    const onSkins = (e) => { const list = Array.isArray(e?.detail) ? e.detail : []; if (list.length) setSkins(list.map((s, i) => ({ id: s.id || `skin_${i}`, name: s.name || `Skin ${i+1}`, color: normalizeSkinColor(s, i), modelPath: s.modelPath }))); };
    window.addEventListener('opennite:skins', onSkins);
    return () => { alive = false; window.removeEventListener('opennite:skins', onSkins); };
  }, []);
  return skins;
}
const creditsLabel = (n) => new Intl.NumberFormat('es-ES').format(n || 0);
const presetName = (id) => PRESETS.find((p) => p.id === id)?.name || id;

const Button = ({ children, className = '', onClick, ...rest }) => (
  <button type="button" className={`btn interactive ${className}`} onMouseEnter={hover} onClick={click(onClick)} {...rest}>
    {children}
  </button>
);

function Slider({ label, min, max, step, value, format, onChange }) {
  return (
    <div className="field">
      <label>{label} <span className="value">{format(value)}</span></label>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}

function Toggle({ label, value, onChange }) {
  return (
    <div className="toggle-row">
      <span>{label}</span>
      <button type="button" className={`switch interactive ${value ? 'on' : ''}`}
        onClick={click(() => onChange(!value))} onMouseEnter={hover} />
    </div>
  );
}

async function accountAction(action, successMessage) {
  try {
    const result = await action();
    if (successMessage) bridge.app.toast(successMessage, 'good');
    return result;
  } catch (error) {
    bridge.app.toast(error.message || 'No se pudo completar la operación', 'warn');
    return null;
  }
}

export function MenuScreen({ version }) {
  const { updateStatus } = useUi();
  const { profile, status, cloud } = useAccount();

  useEffect(() => {
    const onKey = (e) => {
      if (e.code === 'KeyM') bridge.ui.showMaps();
      if (e.code === 'KeyO') bridge.ui.showSettings();
      if (e.code === 'KeyT') bridge.ui.showTienda();
      if (e.code === 'KeyL') bridge.ui.showTaquilla();
      if (e.code === 'KeyB') bridge.ui.showBattlePass();
      if (e.code === 'KeyC') bridge.ui.showAccount();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="screen menu-screen">
      <div className="menu-top">
        <div className="brand">
          <img className="brand-logo" src="./assets/opennite-logo.png" alt="OpenNite" draggable="false" />
          <div className="brand-copy">
            <div className="brand-tag">Battle Royale · código abierto</div>
          </div>
        </div>
        <Button className="account-chip interactive" onClick={() => bridge.ui.showAccount()}>
          <span className="account-chip-avatar">{(profile?.displayName || 'J').slice(0, 1).toUpperCase()}</span>
          <span className="account-chip-text">
            <strong>{creditsLabel(profile?.credits)} ¢</strong>
            <small>{cloud ? profile?.displayName : status === 'connecting' ? 'Conectando...' : 'Modo offline'}</small>
          </span>
          <span className="key">C</span>
        </Button>
        <div className="menu-version">v{version} · ALPHA</div>
      </div>
      <div className="menu-body">
        <div className="menu-eyebrow">Sin construcción. Solo supervivencia.</div>
        <div className="menu-title">CAE.<br /><span>SOBREVIVE.</span></div>
        <div className="menu-sub">Un battle royale libre para PC en la isla de San Borondon: naturaleza y cofres CC0, gráficos escalables y actualizaciones automáticas desde GitHub.</div>
        <div className="menu-actions menu-actions-extended">
          <Button className="primary wide" onClick={() => bridge.ui.showLobby()}><span className="btn-icon">▶</span> JUGAR AHORA</Button>
          <Button className="wide" onClick={() => bridge.app.startTraining()}><span className="btn-icon">◎</span> ENTRENAMIENTO</Button>
          <Button onClick={() => bridge.ui.showTienda()}><span className="btn-icon">🛒</span> TIENDA <span className="key">T</span></Button>
          <Button onClick={() => bridge.ui.showTaquilla()}><span className="btn-icon">🎽</span> TAQUILLA <span className="key">L</span></Button>
          <Button onClick={() => bridge.ui.showBattlePass()}><span className="btn-icon">🏆</span> PASE DE BATALLA <span className="key">B</span></Button>
          <Button onClick={() => bridge.ui.showMaps()}><span className="btn-icon">🗺️</span> MAPAS <span className="key">M</span></Button>
          <Button onClick={() => bridge.ui.showSettings()}><span className="btn-icon">⚙️</span> CONFIGURACIÓN <span className="key">O</span></Button>
          <Button onClick={() => bridge.ui.showCredits()}><span className="btn-icon">ℹ️</span> CRÉDITOS</Button>
          <Button onClick={() => bridge.app.checkUpdates(true)}><span className="btn-icon">⬆️</span> ACTUALIZACIONES</Button>
          <Button className="wide" onClick={() => bridge.app.quit()}><span className="btn-icon">⏻</span> SALIR</Button>
        </div>
      </div>
      <div className="menu-footer">
        <span>Personajes: NoLimitNexus + KayKit (CC0)</span><span>·</span>
        <span>Mapa y cofres: San Borondon (CC0 · Quaternius)</span><span>·</span>
        <span id="update-status">{updateStatus}</span>
      </div>
    </div>
  );
}

export function LobbyScreen() {
  useUi();
  const maps = bridge.maps.list();
  const selectedMap = bridge.ui.selectedMap;
  const s = bridge.settings.all();
  const set = (key, value) => bridge.settings.set(key, value);
  const skinCatalog = useSkinCatalog();

  return (
    <div className="screen panel-screen lobby-screen">
      <div className="panel">
        <div className="panel-head">
          <Button className="small close-x" onClick={() => bridge.ui.showMenu()}>✕</Button>
          <h2>Desplegar partida</h2><div className="spacer" /><span className="status-pill">ALPHA</span>
        </div>
        <div className="panel-body">
          <div className="two-col">
            <div>
              <p className="section-title">Mapa</p>
              <div className="map-grid" style={{ gridTemplateColumns: '1fr' }}>
                {maps.map((m) => (
                  <div key={m.id} role="button" tabIndex={0}
                    className={`map-card interactive ${m.id === selectedMap ? 'selected' : ''}`}
                    onMouseEnter={hover}
                    onClick={click(() => { bridge.ui.selectedMap = m.id; set('mapId', m.id); })}
                    style={{ cursor: 'pointer', borderColor: m.id === selectedMap ? 'var(--accent)' : 'var(--line)' }}>
                    <div className="map-thumb" style={{ background: m.gradient || 'linear-gradient(135deg,#3c4b60,#7890a8)' }}>
                      <span className="map-badge">{m.size || 4096} m</span>
                    </div>
                    <div className="map-info"><h3>{m.name}</h3><p>{m.description}</p></div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="section-title">Opciones de partida</p>
              <Slider label="Rivales (bots) · 20 jugadores" min={0} max={19} step={1} value={s.maxBots}
                format={(v) => v} onChange={(v) => set('maxBots', v)} />
              <div className="field">
                <label>Dificultad <span className="value">{s.botDifficulty}</span></label>
                <select value={s.botDifficulty} onChange={(e) => set('botDifficulty', e.target.value)}>
                  <option value="easy">Fácil</option><option value="normal">Normal</option><option value="hard">Difícil</option>
                </select>
              </div>
              <div className="field">
                <label>Calidad gráfica <span className="value">{QUALITY_PRESETS[s.quality]?.name}</span></label>
                <select value={s.quality} onChange={(e) => { set('quality', e.target.value); bridge.audio?.applyVolumes?.(); }}>
                  {Object.entries(QUALITY_PRESETS).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Aspecto (skin) <span className="value">{skinCatalog.find(sk => sk.color === s.playerColor)?.name || 'Personalizado'}</span></label>
                <p className="hint" style={{ margin: '-2px 0 9px' }}>{skinCatalog.length} modelos en la galería de la derecha. Pulsa uno para equiparlo.</p>
                <div className="skin-row">
                  {skinCatalog.map((sk, i) => (
                    <button key={sk.id || sk.color || i} type="button" className={`interactive skin-swatch ${sk.color === s.playerColor ? 'selected' : ''}`}
                      title={`${sk.name} · ${hexColor(sk.color)}`}
                      onMouseEnter={hover}
                      onClick={click(() => set('playerColor', sk.color))}
                      style={{ borderColor: sk.color === s.playerColor ? 'var(--accent)' : 'var(--line)' }}>
                      <span className="skin-dot" style={{ background: hexColor(sk.color) }} />
                      <span className="skin-name">{sk.name}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="hint" style={{ marginTop: 20 }}>
                <b>Controles:</b> WASD mover · Ratón mirar · ESPACIO saltar / abrir y cerrar planeador · SHIFT correr · CLIC disparar · CLIC DCHO apuntar · R recargar · E recoger · 1-5 arma · ESC pausa.<br /><br />
                <b>Sin modo construcción.</b> La partida empieza subido al autobús; pulsa ESPACIO para saltar.
              </div>
            </div>
          </div>
        </div>
        <div className="panel-foot">
          <Button className="small" onClick={() => window.openniteApp?.openEditor?.()} style={{ background: '#21456e' }}>🔫 EDITOR DE ARMAS</Button>
          <Button className="small" onClick={() => window.openniteApp?.openMapEditor?.()} style={{ background: '#2a4a2a' }}>🗺️ EDITOR DE MAPA</Button>
          <Button className="small" onClick={() => window.openniteApp?.openPartsEditor?.()} style={{ background: '#4a3520' }}>🧱 EDITOR DE PARTES</Button>
          <Button className="small" onClick={() => window.openniteApp?.openCharacterEditor?.()} style={{ background: '#5b2d6e' }}>👤 EDITOR DE SKINS</Button>
          <Button className="small" onClick={() => bridge.ui.showMenu()}>Volver</Button>
          <Button className="primary" style={{ minWidth: 190, justifyContent: 'center' }}
            onClick={() => bridge.app.startMatch(bridge.ui.selectedMap)}>DESPLEGAR ▶</Button>
        </div>
      </div>
      <div className="skin-gallery-label"><span>Galería 3D</span><strong>{skinCatalog.length} skins</strong></div>
    </div>
  );
}

export function SettingsScreen({ back = 'menu' }) {
  useUi();
  const s = bridge.settings.all();
  const set = (key, value) => {
    bridge.settings.set(key, value);
    if (key.includes('Volume')) bridge.audio?.applyVolumes?.();
  };
  const backAction = () => back === 'pause' ? bridge.ui.showPause() : bridge.ui.showMenu();
  const pct = (v) => `${Math.round(v * 100)}%`;

  return (
    <div className="screen panel-screen">
      <div className="panel">
        <div className="panel-head">
          <Button className="small close-x" onClick={backAction}>✕</Button>
          <h2>Configuración gráfica y de juego</h2>
        </div>
        <div className="panel-body">
          <p className="section-title">Perfil de calidad</p>
          <div className="preset-row">
            {Object.entries(QUALITY_PRESETS).map(([k, v]) => (
              <div key={k} role="button" tabIndex={0}
                className={`preset interactive ${s.quality === k ? 'active' : ''}`}
                onMouseEnter={hover}
                onClick={click(() => { set('quality', k); bridge.audio?.applyVolumes?.(); })}>{v.name}</div>
            ))}
          </div>
          <div className="two-col">
            <div>
              <p className="section-title">Pantalla y gráficos</p>
              <div className="field">
                <label>Modo de pantalla <span className="value">{({ fullscreen: 'Pantalla completa', windowed: 'Ventana', borderless: 'Ventana sin bordes' })[s.displayMode || 'fullscreen'] || 'Pantalla completa'}</span></label>
                <select value={s.displayMode || 'fullscreen'} onChange={(e) => {
                  const mode = e.target.value;
                  set('displayMode', mode);
                  window.opennite?.window?.setDisplayMode?.(mode);
                }}>
                  <option value="fullscreen">Pantalla completa</option>
                  <option value="windowed">Ventana</option>
                  <option value="borderless">Ventana sin bordes</option>
                </select>
              </div>
              <p className="hint" style={{ margin: '-2px 0 14px' }}>Por defecto se inicia en pantalla completa. Cambiar entre ventana y modos sin bordes puede requerir reiniciar el juego para aplicar el marco correctamente.</p>
              <Slider label="Escala de resolución" min={0.5} max={1.25} step={0.05} value={s.resolutionScale} format={pct} onChange={(v) => set('resolutionScale', v)} />
              <Slider label="Distancia de dibujo" min={2} max={10} step={1} value={s.viewDistance} format={(v) => `${v * 256} m`} onChange={(v) => set('viewDistance', v)} />
              <Slider label="Distancia de renderizado" min={120} max={1200} step={20} value={s.renderDistance ?? 320} format={(v) => `${v} m`} onChange={(v) => set('renderDistance', v)} />
              <Slider label="Distancia de detalles" min={60} max={800} step={10} value={s.detailDistance ?? 180} format={(v) => `${v} m`} onChange={(v) => set('detailDistance', v)} />
              <Slider label="Densidad de vegetación" min={0} max={1.5} step={0.05} value={s.vegetation} format={pct} onChange={(v) => set('vegetation', v)} />
              <Slider label="Intensidad de efectos" min={0} max={1.5} step={0.05} value={s.effects} format={pct} onChange={(v) => set('effects', v)} />
              <Slider label="Resolución de sombras" min={512} max={4096} step={512} value={s.shadowMapSize} format={(v) => `${v} px`} onChange={(v) => set('shadowMapSize', v)} />
              <Toggle label="Sombras dinámicas" value={s.shadows} onChange={(v) => set('shadows', v)} />
              <Toggle label="Bloom / resplandor" value={s.bloom} onChange={(v) => set('bloom', v)} />
              <Toggle label="Oclusión ambiental (SSAO)" value={s.ssao} onChange={(v) => set('ssao', v)} />
            </div>
            <div>
              <p className="section-title">Cámara (hombro derecho)</p>
              <Slider label="Desplazamiento lateral" min={0.25} max={2.4} step={0.05} value={s.cameraShoulder}
                format={(v) => `${Number(v).toFixed(2)} m`} onChange={(v) => set('cameraShoulder', v)} />
              <Slider label="Distancia de cámara" min={1.8} max={6} step={0.1} value={s.cameraDistance}
                format={(v) => `${Number(v).toFixed(1)} m`} onChange={(v) => set('cameraDistance', v)} />
              <p className="hint" style={{ margin: '-2px 0 14px' }}>La cámara va a la derecha del personaje para que la cabeza no tape la mira. Ajusta estos dos valores a tu gusto.</p>
              <p className="section-title">Juego y audio</p>
              <Slider label="Campo de visión" min={60} max={110} step={1} value={s.fov} format={(v) => `${v}°`} onChange={(v) => set('fov', v)} />
              <Slider label="Sensibilidad del ratón" min={0.0004} max={0.006} step={0.0001} value={s.sensitivity} format={(v) => (v * 1000).toFixed(1)} onChange={(v) => set('sensitivity', v)} />
              <Slider label="Número de rivales · 20 jugadores" min={0} max={19} step={1} value={s.maxBots} format={(v) => `${v}`} onChange={(v) => set('maxBots', v)} />
              <Slider label="Volumen general" min={0} max={1} step={0.05} value={s.masterVolume} format={pct} onChange={(v) => set('masterVolume', v)} />
              <Slider label="Volumen de efectos" min={0} max={1} step={0.05} value={s.sfxVolume} format={pct} onChange={(v) => set('sfxVolume', v)} />
              <Slider label="Volumen ambiental" min={0} max={1} step={0.05} value={s.musicVolume} format={pct} onChange={(v) => set('musicVolume', v)} />
              <Toggle label="Invertir eje Y" value={s.invertY} onChange={(v) => set('invertY', v)} />
              <Toggle label="Mostrar FPS" value={s.showFPS} onChange={(v) => set('showFPS', v)} />
              <Toggle label="Números de daño" value={s.showDamageNumbers} onChange={(v) => set('showDamageNumbers', v)} />
              <Toggle label="Modo debug (cajas de colisión + ejes X/Y/Z)" value={s.debugMode} onChange={(v) => set('debugMode', v)} />
            </div>
          </div>
          <p className="hint" style={{ marginTop: 18 }}>Los cambios se guardan automáticamente. Si tu equipo es modesto, usa el perfil <b>Baja</b>, reduce la escala de resolución y usa pantalla completa para mejorar el rendimiento.</p>
        </div>
        <div className="panel-foot"><Button className="primary" onClick={backAction}>Volver</Button></div>
      </div>
    </div>
  );
}

export function MapsScreen({ back = 'menu' }) {
  useUi();
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(null);
  const backAction = () => back === 'pause' ? bridge.ui.showPause() : bridge.ui.showMenu();

  useEffect(() => {
    let alive = true;
    bridge.maps.refreshCatalog(false).finally(() => { if (alive) bumpUi(); });
    return () => { alive = false; };
  }, []);

  const refresh = async () => {
    setRefreshing(true);
    try { await bridge.maps.refreshCatalog(true); } finally { setRefreshing(false); bumpUi(); }
  };
  const install = async (id) => {
    setBusy(id);
    try {
      await bridge.maps.install(id);
      bridge.app.toast('Mapa instalado correctamente', 'good');
    } catch (error) {
      bridge.app.toast(`Error: ${error.message}`, 'warn');
    } finally { setBusy(null); bumpUi(); }
  };
  const remove = async (id) => { await bridge.maps.uninstall(id); bumpUi(); };
  const select = (id) => {
    bridge.ui.selectedMap = id;
    bridge.settings.set('mapId', id);
    bridge.app.toast(`${bridge.maps.get(id)?.name} seleccionado`, 'good');
    bumpUi();
  };

  return (
    <div className="screen panel-screen">
      <div className="panel">
        <div className="panel-head">
          <Button className="small close-x" onClick={backAction}>✕</Button>
          <h2>Mapas descargables</h2><div className="spacer" />
          <Button className="small" onClick={refresh} disabled={refreshing}>
            {refreshing ? <><span className="loading-inline" /> Buscando...</> : '↻ Buscar novedades en GitHub'}
          </Button>
        </div>
        <div className="panel-body">
          <p className="hint" style={{ marginBottom: 18 }}>Los mapas se descargan gratis desde el repositorio de OpenNite y se guardan en tu equipo. Puedes jugar en ellos sin conexión después de instalarlos.</p>
          <div className="map-grid">
            {bridge.maps.list().map((m) => {
              const usable = bridge.maps.isInstalled(m.id) || m.bundled;
              const selected = bridge.ui.selectedMap === m.id;
              const loading = busy === m.id;
              return (
                <div key={m.id} className="map-card">
                  <div className="map-thumb" style={{ background: m.gradient || 'linear-gradient(135deg,#3c4b60,#7890a8)' }}>
                    <span className="map-badge">{m.size || 4096} m</span>
                  </div>
                  <div className="map-info">
                    <h3>{m.name}</h3><p>{m.description}</p>
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 10 }}>
                      {(m.tags || []).map((t) => <span key={t} className="status-pill" style={{ background: 'rgba(255,255,255,0.08)', color: '#b9c4d2' }}>{t}</span>)}
                    </div>
                  </div>
                  <div style={{ padding: '0 14px 14px', display: 'flex', gap: 6 }}>
                    {usable
                      ? <Button className={`small ${selected ? 'primary' : ''}`} style={{ flex: 1, justifyContent: 'center' }} onClick={() => select(m.id)}>{selected ? 'SELECCIONADO' : 'USAR'}</Button>
                      : <Button className="small primary" style={{ flex: 1, justifyContent: 'center' }} disabled={loading} onClick={() => install(m.id)}>
                        {loading ? <><span className="loading-inline" /> Descargando...</> : 'DESCARGAR'}
                      </Button>}
                    {bridge.maps.isInstalled(m.id) && <Button className="small" title="Desinstalar" onClick={() => remove(m.id)}>✕</Button>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="panel-foot"><Button className="primary" onClick={backAction}>Volver</Button></div>
      </div>
    </div>
  );
}

export function TiendaScreen() {
  const { profile } = useAccount();
  const [busy, setBusy] = useState(null);
  const [category, setCategory] = useState('Todos');
  const categories = ['Todos', 'Trajes', 'Colores'];
  const credits = profile?.credits || 0;
  const owned = profile?.owned || [];
  const items = SHOP_ITEMS.filter((item) => category === 'Todos' || item.category === category);

  const buy = async (item) => {
    setBusy(item.id);
    await accountAction(
      () => bridge.account.purchaseItem(item.id),
      `${item.name} añadido a tu taquilla`,
    );
    setBusy(null);
  };

  return (
    <div className="screen panel-screen economy-screen">
      <div className="panel">
        <div className="panel-head">
          <Button className="small close-x" onClick={() => bridge.ui.showMenu()}>✕</Button>
          <h2>Tienda</h2><div className="spacer" />
          <span className="credit-pill">¢ {creditsLabel(credits)}</span>
        </div>
        <div className="panel-body">
          <p className="hint" style={{ marginBottom: 16 }}>
            Gana créditos con las recompensas del pase de batalla. Los artículos se guardan en tu taquilla y se aplican al instante en la galería 3D.
          </p>
          <div className="preset-row">
            {categories.map((name) => (
              <Button key={name} className={`small ${category === name ? 'primary' : ''}`}
                style={{ justifyContent: 'center' }} onClick={() => setCategory(name)}>{name}</Button>
            ))}
          </div>
          <div className="shop-grid">
            {items.map((item) => {
              const isOwned = owned.includes(item.id);
              const loading = busy === item.id;
              return (
                <div key={item.id} className="shop-card">
                  <div className="shop-art" style={{ background: `linear-gradient(145deg, ${hexColor(item.color)}, #111722 78%)` }}>
                    <span className="shop-kind">{item.category}</span>
                    <span className="shop-swatch" style={{ background: hexColor(item.color) }} />
                  </div>
                  <div className="shop-info">
                    <h3>{item.name}</h3>
                    <p>{item.description}</p>
                    {item.preset && <span className="status-pill">{presetName(item.preset)}</span>}
                  </div>
                  <div className="shop-foot">
                    <span className="price">{isOwned ? 'EN TU TAQUILLA' : <>¢ {creditsLabel(item.price)}</>}</span>
                    <Button className={`small ${!isOwned ? 'primary' : ''}`} disabled={isOwned || loading || credits < item.price}
                      onClick={() => buy(item)}>
                      {loading ? <><span className="loading-inline" /> Comprando...</> : isOwned ? 'ADQUIRIDO' : 'COMPRAR'}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="panel-foot"><Button className="primary" onClick={() => bridge.ui.showTaquilla()}>IR A MI TAQUILLA →</Button></div>
      </div>
    </div>
  );
}

export function TaquillaScreen() {
  const { profile } = useAccount();
  const [busy, setBusy] = useState(null);
  const owned = profile?.owned || [];
  const equipped = profile?.equipped || { preset: 'islander', color: 0xffb45c };
  const presets = PRESETS.filter((p) => p.id === 'islander' || owned.includes(`preset_${p.id}`));
  const colors = SHOP_ITEMS.filter((item) => item.category === 'Colores' && owned.includes(item.id));

  const equip = async (key, options) => {
    setBusy(key);
    await accountAction(() => bridge.account.equip(options), 'Aspecto equipado');
    setBusy(null);
  };

  return (
    <div className="screen panel-screen economy-screen">
      <div className="panel">
        <div className="panel-head">
          <Button className="small close-x" onClick={() => bridge.ui.showMenu()}>✕</Button>
          <h2>Taquilla</h2><div className="spacer" />
          <span className="status-pill">{presets.length} trajes · {colors.length + 1} colores</span>
        </div>
        <div className="panel-body">
          <div className="equipped-banner">
            <div className="equipped-avatar" style={{ background: `linear-gradient(145deg, ${hexColor(equipped.color)}, #18202c)` }} />
            <div><small>EQUIPADO AHORA</small><h3>{presetName(equipped.preset)}</h3><p>Color {hexColor(equipped.color)}</p></div>
          </div>
          <p className="section-title" style={{ marginTop: 22 }}>Trajes</p>
          <div className="locker-grid">
            {presets.map((preset) => {
              const id = `preset_${preset.id}`;
              const active = equipped.preset === preset.id;
              return (
                <div key={preset.id} className={`locker-card ${active ? 'active' : ''}`}>
                  <div className="locker-art" style={{ background: `linear-gradient(150deg, ${hexColor(preset.color)}, #151b26)` }}>
                    <span className="locker-figure">♟</span>
                  </div>
                  <div className="locker-info"><h4>{preset.name}</h4><span>{active ? 'EN USO' : 'DISPONIBLE'}</span></div>
                  <Button className="small" style={{ justifyContent: 'center' }} disabled={active || busy === id}
                    onClick={() => equip(id, { preset: preset.id })}>{active ? 'EQUIPADO' : 'EQUIPAR'}</Button>
                </div>
              );
            })}
          </div>
          <p className="section-title" style={{ marginTop: 24 }}>Colores</p>
          <div className="color-row">
            <button type="button" className={`color-chip interactive ${equipped.color === 0xffb45c ? 'selected' : ''}`}
              onMouseEnter={hover} onClick={click(() => equip('default', { color: 0xffb45c }))}
              title="Color original">
              <span style={{ background: hexColor(0xffb45c) }} /><small>ORIGINAL</small>
            </button>
            {colors.map((item) => (
              <button key={item.id} type="button" className={`color-chip interactive ${equipped.color === item.color ? 'selected' : ''}`}
                onMouseEnter={hover} onClick={click(() => equip(item.id, { color: item.color }))}
                title={item.name}>
                <span style={{ background: hexColor(item.color) }} /><small>{item.name.replace('Color · ', '').toUpperCase()}</small>
              </button>
            ))}
          </div>
          {colors.length === 0 && <p className="hint">Aún no tienes colores. Cómpralos en la tienda con tus créditos.</p>}
        </div>
        <div className="panel-foot">
          <Button onClick={() => bridge.ui.showTienda()}>IR A LA TIENDA</Button>
          <Button className="primary" onClick={() => bridge.ui.showLobby()}>VOLVER AL LOBBY</Button>
        </div>
      </div>
    </div>
  );
}

export function BattlePassScreen() {
  const { profile } = useAccount();
  const [busy, setBusy] = useState(null);
  const credits = profile?.credits || 0;
  const pass = profile?.battlePass || { premium: false, level: 1, claimed: [] };
  const progress = xpProgress(profile?.xp || 0);
  const rewards = passRewards();

  const buyPass = async () => {
    setBusy('pass');
    await accountAction(() => bridge.account.purchaseBattlePass(), 'Pase premium activado');
    setBusy(null);
  };
  const claim = async (track, level) => {
    const key = `${track}${level}`;
    setBusy(key);
    await accountAction(() => bridge.account.claimReward(track, level), `+${track === 'premium' ? PREMIUM_TIER_CREDITS : FREE_TIER_CREDITS} créditos`);
    setBusy(null);
  };

  return (
    <div className="screen panel-screen economy-screen">
      <div className="panel pass-panel">
        <div className="panel-head">
          <Button className="small close-x" onClick={() => bridge.ui.showMenu()}>✕</Button>
          <h2>Pase de batalla</h2><div className="spacer" />
          <span className="credit-pill">¢ {creditsLabel(credits)}</span>
        </div>
        <div className="panel-body">
          <div className="pass-summary">
            <div className="pass-level"><small>NIVEL</small><strong>{pass.level}</strong><span>de {BATTLE_PASS_LEVELS}</span></div>
            <div className="pass-progress">
              <div className="pass-progress-head"><b>{pass.premium ? 'PASE PREMIUM' : 'PASE GRATUITO'}</b><span>{progress.current} / {XP_PER_LEVEL} XP</span></div>
              <div className="xp-bar"><div style={{ width: `${progress.percent}%` }} /></div>
              <p className="hint">Sube de nivel jugando: cada partida da XP por supervivencia, eliminaciones y puesto final.</p>
            </div>
            {!pass.premium && (
              <Button className="primary buy-pass" disabled={busy === 'pass' || credits < BATTLE_PASS_PRICE} onClick={buyPass}>
                {busy === 'pass' ? <><span className="loading-inline" /> Procesando...</> : <>COMPRAR POR ¢ {creditsLabel(BATTLE_PASS_PRICE)}</>}
              </Button>
            )}
          </div>
          <p className="hint" style={{ margin: '18px 0 10px' }}>
            Recompensa gratuita: <b>{creditsLabel(FREE_TIER_CREDITS)} × {BATTLE_PASS_LEVELS} = 200 ¢</b>.
            Recompensa premium: <b>{creditsLabel(PREMIUM_TIER_CREDITS)} × {BATTLE_PASS_LEVELS} = 1000 ¢</b>. El pase cuesta <b>800 ¢</b>.
          </p>
          <div className="pass-grid">
            {rewards.map((row) => {
              const claimFree = pass.claimed.includes(row.free.id);
              const claimPremium = pass.claimed.includes(row.premium.id);
              const unlocked = row.level <= pass.level;
              return (
                <div key={row.level} className={`pass-row ${unlocked ? 'unlocked' : ''}`}>
                  <div className="pass-tier">{row.level}</div>
                  <div className="reward-card free">
                    <span>GRATIS</span><b>¢ {FREE_TIER_CREDITS}</b>
                    <Button className="small" disabled={claimFree || !unlocked || busy === `free${row.level}`}
                      onClick={() => claim('free', row.level)}>
                      {busy === `free${row.level}` ? '...' : claimFree ? 'RECLAMADO' : unlocked ? 'RECLAMAR' : 'BLOQUEADO'}
                    </Button>
                  </div>
                  <div className={`reward-card premium ${pass.premium ? '' : 'locked'}`}>
                    <span>PREMIUM</span><b>¢ {PREMIUM_TIER_CREDITS}</b>
                    <Button className="small" disabled={!pass.premium || claimPremium || !unlocked || busy === `premium${row.level}`}
                      onClick={() => claim('premium', row.level)}>
                      {busy === `premium${row.level}` ? '...' : claimPremium ? 'RECLAMADO' : !pass.premium ? 'SIN PASE' : unlocked ? 'RECLAMAR' : 'BLOQUEADO'}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="panel-foot"><Button className="primary" onClick={() => bridge.ui.showMenu()}>VOLVER</Button></div>
      </div>
    </div>
  );
}

export function AccountScreen() {
  const { profile, status, cloud, configured, error, projectId } = useAccount();
  const [busy, setBusy] = useState(false);

  const signIn = async () => {
    setBusy(true);
    await accountAction(() => bridge.account.signIn(), 'Sesión iniciada con Google');
    setBusy(false);
  };
  const signOut = async () => {
    setBusy(true);
    await accountAction(() => bridge.account.signOut(), 'Sesión cerrada');
    setBusy(false);
  };

  const statusText = status === 'signed-in' ? 'Conectado con Google'
    : status === 'connecting' ? 'Conectando con Firebase...'
      : configured ? 'Sin sesión iniciada' : 'Modo offline (guardado en este equipo)';

  return (
    <div className="screen panel-screen economy-screen">
      <div className="panel account-panel">
        <div className="panel-head">
          <Button className="small close-x" onClick={() => bridge.ui.showMenu()}>✕</Button>
          <h2>Mi cuenta</h2><div className="spacer" /><span className="status-pill">{cloud ? 'FIREBASE' : 'LOCAL'}</span>
        </div>
        <div className="panel-body">
          <div className="account-hero">
            <div className="account-avatar">{profile?.photoURL
              ? <img src={profile.photoURL} alt="" />
              : (profile?.displayName || 'J').slice(0, 1).toUpperCase()}</div>
            <div><h3>{profile?.displayName || 'Jugador local'}</h3>
              <p>{profile?.email || statusText}</p>
              <span className="status-pill">{statusText}</span></div>
          </div>
          {error && <p className="hint error-text">{error}</p>}
          {!configured && (
            <div className="hint offline-note">
              <b>Inicio con Google / Firebase no disponible</b>: faltan las variables de entorno del proyecto.<br />
              1) Copia <code>.env.example</code> a <code>.env.local</code> (local, sin subir secretos).<br />
              2) Rellena <code>VITE_FIREBASE_API_KEY</code>, <code>AUTH_DOMAIN</code>, <code>PROJECT_ID</code>, <code>APP_ID</code>, etc.<br />
              3) Habilita Google en Firebase Auth, añade dominios autorizados y despliega <code>firestore.rules</code> y <code>functions/</code>.<br />
              4) Recompila/reinicia la app. Mientras tanto, créditos, pase y taquilla se guardan solo en este equipo.
            </div>
          )}
          <div className="account-stats">
            <div><b>¢ {creditsLabel(profile?.credits)}</b><span>Créditos</span></div>
            <div><b>{profile?.level || 1}</b><span>Nivel del pase</span></div>
            <div><b>{profile?.stats?.matches || 0}</b><span>Partidas</span></div>
            <div><b>{profile?.stats?.wins || 0}</b><span>Victorias</span></div>
            <div><b>{profile?.stats?.kills || 0}</b><span>Eliminaciones</span></div>
            <div><b>{profile?.xp || 0}</b><span>XP total</span></div>
          </div>
          {configured && !cloud && status !== 'connecting' && (
            <Button className="primary google-button" disabled={busy} onClick={signIn}>
              {busy ? <><span className="loading-inline" /> Conectando...</> : <><span className="btn-icon">G</span> INICIAR SESIÓN CON GOOGLE</>}
            </Button>
          )}
          {cloud && (
            <Button className="google-button" disabled={busy} onClick={signOut}>
              {busy ? 'Cerrando sesión...' : 'CERRAR SESIÓN'}
            </Button>
          )}
          {projectId && <p className="hint" style={{ marginTop: 12 }}>Proyecto Firebase: <code>{projectId}</code></p>}
        </div>
        <div className="panel-foot">
          <Button onClick={() => bridge.ui.showBattlePass()}>VER PASE DE BATALLA</Button>
          <Button className="primary" onClick={() => bridge.ui.showMenu()}>VOLVER</Button>
        </div>
      </div>
    </div>
  );
}

export function CreditsScreen() {
  return (
    <div className="screen panel-screen">
      <div className="panel">
        <div className="panel-head"><Button className="small close-x" onClick={() => bridge.ui.showMenu()}>✕</Button><h2>Créditos y licencias</h2></div>
        <div className="panel-body">
          <p className="section-title">Código</p>
          <p className="hint">OpenNite es software libre bajo licencia MIT. Interfaz: <b>React</b> (MIT) · Motor: <b>Three.js</b> (MIT) · Empaquetado: <b>Electron</b> (MIT) · Construcción: <b>Vite</b> (MIT).</p>
          <p className="section-title" style={{ marginTop: 22 }}>Modelos y animaciones</p>
          <p className="hint"><b>Personajes humanoides modulares</b> de <a href="https://github.com/NoLimitNexus/game-models" target="_blank" rel="noreferrer">NoLimitNexus/game-models</a> — CC0. Cuerpo y 19 piezas intercambiables; esqueleto y <b>132 animaciones KayKit</b> de <a href="https://kaylousberg.com" target="_blank" rel="noreferrer">Kay Lousberg</a> — CC0 1.0. Licencia incluida en <code>public/models/opennite/library/licenses/</code>.</p>
          <p className="section-title" style={{ marginTop: 22 }}>Mapa</p>
          <p className="hint"><b>San Borondon</b> es una isla pequeña de 360 m creada para OpenNite: costa irregular con ensenadas y acantilados, playas, caminos, puerto con muelles, faro, caserío denso y ruinas propios. Árboles, césped, flores y rocas del <b>Stylized Nature MegaKit</b> de <b>Quaternius</b> — CC0 1.0 Universal. <a href="https://quaternius.itch.io/stylized-nature-megakit" target="_blank" rel="noreferrer">Ver pack original</a></p>
          <p className="hint">Los <b>cofres reales</b>, cajas, barriles, puestos de mercado, mesas, bancos y antorchas proceden del <b>Fantasy Props MegaKit</b> de <b>Quaternius</b> — CC0 1.0 Universal. <a href="https://quaternius.itch.io/fantasy-props-megakit" target="_blank" rel="noreferrer">Ver pack original</a></p>
          <p className="section-title" style={{ marginTop: 22 }}>Efectos y audio</p>
          <p className="hint">Armas y vehículos generados por código (geometría procedural propia). Partículas, trazadoras, impactos y cielo generados en tiempo real. Todos los sonidos se sintetizan con WebAudio: no hay archivos de audio de terceros.</p>
          <p className="section-title" style={{ marginTop: 22 }}>Aviso</p>
          <p className="hint">Este proyecto es un homenaje libre al género battle royale. No está afiliado a Epic Games. Fortnite® es una marca registrada de Epic Games. No se usan recursos visuales ni sonoros de ese juego.</p>
        </div>
        <div className="panel-foot"><Button className="primary" onClick={() => bridge.ui.showMenu()}>Volver</Button></div>
      </div>
    </div>
  );
}

export function PauseScreen() {
  return (
    <div className="screen panel-screen">
      <div className="panel" style={{ width: 'min(460px,92vw)' }}>
        <div className="panel-head"><h2>Partida en pausa</h2></div>
        <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Button className="primary" style={{ justifyContent: 'center' }} onClick={() => bridge.app.resumeGame()}>CONTINUAR</Button>
          <Button style={{ justifyContent: 'center' }} onClick={() => bridge.ui.showSettings('pause')}>CONFIGURACIÓN</Button>
          <Button style={{ justifyContent: 'center' }} onClick={() => bridge.ui.showMaps('pause')}>MAPAS</Button>
          <Button className="danger" style={{ justifyContent: 'center' }} onClick={() => bridge.app.returnToMenu()}>ABANDONAR PARTIDA</Button>
        </div>
      </div>
    </div>
  );
}

export function ResultsScreen({ result }) {
  useAccount();
  const xp = matchXp(result);
  return (
    <div className="screen panel-screen">
      <div className="panel result-card" style={{ width: 'min(560px,92vw)' }}>
        <div className="panel-body">
          <div className="banner-title" style={{ color: result.victory ? 'var(--accent)' : 'var(--danger)' }}>{result.victory ? 'VICTORIA' : 'ELIMINADO'}</div>
          <div className="result-rank">#{result.rank}</div>
          <div className="result-stats">
            <div className="result-stat"><b>{result.kills}</b><span>Eliminaciones</span></div>
            <div className="result-stat"><b>{result.damage}</b><span>Daño</span></div>
            <div className="result-stat"><b>{formatTime(result.time)}</b><span>Supervivencia</span></div>
          </div>
          <p className="hint">Mapa: {result.map}</p>
          <div className="reward-line"><b>+{xp} XP</b><span>Reclamable en el pase de batalla</span></div>
        </div>
        <div className="panel-foot" style={{ justifyContent: 'center' }}>
          <Button className="primary" style={{ justifyContent: 'center', minWidth: 180 }} onClick={() => bridge.app.startMatch(bridge.ui.selectedMap)}>JUGAR OTRA VEZ</Button>
          <Button style={{ justifyContent: 'center' }} onClick={() => bridge.ui.showBattlePass()}>VER PASE</Button>
          <Button style={{ justifyContent: 'center' }} onClick={() => bridge.app.returnToMenu()}>MENÚ</Button>
        </div>
      </div>
    </div>
  );
}

export function UpdateScreen({ info }) {
  const { updateProgress } = useUi();
  return (
    <div className="screen panel-screen">
      <div className="panel" style={{ width: 'min(520px,92vw)' }}>
        <div className="panel-head"><h2>Actualización disponible</h2></div>
        <div className="panel-body">
          <p className="hint">Hay una nueva versión de OpenNite (<b>{info.version}</b>) publicada en GitHub. Se descargará en segundo plano y se instalará al cerrar el juego.</p>
          <div className="update-bar"><div id="upd-progress" style={{ width: `${updateProgress.percent}%` }} /></div>
          <p className="hint" id="upd-text" style={{ marginTop: 10 }}>{updateProgress.text || 'Pulsa descargar para empezar.'}</p>
        </div>
        <div className="panel-foot">
          <Button onClick={() => bridge.ui.showMenu()}>Cerrar</Button>
          <Button className="primary" onClick={() => bridge.app.downloadUpdate()}>Descargar e instalar</Button>
        </div>
      </div>
    </div>
  );
}
