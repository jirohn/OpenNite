const fs = require('fs');
const p = 'src/game/world.js';
let s = fs.readFileSync(p, 'utf8');

// 1. Add triangle helper after box function definition. Insert before "  cylinder(ctx" 
const triHelper = `  triangle(ctx, x, y, z, base, height, mat = 'wall', rotY = 0, collide = true) {
    this._matKey = mat;
    const geo = new THREE.BufferGeometry();
    const verts = new Float32Array([-base / 2, 0, 0, base / 2, 0, 0, 0, height, 0]);
    geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    geo.setIndex([0, 1, 2]);
    geo.computeVertexNormals();
    this.addGeo(ctx.buckets, geo, x, y, z, rotY);
    if (collide) this.addCollider(x - base / 2, x + base / 2, y, y + height, z - 0.15, z + 0.15);
  }
`;
const marker = '  cylinder(ctx, x, y, z, r, h, mat = \'metal\', collide = false) {';
if (!s.includes(marker)) { console.error('marker not found'); process.exit(1); }
s = s.replace(marker, triHelper + marker);

// 2. Add side windows + gable end walls in makeBuilding.
// side windows: after back wall windows block, add side windows
const winOld = `    // Ventanas
    if (opts.windows !== false) {
      for (const lx of [-w * 0.27, w * 0.27]) {
        const wx = x + lx * cos + (d / 2) * sin;
        const wz = z - lx * sin + (d / 2) * cos;
        this.box(ctx, wx, y + 1.75, wz, 1.15, 1.1, 0.08, 'glass', front);
      }
    }`;
const winNew = `    // Ventanas (frontal y trasera)
    if (opts.windows !== false) {
      for (const lzSign of [-1, 1]) {
        for (const lx of [-w * 0.27, w * 0.27]) {
          const wx = x + lx * cos + (lzSign * d / 2) * sin;
          const wz = z - lx * sin + (lzSign * d / 2) * cos;
          this.box(ctx, wx, y + 1.75, wz, 1.15, 1.1, 0.08, 'glass', front);
        }
      }
    }`;
if (!s.includes(winOld)) { console.error('winOld not found'); process.exit(1); }
s = s.replace(winOld, winNew);

// 3. Add gable end walls (triangular) when gable !== false
const roofOld = `    // Techo
    if (opts.gable !== false) {`;
const roofNew = `    // Paredes triangulares de los hastiales (gable ends)
    if (opts.gable !== false) {
      const slope = 0.45;
      const triH = (w / 2) * slope;
      for (const lzSign of [-1, 1]) {
        const lx = 0, lz = lzSign * d / 2;
        const wx = x + lx * cos + lz * sin;
        const wz = z - lx * sin + lz * cos;
        this.triangle(ctx, wx, y + h + 0.2, wz, w + 0.4, triH, wallMat, front, true);
      }
    }
    // Techo
    if (opts.gable !== false) {`;
if (!s.includes(roofOld)) { console.error('roofOld not found'); process.exit(1); }
s = s.replace(roofOld, roofNew);

fs.writeFileSync(p, s, 'utf8');
console.log('done');
