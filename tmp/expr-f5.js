(() => {
  const g = window.openniteApp?.game;
  const before = !!g?.world?.debug?.enabled;
  const e = new KeyboardEvent('keydown', { code: 'F5', key: 'F5', bubbles: true, cancelable: true });
  document.dispatchEvent(e);
  const after = !!g?.world?.debug?.enabled;
  return JSON.stringify({ before, after, defaultPrevented: e.defaultPrevented });
})()
