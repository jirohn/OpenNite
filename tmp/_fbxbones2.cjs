const fs=require('fs');
const b=fs.readFileSync('C:/Users/Trabajo/Documents/Anim/Falling.fbx');
// scan for ascii strings containing mixamorig
let cur=''; let found=[];
for(let i=0;i<b.length;i++){
  const c=b[i];
  if(c>=0x20 && c<0x7f){ cur+=String.fromCharCode(c); }
  else { if(/mixamorig/i.test(cur)) found.push(cur); cur=''; }
}
if(/mixamorig/i.test(cur)) found.push(cur);
const uniq=[...new Set(found)].sort();
console.log(uniq.slice(0,60).join('\n'));
console.log('---',uniq.length);
