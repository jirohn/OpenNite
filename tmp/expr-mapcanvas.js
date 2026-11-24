(() => {
  // Try to access the renderer via a global we might have set
  // The map-editor.mjs doesn't expose globals, so check if canvas has content
  const c = document.querySelector('#map-canvas');
  return JSON.stringify({ width: c?.width, height: c?.height, clientW: c?.clientWidth });
})()
