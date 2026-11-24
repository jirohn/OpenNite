(() => {
  const d = window.openniteEditorDebug?.();
  if (!d) return JSON.stringify({ editor: !!window.openniteEditorDebug, mode: document.title });
  return JSON.stringify(d);
})()
