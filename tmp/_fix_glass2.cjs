const fs=require("fs"); let s=fs.readFileSync("src/game/world.js","utf8");
const old = `  registerWindowGlass(kitName, x, y, z, rotY = 0, sy = 1) {
    const def = KIT_CATALOG[kitName];
    if (!def || def.role !== 'window') return null;
    const key = this._pieceKey(kitName, x, y, z, rotY);
    if (this.glassPanels.find(g => g.key === key)) return this.glassPanels.find(g => g.key === key);
    const [sx, sy0, sz] = def.size;
    const fullH = sy0 * (sy || 1);
    const glassW = Math.max(0.5, sz * 0.62);
    const sill = Math.max(0.65, fullH * 0.28);
    const top = Math.max(sill + 0.5, fullH * 0.82);
    const glassH = Math.max(0.3, top - sill);
    const glass = {
      key, kitName, x, y, z, rotY, sy, broken: false,
      mesh: null, colliderRef: null, glassW, glassH, sill, top,
    };
    // Panel visual double-faced (reutiliza geo/material compartidos)
    if (!this._glassMat) {
      this._glassMat = new THREE.MeshStandardMaterial({ color: 0xaed8ff, transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0.1, side: THREE.DoubleSide });
      this._glassGeo = new THREE.PlaneGeometry(1, 1);
      this.disposables.push(this._glassMat, this._glassGeo);
    }
    const mesh = new THREE.Mesh(this._glassGeo, this._glassMat);
    mesh.position.set(x, y + sill + glassH / 2, z);
    mesh.rotation.y = rotY;
    mesh.scale.set(glassW, glassH, 1);
    mesh.castShadow = false; mesh.receiveShadow = false;
    this.root.add(mesh);
    glass.mesh = mesh;
    // Collider del cristal (solo hueco) - bloquea mientras intacto
    const c = rotLocalBoxToWorld({ sx: Math.max(0.12, sx), sz: glassW, minY: sill, maxY: top, cx: 0, cz: 0 }, x, y, z, rotY, 0.12);
    if (c) {
      this.addCollider(c.minX, c.maxX, c.minY, c.maxY, c.minZ, c.maxZ, { role: 'windowGlass', glassKey: key, enabled: true });
      glass.colliderRef = this.colliders[this.colliders.length - 1];
    }
    this.glassPanels.push(glass);
    return glass;
  }`;
const neu = `  _ensureGlassInstanced(extra = 1) {
    if (!this._glassMat) {
      this._glassMat = new THREE.MeshBasicMaterial({ color: 0xbfdfff, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false });
      this._glassGeo = new THREE.PlaneGeometry(1, 1);
      this.disposables.push(this._glassMat, this._glassGeo);
    }
    const capNeeded = (this.glassPanels?.length || 0) + extra;
    if (this._glassInst && this._glassInstCap >= capNeeded) return;
    const newCap = Math.max(64, capNeeded, (this._glassInstCap || 0) * 2);
    const old = this._glassInst;
    const inst = new THREE.InstancedMesh(this._glassGeo, this._glassMat, newCap);
    inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    inst.castShadow = false; inst.receiveShadow = false;
    inst.frustumCulled = false;
    inst.count = 0;
    const dummy = new THREE.Object3D();
    dummy.scale.set(0,0,0); dummy.updateMatrix();
    for (let i=0;i<newCap;i++) inst.setMatrixAt(i, dummy.matrix);
    if (old) {
      const tmp = new THREE.Matrix4();
      for (let i=0;i<(old.count||0);i++){ old.getMatrixAt(i,tmp); inst.setMatrixAt(i,tmp); }
      inst.count = old.count || 0;
      this.root.remove(old);
      old.dispose?.();
    } else {
      this.root.add(inst);
    }
    inst.instanceMatrix.needsUpdate = true;
    this._glassInst = inst;
    this._glassInstCap = newCap;
  }

  registerWindowGlass(kitName, x, y, z, rotY = 0, sy = 1) {
    const def = KIT_CATALOG[kitName];
    if (!def || def.role !== 'window') return null;
    const key = this._pieceKey(kitName, x, y, z, rotY);
    if (this.glassPanels.find(g => g.key === key)) return this.glassPanels.find(g => g.key === key);
    const [sx, sy0, sz] = def.size;
    const fullH = sy0 * (sy || 1);
    const glassW = Math.max(0.5, sz * 0.62);
    const sill = Math.max(0.65, fullH * 0.28);
    const top = Math.max(sill + 0.5, fullH * 0.82);
    const glassH = Math.max(0.3, top - sill);
    this._ensureGlassInstanced(1);
    const idx = this._glassInst.count++;
    const dummy = new THREE.Object3D();
    dummy.position.set(x, y + sill + glassH / 2, z);
    dummy.rotation.y = rotY;
    dummy.scale.set(glassW, glassH, 1);
    dummy.updateMatrix();
    this._glassInst.setMatrixAt(idx, dummy.matrix);
    this._glassInst.instanceMatrix.needsUpdate = true;
    const glass = {
      key, kitName, x, y, z, rotY, sy, broken: false,
      mesh: null, instIdx: idx, colliderRef: null, glassW, glassH, sill, top,
    };
    const c = rotLocalBoxToWorld({ sx: Math.max(0.12, sx), sz: glassW, minY: sill, maxY: top, cx: 0, cz: 0 }, x, y, z, rotY, 0.12);
    if (c) {
      this.addCollider(c.minX, c.maxX, c.minY, c.maxY, c.minZ, c.maxZ, { role: 'windowGlass', glassKey: key, enabled: true });
      glass.colliderRef = this.colliders[this.colliders.length - 1];
    }
    this.glassPanels.push(glass);
    return glass;
  }`;
if(!s.includes(old)){console.log('no'); process.exit(1);} fs.writeFileSync("src/game/world.js", s.replace(old,neu)); console.log('ok');
