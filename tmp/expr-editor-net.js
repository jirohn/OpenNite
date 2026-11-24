(async () => {
  const out = {};
  for (const p of ['/models/opennite/ubc/Superhero_Male_FullBody.gltf', '/node_modules/three/build/three.module.js', '/tools/gun-editor.mjs', '/src/game/character.js']) {
    try { const r = await fetch(p); out[p] = r.status; } catch (e) { out[p] = 'ERR'; }
  }
  try { await import('/tools/gun-editor.mjs'); out.import = 'ok'; } catch (e) { out.import = 'ERR:' + (e.message || e); }
  return JSON.stringify(out);
})()
