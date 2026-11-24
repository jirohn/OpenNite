(() => {
  const g = window.openniteApp?.game;
  const ch = g?.previewCharacter || g?.player?.character;
  if (!ch) return JSON.stringify({ error: 'no character' });
  const gun = ch.weaponMount?.children?.[0];
  const out = { mode: g?.mode, hasGun: !!gun };
  if (ch && gun) {
    const Q = ch.group.quaternion.constructor;
    const negZ = [0, 0, -1];
    const rotVec = (q, v) => {
      const x = q.x, y = q.y, z = q.z, w = q.w;
      const vx = v[0], vy = v[1], vz = v[2];
      const tx = 2 * (y * vz - z * vy), ty = 2 * (z * vx - x * vz), tz = 2 * (x * vy - y * vx);
      return [(vx + w * tx + (y * tz - z * ty)).toFixed(3), (vy + w * ty + (z * tx - x * tz)).toFixed(3), (vz + w * tz + (x * ty - y * tx)).toFixed(3)];
    };
    const toArr = (q) => [q.x.toFixed(3), q.y.toFixed(3), q.z.toFixed(3), q.w.toFixed(3)];
    const toEul = (q) => q.toEuler().toArray().map((v) => +v.toFixed(3));

    ch.group.updateWorldMatrix(true, true);
    if (ch.weaponMount?.parent) ch.weaponMount.parent.updateWorldMatrix(true, true);
    const boneWorldQ = ch.weaponMount?.parent?.getWorldQuaternion(new Q());
    const groupQ = ch.group.getWorldQuaternion(new Q());
    const gunQ = gun.getWorldQuaternion(new Q());
    const gunLocalQ = gun.quaternion.clone();
    out.handAlign = toArr(ch.handAlign);
    out.boneWorldQ = toArr(boneWorldQ);
    out.groupQ = toArr(groupQ);
    out.gunQ_world = toArr(gunQ);
    out.gunLocalQ = toArr(gunLocalQ);
    out.charForward = rotVec(groupQ, negZ);
    out.gunWorldForward = rotVec(gunQ, negZ);
    // posición del arma en espacio del hueso de la mano (debe coincidir con el editor)
    const bone = ch.weaponMount.parent;
    if (bone) {
      const gmv = gun.matrixWorld.elements;
      const gx = gmv[12], gy = gmv[13], gz = gmv[14];
      const M = bone.matrixWorld.constructor;
      const inv = new M();
      inv.copy(bone.matrixWorld).invert();
      const e = inv.elements;
      out.gunInBone = [
        (e[0]*gx + e[4]*gy + e[8]*gz + e[12]).toFixed(3),
        (e[1]*gx + e[5]*gy + e[9]*gz + e[13]).toFixed(3),
        (e[2]*gx + e[6]*gy + e[10]*gz + e[14]).toFixed(3),
      ];
    }
    out.boneWorldTimesHandAlignTimesGunLocal = toArr(boneWorldQ.clone().multiply(ch.handAlign).multiply(gunLocalQ));
    out.gunWorldVsGroupQ_match = toArr(boneWorldQ.clone().multiply(ch.handAlign).multiply(gunLocalQ)).every((v, i) => Math.abs(v - [groupQ.x, groupQ.y, groupQ.z, groupQ.w][i]) < 0.01);
    out.fwdMatchExpectation = toArr(boneWorldQ.clone().multiply(ch.handAlign).multiply(gunLocalQ));
  }
  return JSON.stringify(out, null, 1);
})()
