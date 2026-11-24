(() => {
  const md = document.querySelector('#manualDot');
  if (md && !md.checked) { md.checked = true; md.onclick && md.onclick(); }
  const set = (id, v) => {
    const el = document.querySelector('#' + id);
    if (!el) return;
    el.value = String(v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  set('rotX', 0); set('rotY', 0); set('rotZ', 0);
  const d = window.openniteEditorDebug?.();
  return JSON.stringify({ manualMode: d?.manualMode, gunFwd: d?.gunFwd, gunPos: d?.gunPos });
})()
