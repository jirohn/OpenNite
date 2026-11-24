(() => {
  const md = document.querySelector('#manualDot');
  if (md && !md.checked) { md.checked = true; md.onclick && md.onclick(); }
  const set = (id, v) => {
    const el = document.querySelector('#' + id);
    if (!el) return;
    el.value = String(v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  set('rotX', 0); set('rotY', 90); set('rotZ', 0);
  const btn = document.querySelector('#export');
  if (btn) btn.click();
  return JSON.stringify({ done: true });
})()
