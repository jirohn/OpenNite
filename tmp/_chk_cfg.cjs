const WS=globalThis.WebSocket;
const ws=new WS('ws://127.0.0.1:9222/devtools/page/B9B845AE79FECDDA0E4E148AAE8C0F27');
let id=0;const p=new Map();
const send=(m,pa={})=>new Promise((r,j)=>{const i=++id;p.set(i,{r,j});ws.send(JSON.stringify({id:i,method:m,params:pa}));setTimeout(()=>{if(p.has(i)){p.delete(i);j(new Error('t'))}},10000)});
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const x=p.get(m.id);if(x){p.delete(m.id);x.r(m)}}};
ws.onopen=async()=>{ try{ await send('Runtime.enable'); const r=await send('Runtime.evaluate',{expression:`(async()=>{const r=await fetch('/config/character-skins.json',{cache:'no-store'}); return JSON.stringify({s:r.status,txt:(await r.text()).slice(0,300)});})()`,awaitPromise:true,returnByValue:true}); console.log(r.result?.result?.value); }catch(e){console.error(String(e.message||e))} ws.close(); };
ws.onerror=()=>{console.error('ws err');process.exit(1)};
setTimeout(()=>process.exit(0),15000);
