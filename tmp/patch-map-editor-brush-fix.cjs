const fs=require('fs');const p='tools/map-editor.mjs';let s=fs.readFileSync(p,'utf8');
const old=`    const piece = makePiece(type, x, z, 1);
    const entry = { type, x, y: piece.position.y, z, rot: Math.random() * Math.PI * 2, scale: +(0.75 + Math.random() * 0.7).toFixed(2) };`;
const neu=`    const piece = makePiece(type, x, z, 1);
    piece.position.y = editorHeightAt(x, z);
    const entry = { type, x, y: piece.position.y, z, rot: Math.random() * Math.PI * 2, scale: +(0.75 + Math.random() * 0.7).toFixed(2) };`;
if(!s.includes(old)){console.log('no')} else {fs.writeFileSync(p,s.replace(old,neu)); console.log('ok')}
