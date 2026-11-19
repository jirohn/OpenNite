import React, { useEffect, useState } from 'react';
import { QUALITY_PRESETS } from '../core/settings.js';
import { formatTime } from '../core/utils.js';
import { bridge, click, hover } from './bridge.js';
import { bumpUi, useUi } from './store.js';

const SKINS = [0xffb45c, 0x4ecdc4, 0xff6b9d, 0x9b6dff, 0x6bd97f, 0x5aa9ff, 0xf2e35a, 0xf2f2f2];
const SKIN_NAMES = ['Ámbar', 'Cian', 'Rosa', 'Violeta', 'Esmeralda', 'Azul', 'Oro', 'Blanco'];
const hexColor = (c) => `#${Number(c).toString(16).padStart(6, '0')}`;

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

export function MenuScreen({ version }) {
  const { updateStatus } = useUi();

  useEffect(() => {
    const onKey = (e) => {
      if (e.code === 'KeyM') bridge.ui.showMaps();
      if (e.code === 'KeyO') bridge.ui.showSettings();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="screen menu-screen">
      <div className="menu-top">
        <div className="brand"><div className="brand-mark">O</div><div>
          <div className="brand-name">OPENNITE</div>
          <div className="brand-tag">Battle Royale · código abierto</div>
        </div></div>
        <div className="menu-version">v{version} · ALPHA</div>
      </div>
      <div className="menu-body">
        <div className="menu-eyebrow">Sin construcción. Solo supervivencia.</div>
        <div className="menu-title">CAE.<br /><span>SOBREVIVE.</span></div>
        <div className="menu-sub">Un battle royale libre para PC con mapas enormes, modelos y animaciones CC0, gráficos escalables y actualizaciones automáticas desde GitHub.</div>
        <div className="menu-actions">
          <Button className="primary" onClick={() => bridge.ui.showLobby()}><span className="btn-icon">▶</span> JUGAR AHORA</Button>
          <Button onClick={() => bridge.ui.showMaps()}><span className="btn-icon">🗺️</span> MAPAS <span className="key">M</span></Button>
          <Button onClick={() => bridge.ui.showSettings()}><span className="btn-icon">⚙️</span> CONFIGURACIÓN <span className="key">O</span></Button>
          <Button onClick={() => bridge.ui.showCredits()}><span className="btn-icon">ℹ️</span> CRÉDITOS</Button>
          <Button onClick={() => bridge.app.checkUpdates(true)}><span className="btn-icon">⬆️</span> BUSCAR ACTUALIZACIONES</Button>
          <Button onClick={() => bridge.app.quit()}><span className="btn-icon">⏻</span> SALIR</Button>
        </div>
      </div>
      <div className="menu-footer">
        <span>Modelos: RobotExpressive (CC0 · Quaternius)</span><span>·</span>
        <span>Mapa: Battle Royale Town and Airfield (CC0 · 3DAssets.dev)</span><span>·</span>
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
                <label>Aspecto (skin) <span className="value">{SKIN_NAMES[SKINS.indexOf(s.playerColor)] || 'Personalizado'}</span></label>
                <p className="hint" style={{ margin: '-2px 0 9px' }}>8 modelos 3D animados en la galería de la derecha. Pulsa uno para equiparlo.</p>
                <div className="skin-row">
                  {SKINS.map((c, i) => (
                    <button key={c} type="button" className={`interactive skin-swatch ${c === s.playerColor ? 'selected' : ''}`}
                      title={`${SKIN_NAMES[i]} · ${hexColor(c)}`}
                      onMouseEnter={hover}
                      onClick={click(() => set('playerColor', c))}
                      style={{ borderColor: c === s.playerColor ? 'var(--accent)' : 'var(--line)' }}>
                      <span className="skin-dot" style={{ background: hexColor(c) }} />
                      <span className="skin-name">{SKIN_NAMES[i]}</span>
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
          <Button className="small" onClick={() => bridge.ui.showMenu()}>Volver</Button>
          <Button className="primary" style={{ minWidth: 190, justifyContent: 'center' }}
            onClick={() => bridge.app.startMatch(bridge.ui.selectedMap)}>DESPLEGAR ▶</Button>
        </div>
      </div>
      <div className="skin-gallery-label"><span>Galería 3D</span><strong>8 skins animados</strong></div>
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
              <p className="section-title">Gráficos</p>
              <Slider label="Escala de resolución" min={0.5} max={1.25} step={0.05} value={s.resolutionScale} format={pct} onChange={(v) => set('resolutionScale', v)} />
              <Slider label="Distancia de dibujo" min={2} max={10} step={1} value={s.viewDistance} format={(v) => `${v * 256} m`} onChange={(v) => set('viewDistance', v)} />
              <Slider label="Densidad de vegetación" min={0} max={1.5} step={0.05} value={s.vegetation} format={pct} onChange={(v) => set('vegetation', v)} />
              <Slider label="Intensidad de efectos" min={0} max={1.5} step={0.05} value={s.effects} format={pct} onChange={(v) => set('effects', v)} />
              <Slider label="Resolución de sombras" min={512} max={4096} step={512} value={s.shadowMapSize} format={(v) => `${v} px`} onChange={(v) => set('shadowMapSize', v)} />
              <Toggle label="Sombras dinámicas" value={s.shadows} onChange={(v) => set('shadows', v)} />
              <Toggle label="Bloom / resplandor" value={s.bloom} onChange={(v) => set('bloom', v)} />
              <Toggle label="Oclusión ambiental (SSAO)" value={s.ssao} onChange={(v) => set('ssao', v)} />
            </div>
            <div>
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
            </div>
          </div>
          <p className="hint" style={{ marginTop: 18 }}>Los cambios se guardan automáticamente. Si tu equipo es modesto, usa el perfil <b>Baja</b>: resolución 68%, sin sombras ni bloom y menos vegetación.</p>
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

export function CreditsScreen() {
  return (
    <div className="screen panel-screen">
      <div className="panel">
        <div className="panel-head"><Button className="small close-x" onClick={() => bridge.ui.showMenu()}>✕</Button><h2>Créditos y licencias</h2></div>
        <div className="panel-body">
          <p className="section-title">Código</p>
          <p className="hint">OpenNite es software libre bajo licencia MIT. Interfaz: <b>React</b> (MIT) · Motor: <b>Three.js</b> (MIT) · Empaquetado: <b>Electron</b> (MIT) · Construcción: <b>Vite</b> (MIT).</p>
          <p className="section-title" style={{ marginTop: 22 }}>Modelos y animaciones</p>
          <p className="hint"><b>RobotExpressive</b> por Tomás Laulhé / Quaternius — dominio público CC0 1.0. Incluye animaciones Idle, Walking, Running, Jump, Death, Dance, Wave, Punch y más. <a href="https://quaternius.com" target="_blank" rel="noreferrer">quaternius.com</a></p>
          <p className="section-title" style={{ marginTop: 22 }}>Mapa</p>
          <p className="hint"><b>Battle Royale Town and Airfield</b> por <b>3DAssets.dev</b> — CC0 1.0 Universal. Escena 3D completa (GLB) con pueblo, aeródromo, pista, hangar y objetos de botín. No hay generación procedural de terreno: el archivo se descarga completo desde GitHub. <a href="https://3dassets.dev/packs/battle-royale-town-and-airfield" target="_blank" rel="noreferrer">Ver pack original</a></p>
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
        </div>
        <div className="panel-foot" style={{ justifyContent: 'center' }}>
          <Button className="primary" style={{ justifyContent: 'center', minWidth: 180 }} onClick={() => bridge.app.startMatch(bridge.ui.selectedMap)}>JUGAR OTRA VEZ</Button>
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
