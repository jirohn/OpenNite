const WS=globalThis.WebSocket;
const ws=new WS('ws://127.0.0.1:9222/devtools/page/B9B845AE79FECDDA0E4E148AAE8C0F27');
let id=0;const p=new Map();
const send=(m,pa={})=>new Promise((r,j)=>{const i=++id;p.set(i,{r,j});ws.send(JSON.stringify({id:i,method:m,params:pa}));setTimeout(()=>{if(p.has(i)){p.delete(i);j(new Error('t'))}},20000)});
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const x=p.get(m.id);if(x){p.delete(m.id);x.r(m)}}};
ws.onopen=async()=>{
 try{
  await send('Runtime.enable');
  const expr=`(async()=>{ const urls=[...new Set(${JSON.stringify([
    '/models/opennite/ubc/extra-anim/Falling.fbx','/models/opennite/ubc/extra-anim/FallingToRoll.fbx','/models/opennite/ubc/extra-anim/slide.fbx','/models/opennite/ubc/extra-anim/JumpWindow.fbx','/models/opennite/ubc/extra-anim/ClimbWall.fbx','/models/opennite/characters/100avatars/100Avatars_003_Jimmy.fbx','/models/opennite/characters/100avatars/anims/Idle Sad.fbx','/models/opennite/characters/100avatars/anims/Jimmy.fbx','/models/opennite/characters/100avatars/anims/Idle Happy.fbx','/models/opennite/characters/100avatars/anims/Running.fbx','/models/opennite/characters/100avatars/anims/Walking.fbx','/models/opennite/characters/100avatars/anims/Pistol Run.fbx','/models/opennite/characters/100avatars/anims/Crouched Walking.fbx','/models/opennite/characters/100avatars/anims/Jump Forward Aiming.fbx','/models/opennite/characters/100avatars/anims/ClimbWall.fbx','/models/opennite/characters/100avatars/anims/Slide pose.fbx'
  ])})]; const bad=[]; for(const u of urls){ try{ const r=await fetch(u); const b=await r.arrayBuffer(); const head=new TextDecoder().decode(b.slice(0,20)); if(!head.startsWith('Kaydara FBX')) bad.push({u,head:head.slice(0,15),size:b.byteLength}); }catch(e){ bad.push({u,err:String(e)}); } } return JSON.stringify(bad); })()`;
  const r=await send('Runtime.evaluate',{expression:expr,awaitPromise:true,returnByValue:true});
  console.log(r.result?.result?.value);
 }catch(e){console.error(String(e.message||e))}
 ws.close();
};
ws.onerror=()=>{console.error('ws err');process.exit(1)};
setTimeout(()=>process.exit(0),30000);
