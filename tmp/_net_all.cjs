const WS=globalThis.WebSocket;
const ws=new WS('ws://127.0.0.1:9222/devtools/page/B9B845AE79FECDDA0E4E148AAE8C0F27');
let id=0;const p=new Map(); const fbx=[];
const send=(m,pa={})=>new Promise((r,j)=>{const i=++id;p.set(i,{r,j});ws.send(JSON.stringify({id:i,method:m,params:pa}));setTimeout(()=>{if(p.has(i)){p.delete(i);j(new Error('t'))}},20000)});
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const x=p.get(m.id);if(x){p.delete(m.id);m.error?x.j(new Error(m.error.message||'')):x.r(m.result)}} else if(m.method==='Network.responseReceived'){const u=m.params.response.url; if(u.includes('.fbx')) fbx.push({u:u.split('/').slice(-4).join('/'),s:m.params.response.status,ct:m.params.response.mimeType});}};
ws.onopen=async()=>{ try{ await send('Network.enable'); await send('Page.enable'); await send('Page.reload',{ignoreCache:true}); await new Promise(r=>setTimeout(r,12000)); console.log(JSON.stringify(fbx)); }catch(e){console.error(String(e.message||e))} ws.close(); };
ws.onerror=()=>{console.error('ws err');process.exit(1)};
setTimeout(()=>process.exit(0),40000);
