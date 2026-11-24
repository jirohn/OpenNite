(() => {
  const ov = document.querySelector('#error-overlay');
  return JSON.stringify({
    hasDebug: typeof window.openniteEditorDebug,
    overlay: ov ? ov.style.display : null,
    overlayText: ov ? ov.textContent.slice(0, 200) : null,
    canvases: document.querySelectorAll('canvas').length,
    title: document.title,
  });
})()
