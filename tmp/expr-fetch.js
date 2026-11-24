((async () => {
  const paths = [
    '/tools/gun-editor.html', '/tools/gun-editor.mjs',
    '/node_modules/three/build/three.module.js',
    '/node_modules/three/examples/jsm/loaders/GLTFLoader.js',
    '/node_modules/three/examples/jsm/utils/SkeletonUtils.js',
    '/src/game/character.js', '/src/game/ubc-character.js', '/src/game/kit-character.js',
    '/index.html', '/maps/index.json',
  ];
  const out = {};
  for (const p of paths) {
    try { const r = await fetch(p); out[p] = r.status; } catch (e) { out[p] = 'ERR'; }
  }
  return JSON.stringify(out, null, 0);
})())
