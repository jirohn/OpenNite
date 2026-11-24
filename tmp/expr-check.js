(() => JSON.stringify({
  mode: window.openniteApp?.game?.mode,
  prev: !!window.openniteApp?.game?.previewCharacter,
  skins: window.openniteApp?.game?.previewSkins?.length,
  assetsReady: window.openniteApp?.assetsReady,
  url: location.href,
}))()
