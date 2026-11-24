(() => {
  const c = window.openniteApp?.game?.previewCharacter;
  if (!c) return JSON.stringify({ err: 'no preview' });
  c.play('idleArmed');
  c.needsGunAlign = true;
  c.gunAlignTimer = 0;
  return JSON.stringify({ ok: true, current: c.current });
})()
