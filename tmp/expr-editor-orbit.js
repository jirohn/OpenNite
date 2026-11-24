(async () => {
  const canvas = document.querySelector('#editor-canvas');
  const d0 = window.openniteEditorDebug?.();
  const dist0 = d0?.orbit?.distance ?? null;
  canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: -240, clientX: 400, clientY: 300, bubbles: true, cancelable: true }));
  await new Promise((r) => setTimeout(r, 400));
  const d1 = window.openniteEditorDebug?.();
  const dist1 = d1?.orbit?.distance ?? null;
  // Órbita: arrastre sintético (pointerdown + move + up).
  canvas.dispatchEvent(new PointerEvent('pointerdown', { clientX: 400, clientY: 300, bubbles: true }));
  canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: 520, clientY: 260, bubbles: true }));
  canvas.dispatchEvent(new PointerEvent('pointerup', { clientX: 520, clientY: 260, bubbles: true }));
  await new Promise((r) => setTimeout(r, 400));
  const d2 = window.openniteEditorDebug?.();
  return JSON.stringify({ dist0, dist1, dist2: d2?.orbit?.distance, target: d2?.orbit?.target });
})()
