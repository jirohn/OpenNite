const fs=require("fs"); let s=fs.readFileSync("src/game/world.js","utf8");
const start=s.indexOf("  registerDoor(kitName, x, y, z, rotY = 0, sy = 1) {");
const end=s.indexOf("  registerWindowGlass(kitName, x, y, z, rotY = 0, sy = 1) {");
if(start<0||end<0||end<=start){console.log('no'); process.exit(1);}
const neu=`  registerDoor(kitName, x, y, z, rotY = 0, sy = 1) {
    const def = KIT_CATALOG[kitName];
    if (!def || def.role !== 'door') return null;
    const key = this._pieceKey(kitName, x, y, z, rotY);
    if (this.doors.find(d => d.key === key)) return this.doors.find(d => d.key === key);
    const [sx, sy0, sz] = def.size;
    const fullH = sy0 * (sy || 1);
    const openW = Math.min(1.9, Math.max(1.4, sz * 0.74));
    const openH = Math.min(fullH - 0.12, Math.max(2.2, fullH * 0.82));
    const door = {
      key, kitName, x, y, z, rotY, sy, openW, openH,
      open: false, targetOpen: false, progress: 0, hold: 0,
      mesh: null, pivot: null, blocker: null, autoClose: 0,
    };
    const blocker = rotLocalBoxToWorld({ sx: Math.max(0.24, sx), sz: openW, minY: 0, maxY: openH, cx: 0, cz: 0 }, x, y, z, rotY, 0.24);
    if (blocker) {
      this.addCollider(blocker.minX, blocker.maxX, blocker.minY, blocker.maxY, blocker.minZ, blocker.maxZ, { role: 'doorPanel', doorKey: key, enabled: true });
      door.blockerRef = this.colliders[this.colliders.length - 1];
    }
    if (!this._doorMat) {
      this._doorMat = new THREE.MeshStandardMaterial({ color: 0x8b6a45, roughness: 0.72, metalness: 0.05 });
      this._doorGeo = new THREE.BoxGeometry(1, 1, 1);
      this.disposables.push(this._doorMat, this._doorGeo);
    }
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);
    pivot.rotation.y = rotY;
    const panel = new THREE.Mesh(this._doorGeo, this._doorMat);
    panel.castShadow = true; panel.receiveShadow = true;
    panel.scale.set(0.08, openH - 0.04, openW - 0.06);
    panel.position.set(0, openH / 2, openW / 2 - 0.03);
    const hinge = new THREE.Group();
    hinge.position.set(0, 0, -openW / 2 + 0.03);
    hinge.add(panel);
    pivot.add(hinge);
    this.root.add(pivot);
    door.mesh = panel;
    door.pivot = pivot;
    door.hinge = hinge;
    this.doors.push(door);
    return door;
  }

`;
s=s.slice(0,start)+neu+s.slice(end);
fs.writeFileSync("src/game/world.js",s); console.log('ok');
