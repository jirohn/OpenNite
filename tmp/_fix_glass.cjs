const fs=require("fs"); let s=fs.readFileSync("src/game/world.js","utf8");
const old = `  registerWindowGlass(kitName, x, y, z, rotY = 0, sy = 1) {
    const def = KIT_CATALOG[kitName];
    if (!def || def.role !== 'window') return null;
    const key = this._pieceKey(kitName, x, y, z, rotY);
    if (this.glassPanels.find(g => g.key === key)) return this.glassPanels.find(g => g.key === key);
    const [sx, sy0, sz] = def.size;
    const fullH = sy0 * (sy || 1);
    // Hueco de cristal aproximado: parte central de la ventana
    const glassW = Math.max(0.5, sz * 0.62);
    const sill = Math.max(0.65, fullH * 0.28);
    const top = Math.max(sill + 0.5, fullH * 0.82);
    const glassH = Math.max(0.3, top - sill);
    const glass = {
      key, kitName, x, y, z, rotY, sy, broken: false,
      mesh: null, colliderRef: null, glassW, glassH, sill, top,
    };
    // Panel visual double-faced
    const group = new THREE.Group();
    group.position.set(x, y, z);
    group.rotation.y = rotY;
    const geo = new THREE.PlaneGeometry(glassW, glassH);
    const mat = new THREE.MeshStandardMaterial({ color: 0xaed8ff, transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0.1, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(0, sill + glassH / 2, 0);
    mesh.castShadow = false; mesh.receiveShadow = false;
    group.add(mesh);
    // Marco simple para "double faced" feel / grosor visual
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x7a7a7a, roughness: 0.7, metalness: 0.1, side: THREE.DoubleSide });
    const t = 0.03;
    const f1 = new THREE.Mesh(new THREE.BoxGeometry(t, glassH, t), frameMat); f1.position.set(0, sill + glassH/2, -glassW/2); group.add(f1);
    const f2 = new THREE.Mesh(new THREE.BoxGeometry(t, glassH, t), frameMat); f2.position.set(0, sill + glassH/2,  glassW/2); group.add(f2);
    const f3 = new THREE.Mesh(new THREE.BoxGeometry(t, t, glassW + t), frameMat); f3.position.set(0, sill, 0); group.add(f3);
    const f4 = new THREE.Mesh(new THREE.BoxGeometry(t, t, glassW + t), frameMat); f4.position.set(0, top, 0); group.add(f4);
    this.root.add(group);
    this.disposables.push(geo, mat, frameMat, f1.geometry, f2.geometry, f3.geometry, f4.geometry);
    glass.mesh = group;
    // Collider del cristal (solo hueco) - bloquea mientras intacto
    const c = rotLocalBoxToWorld({ sx: Math.max(0.12, sx), sz: glassW, minY: sill, maxY: top, cx: 0, cz: 0 }, x, y, z, rotY, 0.12);
    if (c) {
      this.addCollider(c.minX, c.maxX, c.minY, c.maxY, c.minZ, c.maxZ, { role: 'windowGlass', glassKey: key, enabled: true });
      glass.colliderRef = this.colliders[this.colliders.length - 1];
    }
    this.glassPanels.push(glass);
    return glass;
  }`;
const neu = `  registerWindowGlass(kitName, x, y, z, rotY = 0, sy = 1) {
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
if(!s.includes(old)){console.log('no'); process.exit(1);} fs.writeFileSync("src/game/world.js", s.replace(old,neu)); console.log('ok');
