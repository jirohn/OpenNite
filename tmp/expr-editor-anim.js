(() => {
  const s = document.querySelector('#animSel');
  if (!s) return JSON.stringify({ err: 'no animSel' });
  const before = window.openniteEditorDebug?.().playing ?? null;
  s.value = 'reload';
  s.dispatchEvent(new Event('change', { bubbles: true }));
  const d = window.openniteEditorDebug?.();
  return JSON.stringify({ before, sel: s.value, playing: d?.playing, orbit: d?.orbit });
})()
