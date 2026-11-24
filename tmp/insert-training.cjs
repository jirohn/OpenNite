const fs = require('fs');
const f = 'src/game/world.js';
let s = fs.readFileSync(f, 'utf8');
const anchor = '  /** Isla peque';
const idx = s.indexOf(anchor);
if (idx < 0) { console.error('no'); process.exit(1); }
const method = `  async loadTraining() {
    this.waterLevel = -100;
    const groundSize = Math.max(120, Math.min(this.size || 240, 320));
    const g = new THREE.Mesh(
      new THREE.PlaneGeometry(groundSize, groundSize),
      new THREE.MeshStandardMaterial({ color: 0x5f6672, roughness: 0.95, metalness: 0.05 })
    );
    g.rotation.x = -Math.PI / 2;
    g.receiveShadow = true;
    this.root.add(g);
    this.disposables.push(g.geometry, g.material);

    const grid = new THREE.GridHelper(groundSize, groundSize / 4, 0x8ea0b5, 0x707a86);
    grid.position.y = 0.01;
    this.root.add(grid);
    this.disposables.push(grid.geometry, grid.material);

    const mkMat = (c, o = 0.95, r = 0.7, m = 0.05) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m, transparent: o < 1, opacity: o });
    const addBlock = (x, y, z, w, h, d, mat, collide = true) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.position.set(x, y + h / 2, z);
      mesh.castShadow = true; mesh.receiveShadow = true;
      this.root.add(mesh);
      this.disposables.push(mesh.geometry, mesh.material);
      if (collide) this.addCollider(x - w / 2, x + w / 2, y, y + h, z - d / 2, z + d / 2);
      return mesh;
    };

    const wallMat = mkMat(0x8a96a3, 0.92, 0.85);
    const blockMat = mkMat(0x728096, 0.95, 0.8);
    const accentMat = mkMat(0x4fa8ff, 0.35, 0.2, 0.1);
    const hs = groundSize / 2 - 2, wh = 4, wt = 1;
    addBlock(0, 0, -hs, groundSize, wh, wt, wallMat);
    addBlock(0, 0, hs, groundSize, wh, wt, wallMat);
    addBlock(-hs, 0, 0, wt, wh, groundSize, wallMat);
    addBlock(hs, 0, 0, wt, wh, groundSize, wallMat);

    const blocks = [
      [-18,0,-18,4,2,4],[-10,0,-18,4,2,4],[-2,0,-18,4,4,4],[6,0,-18,8,2,2],[16,0,-18,4,2,4],
      [-20,0,-6,2,3,10],[-8,0,-4,6,2,2],[4,0,-6,2,4,8],[14,0,-4,8,2,2],[22,0,-6,2,3,10],
      [-16,0,8,6,2,6],[-4,0,10,4,4,2],[6,0,8,6,2,6],[18,0,10,4,2,8],
      [-10,0,22,10,2,2],[8,0,22,10,2,2],[0,0,28,4,2,4],
    ];
    for (const [x, y, z, w, h, d] of blocks) addBlock(x, y, z, w, h, d, blockMat);

    for (let i = 0; i < 4; i++) addBlock(-28 + i * 2, 0, 14 - i * 2, 2, 0.6 * (i + 1), 2, mkMat(0x93a1b0));
    for (let i = 0; i < 4; i++) addBlock(28 - i * 2, 0, 14 - i * 2, 2, 0.6 * (i + 1), 2, mkMat(0x93a1b0));

    for (const [x, z] of [[-20, -24], [20, -24], [0, -30], [-28, 0], [28, 0]]) {
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.08, 24), accentMat.clone());
      pad.position.set(x, 0.04, z); pad.receiveShadow = true; this.root.add(pad);
      this.disposables.push(pad.geometry, pad.material);
    }

    this.spawnPoints = [
      { x: 0, y: 0, z: 34 }, { x: -6, y: 0, z: 34 }, { x: 6, y: 0, z: 34 }, { x: -12, y: 0, z: 30 }, { x: 12, y: 0, z: 30 },
      { x: 0, y: 0, z: 26 }, { x: -18, y: 0, z: 20 }, { x: 18, y: 0, z: 20 }
    ];
    this.lootSpots = [];
    this.chestSpots = [];
    this.pois = [];
    this.loaded = true;
  }

`;
s = s.slice(0, idx) + method + s.slice(idx);
fs.writeFileSync(f, s);
console.log('ok');
