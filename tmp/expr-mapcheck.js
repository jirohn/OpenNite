(() => {
  // Check if world loaded by looking for the canvas and any global
  return JSON.stringify({
    hasCanvas: !!document.querySelector('#map-canvas'),
    title: document.title,
    bodyBg: document.body.style.background,
  });
})()
