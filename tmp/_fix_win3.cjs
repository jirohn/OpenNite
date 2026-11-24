const fs=require("fs");
let lines=fs.readFileSync("src/game/world.js","utf8").split(/\r?\n/);
const neu=[
"          } else if (p.type === 'wall_window') {",
"            addMesh(g, new THREE.BoxGeometry(0.2, KIT_WALL_H, 2), new THREE.MeshStandardMaterial({ color: 0xc2b08a, roughness: 0.85 }), 0, KIT_WALL_H / 2, 0);",
"            // Marco + cristal rompible",
"            const glassW = 1.2, sill = 0.9, top = 2.05;",
"            const post = (2 - glassW) / 2;",
"            const cos = Math.cos(rot), sin = Math.sin(rot);",
"            const rotAABB2 = (w,d,r)=>{ const k=((Math.round((r||0)/(Math.PI/2))%4)+4)%4; return k%2?{w:d,d:w}:{w,d}; };",
"            const addLC = (lx,ly,lz,w,h,d,meta=null)=>{ const wx=x+lx*cos+lz*sin, wz=z-lx*sin+lz*cos, rr=rotAABB2(w,d,rot); this.addCollider(wx-rr.w/2,wx+rr.w/2,y+ly,y+ly+h,wz-rr.d/2,wz+rr.d/2,meta); };",
"            addLC(0,0,-(glassW/2+post/2),0.3,KIT_WALL_H,post,{role:'windowFrame'});",
"            addLC(0,0, (glassW/2+post/2),0.3,KIT_WALL_H,post,{role:'windowFrame'});",
"            addLC(0,0,0,0.3,sill,glassW,{role:'windowFrame'});",
"            addLC(0,top,0,0.3,KIT_WALL_H-top,glassW,{role:'windowFrame'});",
"            this.registerWindowGlass('wall_window_square', x, y, z, rot, 1);",
];
lines.splice(1614,4,...neu); // 0-based: line 1615 is index 1614, replace 4 lines (1615-1618)
fs.writeFileSync("src/game/world.js", lines.join("\n"));
console.log('ok');
