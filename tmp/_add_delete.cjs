const fs=require("fs"); let s=fs.readFileSync("tools/character-editor.mjs","utf8");
const old = `$('btnExportSkin').onclick = () => { downloadJSON({ skins: loadSkinsLocal() }, 'character-skins.json'); setStatus('Skins exportadas.'); };
$('btnNewSkin').onclick = () => {`;
const neu = `$('btnExportSkin').onclick = () => { downloadJSON({ skins: loadSkinsLocal() }, 'character-skins.json'); setStatus('Skins exportadas.'); };
$('btnDeleteSkin').onclick = async () => {
  const id = selectedSkinId || $('gameCharSelect').value;
  if (!id) return;
  const list = loadSkinsLocal();
  const idx = list.findIndex(s => s.id === id);
  if (idx < 0) { setStatus('Skin no encontrada.'); return; }
  const name = list[idx].name || id;
  if (!confirm('Eliminar skin "' + name + '"?')) return;
  list.splice(idx, 1);
  saveSkinsLocal(list);
  const next = list[0] || null;
  selectedSkinId = next?.id || '';
  refreshSkinList();
  if (next) await selectSkinById(next.id, true);
  else { clearModel(); setStatus('Skin eliminada. No quedan skins.'); }
  await saveConfigJSON('character-skins.json', { skins: list }, 'Skin eliminada: ' + name);
};
$('btnNewSkin').onclick = () => {`;
if(s.includes(old)){s=s.replace(old,neu); fs.writeFileSync("tools/character-editor.mjs",s); console.log('ok')} else console.log('no')
