(async () => {
  try {
    await window.openniteApp.startMatch('san-borondon');
    return 'started';
  } catch (e) {
    return 'err: ' + (e?.message || e);
  }
})()
