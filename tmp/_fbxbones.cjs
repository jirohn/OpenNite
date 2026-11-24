const fs=require('fs');
const path=require('path');
const f='C:/Users/Trabajo/Documents/Anim/Falling.fbx';
const b=fs.readFileSync(f);
const s=b.toString('latin1');
// find bone-like names
const names=new Set();
const re=/mixamorig[A-Za-z0-9_]+/g;
let m; while(m=re.exec(s)) names.add(m[0]);
console.log([...names].sort().join('\n'));
