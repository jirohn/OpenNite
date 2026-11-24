const fs=require('fs'); const p='tools/map-editor.mjs'; let s=fs.readFileSync(p,'utf8');
const start=s.indexOf('function placeGrassAt(cx, cz) {');
const end=s.indexOf("canvas.addEventListener('contextmenu'");
if(start<0||end<0||end<=start){console.log('bad',start,end); process.exit(1);}
const neu=`function placeGrassAt(cx, cz) {
  const radius = Math.max(1.5, (+document.querySelector('#brushSize').value || 4) * 0.5);
  const density = Math.max(1, +document.querySelector('#brushDensity')?.value || 5);
  const count = Math.max(1, Math.round(radius * 0.8 * (density / 5)));
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * radius;
    const x = snap(cx + Math.cos(a) * r, 1);
    const z = snap(cz + Math.sin(a) * r, 1);
    if (placed.some(p => p.type === 'grass' && Math.hypot(p.x - x, p.z - z) < 0.8)) continue;
    const piece = makePiece('grass', x, z, 1);
    const entry = { type: 'grass', x, y: piece.position.y, z, rot: Math.random() * Math.PI * 2, scale: +(0.7 + Math.random() * 0.8).toFixed(2) };
    piece.rotation.y = entry.rot;
    piece.scale.setScalar(entry.scale);
    placed.push(entry);
    placedGroup.add(piece);
  }
  document.querySelector('#status').textContent = \`Césped colocado (\${placed.filter(p=>p.type==='grass').length})\`;
}

function placeDecorAt(cx, cz) {
  const radius = Math.max(1, (+document.querySelector('#brushSize').value || 4));
  const density = Math.max(1, +document.querySelector('#brushDensity')?.value || 5);
  const count = Math.max(1, Math.round((radius * radius * 0.12) * (density / 5)));
  const type = selectedPiece;
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * radius;
    const x = snap(cx + Math.cos(a) * r, 1);
    const z = snap(cz + Math.sin(a) * r, 1);
    const minDist = type.startsWith('tree') ? 1.8 : (type.startsWith('rock') ? 1.2 : 0.9);
    if (placed.some(p => p.type === type && Math.hypot(p.x - x, p.z - z) < minDist)) continue;
    const piece = makePiece(type, x, z, 1);
    const entry = { type, x, y: piece.position.y, z, rot: Math.random() * Math.PI * 2, scale: +(0.75 + Math.random() * 0.7).toFixed(2) };
    piece.rotation.y = entry.rot;
    piece.scale.setScalar(entry.scale);
    if (isDecorType(type)) {
      const cfg = getDecorConfig(type);
      const models = cfg.models || [];
      if (models.length) {
        const pick = cfg.random ? models[Math.floor(Math.random() * models.length)] : models[0];
        if (pick?.src) entry.modelSrc = pick.src;
        if (pick?.name) entry.modelName = pick.name;
      }
    }
    placed.push(entry);
    placedGroup.add(piece);
  }
  document.querySelector('#status').textContent = \`Decoración: \${type} (\${placed.filter(p=>p.type===type).length})\`;
}

function applyAt(hit, shift) {
  if (mode === 'place') {
    if (isDecorType(selectedPiece)) { placeDecorAt(hit.x, hit.z); }
    else { placePieceAt(hit.x, hit.z); painting = false; }
  }
  else if (mode === 'path' || mode === 'road') { selectedPiece = mode; placePieceAt(hit.x, hit.z); }
  else if (mode === 'erase') { erasePieceAtRay(); painting = false; }
  else if (mode === 'water') { if (!shift) { addWaterPatch(snap(hit.x,2), snap(hit.z,2)); painting=false; } else applyBrush(hit.x, hit.z, 'water'); }
  else if (mode === 'pick-height') {
    const h = snapH(editorHeightAt(hit.x, hit.z));
    const el = document.querySelector('#targetHeight');
    if (el) el.value = h.toFixed(2).replace(/\\.00$/, '');
    document.querySelector('#status').textContent = \`Altura seleccionada: \${h}\`;
    painting = false;
  }
  else if (mode === 'grass') { placeGrassAt(hit.x, hit.z); }
  else { applyBrush(hit.x, hit.z, mode); }
}

`;
fs.writeFileSync(p, s.slice(0,start)+neu+s.slice(end));
console.log('ok');
