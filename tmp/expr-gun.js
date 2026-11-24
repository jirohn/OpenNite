(() => {
  const g = window.openniteApp?.game;
  const ch = g?.previewCharacter || g?.player?.character;
  if (!ch) return JSON.stringify({ error: 'no character' });
  const gun = ch.weaponMount?.children?.[0];
  const out = { mode: g?.mode, hasGun: !!gun, gunName: gun?.name };
  if (ch && gun) {
    const Q = ch.group.quaternion.constructor;
    const V = ch.group.position.constructor;
    const toArr = (q) => [q.x.toFixed(3), q.y.toFixed(3), q.z.toFixed(3), q.w.toFixed(3)];
    const rotVec = (q, v) => {
      const x = q.x, y = q.y, z = q.z, w = q.w;
      const vx = v[0], vy = v[1], vz = v[2];
      const tx = 2 * (y * vz - z * vy), ty = 2 * (z * vx - x * vz), tz = 2 * (x * vy - y * vx);
      return [(vx + w * tx + (y * tz - z * ty)).toFixed(3), (vy + w * ty + (z * tx - x * tz)).toFixed(3), (vz + w * tz + (x * ty - y * tx)).toFixed(3)];
    };
    out.handAlign = toArr(ch.handAlign);
    out.mountQuat = toArr(ch.weaponMount.quaternion);
    out.gunLocalQuat = toArr(gun.quaternion);
    const groupQ = ch.group.getWorldQuaternion(new Q());
    const gunQ = gun.getWorldQuaternion(new Q());
    const negZ = [0, 0, -1];
    const fwdChar = rotVec(groupQ, negZ);
    const fwdGun = rotVec(gunQ, negZ);
    out.charForward = fwdChar;
    out.gunWorldForward = fwdGun;
    const ang = Math.acos(Math.min(1, (fwdChar[0] * fwdGun[0] + fwdChar[1] * fwdGun[1] + fwdChar[2] * fwdGun[2]))) * (180 / Math.PI);
    out.angleDeg = +ang.toFixed(2);
    const gunLocal = gun.quaternion.clone();
    out.desiredMountQuat = toArr(gunLocal.invert());
    // Chequeo posterior: si setiamos mountQ = gunLocalQ^-1 entonces gunWorld = groupQ y fwdGun debería igualar fwdChar
    const checkMount = new Q().copy(gunLocal.invert());
    const checkFwd = rotVec(ch.group.getWorldQuaternion(new Q()).clone().multiply(checkMount), negZ);
    out.checkFwd = checkFwd;
    out.fwdMatch = Math.abs(checkFwd[0] - fwdChar[0]) < 0.02 && Math.abs(checkFwd[1] - fwdChar[1]) < 0.02 && Math.abs(checkFwd[2] - fwdChar[2]) < 0.02;
  }
  return JSON.stringify(out);
})()
