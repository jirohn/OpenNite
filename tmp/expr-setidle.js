(() => {
  const s = document.querySelector('#animSel');
  if (!s) return JSON.stringify({ err: 'no animSel' });
  s.value = 'idleArmed';
  s.dispatchEvent(new Event('change', { bubbles: true }));
  return JSON.stringify({ set: s.value });
})()
