const WS = globalThis.WebSocket;
const ws = new WS('ws://127.0.0.1:9222/devtools/page/BD7670CD91FE42C2BE0AD1E3AA1568FD');
let id=0; const pending=new Map();
const send=(m,pa={})=>new Promise((r,j)=>{const i=++id;pending.set(i,{r,j});ws.send(JSON.stringify({id:i,method:m,params:pa}));setTimeout(()=>{if(pending.has(i)){pending.delete(i);j(new Error('timeout'))}},15000)});
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const x=pending.get(m.id);if(x){pending.delete(m.id);m.error?x.j(new Error(JSON.stringify(m.error))):x.r(m.result)}}};
ws.onopen=async()=>{
  try{
    await send('Runtime.enable');
    const expr = (async()=>{ try {
      // replicate load
      const url = '/models/opennite/characters/100avatars/100Avatars_003_Jimmy.fbx';
      const r = await fetch(url);
      const ct = r.headers.get('content-type');
      const txt = await r.clone().text();
      return JSON.stringify({ok:r.ok,status:r.status,ct,head:txt.slice(0,40)});
    } catch(e){ return JSON.stringify({err:String(e), stack:String(e?.stack||'').slice(0,300)}); } })();
    const r = await send('Runtime.evaluate',{expression:expr,awaitPromise:true,returnByValue:true});
    console.log(r.result?.value);
  }catch(e){console.error(e.message)}
  ws.close();
};
ws.onerror=()=>{console.error('ws err');process.exit(1)};
setTimeout(()=>process.exit(0),20000);
