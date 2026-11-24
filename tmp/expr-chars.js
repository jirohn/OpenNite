(() => {
  const g = window.openniteApp?.game;
  const out = [];
  const ch = (c) => c ? {
    ubc: !!c.isUbc,
    clip: c.kitChar?.playing || c.current || null,
    pos: [c.group?.position?.x?.toFixed?.(1), c.group?.position?.y?.toFixed?.(1), c.group?.position?.z?.toFixed?.(1)],
    rotY: (c.group?.rotation?.y || 0).toFixed(2),
  } : null;
  if (g?.previewCharacter) out.push(['preview', ch(g.previewCharacter)]);
  if (g?.previewSkins) for (let i = 0; i < g.previewSkins.length; i++) out.push(['skin' + i, ch(g.previewSkins[i])]);
  if (g?.player?.character) out.push(['player', ch(g.player.character), { weapon: g.player?.inventory?.current()?.type }]);
  if (g?.bots) for (const b of g.bots) out.push(['bot', b.name, ch(b.character)]);
  return JSON.stringify(out);
})()
