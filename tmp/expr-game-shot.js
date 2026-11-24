(() => {
  const g = window.openniteApp?.game;
  if (!g?.renderer) return JSON.stringify({ err: 'no renderer' });
  try { g.renderer.render(g.scene, g.camera); } catch (e) {}
  return g.renderer.domElement.toDataURL('image/png');
})()
