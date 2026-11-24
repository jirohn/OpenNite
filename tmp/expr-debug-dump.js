(() => {
  const g = window.openniteApp?.game;
  const debug = g?.world?.debug;
  const scene = g?.scene;
  const sceneChildren = scene?.children || [];
  const types = sceneChildren.reduce((acc, o) => { const t = o.type || 'none'; acc[t] = (acc[t] || 0) + 1; return acc; }, {});
  const lineObjs = sceneChildren.filter((o) => o.type === 'Line' || o.type === 'LineSegments');
  const spriteObjs = sceneChildren.filter((o) => o.type === 'Sprite');
  const firstLine = lineObjs[0];
  const firstSprite = spriteObjs[0];
  const out = {
    mode: g?.mode,
    debugEnabled: !!debug?.enabled,
    debugBoxes: debug?.boxes?.length,
    debugItems: debug?.items?.length,
    sceneChildren: sceneChildren.length,
    sceneTypes: types,
    visibleLineCount: lineObjs.filter((o) => !o.visible).length,
    spriteCount: spriteObjs.length,
    firstLine: firstLine ? { pos: [firstLine.position.x.toFixed(2), firstLine.position.y.toFixed(2), firstLine.position.z.toFixed(2)], geometryVerts: firstLine.geometry.attributes?.position?.count, matColor: firstLine.material?.color?.getHexString?.() } : null,
    firstSprite: firstSprite ? { pos: [firstSprite.position.x.toFixed(2), firstSprite.position.y.toFixed(2), firstSprite.position.z.toFixed(2)], scale: firstSprite.scale?.toArray?.().map((v) => +v.toFixed(3)), visible: firstSprite.visible, matMapPresent: !!firstSprite.material?.map } : null,
    firstAxisGroup: (() => {
      const item = debug?.items?.find?.((i) => i.line)?.line?.parent;
      if (!item) return null;
      return { pos: [item.position.x.toFixed(2), item.position.y.toFixed(2), item.position.z.toFixed(2)], children: (item.children || []).map((c) => ({ type: c.type, pos: [c.position.x.toFixed(2), c.position.y.toFixed(2), c.position.z.toFixed(2)], scale: c.scale?.toArray?.().map((v) => +v.toFixed(2)), color: c.material?.color?.getHexString?.() })) };
    })(),
    debugCanvasSize: (() => { const c = document.querySelector('canvas'); return c ? { w: c.clientWidth, h: c.clientHeight } : null; })(),
  };
  return JSON.stringify(out, null, 0);
})()
