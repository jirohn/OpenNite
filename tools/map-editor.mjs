/**
 * OpenNite - Editor de mapas.
 *
 * Es el editor de Easy Game Developer (EGD): las pestañas "Map Editor" y
 * "Scene Editor" son las clases de EGD (editor de Mundo y editor de Escena)
 * ejecutándose sobre el mismo motor (src/core/egd-engine.mjs). Los mapas se
 * abren y se guardan en el formato de EGD ("egd-map"), el mismo que lee el juego.
 *
 * Lo propio de OpenNite:
 *  - Scene Editor: solo objetos de la escena, viento, cofres, armas y el spawn
 *    del modo entrenamiento (en partida se cae del cielo, no hay punto de inicio).
 *  - Mapa nuevo: plano y por debajo del nivel del agua.
 *  - Guardar escribe en los mapas del juego (public/maps) y en su índice.
 */
import * as THREE from 'three';
import {
  EgdWorldEditor, EgdSceneEditor, EgdViewport, egdDispose, egdNewEntity, egdEl, egdModal, egdButton, egdSection, egdHint, egdRow, egdNumber, egdText, egdClear, egdCreateWorld as Hr, egdNormalizeWorld as M0, EGD_PROPS as Hn, EGD_BUILD_MATERIALS as Kt, EGD_BUILD_PIECES as Ei, EGD_SHAPES as bo, EGD_ENTITY_TYPES as qr, EGD_PRESET_LIST as ii, egdNormalizeEntity as S0, egdNewCharacter as _n, egdMakeTile as gh,
} from '../src/core/egd-engine.mjs';
import { isEgdMap, EGD_MAP_FORMAT, egdUpgradeWater, egdTileHasWater } from '../src/core/egd-map.mjs';

const $ = (s) => document.querySelector(s);
const AUTOSAVE_KEY = 'opennite-editor-autosave-v1';
const MAX_UNDO = 60;
const WIND_DEFAULTS = { strength: 2.5, radius: 40 };

// Objeto "recogible" de OpenNite: punto de arma + munición (el arma sale al azar).
const WEAPON_ITEM = {
  id: 'opennite_weapon',
  name: 'Arma + munición (aleatoria)',
  parts: [
    { shape: 'box', color: '#3d4350', size: [0.9, 0.22, 0.2], pos: [0, 0.05, 0], rot: [0, 0, 0] },
    { shape: 'box', color: '#2a2e36', size: [0.16, 0.3, 0.14], pos: [-0.22, -0.16, 0], rot: [0, 0, 14] },
    { shape: 'box', color: '#ffb020', size: [0.22, 0.12, 0.12], pos: [0.18, -0.12, 0], rot: [0, 0, 0], glow: true },
  ],
  stats: {},
  scriptParams: {},
};

// Tipos de entidad propios de OpenNite (nombre e icono en listas e inspector).
qr.wind = { name: 'Viento', icon: '💨' };
qr.spawn = { name: 'Spawn (entrenamiento)', icon: '⚑' };
qr.pickup = { name: 'Arma + munición', icon: '✦' };

// ------------------------------------------------------------------ mapa <-> proyecto
function slug(s) {
  return String(s || 'mapa').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'mapa';
}

/** Proyecto de editor (lo que usan las clases de EGD) a partir de un archivo egd-map. */
function projectFromMap(raw) {
  const file = raw.world ? raw : { world: raw, entities: [] };
  const world = JSON.parse(JSON.stringify(file.world));
  M0(world);
  if (file.name) world.name = file.name;
  // El agua antigua (teselas "water") pasa al agua nueva de EGD, igual que en el juego.
  egdUpgradeWater(world);
  const opennite = { ...(file.opennite || {}) };
  const entities = (file.entities || []).map((e) => { const c = JSON.parse(JSON.stringify(e)); S0(c); return c; });
  // Los vientos de OpenNite se editan como objetos de la escena.
  for (const w of opennite.winds || []) {
    const e = egdNewEntity('wind', {
      id: w.id || undefined, name: w.name || 'Viento',
      position: [+w.x || 0, +w.y || 0, +w.z || 0], rotation: [0, ((+w.rot || 0) * 180 / Math.PI), 0],
    });
    e.wind = { strength: +w.strength || WIND_DEFAULTS.strength, radius: +w.radius || WIND_DEFAULTS.radius };
    e.collidable = false;
    entities.push(e);
  }
  delete opennite.winds;
  for (const e of entities) if (e.type === 'pickup' && !e.itemId) e.itemId = WEAPON_ITEM.id;
  return {
    format: 'egd-project', version: 1, name: world.name || 'Mapa',
    world, entities, characters: [_n('Héroe')], items: [JSON.parse(JSON.stringify(WEAPON_ITEM))],
    scripts: [], models: [], opennite,
  };
}

/** Archivo egd-map (el de EGD, con el bloque `opennite` que EGD ignora). */
function mapFromProject(p) {
  const winds = [];
  const entities = [];
  for (const e of p.entities) {
    if (e.type === 'wind') {
      winds.push({
        id: e.id, type: 'wind', name: e.name || 'Viento',
        x: e.position[0], y: e.position[1], z: e.position[2],
        rot: (e.rotation[1] || 0) * Math.PI / 180,
        strength: e.wind?.strength ?? WIND_DEFAULTS.strength, radius: e.wind?.radius ?? WIND_DEFAULTS.radius,
      });
    } else entities.push(e);
  }
  const name = p.world.name || p.name || 'Mapa';
  const opennite = { ...(p.opennite || {}), id: p.opennite?.id || slug(name), winds };
  return { format: EGD_MAP_FORMAT, version: 1, name, world: p.world, entities, opennite };
}

/** Mapa nuevo de OpenNite: plano y por debajo del nivel del agua (todo mar). */
function newProject() {
  // Fondo de arena a -2 m y agua de EGD a nivel 0 (la superficie queda en -0.15 m).
  const world = Hr(48, 2, 'sand');
  for (const t of world.tiles) { t.h = -4; t.w = 0; }
  world.name = 'Mapa nuevo';
  return projectFromMap({ format: EGD_MAP_FORMAT, version: 1, name: world.name, world, entities: [] });
}

// ------------------------------------------------------------------ viento (gizmo)
function windObject(e) {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: '#7fd4ff', transparent: true, opacity: 0.85 });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.2, 10), mat);
  shaft.rotation.x = Math.PI / 2; shaft.position.set(0, 1.2, 0);
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.8, 14), mat);
  head.rotation.x = Math.PI / 2; head.position.set(0, 1.2, 1.5);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.08, 20), mat);
  base.position.y = 0.04;
  g.add(shaft, head, base);
  const r = e.wind?.radius ?? WIND_DEFAULTS.radius;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(Math.max(0.5, r - 0.25), r, 64),
    new THREE.MeshBasicMaterial({ color: '#7fd4ff', transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.1;
  ring.raycast = () => {}; // el aro no se selecciona: solo la flecha
  g.add(ring);
  g.position.fromArray(e.position);
  g.rotation.set(0, (e.rotation[1] || 0) * Math.PI / 180, 0);
  g.name = e.name;
  g.userData.entityId = e.id;
  return g;
}

// ------------------------------------------------------------------ Map Editor
/**
 * Editor de Mundo de EGD. Único cambio: como un mapa nuevo de OpenNite empieza
 * bajo el agua, "Elevar" saca tierra del material elegido cuando la tesela sale
 * del agua (el fondo sumergido sigue siendo de arena).
 */
class OpenNiteWorldEditor extends EgdWorldEditor {
  applyTool(tile, idx) {
    const liquid = (t) => t === 'water' || t === 'lava';
    const underwater = egdTileHasWater(tile);
    const r = super.applyTool(tile, idx);
    if (this.tool === 'raise' && !liquid(this.paintType)) {
      if (liquid(tile.t)) tile.t = this.paintType;
      else if (underwater && !egdTileHasWater(tile)) tile.t = this.paintType;
    }
    return r;
  }
}

// ------------------------------------------------------------------ Scene Editor
/** Editor de Escena de EGD, con los elementos que usa OpenNite. */
class OpenNiteSceneEditor extends EgdSceneEditor {
  addObject(e) {
    if (e.type !== 'wind') return super.addObject(e);
    const g = windObject(e);
    this.content.add(g);
    this.objects.set(e.id, g);
    return g;
  }

  addWind() {
    const p = this.placementPoint();
    const e = egdNewEntity('wind', { name: 'Viento', position: [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)] });
    e.wind = { ...WIND_DEFAULTS };
    e.collidable = false;
    this.project.entities.push(e);
    this.addObject(e);
    this.app.commit('Añadir viento');
    this.select(e.id);
  }

  // En OpenNite se puede borrar cualquier objeto (no hace falta punto de inicio).
  deleteSelected() {
    const e = this.entity();
    if (!e) return;
    this.project.entities = this.project.entities.filter((n) => n.id !== e.id);
    const o = this.objects.get(e.id);
    this.tc.detach();
    if (o) { this.content.remove(o); egdDispose(o); this.objects.delete(e.id); }
    this.selectedId = null;
    this.app.commit('Borrar ' + e.name);
    this.renderPanels();
  }

  renderLeft() {
    const el = egdClear(this.app.left);
    const add = (label, type, opts) => egdButton(label, () => this.addEntity(type, opts));
    const decor = document.createElement('select');
    for (const [k, v] of Object.entries(Hn)) decor.append(new Option(v.name, k));
    decor.value = 'tree';
    const matSel = document.createElement('select');
    for (const [k, v] of Object.entries(Kt)) matSel.append(new Option(v.name, k));
    matSel.value = this.buildMat;
    matSel.onchange = () => { this.buildMat = matSel.value; };
    const prefabSel = document.createElement('select');
    for (const [k, v] of Object.entries(ii)) prefabSel.append(new Option(v.name, k));
    prefabSel.value = this.prefabKey;
    prefabSel.onchange = () => { this.prefabKey = prefabSel.value; };
    const rotSel = document.createElement('select');
    for (const r of [0, 90, 180, 270]) rotSel.append(new Option(r + '°', r));
    rotSel.value = this.prefabRot;
    rotSel.onchange = () => { this.prefabRot = +rotSel.value; };
    const breakable = egdEl('input', { type: 'checkbox' });
    breakable.checked = !!this.buildBreakable;
    breakable.onchange = () => { this.buildBreakable = breakable.checked; };

    el.append(
      egdSection('🎯 OpenNite',
        egdEl('div', { class: 'grid-buttons' },
          add('📦 Cofre', 'prop', { prop: 'chest', name: 'Cofre' }),
          add('✦ Arma + munición', 'pickup', { name: 'Arma + munición', itemId: WEAPON_ITEM.id }),
          egdButton('💨 Viento', () => this.addWind()),
          add('⚑ Spawn (entrenamiento)', 'spawn', { name: 'Spawn (entrenamiento)' }),
        ),
        egdHint('En partida se cae del cielo: el spawn solo se usa en el modo entrenamiento. Los cofres y armas son el botín del mapa.'),
      ),
      egdSection('Añadir primitiva',
        egdEl('div', { class: 'grid-buttons' }, Object.entries(bo).map(([k, v]) => add(v, 'primitive', { shape: k, name: v }))),
      ),
      egdSection('🧱 Construcción modular',
        egdEl('div', { class: 'grid-buttons' }, Object.entries(Ei).map(([k, v]) => egdButton(v.icon + ' ' + v.name, () => this.addBuild(k), '', v.hint))),
        egdRow('Material', matSel),
        egdRow('', egdEl('label', { class: 'check' }, breakable, 'Rompible')),
        egdRow('Prefabricado', prefabSel, rotSel),
        egdButton('Colocar prefabricado', () => this.addPrefab(this.prefabKey), 'primary block'),
        egdHint('Medidas estándar: celdas de 4 m y plantas de 3 m. Las piezas se mueven de 1 en 1 m y giran 90°.'),
      ),
      egdSection('🌲 Decorado',
        egdRow('Decorado', decor, egdButton('Añadir', () => this.addEntity('prop', { prop: decor.value, name: Hn[decor.value].name }))),
      ),
    );
    this.outliner = egdEl('div', { class: 'list' });
    const search = egdText(this.filter, (v) => { this.filter = v; this.renderOutliner(); }, { placeholder: 'Buscar...', live: true });
    el.append(egdSection(`Objetos de la escena (${this.project.entities.length})`, search, egdEl('div', { style: { height: '6px' } }), this.outliner));
    this.renderOutliner();
  }

  renderInspector() {
    super.renderInspector();
    const t = this.entity();
    if (t?.type !== 'wind') return;
    t.wind ??= { ...WIND_DEFAULTS };
    const change = (label) => { this.app.commit(label); this.rebuildObject(t); };
    // Fuerza y radio en la misma sección del viento; sin la sección "Juego" (no es sólido).
    const [main, , game] = this.app.right.children;
    main?.append(
      egdRow('Fuerza', egdNumber(t.wind.strength, (v) => { t.wind.strength = Math.min(20, Math.max(0.2, v)); change('Fuerza del viento'); }, { step: 0.5, min: 0.2, max: 20 })),
      egdRow('Radio', egdNumber(t.wind.radius, (v) => { t.wind.radius = Math.min(500, Math.max(5, v)); change('Radio del viento'); }, { step: 5, min: 5, max: 500 })),
      egdHint('Empuja a los jugadores en la dirección de la flecha (rótala con E). El aro marca su alcance.'),
    );
    game?.remove();
  }

  // OpenNite no usa micro-códigos de EGD.
  scriptsSection() { return egdEl('div'); }
}

// ------------------------------------------------------------------ aplicación
class EditorApp {
  constructor() {
    this.left = $('#left-panel');
    this.right = $('#right-panel');
    this.overlay = $('#viewport-overlay');
    this.center = $('#center-panel');
    this.rev = 0;
    this.undoStack = [];
    this.redoStack = [];
    this.dirty = false;
    this.consoleCount = 0;
    this.mapIndex = null;
    this.project = this.loadAutosave() || newProject();
    this.snapshot = JSON.stringify(this.project);
    this.engine = new EgdViewport($('#canvas-host'));
    this.editors = { world: new OpenNiteWorldEditor(this), scene: new OpenNiteSceneEditor(this) };
    this.current = null;
    this.bindUI();
    this.updateTitle();
    this.setDirty(false);
    this.switchTab('world');
    this.log('Editor de mapas de OpenNite listo (motor de Easy Game Developer).');
  }

  switchTab(name) {
    if (this.current === this.editors[name]) return;
    this.current?.deactivate();
    for (const el of [this.left, this.right, this.overlay]) egdClear(el);
    this.closeDrawers();
    this.current = this.editors[name];
    this.currentName = name;
    document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
    this.current.activate();
  }

  openScript() {}

  // ---- historial
  commit(label = 'Cambio') {
    this.undoStack.push(this.snapshot);
    if (this.undoStack.length > MAX_UNDO) this.undoStack.shift();
    this.redoStack = [];
    this.snapshot = JSON.stringify(this.project);
    this.rev++;
    if (this.current && 'lastRev' in this.current) this.current.lastRev = this.rev;
    this.setDirty(true);
    this.status(label);
    clearTimeout(this._autosave);
    this._autosave = setTimeout(() => this.autosave(), 800);
  }
  undo() { this.restore(this.undoStack, this.redoStack, 'Deshacer'); }
  redo() { this.restore(this.redoStack, this.undoStack, 'Rehacer'); }
  restore(from, to, label) {
    if (!from.length) return this.status('Nada que ' + label.toLowerCase());
    to.push(this.snapshot);
    this.snapshot = from.pop();
    this.project = JSON.parse(this.snapshot);
    this.rev++;
    this.setDirty(true);
    this.reloadCurrent();
    this.status(label);
    this.autosave();
  }
  reloadCurrent() {
    this.updateTitle();
    const c = this.current;
    if (c) { c.refresh?.(); c.renderPanels?.(); }
  }
  replaceProject(p) {
    this.project = p;
    this.snapshot = JSON.stringify(p);
    this.undoStack = [];
    this.redoStack = [];
    this.rev++;
    this.setDirty(false);
    this.reloadCurrent();
    this.autosave();
  }

  // ---- archivo
  autosave() { try { localStorage.setItem(AUTOSAVE_KEY, this.snapshot); } catch {} }
  loadAutosave() {
    try {
      const s = localStorage.getItem(AUTOSAVE_KEY);
      if (!s) return null;
      const p = JSON.parse(s);
      if (!p?.world?.tiles) return null;
      M0(p.world);
      p.entities ??= []; p.entities.forEach(S0);
      p.items = [JSON.parse(JSON.stringify(WEAPON_ITEM))];
      p.characters ??= [_n('Héroe')]; p.scripts ??= []; p.models ??= []; p.opennite ??= {};
      return p;
    } catch { return null; }
  }
  mapFile() { return mapFromProject(this.project); }
  mapJSON() { return JSON.stringify(this.mapFile(), null, 2); }

  async newMap() {
    if (this.dirty && !confirm('Hay cambios sin guardar. ¿Crear un mapa nuevo?')) return;
    this.replaceProject(newProject());
    this.toast('Mapa nuevo: plano y bajo el nivel del agua');
  }

  openMapData(raw, label) {
    if (!isEgdMap(raw)) {
      alert('Este mapa es del sistema antiguo de OpenNite (terreno procedural) y no tiene teselas. Abre un mapa egd-map o crea uno nuevo.');
      return false;
    }
    this.replaceProject(projectFromMap(raw));
    this.toast('Mapa abierto: ' + (label || this.project.world.name));
    return true;
  }

  async loadIndex() {
    try {
      const res = await fetch('/maps/index.json?t=' + Date.now());
      this.mapIndex = res.ok ? await res.json() : { maps: [] };
    } catch { this.mapIndex = { maps: [] }; }
    return this.mapIndex;
  }

  async openDialog() {
    const idx = await this.loadIndex();
    const list = egdEl('div', { class: 'map-list' });
    let modal;
    for (const m of idx.maps || []) {
      list.append(egdEl('div', {
        class: 'list-item',
        onclick: async () => {
          if (this.dirty && !confirm('Hay cambios sin guardar. ¿Abrir otro mapa?')) return;
          try {
            const res = await fetch('/maps/' + m.file + '?t=' + Date.now());
            const raw = await res.json();
            if (this.openMapData(raw, m.name)) {
              // Guardar sobrescribe este mismo mapa del juego (mismo id y archivo).
              this.project.opennite = { ...(this.project.opennite || {}), id: m.id };
              this.snapshot = JSON.stringify(this.project);
              this.setDirty(false);
              modal?.close();
            }
          } catch (e) { alert('No se pudo abrir: ' + e.message); }
        },
      }, egdEl('span', { class: 'li-label' }, m.name || m.id), egdEl('small', {}, m.file)));
    }
    const fromFile = egdButton('📂 Desde un archivo (.json)…', async () => {
      const raw = await this.pickFile();
      if (raw && this.openMapData(raw)) modal?.close();
    }, 'block');
    const close = egdEl('div', { class: 'btn-row', style: { justifyContent: 'flex-end', marginTop: '10px' } }, egdButton('Cerrar', () => modal?.close()));
    modal = egdModal('Abrir mapa', egdHint('Mapas del juego:'), list, fromFile, close);
  }

  async pickFile() {
    try {
      const txt = window.opennite?.app?.openMapFile ? await window.opennite.app.openMapFile() : await new Promise((resolve) => {
        const inp = document.createElement('input');
        inp.type = 'file'; inp.accept = '.json,application/json';
        inp.onchange = () => { const f = inp.files?.[0]; if (!f) return resolve(null); f.text().then(resolve); };
        inp.click();
      });
      return txt ? JSON.parse(txt) : null;
    } catch (e) { alert('Archivo no válido: ' + e.message); return null; }
  }

  /** Guarda en los mapas del juego (public/maps y dist/maps) y lo añade al índice. */
  async save() {
    const file = this.mapFile();
    const id = file.opennite.id;
    this.project.opennite = { ...(this.project.opennite || {}), id };
    const json = JSON.stringify(file, null, 2);
    const fileName = `${id}.json`;
    const write = window.opennite?.app?.writeFile;
    if (!write) { this.download(fileName, json); this.setDirty(false); return; }
    let ok = 0;
    for (const dir of ['public/maps', 'dist/maps']) {
      try { await write(`${dir}/${fileName}`, json); ok++; } catch {}
    }
    // Índice de mapas del juego: se añade si no estaba.
    try {
      const idxTxt = await window.opennite.app.readFile('public/maps/index.json');
      const idx = idxTxt ? JSON.parse(idxTxt) : { schema: 1, maps: [] };
      idx.maps ??= [];
      const N = file.world.size * file.world.tileSize;
      const entry = idx.maps.find((m) => m.id === id || m.file === fileName);
      if (entry) { entry.name = file.name; entry.size = N; }
      else idx.maps.push({ id, name: file.name, description: 'Mapa creado con el editor (formato egd-map).', file: fileName, version: 1, size: N, type: 'island', theme: 'temperate', gradient: 'linear-gradient(135deg,#2e6f82,#67a86d 45%,#e3d19a)', tags: ['EGD'] });
      const out = JSON.stringify(idx, null, 2);
      for (const dir of ['public/maps', 'dist/maps']) { try { await write(`${dir}/index.json`, out); } catch {} }
    } catch (e) { this.log('No se pudo actualizar el índice de mapas: ' + e.message, 'warn'); }
    if (!ok) { this.download(fileName, json); return; }
    // El juego abrirá este mapa (partida y entrenamiento) la próxima vez.
    try {
      const s = await window.opennite?.settings?.get?.();
      await window.opennite?.settings?.set?.({ ...(s || {}), mapId: id });
    } catch {}
    this.setDirty(false);
    this.toast('Mapa guardado en el juego: ' + file.name);
    this.log(`Guardado ${fileName}: ${file.world.size}×${file.world.size} teselas, ${file.entities.length} objetos, ${file.opennite.winds.length} vientos`);
  }

  download(name, text) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // Botones "Guardar mapa / Cargar mapa" del panel del Map Editor.
  async saveMap() { this.download(`${this.mapFile().opennite.id}.json`, this.mapJSON()); }
  async loadMap() {
    if (!confirm('Cargar un mapa reemplaza el terreno y los objetos actuales. ¿Continuar?')) return;
    const raw = await this.pickFile();
    if (raw) this.openMapData(raw);
  }

  // ---- interfaz
  setDirty(d) {
    this.dirty = d;
    $('#file-text').textContent = (this.project.opennite?.id ? this.project.opennite.id + '.json' : 'Sin guardar') + (d ? ' •' : '');
  }
  updateTitle() {
    $('#project-name').value = this.project.world.name || 'Mapa';
    document.title = (this.project.world.name || 'Mapa') + ' — OpenNite · Editor de mapas';
  }
  status(t) { $('#status-text').textContent = t; }
  toast(t) {
    const d = document.createElement('div');
    d.className = 'toast'; d.textContent = t;
    $('#toast-host').appendChild(d);
    setTimeout(() => d.remove(), 2600);
  }
  log(msg, kind = 'log') {
    const d = document.createElement('div');
    d.className = kind;
    d.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    const body = $('#console-body');
    body.appendChild(d); body.scrollTop = body.scrollHeight;
    $('#console-count').textContent = ++this.consoleCount;
    if (kind === 'error') this.status('⚠ ' + msg);
  }
  toggleDrawer(side) {
    const a = side === 'left' ? this.left : this.right, b = side === 'left' ? this.right : this.left;
    const open = !a.classList.contains('open');
    b.classList.remove('open'); a.classList.toggle('open', open);
    $('#drawer-backdrop').classList.toggle('show', open);
  }
  closeDrawers() {
    this.left.classList.remove('open'); this.right.classList.remove('open');
    $('#drawer-backdrop')?.classList.remove('show');
  }

  bindUI() {
    $('#btn-undo').onclick = () => this.undo();
    $('#btn-redo').onclick = () => this.redo();
    $('#btn-new').onclick = () => this.newMap();
    $('#btn-open').onclick = () => this.openDialog();
    $('#btn-save').onclick = () => this.save();
    $('#btn-export').onclick = () => this.saveMap();
    $('#btn-play').onclick = () => {
      if (this.dirty && !confirm('Hay cambios sin guardar. ¿Volver al juego igualmente?')) return;
      location.href = '/';
    };
    $('#btn-menu').onclick = (e) => { e.stopPropagation(); $('#topbar').classList.toggle('menu-open'); };
    document.addEventListener('click', (e) => { if (!e.target.closest('.file-menu, #btn-menu')) $('#topbar').classList.remove('menu-open'); });
    $('#mb-left').onclick = () => this.toggleDrawer('left');
    $('#mb-right').onclick = () => this.toggleDrawer('right');
    $('#drawer-backdrop').addEventListener('click', () => this.closeDrawers());
    document.querySelectorAll('#tabs button').forEach((b) => b.addEventListener('click', () => this.switchTab(b.dataset.tab)));
    $('#project-name').addEventListener('change', (e) => {
      const v = e.target.value || 'Mapa';
      this.project.world.name = v; this.project.name = v;
      this.commit('Nombre del mapa');
      this.updateTitle();
      this.current?.renderPanels?.();
    });
    $('#btn-console').onclick = () => $('#console').classList.toggle('hidden');
    $('#console-close').onclick = () => $('#console').classList.add('hidden');
    $('#console-clear').onclick = () => { $('#console-body').innerHTML = ''; this.consoleCount = 0; $('#console-count').textContent = '0'; };
    window.addEventListener('keydown', (e) => {
      const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName);
      if (e.ctrlKey && e.code === 'KeyS') { e.preventDefault(); this.save(); return; }
      if (typing) return;
      if (e.ctrlKey && e.code === 'KeyZ') { e.preventDefault(); e.shiftKey ? this.redo() : this.undo(); return; }
      if (e.ctrlKey && e.code === 'KeyY') { e.preventDefault(); this.redo(); return; }
      this.current?.onKey?.(e);
    });
    window.addEventListener('beforeunload', () => this.autosave());
    window.addEventListener('error', (e) => this.log('Error: ' + e.message, 'error'));
  }
}

const app = new EditorApp();
window.editorApp = app;
export { app, projectFromMap, mapFromProject, newProject };
