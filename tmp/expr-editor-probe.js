(() => {
  const wt = document.querySelector('#weaponType');
  return JSON.stringify({
    weaponOptions: wt ? wt.options.length : -1,
    animOptions: document.querySelector('#animSel') ? document.querySelector('#animSel').options.length : -1,
    manualLabel: document.querySelector('#manualLabel') ? document.querySelector('#manualLabel').textContent : null,
    applyOnclick: !!document.querySelector('#apply')?.onclick,
    hasDebug: typeof window.openniteEditorDebug,
  });
})()
