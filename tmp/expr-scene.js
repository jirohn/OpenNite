(() => {
  const g = window.openniteApp?.game;
  if (!g) return JSON.stringify({ err: 'no game' });
  const scene = g.scene;
  let meshes = 0, groups = 0;
  scene.traverse(o => { if (o.isMesh) meshes++; if (o.isGroup) groups++; });
  return JSON.stringify({ mode: g.mode, meshes, groups, worldReady: !!g.world, colliders: g.world?.colliders?.length });
})()
