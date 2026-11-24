const fs = require('fs');
const f = 'tools/map-editor.mjs';
let s = fs.readFileSync(f, 'utf8');
const old = `function rebuildTerrainMesh() {
  const verts = [];
  const norms = [];
  const cols = [];
  const colorTop = new THREE.Color(0x4f7c45);
  const colorSide = new THREE.Color(0x6b5a42);
  const minG = -seg / 2, maxG = seg / 2;
  const cellH = (gx, gz) => editorHeightAt((gx + 0.5) * TERRAIN_CELL, (gz + 0.5) * TERRAIN_CELL);
  const pushQuad = (a,b,c,d,n,color) => {
    // two triangles a,b,c and a,c,d
    for (const p of [a,b,c,a,c,d]) { verts.push(p.x,p.y,p.z); norms.push(n.x,n.y,n.z); cols.push(color.r,color.g,color.b); }
  };
  for (let gz = minG; gz < maxG; gz++) {
    for (let gx = minG; gx < maxG; gx++) {
      const x0 = gx * TERRAIN_CELL, x1 = x0 + TERRAIN_CELL;
      const z0 = gz * TERRAIN_CELL, z1 = z0 + TERRAIN_CELL;
      const y = cellH(gx, gz);
      // top
      pushQuad(
        new THREE.Vector3(x0,y,z0), new THREE.Vector3(x0,y,z1), new THREE.Vector3(x1,y,z1), new THREE.Vector3(x1,y,z0),
        new THREE.Vector3(0,1,0), colorTop
      );
      // sides
      const yn = cellH(gx, gz - 1);
      if (y > yn) pushQuad(new THREE.Vector3(x0,y,z0), new THREE.Vector3(x1,y,z0), new THREE.Vector3(x1,yn,z0), new THREE.Vector3(x0,yn,z0), new THREE.Vector3(0,0,-1), colorSide);
      const ys = cellH(gx, gz + 1);
      if (y > ys) pushQuad(new THREE.Vector3(x1,y,z1), new THREE.Vector3(x0,y,z1), new THREE.Vector3(x0,ys,z1), new THREE.Vector3(x1,ys,z1), new THREE.Vector3(0,0,1), colorSide);
      const yw = cellH(gx - 1, gz);
      if (y > yw) pushQuad(new THREE.Vector3(x0,y,z1), new THREE.Vector3(x0,y,z0), new THREE.Vector3(x0,yw,z0), new THREE.Vector3(x0,yw,z1), new THREE.Vector3(-1,0,0), colorSide);
      const ye = cellH(gx + 1, gz);
      if (y > ye) pushQuad(new THREE.Vector3(x1,y,z0), new THREE.Vector3(x1,y,z1), new THREE.Vector3(x1,ye,z1), new THREE.Vector3(x1,ye,z0), new THREE.Vector3(1,0,0), colorSide);
    }
  }
  const old = terrain.geometry;
  terrainGeo = new THREE.BufferGeometry();
  terrainGeo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  terrainGeo.setAttribute('normal', new THREE.Float32BufferAttribute(norms, 3));
  terrainGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  terrainGeo.computeBoundingSphere();
  terrain.geometry = terrainGeo;
  if (old && old !== terrainGeo) old.dispose();
}`;
const neu = `function rebuildTerrainMesh() {
  const verts = [];
  const norms = [];
  const cols = [];
  const colorTop = new THREE.Color(0x4f7c45);
  const colorSide = new THREE.Color(0x6b5a42);
  const minG = -seg / 2, maxG = seg / 2;
  const cellH = (gx, gz) => editorHeightAt((gx + 0.5) * TERRAIN_CELL, (gz + 0.5) * TERRAIN_CELL);
  const smoothAt = (gx, gz) => cellSmooth.get(key(gx, gz)) || 0;
  const cornerH = (vx, vz) => {
    // corner between cells (vx-1,vz-1),(vx,vz-1),(vx-1,vz),(vx,vz)
    const cells = [[vx-1,vz-1],[vx,vz-1],[vx-1,vz],[vx,vz]];
    let sum = 0, n = 0, sm = 0;
    for (const [cx,cz] of cells) { sum += cellH(cx,cz); n++; sm = Math.max(sm, smoothAt(cx,cz)); }
    const avg = sum / (n || 1);
    // For blocky (sm==0) return the height of the cell that "owns" this corner for flatness? Use avg blended by sm
    // But we want pure blocky when sm==0. We'll compute per-cell corner using its own height when sm==0.
    return { avg, sm };
  };
  const cellCornerH = (gx, gz, cornerIndex) => {
    // cornerIndex: 0=x0z0,1=x0z1,2=x1z1,3=x1z0
    const y = cellH(gx, gz);
    const vx = cornerIndex === 0 || cornerIndex === 1 ? gx : gx + 1;
    const vz = cornerIndex === 0 || cornerIndex === 3 ? gz : gz + 1;
    const { avg, sm } = cornerH(vx, vz);
    const s = clamp(sm, 0, 1);
    return y + (avg - y) * s;
  };
  const pushTri = (a,b,c,n,color) => {
    for (const p of [a,b,c]) { verts.push(p.x,p.y,p.z); norms.push(n.x,n.y,n.z); cols.push(color.r,color.g,color.b); }
  };
  const pushQuad = (a,b,c,d,n,color) => { pushTri(a,b,c,n,color); pushTri(a,c,d,n,color); };
  for (let gz = minG; gz < maxG; gz++) {
    for (let gx = minG; gx < maxG; gx++) {
      const x0 = gx * TERRAIN_CELL, x1 = x0 + TERRAIN_CELL;
      const z0 = gz * TERRAIN_CELL, z1 = z0 + TERRAIN_CELL;
      const y00 = cellCornerH(gx,gz,0), y01 = cellCornerH(gx,gz,1), y11 = cellCornerH(gx,gz,2), y10 = cellCornerH(gx,gz,3);
      const v00 = new THREE.Vector3(x0,y00,z0), v01 = new THREE.Vector3(x0,y01,z1), v11 = new THREE.Vector3(x1,y11,z1), v10 = new THREE.Vector3(x1,y10,z0);
      // top - compute normal
      const n1 = new THREE.Vector3().subVectors(v01,v00).cross(new THREE.Vector3().subVectors(v10,v00)).normalize();
      const n2 = new THREE.Vector3().subVectors(v11,v01).cross(new THREE.Vector3().subVectors(v10,v01)).normalize();
      if (n1.y < 0) n1.negate(); if (n2.y < 0) n2.negate();
      pushTri(v00,v01,v10,n1,colorTop); pushTri(v01,v11,v10,n2,colorTop);
      // sides use edge heights
      const sy00 = cellCornerH(gx,gz-1,1), sy10 = cellCornerH(gx,gz-1,2); // north neighbor bottom edge
      const sy01 = cellCornerH(gx,gz+1,0), sy11 = cellCornerH(gx,gz+1,3); // south
      const sx00 = cellCornerH(gx-1,gz,3), sx01 = cellCornerH(gx-1,gz,2); // west
      const sx10 = cellCornerH(gx+1,gz,0), sx11 = cellCornerH(gx+1,gz,1); // east
      if (y00 > sy00+0.001 || y10 > sy10+0.001) pushQuad(v00,v10,new THREE.Vector3(x1,sy10,z0),new THREE.Vector3(x0,sy00,z0),new THREE.Vector3(0,0,-1),colorSide);
      if (y10 > sx10+0.001 || y11 > sx11+0.001) pushQuad(v10,v11,new THREE.Vector3(x1,sx11,z1),new THREE.Vector3(x1,sx10,z0),new THREE.Vector3(1,0,0),colorSide);
      if (y11 > sy11+0.001 || y01 > sy01+0.001) pushQuad(v11,v01,new THREE.Vector3(x0,sy01,z1),new THREE.Vector3(x1,sy11,z1),new THREE.Vector3(0,0,1),colorSide);
      if (y01 > sx01+0.001 || y00 > sx00+0.001) pushQuad(v01,v00,new THREE.Vector3(x0,sx00,z0),new THREE.Vector3(x0,sx01,z1),new THREE.Vector3(-1,0,0),colorSide);
    }
  }
  const old = terrain.geometry;
  terrainGeo = new THREE.BufferGeometry();
  terrainGeo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  terrainGeo.setAttribute('normal', new THREE.Float32BufferAttribute(norms, 3));
  terrainGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  terrainGeo.computeVertexNormals();
  terrainGeo.computeBoundingSphere();
  terrain.geometry = terrainGeo;
  if (old && old !== terrainGeo) old.dispose();
}`;
if (!s.includes(old)) { console.error('not found'); process.exit(1); }
fs.writeFileSync(f, s.replace(old, neu));
console.log('ok');
