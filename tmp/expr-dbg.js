(() => JSON.stringify({
  debugMode: window.openniteApp?.game?.settings?.get?.("debugMode"),
  worldDebug: !!window.openniteApp?.game?.world?.debug?.enabled,
  previewDebug: !!window.openniteApp?.game?.previewDebug?.enabled,
}))()
