const fs=require("fs");
let s=fs.readFileSync("tools/character-editor.mjs","utf8");

// fix ensureDefaultSkins to update modelPath/name from defaults
const oldEns = `function ensureDefaultSkins() {
  const list = loadSkinsLocal();
  let changed = false;
  for (const d of GAME_DEFAULT_SKINS) {
    if (!list.some(s => s.id === d.id)) { list.push({ ...d, updatedAt: new Date().toISOString() }); changed = true; }
  }
  if (changed) saveSkinsLocal(list);
  return list;
}`;
const neuEns = `function ensureDefaultSkins() {
  const list = loadSkinsLocal();
  let changed = false;
  for (const d of GAME_DEFAULT_SKINS) {
    const existing = list.find(s => s.id === d.id);
    if (!existing) { list.push({ ...d, updatedAt: new Date().toISOString() }); changed = true; }
    else {
      if (!existing.modelPath && d.modelPath) { existing.modelPath = d.modelPath; changed = true; }
      if (!existing.name && d.name) { existing.name = d.name; changed = true; }
    }
  }
  if (changed) saveSkinsLocal(list);
  return list;
}`;
if(s.includes(oldEns)){ s=s.replace(oldEns,neuEns); console.log('ens ok'); } else console.log('ens no');

// fix init
const initIdx = s.indexOf('async function init() {');
const initEnd = s.lastIndexOf('init();');
if(initIdx>=0 && initEnd>initIdx){
  const neuInit = `async function init() {
  const saved = await loadConfigJSON('character-skins.json');
  if (saved?.skins?.length) saveSkinsLocal(saved.skins);
  ensureDefaultSkins();
  refreshSkinList();
  resize(true);
  drawTimeline();
  Object.assign(window, { __ed: { get modelRoot(){ return modelRoot; }, get clips(){ return clips; }, get currentClip(){ return currentClip; }, camera, orbit, scene, THREE, loadModelFromURL, applyClipAtTime } });
  animate();
  const list = loadSkinsLocal();
  const defSkin = list.find(s => s.id === '100avatars_003_jimmy') || list.find(s => s.id === 'skin_default_male') || list[0];
  if (defSkin) {
    selectedSkinId = defSkin.id;
    fillSkinForm(defSkin);
    refreshSkinList();
    $('gameCharSelect').value = defSkin.id;
    if (defSkin.modelPath) {
      setStatus(\`Cargando personaje por defecto: \${defSkin.name || defSkin.id}...\`);
      try {
        await loadModelFromURL(defSkin.modelPath, defSkin.name || defSkin.id);
        if (modelRoot) setStatus(\`Listo. Personaje cargado: \${defSkin.name || defSkin.id}. \${clips.length} animaciones.\`);
      } catch (e) {
        console.error('[editor] auto-load failed', e);
        setStatus('Error cargando: ' + (e?.message || e));
      }
    } else {
      setStatus('Editor listo. Selecciona un modelo para la skin.');
    }
  } else {
    setStatus('Editor de personajes listo.');
  }
}
init();`;
  s = s.slice(0,initIdx) + neuInit + s.slice(initEnd + 'init();'.length);
  console.log('init ok');
} else console.log('init no');
fs.writeFileSync("tools/character-editor.mjs",s);
