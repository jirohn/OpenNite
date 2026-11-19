import React from 'react';
import { bridge, hover } from './bridge.js';
import { useHud } from './store.js';

export function Hud() {
  const h = useHud();

  if (!h.mounted) return null;

  return (
    <div className="hud">
      <div id="crosshair" className={`crosshair ${h.hit ? 'hit' : ''}`} style={{ opacity: h.hiddenCrosshair ? 0 : 1 }} />
      {h.showLockPrompt && (
        <button type="button" className="interactive lock-overlay" onMouseEnter={hover}
          onClick={() => bridge.hud?.input?.requestLock?.()}>
          <span>CLIC PARA FIJAR EL RATÓN</span>
          <small>Si no se fija, mantén pulsado el CLIC IZQUIERDO y mueve el ratón para mirar</small>
        </button>
      )}
      <div className="hud-top-left">
        <div className="map-label" id="hud-map">{h.mapName}</div>
        <div className="kill-feed" id="kill-feed">
          {h.kills.map((k, i) => (
            <div className="kill-entry" key={`${k.killer}-${k.victim}-${i}`}>
              <b>{k.killer}</b> {k.weapon ? `【${k.weapon}】` : '✕'} {k.victim}
            </div>
          ))}
        </div>
      </div>
      <div className="hud-top-center">
        <div className="alive-count"><span className="dot" /><span id="alive-count">{h.alive}</span> JUGADORES</div>
        <div className="storm-timer" id="storm-timer">{h.stormTime}</div>
      </div>
      <div className="minimap-wrap">
        <canvas id="minimap" width="356" height="356" ref={(el) => { bridge.refs.minimap = el; }} />
        <div className="minimap-label">MAPA TÁCTICO</div>
      </div>
      <div className="hud-bottom-left">
        <div className="vitals">
          <div className="bar-row"><div className="bar-icon">🛡️</div>
            <div className="bar shield" id="shield-bar"><div style={{ width: `${Math.max(0, Math.min(100, h.shield))}%` }} /></div>
            <div className="bar-num" id="shield-num">{Math.round(h.shield)}</div>
          </div>
          <div className="bar-row"><div className="bar-icon">❤️</div>
            <div className={`bar health ${h.lowHp ? 'low' : ''}`} id="health-bar"><div style={{ width: `${Math.max(0, Math.min(100, h.hp))}%` }} /></div>
            <div className="bar-num" id="health-num">{Math.round(h.hp)}</div>
          </div>
        </div>
        <div className="slots" id="slots">
          {h.slots.map((s, i) => (
            <div className={`slot ${i === s.active ? 'active' : ''} ${s.item ? '' : 'empty'}`} key={i}>
              <span className="n">{i + 1}</span><span>{s.item ? s.icon : ''}</span>
              <span className="ammo">{s.item ? s.ammo : ''}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="hud-bottom-right">
        <div className="weapon-name" id="weapon-name" style={{ color: h.weaponColor }}>{h.weaponName}</div>
        <div className="ammo-big"><span id="ammo-num">{h.ammo}</span><small id="ammo-reserve">{h.reserve}</small></div>
        <div className="reload-hint" id="reload-hint">{h.reloadHint}</div>
      </div>
      {h.pickupVisible && (
        <div className="pickup-prompt" id="pickup-prompt"><kbd>E</kbd><span id="pickup-text">{h.pickupText}</span></div>
      )}
      {h.bannerVisible && (
        <div className="banner" id="banner">
          <div className="banner-title" id="banner-title">{h.bannerTitle}</div>
          <div className="banner-sub" id="banner-sub">{h.bannerSub}</div>
        </div>
      )}
      <div className="floating-texts" id="floating-texts"
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
        ref={(el) => { bridge.refs.floating = el; }} />
      <div className="damage-vignette" id="damage-vignette" style={{ opacity: h.damageOpacity }} />
      <div className="storm-vignette" id="storm-vignette" style={{ opacity: h.stormOpacity }} />
      <div id="fps-counter" style={{ position: 'absolute', right: 26, bottom: 100, fontSize: 10, color: 'rgba(255,255,255,0.55)', fontVariantNumeric: 'tabular-nums' }}>{h.fps}</div>
      <div id="pause-hint">ESC · pausa &nbsp;|&nbsp; SHIFT · correr &nbsp;|&nbsp; ESPACIO · saltar / abrir o cerrar planeador &nbsp;|&nbsp; CLIC DCHO · apuntar &nbsp;|&nbsp; R · recargar &nbsp;|&nbsp; E · recoger</div>
    </div>
  );
}
