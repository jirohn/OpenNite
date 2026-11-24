(async () => {
  try {
    await window.opennite.app.writeFile('config/test-write.txt', 'hello');
    return 'write ok';
  } catch (e) {
    return 'write err: ' + (e?.message || e);
  }
})()
