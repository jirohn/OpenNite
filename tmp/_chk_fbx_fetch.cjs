const WS=globalThis.WebSocket;
const ws=new WS('ws://127.0.0.1:9222/devtools/page/49603B64B4F595F16E6FA9C12B478B6C');
let id=0;const p=new Map();
const send=(m,pa={})=>new Promise((r,j)=>{const i=++id;p.set(i,{r,j});ws.send(JSON.stringify({id:i,method:m,params:pa}));setTimeout(()=>{if(p.has(i)){p.delete(i);j(new Error('t'))}},20000)});
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const x=p.get(m.id);if(x){p.delete(m.id);m.error?x.j(new Error(m.error.message||'')):x.r(m.result)}}};
ws.onopen=async()=>{
 try{
  await send('Runtime.enable');
  const expr = `(async()=>{ try {
    const url='/models/opennite/characters/100avatars/100Avatars_001_Crimsom.fbx';
    const r=await fetch(url); const t=await r.text();
    return JSON.stringify({status:r.status, ct:r.headers.get('content-type'), head:t.slice(0,30)});
  } catch(e){ return JSON.stringify({err:String(e)}); } })()`;
  const r=await send('Runtime.evaluate',{expression:expr,awaitPromise:true,returnByValue:true});
  console.log(r.result?.value);
 }catch(e){console.error(String(e.message||e))}
 ws.close();
};
ws.onerror=()=>{console.error('ws err');process.exit(1)};
setTimeout(()=>process.exit(0),25000);
