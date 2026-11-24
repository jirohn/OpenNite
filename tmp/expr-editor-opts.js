(() => {
  const sel = document.querySelector('#weaponType');
  const opts = sel ? Array.from(sel.options).map(o => o.value) : [];
  return JSON.stringify({ opts, current: sel?.value, debug: window.openniteEditorDebug?.() });
})()
