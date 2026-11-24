const WS=globalThis.WebSocket;
const ws=new WS('ws://127.0.0.1:9222/devtools/page/B9B845AE79FECDDA0E4E148AAE8C0F27');
let id=0;const p=new Map();
const send=(m,pa={})=>new Promise((r,j)=>{const i=++id;p.set(i,{r,j});ws.send(JSON.stringify({id:i,method:m,params:pa}));setTimeout(()=>{if(p.has(i)){p.delete(i);j(new Error('t'))}},15000)});
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const x=p.get(m.id);if(x){p.delete(m.id);x.r(m)}}};
ws.onopen=async()=>{
 try{
  await send('Runtime.enable');
  const expr = `(async()=>{ const files=['100Avatars_001_Crimsom.fbx','100Avatars_002_CoolAlien.fbx','100Avatars_003_Jimmy.fbx','100Avatars_004_OldMoustache.fbx','100Avatars_005_Skull.fbx','100Avatars_006_Cappy.fbx']; const out=[]; for(const f of files){ try{ const r=await fetch('/models/opennite/characters/100avatars/'+f); const t=await r.text(); out.push({f,status:r.status,ct:r.headers.get('content-type'),head:t.slice(0,20)}); }catch(e){ out.push({f,err:String(e)}); } } return JSON.stringify(out); })()`;
  const r=await send('Runtime.evaluate',{expression:expr,awaitPromise:true,returnByValue:true});
  console.log(r.result?.result?.value);
 }catch(e){console.error(String(e.message||e))}
 ws.close();
};
ws.onerror=()=>{console.error('ws err');process.exit(1)};
setTimeout(()=>process.exit(0),25000);
