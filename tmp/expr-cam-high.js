(() => {
  const g = window.openniteApp?.game;
  if (!g) return JSON.stringify({ err: 'no game' });
  // Move camera high up to see the map
  g.camera.position.set(0, 200, 0);
  g.camera.lookAt(0, 0, 0);
  return JSON.stringify({ ok: true, pos: g.camera.position.toArray() });
})()
