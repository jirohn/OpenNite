(() => {
  const g = window.openniteApp?.game;
  if (!g) return JSON.stringify({mode:'no-game'});
  const l = window.uiStore?.getState?.()?.loading;
  return JSON.stringify({ mode: g.mode, worldLoaded: !!g.world?.loaded, player: !!g.player, bots: (g.bots||[]).length, loading: l ? {percent:l.percent,text:l.text} : null });
})()