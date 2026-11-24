const fs=require('fs');
const f='tools/map-editor.mjs';
let s=fs.readFileSync(f,'utf8');

const oldMake=`  } else if (type === 'road' || type === 'path') {
    const isRoad = type === 'road';
    addM(g, new THREE.BoxGeometry(4, 0.12, 4), new THREE.MeshStandardMaterial({ color: isRoad ? 0x44484d : 0x7a6a52, roughness: 0.95 }), 0, 0.06, 0);
    if (isRoad) {
      addM(g, new THREE.BoxGeometry(0.18, 0.13, 3.2), new THREE.MeshStandardMaterial({ color: 0xd8d0b8, roughness: 0.8 }), 0, 0.07, 0);
    }
  }`;
const neuMake=`  } else if (type === 'road' || type === 'path') {
    const isRoad = type === 'road';
    const baseC = isRoad ? 0x44484d : 0x7a6a52;
    const markC = isRoad ? 0xd8d0b8 : 0x9a8662;
    addM(g, new THREE.BoxGeometry(4, 0.12, 4), new THREE.MeshStandardMaterial({ color: baseC, roughness: 0.95 }), 0, 0.06, 0);
    const conn = g.userData.conn || { n:false,s:false,e:false,w:false };
    const arms = [];
    if (conn.n) arms.push([0,0,-1]);
    if (conn.s) arms.push([0,0,1]);
    if (conn.e) arms.push([1,0,0]);
    if (conn.w) arms.push([-1,0,0]);
    if (!arms.length) arms.push([0,0,-1],[0,0,1]);
    for (const [ax,ay,az] of arms) {
      const len = 2;
      const cx2 = ax*1, cz2 = az*1;
      const w = ax!==0 ? 2 : (isRoad?1.2:1.6);
      const d = az!==0 ? 2 : (isRoad?1.2:1.6);
      addM(g, new THREE.BoxGeometry(w, 0.125, d), new THREE.MeshStandardMaterial({ color: baseC, roughness: 0.95 }), cx2, 0.065, cz2);
      if (isRoad) {
        if (ax!==0) addM(g, new THREE.BoxGeometry(1.8,0.13,0.14), new THREE.MeshStandardMaterial({color:markC,roughness:0.8}), cx2,0.072,cz2);
        if (az!==0) addM(g, new THREE.BoxGeometry(0.14,0.13,1.8), new THREE.MeshStandardMaterial({color:markC,roughness:0.8}), cx2,0.072,cz2);
      }
    }
    addM(g, new THREE.CylinderGeometry(isRoad?0.45:0.55, isRoad?0.45:0.55, 0.126, 12), new THREE.MeshStandardMaterial({ color: baseC, roughness: 0.95 }), 0, 0.065, 0);
  }`;
if(!s.includes(oldMake)){console.error('make not found'); process.exit(1);}
s=s.replace(oldMake, neuMake);

const oldPlace=`function placePieceAt(x, z) {
  const gs = (selectedPiece === 'road' || selectedPiece === 'path') ? 4 : 2;
  x = snap(x, gs); z = snap(z, gs);
  const floors = ((selectedPiece === 'house' || selectedPiece === 'cabin') && document.querySelector('#floorsSelect')) ? parseInt(document.querySelector('#floorsSelect').value, 10) || 1 : 1;
  const piece = makePiece(selectedPiece, x, z, floors);
  piece.position.y = editorHeightAt(x, z);
  const entry = { type: selectedPiece, x, y: piece.position.y, z, rot: rotY };
  if ((selectedPiece === 'house' || selectedPiece === 'cabin') && floors > 1) entry.floors = floors;
  // avoid duplicates at same xz/type
  const dupIdx = placed.findIndex(p => Math.abs(p.x-x)<0.1 && Math.abs(p.z-z)<0.1 && p.type===selectedPiece);
  if (dupIdx >= 0) { placedGroup.remove(placedGroup.children[dupIdx]); placed.splice(dupIdx,1); }
  placed.push(entry);
  placedGroup.add(piece);
  document.querySelector('#status').textContent = \`Colocado: \${selectedPiece} (\${x.toFixed(1)}, \${z.toFixed(1)})\`;
}`;
const neuPlace=`function roadKey(x,z){ return Math.round(x/4)+','+Math.round(z/4); }
function isRoadLike(type){ return type==='road' || type==='path'; }
function getRoadConn(x,z,type){
  const g=4, k=roadKey(x,z);
  const has = (dx,dz)=> placed.some(p=>isRoadLike(p.type) && p.type===type && Math.round(p.x/g)===Math.round(x/g)+dx && Math.round(p.z/g)===Math.round(z/g)+dz);
  return { n:has(0,-1), s:has(0,1), e:has(1,0), w:has(-1,0) };
}
function rebuildRoadAt(idx){
  const p = placed[idx]; if(!p || !isRoadLike(p.type)) return;
  const old = placedGroup.children[idx];
  const conn = getRoadConn(p.x,p.z,p.type);
  rotY = 0;
  const piece = makePiece(p.type, p.x, p.z, 1);
  piece.userData.conn = conn;
  // rebuild visuals with conn: easiest to recreate
  while(piece.children.length) piece.remove(piece.children[0]);
  // call maker by type using conn
  const g = piece;
  const isRoad = p.type==='road';
  const baseC = isRoad ? 0x44484d : 0x7a6a52;
  const markC = isRoad ? 0xd8d0b8 : 0x9a8662;
  addM(g, new THREE.BoxGeometry(4,0.12,4), new THREE.MeshStandardMaterial({color:baseC,roughness:0.95}),0,0.06,0);
  const arms=[];
  if(conn.n) arms.push([0,-1]); if(conn.s) arms.push([0,1]); if(conn.e) arms.push([1,0]); if(conn.w) arms.push([-1,0]);
  if(!arms.length) arms.push([0,-1],[0,1]);
  for(const [ax,az] of arms){
    const w=ax!==0?2:(isRoad?1.2:1.6), d=az!==0?2:(isRoad?1.2:1.6);
    addM(g,new THREE.BoxGeometry(w,0.125,d),new THREE.MeshStandardMaterial({color:baseC,roughness:0.95}),ax*1,0.065,az*1);
    if(isRoad){ if(ax!==0) addM(g,new THREE.BoxGeometry(1.8,0.13,0.14),new THREE.MeshStandardMaterial({color:markC,roughness:0.8}),ax*1,0.072,az*1); if(az!==0) addM(g,new THREE.BoxGeometry(0.14,0.13,1.8),new THREE.MeshStandardMaterial({color:markC,roughness:0.8}),ax*1,0.072,az*1); }
  }
  addM(g,new THREE.CylinderGeometry(isRoad?0.45:0.55,isRoad?0.45:0.55,0.126,12),new THREE.MeshStandardMaterial({color:baseC,roughness:0.95}),0,0.065,0);
  piece.position.set(p.x, editorHeightAt(p.x,p.z), p.z);
  piece.rotation.y = p.rot || 0;
  placedGroup.children[idx] = piece;
  if(old) { old.traverse(o=>{o.geometry?.dispose?.(); if(o.material){ (Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.dispose?.()); }}); }
}
function refreshRoadNeighbors(x,z,type){
  const g=4;
  for(let i=0;i<placed.length;i++){
    const p=placed[i];
    if(!isRoadLike(p.type) || p.type!==type) continue;
    if(Math.abs(Math.round(p.x/g)-Math.round(x/g))<=1 && Math.abs(Math.round(p.z/g)-Math.round(z/g))<=1) rebuildRoadAt(i);
  }
}

function placePieceAt(x, z) {
  const gs = (selectedPiece === 'road' || selectedPiece === 'path') ? 4 : 2;
  x = snap(x, gs); z = snap(z, gs);
  const floors = ((selectedPiece === 'house' || selectedPiece === 'cabin') && document.querySelector('#floorsSelect')) ? parseInt(document.querySelector('#floorsSelect').value, 10) || 1 : 1;
  rotY = (selectedPiece==='road'||selectedPiece==='path') ? 0 : rotY;
  const piece = makePiece(selectedPiece, x, z, floors);
  piece.position.y = editorHeightAt(x, z);
  const entry = { type: selectedPiece, x, y: piece.position.y, z, rot: rotY };
  if ((selectedPiece === 'house' || selectedPiece === 'cabin') && floors > 1) entry.floors = floors;
  const dupIdx = placed.findIndex(p => Math.abs(p.x-x)<0.1 && Math.abs(p.z-z)<0.1 && p.type===selectedPiece);
  if (dupIdx >= 0) { placedGroup.remove(placedGroup.children[dupIdx]); placed.splice(dupIdx,1); }
  placed.push(entry);
  placedGroup.add(piece);
  if (isRoadLike(selectedPiece)) refreshRoadNeighbors(x,z,selectedPiece);
  document.querySelector('#status').textContent = \`Colocado: \${selectedPiece} (\${x.toFixed(1)}, \${z.toFixed(1)})\`;
}`;
if(!s.includes(oldPlace)){console.error('place not found'); process.exit(1);}
s=s.replace(oldPlace, neuPlace);

const oldErase=`function erasePieceAtRay() {
  let best = null, bestD = 3;
  for (const p of placedGroup.children) {
    const d = raycaster.ray.distanceToPoint(p.position);
    if (d < bestD) { bestD = d; best = p; }
  }
  if (best) {
    const i = placedGroup.children.indexOf(best);
    placedGroup.remove(best);
    if (i >= 0) placed.splice(i, 1);
    document.querySelector('#status').textContent = 'Pieza eliminada';
  }
}`;
const neuErase=`function erasePieceAtRay() {
  let best = null, bestD = 3;
  for (const p of placedGroup.children) {
    const d = raycaster.ray.distanceToPoint(p.position);
    if (d < bestD) { bestD = d; best = p; }
  }
  if (best) {
    const i = placedGroup.children.indexOf(best);
    const removed = placed[i];
    placedGroup.remove(best);
    if (i >= 0) placed.splice(i, 1);
    if (removed && isRoadLike(removed.type)) refreshRoadNeighbors(removed.x, removed.z, removed.type);
    document.querySelector('#status').textContent = 'Pieza eliminada';
  }
}`;
if(!s.includes(oldErase)){console.error('erase not found'); process.exit(1);}
s=s.replace(oldErase, neuErase);

fs.writeFileSync(f,s);
console.log('ok');