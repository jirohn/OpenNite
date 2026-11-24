const fs=require('fs');
const f='tools/map-editor.mjs';
let s=fs.readFileSync(f,'utf8');
const old=`rebuildTerrainMesh();
  document.querySelector('#status').textContent = \`Cargadas \${placed.length} piezas, \${heightOverrides.size} celdas de terreno\`;`;
const neu=`rebuildTerrainMesh();
  for(let i=0;i<placed.length;i++){ if(isRoadLike(placed[i].type)) rebuildRoadAt(i); }
  document.querySelector('#status').textContent = \`Cargadas \${placed.length} piezas, \${heightOverrides.size} celdas de terreno\`;`;
if(!s.includes(old)){console.error('not found'); process.exit(1);} 
fs.writeFileSync(f,s.replace(old,neu)); console.log('ok');