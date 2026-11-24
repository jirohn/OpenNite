const WS=globalThis.WebSocket;
const ws=new WS('ws://127.0.0.1:9222/devtools/page/B9B845AE79FECDDA0E4E148AAE8C0F27');
let id=0;const p=new Map();
const send=(m,pa={})=>new Promise((r,j)=>{const i=++id;p.set(i,{r,j});ws.send(JSON.stringify({id:i,method:m,params:pa}));setTimeout(()=>{if(p.has(i)){p.delete(i);j(new Error('t'))}},15000)});
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const x=p.get(m.id);if(x){p.delete(m.id);x.r(m)}}};
ws.onopen=async()=>{
 try{
  await send('Runtime.enable');
  const files=['Jimmy.fbx','Idle Happy.fbx','Idle Sad.fbx','Walking.fbx','Running.fbx','Pistol Run.fbx','Crouched Walking.fbx','Jump Forward Aiming.fbx','ClimbWall.fbx','Slide pose.fbx','Falling.fbx','Falling To Roll.fbx','slide.fbx','Jump-window.fbx','climb-wall.fbx'];
  const expr = `(async()=>{ const files=${JSON.stringify(files)}; const out=[]; for(const f of files){ try{ const r=await fetch('/models/opennite/characters/100avatars/anims/'+encodeURIComponent(f)); const t=await r.text(); out.push({f,s:r.status,h:t.slice(0,15)}); }catch(e){ out.push({f,e:String(e)}); } } return JSON.stringify(out); })()`;
  const r=await send('Runtime.evaluate',{expression:expr,awaitPromise:true,returnByValue:true});
  console.log(r.result?.result?.value);
 }catch(e){console.error(String(e.message||e))}
 ws.close();
};
ws.onerror=()=>{console.error('ws err');process.exit(1)};
setTimeout(()=>process.exit(0),25000);
