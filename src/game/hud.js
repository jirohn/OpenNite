import * as THREE from 'three';
import { clamp, formatTime } from '../core/utils.js';

const TEMPLATE = `
<div class="hud">
  <div class="crosshair" id="crosshair"></div>
  <button class="interactive lock-overlay" id="lock-prompt"><span>CLIC PARA FIJAR EL RATÓN</span><small>Si no se fija, mantén pulsado el CLIC IZQUIERDO y mueve el ratón para mirar</small></button>
  <div class="hud-top-left">
    <div class="map-label" id="hud-map">ISLAS VERDES</div>
    <div class="kill-feed" id="kill-feed"></div>
  </div>
  <div class="hud-top-center">
    <div class="alive-count"><span class="dot"></span><span id="alive-count">0</span> JUGADORES</div>
    <div class="storm-timer" id="storm-timer"></div>
  </div>
  <div class="minimap-wrap"><canvas id="minimap" width="356" height="356"></canvas><div class="minimap-label">MAPA TÁCTICO</div></div>
  <div class="hud-bottom-left">
    <div class="vitals">
      <div class="bar-row"><div class="bar-icon">🛡️</div><div class="bar shield" id="shield-bar"><div style="width:0%"></div></div><div class="bar-num" id="shield-num">0</div></div>
      <div class="bar-row"><div class="bar-icon">❤️</div><div class="bar health" id="health-bar"><div style="width:100%"></div></div><div class="bar-num" id="health-num">100</div></div>
    </div>
    <div class="slots" id="slots"></div>
  </div>
  <div class="hud-bottom-right">
    <div class="weapon-name" id="weapon-name">Pistola</div>
    <div class="ammo-big"><span id="ammo-num">12</span><small id="ammo-reserve">/ 90</small></div>
    <div class="reload-hint" id="reload-hint"></div>
  </div>
  <div class="pickup-prompt" id="pickup-prompt" style="display:none"><kbd>E</kbd><span id="pickup-text"></span></div>
  <div class="banner" id="banner" style="display:none"><div class="banner-title" id="banner-title"></div><div class="banner-sub" id="banner-sub"></div></div>
  <div class="toast-stack" id="toast-stack"></div>
  <div class="floating-texts" id="floating-texts" style="position:absolute;inset:0;pointer-events:none"></div>
  <div class="damage-vignette" id="damage-vignette"></div>
  <div class="storm-vignette" id="storm-vignette"></div>
  <div id="fps-counter" style="position:absolute;right:26px;bottom:100px;font-size:10px;color:rgba(255,255,255,0.55);font-variant-numeric:tabular-nums"></div>
  <div id="pause-hint">ESC · pausa &nbsp;|&nbsp; SHIFT · correr &nbsp;|&nbsp; ESPACIO · saltar / abrir o cerrar planeador &nbsp;|&nbsp; CLIC DCHO · apuntar &nbsp;|&nbsp; R · recargar &nbsp;|&nbsp; E · recoger</div>
</div>`;

export class HUD {
  constructor(uiRoot, settings) {
    this.root = uiRoot;
    this.settings = settings;
    this.el = null;
    this.killFeed = [];
    this.toasts = [];
    this.bannerTime = 0;
    this.damageFlashAmount = 0;
    this.hitTime = 0;
    this.lastSlotsKey = '';
    this.minimapCtx = null;
    this.fpsSmooth = 60;
    this.frameCount = 0;
    this.fpsTimer = 0;
  }

  mount(mapName) {
    this.unmount();
    const wrap = document.createElement('div');
    wrap.innerHTML = TEMPLATE;
    this.el = wrap.firstElementChild;
    this.root.appendChild(this.el);
    this.q = (id) => this.el.querySelector(`#${id}`);
    this.q('hud-map').textContent = mapName;
    this.minimapCtx = this.q('minimap').getContext('2d');
  }

  unmount() {
    if (this.el) this.el.remove();
    this.el = null;
  }

  toast(text, type = '') {
    this.toasts.push({ text, type, life: 3.4 });
    if (this.toasts.length > 5) this.toasts.shift();
    this.renderToasts();
  }

  renderToasts() {
    if (!this.el) return;
    this.q('toast-stack').innerHTML = this.toasts.map((t) => `<div class="toast ${t.type}">${t.text}</div>`).join('');
  }

  kill(killer, victim, weapon = '') {
    this.killFeed.unshift({ killer, victim, weapon, life: 6 });
    if (this.killFeed.length > 5) this.killFeed.pop();
    if (this.el) this.q('kill-feed').innerHTML = this.killFeed.map((k) =>
      `<div class="kill-entry"><b>${k.killer}</b> ${k.weapon ? `【${k.weapon}】` : '✕'} ${k.victim}</div>`).join('');
  }

  banner(title, sub = '', duration = 2.4) {
    if (!this.el) return;
    this.q('banner-title').textContent = title;
    this.q('banner-sub').textContent = sub;
    this.q('banner').style.display = 'block';
    this.bannerTime = duration;
  }

  hitMarker() { this.hitTime = 0.16; }

  damageFlash(amount = 0.5) { this.damageFlashAmount = Math.min(1, this.damageFlashAmount + amount); }

  update(game, dt) {
    if (!this.el) return;
    const { player, world, storm, bots, loot, camera } = game;

    const lockPrompt = this.q('lock-prompt');
    if (lockPrompt) {
      lockPrompt.style.display = (!game.input.locked && game.input.autoLock && !game.paused) ? 'block' : 'none';
    }

    // FPS
    this.frameCount++;
    this.fpsTimer += dt;
    if (this.fpsTimer >= 0.5) {
      this.fpsSmooth = this.frameCount / this.fpsTimer;
      this.frameCount = 0;
      this.fpsTimer = 0;
      if (this.settings.get('showFPS')) this.q('fps-counter').textContent = `${Math.round(this.fpsSmooth)} FPS`;
      else this.q('fps-counter').textContent = '';
    }

    // Vida y escudo
    const hp = Math.round(player.hp);
    const sh = Math.round(player.shield);
    this.q('health-num').textContent = hp;
    this.q('shield-num').textContent = sh;
    this.q('health-bar').firstElementChild.style.width = `${clamp(hp, 0, 100)}%`;
    this.q('shield-bar').firstElementChild.style.width = `${clamp(sh, 0, 100)}%`;
    this.q('health-bar').classList.toggle('low', hp <= 30);
    this.q('damage-vignette').style.opacity = Math.max(hp < 35 ? (1 - hp / 35) * 0.35 : 0, this.damageFlashAmount).toFixed(2);
    this.damageFlashAmount = Math.max(0, this.damageFlashAmount - dt * 2.2);

    const outside = storm.distanceOutside(player.position);
    this.q('storm-vignette').style.opacity = outside > 0 ? clamp(outside / 260 + 0.25, 0, 0.9).toFixed(2) : '0';

    // Inventario
    const inv = player.inventory;
    const slotsKey = inv.slots.map((s) => s ? `${s.type}${s.rarity}${s.ammo}` : '-').join('|') + inv.active;
    if (slotsKey !== this.lastSlotsKey) {
      this.lastSlotsKey = slotsKey;
      this.q('slots').innerHTML = inv.slots.map((s, i) => `
        <div class="slot ${i === inv.active ? 'active' : ''} ${s ? '' : 'empty'}">
          <span class="n">${i + 1}</span><span>${s ? s.def.icon : ''}</span>
          <span class="ammo">${s ? (s.def.melee ? '∞' : s.ammo) : ''}</span>
        </div>`).join('');
    }
    const cur = inv.current();
    this.q('weapon-name').textContent = cur ? cur.name : 'Sin arma';
    if (cur) this.q('weapon-name').style.color = cur.color;
    this.q('ammo-num').textContent = cur ? (cur.def.melee ? '∞' : cur.ammo) : '0';
    this.q('ammo-reserve').textContent = cur && cur.def.ammo ? `/ ${inv.ammo[cur.def.ammo] ?? 0}` : '';
    this.q('reload-hint').textContent = inv.reloading ? 'RECARGANDO...' : cur && !cur.def.melee && cur.ammo === 0 ? 'PULSA R PARA RECARGAR' : '';

    // Contadores
    const alive = 1 + bots.filter((b) => b.alive).length;
    this.q('alive-count').textContent = alive;
    this.q('storm-timer').textContent = storm.timeText;

    // Crosshair
    this.hitTime -= dt;
    this.q('crosshair').classList.toggle('hit', this.hitTime > 0);
    this.q('crosshair').style.opacity = player.ads && cur?.def.scope ? '0' : '1';

    // Prompt de recogida
    const near = loot.findNear(player.position, 3.4);
    this.q('pickup-prompt').style.display = near && player.alive ? 'block' : 'none';
    if (near) this.q('pickup-text').textContent = near.isChest ? 'Abrir cofre' : near.item.name;

    // Banner / toasts
    if (this.bannerTime > 0) {
      this.bannerTime -= dt;
      if (this.bannerTime <= 0) this.q('banner').style.display = 'none';
    }
    let changed = false;
    for (let i = this.toasts.length - 1; i >= 0; i--) {
      this.toasts[i].life -= dt;
      if (this.toasts[i].life <= 0) { this.toasts.splice(i, 1); changed = true; }
    }
    if (changed) this.renderToasts();

    this.drawMinimap(game);
    this.drawFloatingTexts(game);
  }

  drawMinimap(game) {
    const ctx = this.minimapCtx;
    if (!ctx) return;
    const { player, world, storm, bots } = game;
    const W = 356;
    const C = W / 2;
    const range = 620;
    const scale = C / range;
    ctx.clearRect(0, 0, W, W);
    ctx.save();
    ctx.beginPath();
    ctx.arc(C, C, C - 4, 0, Math.PI * 2);
    ctx.clip();

    // Fondo + rejilla
    const gr = ctx.createRadialGradient(C, C, 20, C, C, C);
    gr.addColorStop(0, '#3a4a52');
    gr.addColorStop(1, '#1a242c');
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, W, W);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    for (let x = -range; x <= range; x += 100) {
      const sx = C + x * scale;
      ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, W); ctx.stroke();
      const sy = C + x * scale;
      ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(W, sy); ctx.stroke();
    }

    const toX = (wx) => C + (wx - player.position.x) * scale;
    const toY = (wz) => C + (wz - player.position.z) * scale;

    // Carreteras
    const pois = world.map.pois || [];
    ctx.strokeStyle = 'rgba(230,225,200,0.28)';
    ctx.lineWidth = 3;
    for (const [a, b] of world.map.roads || []) {
      if (!pois[a] || !pois[b]) continue;
      ctx.beginPath();
      ctx.moveTo(toX(pois[a].x), toY(pois[a].z));
      ctx.lineTo(toX(pois[b].x), toY(pois[b].z));
      ctx.stroke();
    }

    // Puntos de interés
    ctx.font = '600 11px Inter, sans-serif';
    ctx.textAlign = 'center';
    for (const poi of pois) {
      const x = toX(poi.x);
      const y = toY(poi.z);
      if (x < -20 || x > W + 20 || y < -20 || y > W + 20) continue;
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillRect(x - 3, y - 3, 6, 6);
      ctx.fillStyle = 'rgba(255,255,255,0.72)';
      ctx.fillText(poi.name, x, y - 8);
    }

    // Tormenta
    const sr = storm.radius * scale;
    ctx.strokeStyle = 'rgba(180,100,255,0.95)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(toX(storm.center.x), toY(storm.center.z), sr, 0, Math.PI * 2);
    ctx.stroke();
    if (storm.state === 'shrinking') {
      ctx.strokeStyle = 'rgba(220,160,255,0.55)';
      ctx.setLineDash([8, 6]);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(toX(storm.nextCenter.x), toY(storm.nextCenter.z), storm.nextRadius * scale, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Bots cercanos
    for (const b of bots) {
      if (!b.alive) continue;
      const x = toX(b.position.x);
      const y = toY(b.position.z);
      if (x < 0 || x > W || y < 0 || y > W) continue;
      ctx.fillStyle = '#ff5b6b';
      ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill();
    }

    // Jugador (flecha)
    ctx.save();
    ctx.translate(C, C);
    ctx.rotate(-player.yaw);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#111820';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -10); ctx.lineTo(7, 8); ctx.lineTo(0, 4); ctx.lineTo(-7, 8);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    ctx.restore();
  }

  drawFloatingTexts(game) {
    if (!this.el) return;
    const container = this.q('floating-texts');
    const camera = game.camera;
    const v = new THREE.Vector3();
    let html = '';
    for (const ft of game.effects.floatingTexts) {
      v.copy(ft.pos).project(camera);
      if (v.z < -1 || v.z > 1) continue;
      const x = (v.x * 0.5 + 0.5) * window.innerWidth;
      const y = (-v.y * 0.5 + 0.5) * window.innerHeight;
      const alpha = clamp(ft.life / ft.max, 0, 1);
      html += `<div style="position:absolute;left:${x}px;top:${y}px;transform:translate(-50%,-50%);color:${ft.color};font-weight:800;font-size:15px;text-shadow:0 2px 4px #000;opacity:${alpha}">${ft.text}</div>`;
    }
    container.innerHTML = html;
  }
}
