const fs=require('fs');
const b=fs.readFileSync('C:/Users/Trabajo/Documents/Anim/03_Jimmy.glb');
const jsonLen=b.readUInt32LE(12);
const json=JSON.parse(b.slice(20,20+jsonLen).toString('utf8'));
const bones=(json.nodes||[]).filter(n=>/mixamorig|hips|spine|arm|leg|head/i.test(n.name||'')).map(n=>n.name);
console.log(bones.slice(0,30));
console.log('total nodes',json.nodes?.length);
