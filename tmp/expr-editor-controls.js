(() => {
  const set = (sel, val) => {
    const el = document.querySelector(sel);
    if (!el) return 'missing:' + sel;
    el.value = val;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return 'ok';
  };
  const out = {
    res: set('#resScale', '1.5'),
    bg: set('#bgColor', '#274060'),
  };
  return JSON.stringify(out);
})()
