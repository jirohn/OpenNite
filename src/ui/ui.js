import { QUALITY_PRESETS } from '../core/settings.js';
import { formatTime } from '../core/utils.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const SKINS = [0xffb45c, 0x4ecdc4, 0xff6b9d, 0x9b6dff, 0x6bd97f, 0x5aa9ff, 0xf2e35a, 0xf2f2f2];
const SKIN_NAMES = ['Ámbar', 'Cian', 'Rosa', 'Violeta', 'Esmeralda', 'Azul', 'Oro', 'Blanco'];
const hexColor = (c) => `#${Number(c).toString(16).padStart(6, '0')}`;

export class UI {
  constructor(root, app, settings, maps, audio) {
    this.root = root;
    this.app = app;
    this.settings = settings;
    this.maps = maps;
    this.audio = audio;
    this.current = null;
    this.selectedMap = settings.get('mapId');
  }

  clear() {
    this.root.innerHTML = '';
    this.current = null;
  }

  screen(html, cls = '') {
    this.clear();
    const el = document.createElement('div');
    el.className = `screen ${cls}`;
    el.innerHTML = html;
    this.root.appendChild(el);
    this.current = el;
    return el;
  }

  bind(el, selector, event, fn) {
    el.querySelectorAll(selector).forEach((node) => {
      node.addEventListener(event, (e) => {
        this.audio.init();
        this.audio.play(event === 'mouseenter' ? 'hover' : 'click');
        fn(e, node);
      });
    });
  }

  // ---------------------- Menú principal ----------------------

  showMenu() {
    const version = this.app.version;
    const el = this.screen(`
      <div class="menu-screen">
        <div class="menu-top">
          <div class="brand"><div class="brand-mark">O</div><div><div class="brand-name">OPENNITE</div><div class="brand-tag">Battle Royale · código abierto</div></div></div>
          <div class="menu-version">v${esc(version)} · ALPHA</div>
        </div>
        <div class="menu-body">
          <div class="menu-eyebrow">Sin construcción. Solo supervivencia.</div>
          <div class="menu-title">CAE.<br><span>SOBREVIVE.</span></div>
          <div class="menu-sub">Un battle royale libre para PC con mapas enormes, modelos y animaciones CC0, gráficos escalables y actualizaciones automáticas desde GitHub.</div>
          <div class="menu-actions">
            <button class="btn primary interactive" data-act="play"><span class="btn-icon">▶</span> JUGAR AHORA</button>
            <button class="btn interactive" data-act="maps"><span class="btn-icon">🗺️</span> MAPAS <span class="key">M</span></button>
            <button class="btn interactive" data-act="settings"><span class="btn-icon">⚙️</span> CONFIGURACIÓN <span class="key">O</span></button>
            <button class="btn interactive" data-act="credits"><span class="btn-icon">ℹ️</span> CRÉDITOS</button>
            <button class="btn interactive" data-act="update"><span class="btn-icon">⬆️</span> BUSCAR ACTUALIZACIONES</button>
            <button class="btn interactive" data-act="quit"><span class="btn-icon">⏻</span> SALIR</button>
          </div>
        </div>
        <div class="menu-footer"><span>Modelos: RobotExpressive (CC0 · Quaternius)</span><span>·</span><span>Hecho con Three.js + Electron</span><span>·</span><span id="update-status"></span></div>
      </div>`);

    this.bind(el, '[data-act]', 'mouseenter', () => {});
    el.querySelectorAll('[data-act]').forEach((btn) => {
      btn.addEventListener('mouseenter', () => this.audio.play('hover'));
      btn.addEventListener('click', () => {
        this.audio.init();
        this.audio.play('click');
        const act = btn.dataset.act;
        if (act === 'play') this.showLobby();
        else if (act === 'maps') this.showMaps();
        else if (act === 'settings') this.showSettings();
        else if (act === 'credits') this.showCredits();
        else if (act === 'update') this.app.checkUpdates(true);
        else if (act === 'quit') this.app.quit();
      });
    });

    window.addEventListener('keydown', this._menuKeys = (e) => {
      if (this.current !== el) return;
      if (e.code === 'KeyM') this.showMaps();
      if (e.code === 'KeyO') this.showSettings();
    });
  }

  // ---------------------- Lobby ----------------------

  showLobby() {
    const maps = this.maps.list();
    if (!maps.some((m) => m.id === this.selectedMap)) this.selectedMap = maps[0]?.id || 'verdant-isles';
    const el = this.screen(`
      <div class="panel-screen">
        <div class="panel">
          <div class="panel-head"><button class="btn small close-x interactive" data-back>✕</button><h2>Desplegar partida</h2><div class="spacer"></div><span class="status-pill">ALPHA</span></div>
          <div class="panel-body">
            <div class="two-col">
              <div>
                <p class="section-title">Mapa</p>
                <div class="map-grid" style="grid-template-columns:1fr">
                  ${maps.map((m) => `
                    <div class="map-card interactive ${m.id === this.selectedMap ? 'selected' : ''}" data-map="${esc(m.id)}" style="cursor:pointer;border-color:${m.id === this.selectedMap ? 'var(--accent)' : 'var(--line)'}">
                      <div class="map-thumb" style="background:${esc(m.gradient || 'linear-gradient(135deg,#3c4b60,#7890a8)')}"><span class="map-badge">${esc(m.size || 4096)} m</span></div>
                      <div class="map-info"><h3>${esc(m.name)}</h3><p>${esc(m.description)}</p></div>
                    </div>`).join('')}
                </div>
              </div>
              <div>
                <p class="section-title">Opciones de partida</p>
                <div class="field"><label>Rivales (bots) <span class="value" id="bots-val">${this.settings.get('maxBots')}</span></label><input type="range" id="bots" min="0" max="60" step="1" value="${this.settings.get('maxBots')}"></div>
                <div class="field"><label>Dificultad <span class="value" id="diff-val">${this.settings.get('botDifficulty')}</span></label><select id="diff"><option value="easy">Fácil</option><option value="normal">Normal</option><option value="hard">Difícil</option></select></div>
                <div class="field"><label>Calidad gráfica <span class="value">${QUALITY_PRESETS[this.settings.get('quality')]?.name}</span></label><select id="quality">${Object.entries(QUALITY_PRESETS).map(([k, v]) => `<option value="${k}" ${k === this.settings.get('quality') ? 'selected' : ''}>${v.name}</option>`).join('')}</select></div>
                <div class="field"><label>Aspecto (skin) <span class="value">${SKIN_NAMES[SKINS.indexOf(this.settings.get('playerColor'))] || 'Personalizado'}</span></label>
                  <div id="skin-row" class="skin-row">
                    ${SKINS.map((c, i) => `
                      <button class="interactive skin-swatch ${c === this.settings.get('playerColor') ? 'selected' : ''}" data-skin="${c}" title="${SKIN_NAMES[i]} · ${hexColor(c)}" style="border-color:${c === this.settings.get('playerColor') ? 'var(--accent)' : 'var(--line)'}">
                        <span class="skin-dot" style="background:${hexColor(c)}"></span>
                        <span class="skin-name">${SKIN_NAMES[i]}</span>
                      </button>`).join('')}
                  </div>
                </div>
                <div class="hint" style="margin-top:20px">
                  <b>Controles:</b> WASD mover · Ratón mirar · ESPACIO saltar / abrir y cerrar planeador · SHIFT correr · CLIC disparar · CLIC DCHO apuntar · R recargar · E recoger · 1-5 arma · ESC pausa.<br><br>
                  <b>Sin modo construcción.</b> La partida empieza subido al autobús; pulsa ESPACIO para saltar.
                </div>
              </div>
            </div>
          </div>
          <div class="panel-foot"><button class="btn small interactive" data-back>Volver</button><button class="btn primary interactive" data-start style="min-width:190px;justify-content:center">DESPLEGAR ▶</button></div>
        </div>
      </div>`);

    el.querySelector('#diff').value = this.settings.get('botDifficulty');
    this.bind(el, '[data-map]', 'click', (e, node) => {
      this.selectedMap = node.dataset.map;
      this.settings.set('mapId', this.selectedMap);
      this.showLobby();
    });
    this.bind(el, '[data-back]', 'click', () => this.showMenu());
    this.bind(el, '#bots', 'input', (e, node) => {
      el.querySelector('#bots-val').textContent = node.value;
      this.settings.set('maxBots', Number(node.value));
    });
    this.bind(el, '#diff', 'change', (e, node) => {
      el.querySelector('#diff-val').textContent = node.value;
      this.settings.set('botDifficulty', node.value);
    });
    this.bind(el, '#quality', 'change', (e, node) => this.settings.set('quality', node.value));
    this.bind(el, '[data-skin]', 'click', (e, node) => {
      const color = Number(node.dataset.skin);
      this.settings.set('playerColor', color);
      for (const sw of el.querySelectorAll('[data-skin]')) {
        const active = Number(sw.dataset.skin) === color;
        sw.classList.toggle('selected', active);
        sw.style.borderColor = active ? 'var(--accent)' : 'var(--line)';
      }
      const label = node.closest('.field')?.querySelector('.value');
      if (label && SKINS.includes(color)) label.textContent = SKIN_NAMES[SKINS.indexOf(color)];
      this.audio?.play?.('click');
    });
    this.bind(el, '[data-start]', 'click', () => {
      this.app.startMatch(this.selectedMap);
    });
  }

  // ---------------------- Ajustes ----------------------

  showSettings(back = 'menu') {
    const s = this.settings.all();
    const slider = (id, label, min, max, step, value, fmt = (v) => v) => `
      <div class="field"><label>${label} <span class="value" id="${id}-v">${fmt(value)}</span></label><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${value}"></div>`;
    const toggle = (id, label, value) => `
      <div class="toggle-row"><span>${label}</span><button class="switch interactive ${value ? 'on' : ''}" id="${id}" data-value="${!!value}"></button></div>`;

    const el = this.screen(`
      <div class="panel-screen">
        <div class="panel">
          <div class="panel-head"><button class="btn small close-x interactive" data-back>✕</button><h2>Configuración gráfica y de juego</h2></div>
          <div class="panel-body">
            <p class="section-title">Perfil de calidad</p>
            <div class="preset-row">${Object.entries(QUALITY_PRESETS).map(([k, v]) => `<div class="preset interactive ${s.quality === k ? 'active' : ''}" data-preset="${k}">${v.name}</div>`).join('')}</div>
            <div class="two-col">
              <div>
                <p class="section-title">Gráficos</p>
                ${slider('resolutionScale', 'Escala de resolución', 0.5, 1.25, 0.05, s.resolutionScale, (v) => `${Math.round(v * 100)}%`)}
                ${slider('viewDistance', 'Distancia de dibujo', 2, 10, 1, s.viewDistance, (v) => `${v * 256} m`)}
                ${slider('vegetation', 'Densidad de vegetación', 0, 1.5, 0.05, s.vegetation, (v) => `${Math.round(v * 100)}%`)}
                ${slider('effects', 'Intensidad de efectos', 0, 1.5, 0.05, s.effects, (v) => `${Math.round(v * 100)}%`)}
                ${slider('shadowMapSize', 'Resolución de sombras', 512, 4096, 512, s.shadowMapSize, (v) => `${v} px`)}
                ${toggle('shadows', 'Sombras dinámicas', s.shadows)}
                ${toggle('bloom', 'Bloom / resplandor', s.bloom)}
                ${toggle('ssao', 'Oclusión ambiental (SSAO)', s.ssao)}
              </div>
              <div>
                <p class="section-title">Juego y audio</p>
                ${slider('fov', 'Campo de visión', 60, 110, 1, s.fov, (v) => `${v}°`)}
                ${slider('sensitivity', 'Sensibilidad del ratón', 0.0004, 0.006, 0.0001, s.sensitivity, (v) => (v * 1000).toFixed(1))}
                ${slider('maxBots', 'Número de rivales', 0, 60, 1, s.maxBots, (v) => `${v}`)}
                ${slider('masterVolume', 'Volumen general', 0, 1, 0.05, s.masterVolume, (v) => `${Math.round(v * 100)}%`)}
                ${slider('sfxVolume', 'Volumen de efectos', 0, 1, 0.05, s.sfxVolume, (v) => `${Math.round(v * 100)}%`)}
                ${slider('musicVolume', 'Volumen ambiental', 0, 1, 0.05, s.musicVolume, (v) => `${Math.round(v * 100)}%`)}
                ${toggle('invertY', 'Invertir eje Y', s.invertY)}
                ${toggle('showFPS', 'Mostrar FPS', s.showFPS)}
                ${toggle('showDamageNumbers', 'Números de daño', s.showDamageNumbers)}
              </div>
            </div>
            <p class="hint" style="margin-top:18px">Los cambios se guardan automáticamente. Si tu equipo es modesto, usa el perfil <b>Baja</b>: resolución 68%, sin sombras ni bloom y menos vegetación.</p>
          </div>
          <div class="panel-foot"><button class="btn primary interactive" data-back>Volver</button></div>
        </div>
      </div>`);

    this.bind(el, '[data-back]', 'click', () => back === 'pause' ? this.showPause() : this.showMenu());
    this.bind(el, '[data-preset]', 'click', (e, node) => {
      this.settings.set('quality', node.dataset.preset);
      this.audio.applyVolumes();
      this.showSettings(back);
    });
    el.querySelectorAll('input[type=range]').forEach((input) => {
      input.addEventListener('input', () => {
        const key = input.id;
        const value = Number(input.value);
        this.settings.set(key, value);
        const label = el.querySelector(`#${key}-v`);
        if (label) {
          if (key === 'resolutionScale' || key === 'vegetation' || key === 'effects' || key.includes('Volume')) label.textContent = `${Math.round(value * 100)}%`;
          else if (key === 'viewDistance') label.textContent = `${value * 256} m`;
          else if (key === 'sensitivity') label.textContent = (value * 1000).toFixed(1);
          else if (key === 'fov') label.textContent = `${value}°`;
          else if (key === 'shadowMapSize') label.textContent = `${value} px`;
          else label.textContent = value;
        }
        if (key.includes('Volume')) this.audio.applyVolumes();
      });
    });
    el.querySelectorAll('.switch').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.id;
        const value = btn.dataset.value !== 'true';
        btn.dataset.value = String(value);
        btn.classList.toggle('on', value);
        this.settings.set(key, value);
      });
    });
  }

  // ---------------------- Mapas ----------------------

  async showMaps(back = 'menu') {
    const el = this.screen(`
      <div class="panel-screen">
        <div class="panel">
          <div class="panel-head"><button class="btn small close-x interactive" data-back>✕</button><h2>Mapas descargables</h2><div class="spacer"></div><button class="btn small interactive" data-refresh>↻ Buscar novedades en GitHub</button></div>
          <div class="panel-body">
            <p class="hint" style="margin-bottom:18px">Los mapas se descargan gratis desde el repositorio de OpenNite y se guardan en tu equipo. Puedes jugar en ellos sin conexión después de instalarlos.</p>
            <div class="map-grid" id="map-grid"><div><span class="loading-inline"></span> Cargando catálogo...</div></div>
          </div>
          <div class="panel-foot"><button class="btn primary interactive" data-back>Volver</button></div>
        </div>
      </div>`);

    this.bind(el, '[data-back]', 'click', () => back === 'pause' ? this.showPause() : this.showMenu());
    this.bind(el, '[data-refresh]', 'click', async (e, node) => {
      node.innerHTML = '<span class="loading-inline"></span> Buscando...';
      await this.maps.refreshCatalog(true);
      this.renderMapCards(el);
    });
    await this.maps.refreshCatalog(false);
    this.renderMapCards(el);
  }

  renderMapCards(el) {
    const grid = el.querySelector('#map-grid');
    if (!grid) return;
    const entries = this.maps.list();
    grid.innerHTML = entries.map((m) => {
      const installed = this.maps.isInstalled(m.id);
      const bundled = m.bundled;
      const selected = this.selectedMap === m.id;
      return `<div class="map-card">
        <div class="map-thumb" style="background:${esc(m.gradient || 'linear-gradient(135deg,#3c4b60,#7890a8)')}"><span class="map-badge">${esc(m.size || 4096)} m</span></div>
        <div class="map-info"><h3>${esc(m.name)}</h3><p>${esc(m.description)}</p>
          <div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:10px">${(m.tags || []).map((t) => `<span class="status-pill" style="background:rgba(255,255,255,0.08);color:#b9c4d2">${esc(t)}</span>`).join('')}</div>
        </div>
        <div style="padding:0 14px 14px;display:flex;gap:6px">
          ${installed || bundled ? `<button class="btn small interactive ${selected ? 'primary' : ''}" data-select="${esc(m.id)}" style="flex:1;justify-content:center">${selected ? 'SELECCIONADO' : 'USAR'}</button>` : `<button class="btn small primary interactive" data-install="${esc(m.id)}" style="flex:1;justify-content:center">DESCARGAR</button>`}
          ${installed ? `<button class="btn small interactive" data-remove="${esc(m.id)}" title="Desinstalar">✕</button>` : ''}
        </div>
      </div>`;
    }).join('');

    this.bind(el, '[data-select]', 'click', (e, node) => {
      this.selectedMap = node.dataset.select;
      this.settings.set('mapId', this.selectedMap);
      this.app.toast(`${this.maps.get(this.selectedMap)?.name} seleccionado`, 'good');
      this.renderMapCards(el);
    });
    this.bind(el, '[data-install]', 'click', async (e, node) => {
      const id = node.dataset.install;
      node.disabled = true;
      node.innerHTML = '<span class="loading-inline"></span> Descargando...';
      try {
        await this.maps.install(id);
        this.app.toast('Mapa instalado correctamente', 'good');
      } catch (error) {
        this.app.toast(`Error: ${error.message}`, 'warn');
      }
      this.renderMapCards(el);
    });
    this.bind(el, '[data-remove]', 'click', async (e, node) => {
      await this.maps.uninstall(node.dataset.remove);
      this.renderMapCards(el);
    });
  }

  // ---------------------- Créditos ----------------------

  showCredits() {
    const el = this.screen(`
      <div class="panel-screen">
        <div class="panel">
          <div class="panel-head"><button class="btn small close-x interactive" data-back>✕</button><h2>Créditos y licencias</h2></div>
          <div class="panel-body">
            <p class="section-title">Código</p>
            <p class="hint">OpenNite es software libre bajo licencia MIT. Motor: <b>Three.js</b> (MIT) · Empaquetado: <b>Electron</b> (MIT) · Construcción: <b>Vite</b> (MIT).</p>
            <p class="section-title" style="margin-top:22px">Modelos y animaciones</p>
            <p class="hint"><b>RobotExpressive</b> por Tomás Laulhé / Quaternius — dominio público CC0 1.0. Incluye animaciones Idle, Walking, Running, Jump, Death, Dance, Wave, Punch y más. <a href="https://quaternius.com" target="_blank">quaternius.com</a></p>
            <p class="section-title" style="margin-top:22px">Efectos, world y audio</p>
            <p class="hint">Armas y vehículos generados por código (geometría procedural propia). Partículas, trazadoras, impactos, cielo, agua y terreno generados en tiempo real. Todos los sonidos se sintetizan con WebAudio: no hay archivos de audio de terceros.</p>
            <p class="section-title" style="margin-top:22px">Aviso</p>
            <p class="hint">Este proyecto es un homenaje libre al género battle royale. No está afiliado a Epic Games. Fortnite® es una marca registrada de Epic Games. No se usan recursos visuales ni sonoros de ese juego.</p>
          </div>
          <div class="panel-foot"><button class="btn primary interactive" data-back>Volver</button></div>
        </div>
      </div>`);
    this.bind(el, '[data-back]', 'click', () => this.showMenu());
  }

  // ---------------------- Pausa y resultados ----------------------

  showPause() {
    const el = this.screen(`
      <div class="panel-screen">
        <div class="panel" style="width:min(460px,92vw)">
          <div class="panel-head"><h2>Partida en pausa</h2></div>
          <div class="panel-body" style="display:flex;flex-direction:column;gap:10px">
            <button class="btn primary interactive" data-resume style="justify-content:center">CONTINUAR</button>
            <button class="btn interactive" data-settings style="justify-content:center">CONFIGURACIÓN</button>
            <button class="btn interactive" data-maps style="justify-content:center">MAPAS</button>
            <button class="btn danger interactive" data-menu style="justify-content:center">ABANDONAR PARTIDA</button>
          </div>
        </div>
      </div>`);
    this.bind(el, '[data-resume]', 'click', () => this.app.resumeGame());
    this.bind(el, '[data-settings]', 'click', () => this.showSettings('pause'));
    this.bind(el, '[data-maps]', 'click', () => this.showMaps('pause'));
    this.bind(el, '[data-menu]', 'click', () => this.app.returnToMenu());
  }

  showResults(result) {
    const el = this.screen(`
      <div class="panel-screen">
        <div class="panel result-card" style="width:min(560px,92vw)">
          <div class="panel-body">
            <div class="banner-title" style="color:${result.victory ? 'var(--accent)' : 'var(--danger)'}">${result.victory ? 'VICTORIA' : 'ELIMINADO'}</div>
            <div class="result-rank">#${result.rank}</div>
            <div class="result-stats">
              <div class="result-stat"><b>${result.kills}</b><span>Eliminaciones</span></div>
              <div class="result-stat"><b>${result.damage}</b><span>Daño</span></div>
              <div class="result-stat"><b>${formatTime(result.time)}</b><span>Supervivencia</span></div>
            </div>
            <p class="hint">Mapa: ${esc(result.map)}</p>
          </div>
          <div class="panel-foot" style="justify-content:center">
            <button class="btn primary interactive" data-again style="justify-content:center;min-width:180px">JUGAR OTRA VEZ</button>
            <button class="btn interactive" data-menu style="justify-content:center">MENÚ</button>
          </div>
        </div>
      </div>`);
    this.bind(el, '[data-again]', 'click', () => this.app.startMatch(this.selectedMap));
    this.bind(el, '[data-menu]', 'click', () => this.app.returnToMenu());
  }

  showUpdate(info) {
    const el = this.screen(`
      <div class="panel-screen">
        <div class="panel" style="width:min(520px,92vw)">
          <div class="panel-head"><h2>Actualización disponible</h2></div>
          <div class="panel-body">
            <p class="hint">Hay una nueva versión de OpenNite (<b>${esc(info.version)}</b>) publicada en GitHub. Se descargará en segundo plano y se instalará al cerrar el juego.</p>
            <div class="update-bar"><div id="upd-progress" style="width:0%"></div></div>
            <p class="hint" id="upd-text" style="margin-top:10px">Pulsa descargar para empezar.</p>
          </div>
          <div class="panel-foot">
            <button class="btn interactive" data-close>Cerrar</button>
            <button class="btn primary interactive" data-download>Descargar e instalar</button>
          </div>
        </div>
      </div>`);
    this.bind(el, '[data-close]', 'click', () => this.showMenu());
    this.bind(el, '[data-download]', 'click', async (e, node) => {
      node.disabled = true;
      node.innerHTML = '<span class="loading-inline"></span> Descargando...';
      await this.app.downloadUpdate();
    });
  }

  setUpdateProgress(percent, text) {
    const bar = this.root.querySelector('#upd-progress');
    const label = this.root.querySelector('#upd-text');
    if (bar) bar.style.width = `${percent}%`;
    if (label && text) label.textContent = text;
  }
}
