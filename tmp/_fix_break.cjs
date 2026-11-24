const fs=require("fs"); let s=fs.readFileSync("src/game/world.js","utf8");
const old = `  breakGlass(glassOrKey, impactPoint = null) {
    const g = typeof glassOrKey === 'string' ? this.glassPanels.find(x => x.key === glassOrKey) : glassOrKey;
    if (!g || g.broken) return false;
    g.broken = true;
    if (g.colliderRef) g.colliderRef.enabled = false;
    if (g.mesh) {
      g.mesh.visible = false;
    }
    // Efecto simple de partículas de cristal
    const p = impactPoint || new THREE.Vector3(g.x, g.y + (g.sill + g.top) / 2, g.z);
    for (let i = 0; i < 14; i++) {
      const geo = new THREE.PlaneGeometry(0.05 + Math.random()*0.08, 0.05 + Math.random()*0.08);
      const mat = new THREE.MeshBasicMaterial({ color: 0xcfefff, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
      const m = new THREE.Mesh(geo, mat);
      m.position.copy(p);
      m.userData.vel = new THREE.Vector3((Math.random()-0.5)*4, Math.random()*3+1, (Math.random()-0.5)*4);
      m.userData.life = 0.8 + Math.random()*0.6;
      m.userData.rot = new THREE.Vector3(Math.random()*6,Math.random()*6,Math.random()*6);
      this.root.add(m);
      if (!this._glassDebris) this._glassDebris = [];
      this._glassDebris.push(m);
    }
    return true;
  }`;
const neu = `  breakGlass(glassOrKey, impactPoint = null) {
    const g = typeof glassOrKey === 'string' ? this.glassPanels.find(x => x.key === glassOrKey) : glassOrKey;
    if (!g || g.broken) return false;
    g.broken = true;
    if (g.colliderRef) g.colliderRef.enabled = false;
    if (g.instIdx != null && this._glassInst) {
      const dummy = new THREE.Object3D();
      dummy.scale.set(0,0,0); dummy.updateMatrix();
      this._glassInst.setMatrixAt(g.instIdx, dummy.matrix);
      this._glassInst.instanceMatrix.needsUpdate = true;
    } else if (g.mesh) {
      g.mesh.visible = false;
    }
    const p = impactPoint || new THREE.Vector3(g.x, g.y + (g.sill + g.top) / 2, g.z);
    if (!this._glassDebrisMat) { this._glassDebrisMat = new THREE.MeshBasicMaterial({ color: 0xcfefff, transparent: true, opacity: 0.8, side: THREE.DoubleSide }); this._glassDebrisGeo = new THREE.PlaneGeometry(1,1); this.disposables.push(this._glassDebrisMat,this._glassDebrisGeo); }
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(this._glassDebrisGeo, this._glassDebrisMat);
      const s = 0.05 + Math.random()*0.08;
      m.scale.set(s,s,s);
      m.position.copy(p);
      m.userData.vel = new THREE.Vector3((Math.random()-0.5)*4, Math.random()*3+1, (Math.random()-0.5)*4);
      m.userData.life = 0.8 + Math.random()*0.6;
      m.userData.rot = new THREE.Vector3(Math.random()*6,Math.random()*6,Math.random()*6);
      this.root.add(m);
      if (!this._glassDebris) this._glassDebris = [];
      this._glassDebris.push(m);
    }
    return true;
  }`;
if(!s.includes(old)){console.log('no'); process.exit(1);} fs.writeFileSync("src/game/world.js", s.replace(old,neu)); console.log('ok');
