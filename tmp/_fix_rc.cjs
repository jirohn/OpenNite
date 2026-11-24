const fs=require("fs"); let lines=fs.readFileSync("src/game/world.js","utf8").split(/\r?\n/);
const idx = lines.findIndex(l=>l.includes('resolveCollision(position, radius = 0.45, height = 1.8) {'));
if(idx<0){console.log('no'); process.exit(1);}
lines.splice(idx+2,0,'    const ps = this.playerState;');
const idx2 = lines.findIndex((l,i)=>i>idx && l.includes('if (dist >= radius) continue;'));
if(idx2<0){console.log('no2'); process.exit(1);}
lines.splice(idx2+1,0,
"      if (c.role === 'windowGlass' && c.glassKey) {",
"        const airborne = ps && !ps.grounded && !ps.swimming;",
"        const fast = ps && Math.hypot(ps.vx || 0, ps.vz || 0, ps.vy || 0) > 1.5;",
"        if (airborne || fast) {",
"          this.breakGlass(c.glassKey, new THREE.Vector3(closestX, clamp(position.y + 1.0, c.minY, c.maxY), closestZ));",
"          continue;",
"        }",
"      }"
);
fs.writeFileSync("src/game/world.js", lines.join("\n")); console.log('ok');
