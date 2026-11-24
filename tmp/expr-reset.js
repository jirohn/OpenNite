(() => {
  const btn = document.querySelector('#reset');
  if (!btn) return JSON.stringify({ err: 'no reset' });
  btn.click();
  return JSON.stringify({ reset: true });
})()
