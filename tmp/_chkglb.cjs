const fs=require('fs');
const b=fs.readFileSync('C:/Users/Trabajo/Documents/Anim/03_Jimmy.glb');
const s=b.toString('utf8');
console.log(s.includes('"animations"'));
const m=s.match(/"animations"\s*:\s*\[/);
console.log(!!m);
