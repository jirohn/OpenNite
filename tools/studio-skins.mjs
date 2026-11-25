/**
 * OpenNite Studio - los personajes del juego como personajes y modelos de EGD.
 *
 * Los avatares de OpenNite (100Avatars de Polygonal Mind, rig de Mixamo) entran
 * en el Studio como "modelos 3D" de EGD con sus animaciones de Mixamo, y cada uno
 * como personaje de EGD que usa ese modelo. Los archivos no se copian: el almacén
 * de EGD los lee de /models/... la primera vez (asset con `url`).
 *
 * Al guardar, los personajes marcados como skin se escriben en
 * config/character-skins.json, que es lo que lee el juego (menú y partida).
 */

const AVATARS = '/models/opennite/characters/100avatars/';
const ANIMS = AVATARS + 'anims/';

/** Avatares que trae OpenNite. */
export const OPENNITE_AVATARS = [
  { id: '100avatars_003_jimmy', name: 'Jimmy', file: '100Avatars_003_Jimmy', color: '#1e88e5' },
  { id: '100avatars_001_crimsom', name: 'Crimsom', file: '100Avatars_001_Crimsom', color: '#c62828' },
  { id: '100avatars_002_coolalien', name: 'Cool Alien', file: '100Avatars_002_CoolAlien', color: '#43a047' },
  { id: '100avatars_004_oldmoustache', name: 'Old Moustache', file: '100Avatars_004_OldMoustache', color: '#8d6e63' },
  { id: '100avatars_005_skull', name: 'Skull', file: '100Avatars_005_Skull', color: '#eeeeee' },
  { id: '100avatars_006_cappy', name: 'Cappy', file: '100Avatars_006_Cappy', color: '#fb8c00' },
];

/**
 * Animaciones de Mixamo del juego y la ranura de EGD a la que van.
 * Las ranuras con nombre de EGD (idle, walk, run…) las usa el motor; las demás
 * son "animaciones extra" con el nombre que usa OpenNite.
 */
export const OPENNITE_ANIMS = [
  ['Idle Happy', 'idle'],
  ['Walking', 'walk'],
  ['Running', 'run'],
  ['Jump Forward Aiming', 'jump'],
  ['Running Backward', 'runBack'],
  ['Running Left Turn', 'turnLeft'],
  ['Running Right Turn', 'turnRight'],
  ['Riffle Gunplay', 'attack'],
  ['Walking Backwards', 'walkBack'],
  ['Pistol Run', 'sprint'],
  ['Pistol Run Backward', 'sprintBack'],
  ['Crouched Walking', 'crouchWalk'],
  ['Run Forward Aiming', 'runAim'],
  ['Run Backward Aiming', 'runAimBack'],
  ['Walk Forward aiming', 'walkAim'],
  ['Walking Backwards Aiming', 'walkAimBack'],
  ['Running Turn 180', 'turn180'],
  ['Gunplay Shotgun', 'shotgun'],
  ['Swimming', 'swim'],
  ['Idle In Water', 'swimIdle'],
  ['Run To Swimming', 'runToSwim'],
  ['ClimbWall', 'climb'],
  ['Slide pose', 'slide'],
  ['Idle Sad', 'idleSad'],
];
// Ranuras de EGD (el resto son extra y necesitan decir si se repiten).
const EGD_SLOTS = new Set(['idle', 'walk', 'run', 'jump', 'attack', 'use', 'hit', 'death', 'sit', 'enter', 'exit', 'runBack', 'strafeLeft', 'strafeRight', 'turnLeft', 'turnRight']);
const ONE_SHOT = new Set(['attack', 'shotgun', 'runToSwim', 'turn180', 'jump']);

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const animAssetId = (name) => 'on_anim_' + slug(name);

/** Datos de skin de OpenNite por defecto (los mismos campos que character-skins.json). */
export function defaultSkinInfo(extra = {}) {
  return {
    skin: true, skinId: '', color: '#1e88e5', rarity: 'common', price: 0, currency: 'chapas',
    saleStart: null, saleEnd: null, battlePassGift: false, battlePassLevel: null, default: false,
    notes: '', ...extra,
  };
}

/** Pone en el proyecto (si faltan) los modelos y personajes de los avatares de OpenNite. */
export function seedOpenNiteCharacters(project, skinsCatalog, newCharacter) {
  project.models ??= [];
  project.characters ??= [];
  project.assets ??= {};
  const skins = Array.isArray(skinsCatalog?.skins) ? skinsCatalog.skins : [];
  let added = 0;
  // Animaciones compartidas (rig de Mixamo, valen para todos los avatares).
  const animFiles = OPENNITE_ANIMS.map(([file]) => {
    const id = animAssetId(file);
    project.assets[id] ??= { name: file + '.fbx', ext: 'fbx', url: ANIMS + encodeURIComponent(file) + '.fbx' };
    return { assetId: id, ext: 'fbx', name: file };
  });
  const anims = {}, animLoops = {};
  for (const [file, slot] of OPENNITE_ANIMS) {
    anims[slot] = animAssetId(file) + '#0';
    if (!EGD_SLOTS.has(slot) && !ONE_SHOT.has(slot)) animLoops[slot] = true;
  }
  for (const av of OPENNITE_AVATARS) {
    const modelId = 'mdl_' + av.id;
    const assetId = 'on_' + av.id;
    const texId = 'on_tex_' + av.id;
    const url = AVATARS + av.file + '.fbx';
    project.assets[assetId] ??= { name: av.file + '.fbx', ext: 'fbx', url };
    project.assets[texId] ??= { name: av.file + '.png', ext: 'png', url: AVATARS + av.file + '.png' };
    if (!project.models.some((m) => m.id === modelId)) {
      project.models.push({
        id: modelId, name: av.name, kind: 'character', assetId, ext: 'fbx', height: 1.8, scale: 1, inPlace: true,
        handRot: [90, 0, 0], handOffset: [0, 0, 0], animFiles: animFiles.map((a) => ({ ...a })),
        anims: { ...anims }, animLoops: { ...animLoops }, materials: {},
        opennite: { texture: texId, path: url },
      });
    }
    let ch = project.characters.find((c) => c.opennite?.skinId === av.id || c.modelId === modelId);
    if (ch) continue;
    ch = newCharacter(av.name);
    ch.modelId = modelId;
    const sk = skins.find((s) => s.id === av.id || s.modelPath === url);
    // Los que ya estaban en el catálogo del juego entran como skins; el resto, como personajes.
    ch.opennite = defaultSkinInfo({
      skin: !!sk, skinId: av.id, color: sk?.color || av.color, rarity: sk?.rarity || 'common',
      price: sk?.price ?? 0, currency: sk?.currency || 'chapas', saleStart: sk?.saleStart ?? null, saleEnd: sk?.saleEnd ?? null,
      battlePassGift: !!sk?.battlePassGift, battlePassLevel: sk?.battlePassLevel ?? null, default: !!sk?.default, notes: sk?.notes || '',
    });
    project.characters.push(ch);
    added++;
  }
  // El personaje del jugador: la skin por defecto del juego.
  const def = project.characters.find((c) => c.opennite?.skin && c.opennite.default);
  if (def && added) { project.player ??= {}; project.player.characterId = def.id; }
  // El personaje de ejemplo de EGD sobra si nadie lo ha tocado.
  if (added) project.characters = project.characters.filter((c) => c.modelId || c.opennite || c.name !== 'Jugador');
  project.player ??= {};
  if (!project.characters.some((c) => c.id === project.player.characterId)) project.player.characterId = project.characters[0]?.id;
  return added;
}

/**
 * El almacén de EGD pide los archivos de los modelos por id: los de OpenNite
 * llevan `url` y se leen del juego.
 */
export function installAssetResolver(store, getProject) {
  store.resolver = async (id, meta) => {
    const url = meta?.url || getProject()?.assets?.[id]?.url;
    if (!url) return null;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`No se pudo leer ${url} (${res.status})`);
    return res.arrayBuffer();
  };
}

/**
 * Textura de los avatares (FBX con la textura aparte): se pone en todos sus
 * materiales la primera vez que el modelo está listo.
 */
export function applyOpenNiteTextures(app, modelId) {
  const p = app.project;
  const model = (p.models || []).find((m) => m.id === modelId);
  const tex = model?.opennite?.texture;
  if (!tex) return;
  const prep = app.studio?.egdModelLibrary.get(modelId);
  if (!prep) return;
  // Misma clave que usa EGD para cada material: nombre#índice.
  const keys = [];
  const seen = new Set();
  prep.template.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (m && !seen.has(m)) { seen.add(m); keys.push((m.name || 'Material') + '#' + keys.length); }
    }
  });
  model.materials ??= {};
  let changed = false;
  // Los FBX de 100Avatars traen la textura con ruta de otro PC y algunos, opacidad 0.
  for (const k of keys) {
    const cur = model.materials[k] || {};
    if (cur.map && cur.opacity !== undefined) continue;
    model.materials[k] = { map: tex, opacity: 1, transparent: false, ...cur };
    changed = true;
  }
  if (!changed) return;
  app.studio.egdModelLibrary.applyMaterials(model, app.getBuffer).then(() => {
    app.snapshot = JSON.stringify(p);
    app.current?.refresh?.();
  }).catch(() => {});
}

/** Ruta del archivo del modelo de un personaje, si el juego puede cargarlo. */
function modelPathOf(project, ch) {
  const m = (project.models || []).find((x) => x.id === ch.modelId);
  if (!m) return null;
  return m.opennite?.path || project.assets?.[m.assetId]?.url || project.assets?.[m.assetId]?.path || null;
}

/** config/character-skins.json a partir de los personajes del Studio marcados como skin. */
export function skinsCatalogFromProject(project) {
  const skins = [];
  const skipped = [];
  for (const ch of project.characters || []) {
    const o = ch.opennite;
    if (!o?.skin) continue;
    const modelPath = modelPathOf(project, ch);
    if (!modelPath) { skipped.push(ch.name); continue; }
    skins.push({
      id: o.skinId || ch.id, name: ch.name, modelPath, color: o.color || '#1e88e5',
      rarity: o.rarity || 'common', price: +o.price || 0, currency: o.currency || 'chapas',
      saleStart: o.saleStart || null, saleEnd: o.saleEnd || null,
      battlePassGift: !!o.battlePassGift, battlePassLevel: o.battlePassGift ? (+o.battlePassLevel || 1) : null,
      default: !!o.default, anim: 'idle', notes: o.notes || '', studioCharacterId: ch.id,
    });
  }
  if (skins.length && !skins.some((s) => s.default)) skins[0].default = true;
  return { catalog: { skins }, skipped };
}

/** Sección "Skin de OpenNite" en la pestaña Personajes (debajo de lo de EGD). */
export function skinSection(app, ch, ui) {
  const { egdSection, egdRow, egdText, egdNumber, egdSelect, egdCheck, egdHint, egdEl } = ui;
  const o = ch.opennite ??= defaultSkinInfo({ skin: false, skinId: ch.id });
  const commit = (label) => { app.commit(label); };
  const hasModel = !!modelPathOf(app.project, ch);
  const rows = [
    egdRow('', egdCheck(o.skin, (v) => { o.skin = v; commit('Skin de OpenNite'); app.current?.renderPanels?.(); }, 'Es una skin del juego')),
  ];
  if (!hasModel) rows.push(egdHint('Para que el juego lo use como skin, el personaje tiene que usar un modelo 3D (Apariencia → Tipo).'));
  if (o.skin) {
    const color = egdEl('input', { type: 'color', value: o.color || '#1e88e5' });
    color.addEventListener('change', () => { o.color = color.value; commit('Color de la skin'); });
    rows.push(
      egdRow('Id', egdText(o.skinId || ch.id, (v) => { o.skinId = v.trim() || ch.id; commit('Id de la skin'); })),
      egdRow('Color', color),
      egdRow('Rareza', egdSelect([['common', 'Común'], ['uncommon', 'Poco común'], ['rare', 'Rara'], ['epic', 'Épica'], ['legendary', 'Legendaria']], o.rarity || 'common', (v) => { o.rarity = v; commit('Rareza'); })),
      egdRow('Precio', egdNumber(+o.price || 0, (v) => { o.price = Math.max(0, Math.round(v)); commit('Precio'); }, { step: 50, min: 0 })),
      egdRow('Moneda', egdSelect([['chapas', 'Chapas'], ['pavos', 'Pavos']], o.currency || 'chapas', (v) => { o.currency = v; commit('Moneda'); })),
      egdRow('', egdCheck(o.default, (v) => {
        for (const c of app.project.characters) if (c.opennite) c.opennite.default = false;
        o.default = v; commit('Skin por defecto');
      }, 'Skin por defecto (gratis, la llevan todos)')),
      egdRow('', egdCheck(o.battlePassGift, (v) => { o.battlePassGift = v; commit('Pase de batalla'); app.current?.renderPanels?.(); }, 'Sale en el pase de batalla')),
    );
    if (o.battlePassGift) rows.push(egdRow('Nivel del pase', egdNumber(+o.battlePassLevel || 1, (v) => { o.battlePassLevel = Math.max(1, Math.round(v)); commit('Nivel del pase'); }, { step: 1, min: 1 })));
    rows.push(egdHint('Se guarda en config/character-skins.json al pulsar «Guardar en el juego»: aparece en el menú, la taquilla y en partida.'));
  }
  return egdSection('🎽 Skin de OpenNite', ...rows);
}
