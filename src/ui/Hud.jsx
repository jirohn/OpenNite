import React from 'react';
import { bridge, hover } from './bridge.js';
import { useHud } from './store.js';

const CARDINALS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];

function compassMarks(heading) {
  return [-2, -1, 0, 1, 2].map((offset) => {
    const deg = ((heading + offset * 45) % 360 + 360) % 360;
    return { key: offset, text: offset === 0 ? CARDINALS[Math.round(deg / 45) % 8] : CARDINALS[Math.round(deg / 45) % 8], major: offset % 2 === 0 };
  });
}

export function Hud() {
  const h = useHud();

  if (!h.mounted) return null;

  return (
    <div className="hud">
      <div id="crosshair" className={`crosshair ${h.hit ? 'hit' : ''}`} style={{ opacity: h.hiddenCrosshair ? 0 : 1 }} />
      {h.showLockPrompt && (
        <button type="button" className="interactive lock-overlay" onMouseEnter={hover}
          onClick={() => bridge.hud?.input?.requestLock?.()}>
          <span>CLIC PARA JUGAR</span>
          <small>WASD moverte · Ratón mirar · ESPACIO saltar/salir del autobús · CLIC disparar · E recoger</small>
        </button>
      )}

      <div className="hud-top-left">
        <div className="map-label" id="hud-map">{h.mapName}</div>
        <div className="hud-stat-row">
          <span className="hud-pill"><b id="alive-count">{h.alive}</b> VIVOS</span>
          <span className="hud-pill accent"><b>{h.kills}</b> BAJAS</span>
        </div>
        <div className="kill-feed" id="kill-feed">
          {h.killFeed.map((k, i) => (
            <div className="kill-entry" key={`${k.killer}-${k.victim}-${i}`}>
              <b>{k.killer}</b> {k.weapon ? `【${k.weapon}】` : '✕'} {k.victim}
            </div>
          ))}
        </div>
      </div>

      <div className="hud-top-center">
        <div className="compass" aria-label={`Rumbo ${h.heading} grados, ${h.headingLabel}`}>
          <div className="compass-marks">
            {compassMarks(h.heading).map((m) => (
              <span key={m.key} className={m.major ? 'major' : ''}>{m.text}</span>
            ))}
          </div>
          <div className="compass-bearing">{h.heading}° {h.headingLabel}</div>
        </div>
        <div className="storm-timer" id="storm-timer">{h.stormTime}</div>
      </div>

      <div className="minimap-wrap">
        <canvas id="minimap" width="356" height="356" ref={(el) => { bridge.refs.minimap = el; }} />
        <div className="minimap-label">MAPA TÁCTICO</div>
        <div className="minimap-legend">
          <span><i className="lg-you" />TÚ</span>
          <span><i className="lg-foe" />ENEMIGO</span>
          <span><i className="lg-zone" />ZONA</span>
        </div>
      </div>

      <div className="hud-bottom-left">
        <div className="hud-panel">
          <div className="panel-head"><span>ESTADO</span><span>SUPERVIVENCIA</span></div>
          <div className="vitals">
            <div className="bar-row"><div className="bar-icon">🛡️</div>
              <span className="bar-name">ESCUDO</span>
              <div className="bar shield" id="shield-bar"><div style={{ width: `${Math.max(0, Math.min(100, h.shield))}%` }} /></div>
              <div className="bar-num" id="shield-num">{Math.round(h.shield)}</div>
            </div>
            <div className="bar-row"><div className="bar-icon">❤️</div>
              <span className="bar-name">VIDA</span>
              <div className={`bar health ${h.lowHp ? 'low' : ''}`} id="health-bar"><div style={{ width: `${Math.max(0, Math.min(100, h.hp))}%` }} /></div>
              <div className="bar-num" id="health-num">{Math.round(h.hp)}</div>
            </div>
          </div>
          <div className="slots" id="slots">
            {h.slots.map((s, i) => (
              <div className={`slot ${s.active ? 'active' : ''} ${s.item ? '' : 'empty'}`} key={i}>
                <span className="n">{i + 1}</span><span>{s.item ? s.icon : ''}</span>
                <span className="ammo">{s.item ? s.ammo : ''}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="hud-bottom-right">
        <div className="hud-panel weapon-panel">
          <div className="panel-head"><span>ARMA ACTUAL</span><span>MUNICIÓN</span></div>
          <div className="weapon-name" id="weapon-name" style={{ color: h.weaponColor }}>{h.weaponName}</div>
          <div className="ammo-big"><span id="ammo-num">{h.ammo}</span><small id="ammo-reserve">{h.reserve}</small></div>
          <div className="reload-hint" id="reload-hint">{h.reloadHint}</div>
        </div>
      </div>

      {h.pickupVisible && (
        <div className="pickup-prompt" id="pickup-prompt" style={{ display:'flex', alignItems:'center', gap:'10px' }}>
          {h.chestOpening?.active ? (
            <div style={{ width:44, height:44, position:'relative', flex:'0 0 44px' }}>
              <svg viewBox="0 0 44 44" style={{ width:44, height:44, transform:'rotate(-90deg)' }}>
                <circle cx="22" cy="22" r="18" stroke="rgba(255,255,255,0.18)" strokeWidth="5" fill="none" />
                <circle cx="22" cy="22" r="18" stroke="#7CFFB2" strokeWidth="5" fill="none"
                  strokeLinecap="round"
                  strokeDasharray={`${2*Math.PI*18}`}
                  strokeDashoffset={`${2*Math.PI*18*(1-(h.chestOpening.progress||0))}`}
                  style={{ transition:'stroke-dashoffset 0.08s linear' }} />
              </svg>
              <div style={{ position:'absolute', inset:0, display:'grid', placeItems:'center', fontSize:'11px', fontWeight:700, color:'#fff' }}>
                {Math.round((h.chestOpening.progress||0)*100)}%
              </div>
            </div>
          ) : (
            <kbd>{/ESPACIO/i.test(h.pickupText || '') ? 'ESPACIO' : 'E'}</kbd>
          )}
          <span id="pickup-text">{h.pickupText}</span>
        </div>
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
      <div id="fps-counter" className="fps-counter">{h.fps}</div>
      <div id="pause-hint">
        <kbd>WASD</kbd> mover · <kbd>SHIFT</kbd> correr · <kbd>ESPACIO</kbd> saltar/salir del bus/planeador · <kbd>CLIC</kbd> disparar · <kbd>CLIC DCHO</kbd> apuntar · <kbd>R</kbd> recargar · <kbd>E</kbd> interactuar · <kbd>1-5</kbd> arma · <kbd>ESC</kbd> pausa
      </div>
    </div>
  );
}
