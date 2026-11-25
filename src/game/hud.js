import * as THREE from 'three';
import { clamp } from '../core/utils.js';
import { bridge } from '../ui/bridge.js';
import { hudStore, pushHudToast } from '../ui/store.js';

/** Estado del HUD: la vista React está en src/ui/Hud.jsx. */
export class HUD {
  constructor(uiRoot, settings) {
    this.root = uiRoot;
    this.settings = settings;
    this.input = null;
    this.bannerTime = 0;
    this.damageFlashAmount = 0;
    this.hitTime = 0;
    this.minimapCtx = null;
    this.minimapCanvas = null;
    this.fpsSmooth = 60;
    this.frameCount = 0;
    this.fpsTimer = 0;
    this.uwDrops = []; // gotas en UV para el postprocesado
    this.uwSpawnTimer = 0;
    this.uwWasUnderwater = false;
    this.uwDropTime = 0;
    this.uwIntensity = 0;
    bridge.hud = this;
  }

  mount(mapName) {
    this.unmount();
    this.bannerTime = 0;
    this.damageFlashAmount = 0;
    this.hitTime = 0;
    this.fpsSmooth = 60;
    this.frameCount = 0;
    this.fpsTimer = 0;
    hudStore.setState({
      mounted: true, mapName, showLockPrompt: false, fps: '',
      hp: 100, shield: 0, lowHp: false, damageOpacity: 0, stormOpacity: 0,
      slots: [], weaponName: 'Pistola', weaponColor: '#ffffff',
      ammo: '12', reserve: '/ 90', reloadHint: '', alive: 1, kills: 0, killFeed: [],
      heading: 0, headingLabel: 'N', stormTime: '',
      hit: false, hiddenCrosshair: false, pickupVisible: false, pickupText: '',
      chestOpening: null,
      bannerVisible: false, bannerTitle: '', bannerSub: '', toasts: [], kills: [],
    });
    this.uwDrops = [];
    this.uwWasUnderwater = false;
    this.uwDropTime = 0;
    this.uwIntensity = 0;
  }

  unmount() {
    hudStore.setState({ mounted: false });
    this.uwDrops = [];
  }

  toast(text, type = '') {
    pushHudToast(text, type);
  }

  kill(killer, victim, weapon = '') {
    hudStore.setState((s) => ({
      killFeed: [{ killer, victim, weapon }, ...s.killFeed].slice(0, 5),
    }));
  }

  banner(title, sub = '', duration = 2.4) {
    hudStore.setState({ bannerTitle: title, bannerSub: sub, bannerVisible: true });
    this.bannerTime = duration;
  }

  hitMarker() { this.hitTime = 0.16; }

  damageFlash(amount = 0.5) { this.damageFlashAmount = Math.min(1, this.damageFlashAmount + amount); }

  update(game, dt) {
    if (!hudStore.getState().mounted) return;
    const { player, storm, bots, loot } = game;
    const patch = {
      showLockPrompt: !game.input.locked && game.input.autoLock && !game.paused,
    };

    // FPS
    this.frameCount++;
    this.fpsTimer += dt;
    if (this.fpsTimer >= 0.5) {
      this.fpsSmooth = this.frameCount / this.fpsTimer;
      this.frameCount = 0;
      this.fpsTimer = 0;
      patch.fps = this.settings.get('showFPS') ? `${Math.round(this.fpsSmooth)} FPS` : '';
    }

    // Vida y escudo
    const hp = Math.round(player.hp);
    const sh = Math.round(player.shield);
    patch.hp = hp;
    patch.shield = sh;
    patch.lowHp = hp <= 30;
    patch.damageOpacity = Math.max(hp < 35 ? (1 - hp / 35) * 0.35 : 0, this.damageFlashAmount).toFixed(2);
    this.damageFlashAmount = Math.max(0, this.damageFlashAmount - dt * 2.2);

    const outside = storm.distanceOutside(player.position);
    patch.stormOpacity = outside > 0 ? clamp(outside / 260 + 0.25, 0, 0.9).toFixed(2) : '0';

    // Inventario
    const inv = player.inventory;
    patch.slots = inv.slots.map((s, i) => ({
      active: i === inv.active,
      item: !!s,
      icon: s ? s.def.icon : '',
      ammo: s ? (s.def.melee ? '∞' : s.ammo) : '',
    }));
    const cur = inv.current();
    patch.weaponName = cur ? cur.name : 'Sin arma';
    patch.weaponColor = cur ? cur.color : '#ffffff';
    patch.ammo = cur ? (cur.def.melee ? '∞' : cur.ammo) : '0';
    patch.reserve = cur && cur.def.ammo ? `/ ${inv.ammo[cur.def.ammo] ?? 0}` : '';
    patch.reloadHint = inv.reloading
      ? 'RECARGANDO...'
      : cur && !cur.def.melee && cur.ammo === 0
        ? ((inv.ammo[cur.def.ammo] ?? 0) > 0 ? 'SIN BALAS · PULSA R' : 'SIN MUNICIÓN')
        : '';

    // Contadores y brújula (la vista gira con el mismo yaw que la cámara).
    patch.alive = 1 + bots.filter((b) => b.alive).length;
    patch.kills = player.kills || 0;
    const heading = (THREE.MathUtils.radToDeg(Math.atan2(-Math.sin(player.yaw), Math.cos(player.yaw))) + 360) % 360;
    patch.heading = Math.round(heading);
    patch.headingLabel = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'][Math.round(heading / 45) % 8];
    if (storm.active) {
      const warn = outside > 0 ? ` · ¡SAL DE LA TORMENTA! +${Math.round(outside)}m` : '';
      patch.stormTime = `${storm.timeText} · Fase ${storm.phase || 0}${warn}`;
    } else {
      patch.stormTime = '';
    }

    // Crosshair
    this.hitTime -= dt;
    patch.hit = this.hitTime > 0;
    patch.hiddenCrosshair = player.ads && !!cur?.def.scope;

    // Prompt de recogida / salto del autobús / apertura cofre/puerta
    const co = game.chestOpening;
    const od = game.doorOpening;
    const nearDoor = (!player.inBus && player.alive && game.world?.findNearestDoor) ? game.world.findNearestDoor(player.position, 2.6) : null;
    if (player.inBus) {
      patch.pickupVisible = true;
      patch.pickupText = 'Pulsa ESPACIO para saltar del autobús';
      patch.chestOpening = null;
    } else if (co && player.alive) {
      const progress = Math.max(0, Math.min(1, co.time / (co.duration || 1)));
      patch.pickupVisible = true;
      patch.pickupText = 'Abriendo cofre...';
      patch.chestOpening = { progress, active: true };
    } else if (od && player.alive) {
      const progress = Math.max(0, Math.min(1, od.time / (od.duration || 0.5)));
      patch.pickupVisible = true;
      patch.pickupText = od.entity?.targetOpen ? 'Cerrando puerta...' : 'Abriendo puerta...';
      patch.chestOpening = { progress, active: true };
    } else {
      const near = player.ride ? null : loot.findNear(player.position, 3.4);
      const vText = player.alive && game.vehicles ? game.vehicles.hudText(player) : null;
      if (player.ride && vText) {
        patch.pickupVisible = true;
        patch.pickupText = vText;
      } else if (near && player.alive) {
        patch.pickupVisible = true;
        patch.pickupText = near.isChest ? 'Mantén E para abrir cofre' : `${near.item.name} (E)`;
      } else if (nearDoor && player.alive) {
        patch.pickupVisible = true;
        patch.pickupText = nearDoor.targetOpen ? 'Mantén E para cerrar puerta' : 'Mantén E para abrir puerta';
      } else if (vText) {
        patch.pickupVisible = true;
        patch.pickupText = vText;
      } else if (player.alive && player.glidePrompt) {
        patch.pickupVisible = true;
        patch.pickupText = 'Pulsa ESPACIO para abrir paracaídas';
      } else {
        patch.pickupVisible = false;
        patch.pickupText = '';
      }
      patch.chestOpening = null;
    }

    // Banner / toasts
    if (this.bannerTime > 0) {
      this.bannerTime -= dt;
      if (this.bannerTime <= 0) patch.bannerVisible = false;
    }
    const state = hudStore.getState();
    let changed = false;
    const toasts = [];
    for (const t of state.toasts) {
      const life = t.life - dt;
      if (life <= 0) { changed = true; continue; }
      if (life !== t.life) changed = true;
      toasts.push({ ...t, life });
    }
    if (changed) patch.toasts = toasts;

    hudStore.setState(patch);
    this.updateUnderwater(game, dt);
    this.drawMinimap(game);
    this.drawFloatingTexts(game);
  }

  updateUnderwater(game, dt) {
    const pass = game.underwaterPass;
    if (!pass) return;
    const cam = game.camera;
    let underwater = false;
    let waterY = -Infinity;
    if (cam && game.world) {
      waterY = game.world.waterYAt ? game.world.waterYAt(cam.position.x, cam.position.z) : game.world.waterLevel;
      underwater = Number.isFinite(waterY) && waterY > -50 && (cam.position.y < waterY + 0.15);
    }

    if (underwater && !this.uwWasUnderwater) {
      // Las burbujas 3D las genera el personaje al caer al agua (Player), no la camara.
      this.uwDropTime = 0;
      this.uwDrops.length = 0;
    } else if (!underwater && this.uwWasUnderwater) {
      this.uwDropTime = 1.1;
      this.uwSpawnTimer = 0;
    }
    this.uwWasUnderwater = underwater;
    this.uwDropTime = Math.max(0, this.uwDropTime - dt);

    const target = underwater ? 1 : 0;
    this.uwIntensity += (target - this.uwIntensity) * Math.min(1, dt * (underwater ? 3.5 : 2.4));
    if (this.uwIntensity < 0.002) this.uwIntensity = 0;

    // Gotas pequeñas y realistas al salir: se ven como lentes, no como bolas gigantes.
    if (this.uwDropTime > 0) {
      this.uwSpawnTimer -= dt;
      if (this.uwSpawnTimer <= 0) {
        this.uwSpawnTimer = 0.13 + Math.random() * 0.17;
        const n = 1 + Math.floor(Math.random() * 2);
        for (let i = 0; i < n && this.uwDrops.length < 12; i++) {
          this.uwDrops.push({
            x: 0.06 + Math.random() * 0.88,
            y: 1.03 + Math.random() * 0.08,
            vy: -(0.20 + Math.random() * 0.18),
            r: 0.012 + Math.random() * 0.014, // ~13-28px a 1080p
            strength: 0.5 + Math.random() * 0.35,
            wob: Math.random() * Math.PI * 2,
            life: 1,
          });
        }
      }
    }

    const u = pass.uniforms;
    u.uTime.value += dt;
    u.uUnderwater.value = this.uwIntensity;
    const arr = u.uDrops.value;
    let count = 0;
    for (let i = this.uwDrops.length - 1; i >= 0; i--) {
      const d = this.uwDrops[i];
      d.wob += dt * 3;
      d.x += Math.sin(d.wob) * 0.008 * dt;
      d.y += d.vy * dt;
      d.vy -= 0.30 * dt;
      d.life -= dt * 0.3;
      if (d.y < -0.06 || d.life <= 0) { this.uwDrops.splice(i, 1); continue; }
      if (count < 12) {
        arr[count].set(d.x, d.y, d.r, d.strength * Math.min(1, d.life * 2));
        count++;
      }
    }
    u.uDropCount.value = count;
  }

  drawMinimap(game) {
    const canvas = bridge.refs.minimap;
    if (!canvas) return;
    if (!this.minimapCtx || this.minimapCanvas !== canvas) {
      this.minimapCtx = canvas.getContext('2d');
      this.minimapCanvas = canvas;
    }
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
    const pois = world.pois || world.map.pois || [];
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
    const container = bridge.refs.floating;
    if (!container) return;
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
