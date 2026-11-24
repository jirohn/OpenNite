(() => {
  const g = window.openniteApp?.game;
  const d = g?.world?.debug;
  const scene = g?.scene;
  const playerPos = g?.player?.position;
  const cam = g?.camera;
  const V = scene.position.clone();
  const line = d?.items?.[0]?.line;
  line?.getWorldPosition(V);
  const V2 = scene.position.clone();
  const group = d?.items?.find?.((i) => i.line)?.line?.parent;
  group?.getWorldPosition(V2);
  const out = {
    mode: g?.mode,
    debugEnabled: !!d?.enabled,
    sceneChildren: scene.children.length,
    debugItems: d?.items?.length,
    camPos: cam?.position?.toArray?.().map((x) => +x.toFixed(1)),
    playerPos: playerPos?.toArray?.().map((x) => +x.toFixed(1)),
    firstLineWorld: V.toArray().map((x) => +x.toFixed(1)),
    axisGroupWorld: V2.toArray().map((x) => +x.toFixed(1)),
    firstLineVisible: line?.visible,
    firstLineMatColor: line?.material?.color?.getHexString?.(),
    fog: scene.fog ? { type: scene.fog.type, near: scene.fog.near, far: scene.fog.far, color: scene.fog.color?.getHexString?.() } : null,
    debugLinesCount: (scene.children || []).filter((o) => o.type === 'Line' || o.type === 'LineSegments').length,
    debugSpriteCount: (scene.children || []).filter((o) => o.type === 'Sprite').length,
    nSpritesInGroups: (d?.items || []).filter((i) => i.sprite).length,
    camName: cam?.constructor?.name,
  };
  return JSON.stringify(out, null, 0);
})()
