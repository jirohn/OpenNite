(() => {
  const sel = document.querySelector('#weaponType');
  sel.value = 'pickaxe';
  sel.dispatchEvent(new Event('change', { bubbles: true }));
  return JSON.stringify({ set: sel.value });
})()
