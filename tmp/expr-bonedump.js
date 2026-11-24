(() => {
  const g = window.openniteApp?.game;
  const d = g?.world?.debug;
  const out = {
    mode: g?.mode,
    debugEnabled: !!d?.enabled,
    totalItems: d?.items?.length,
    colliders: d?.boxes?.length,
    markers: (d?.getMarkers?.() || []).length,
  };
  const player = g?.player?.character;
  const bones = player?.kitChar?.bones instanceof Map ? player.kitChar.bones : null;
  if (bones) {
    out.playerBones = bones.size;
    out.playerBoneAxes = [];
    for (const [name, bone] of bones) {
      const pos = bone.getWorldPosition(g.scene.position.clone());
      const q = bone.quaternion.constructor();
      bone.getWorldQuaternion(q);
      out.playerBoneAxes.push({
        name: String(name).replace(/_(?:01|02|03)$/g, ''),
        pos: [pos.x.toFixed(2), pos.y.toFixed(2), pos.z.toFixed(2)],
        rotQ: [q.x.toFixed(2), q.y.toFixed(2), q.z.toFixed(2), q.w.toFixed(2)],
      });
    }
  }
  return JSON.stringify(out, null, 1).slice(0, 5000);
})()
