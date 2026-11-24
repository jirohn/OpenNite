const WS=globalThis.WebSocket;
const ws=new WS('ws://127.0.0.1:9222/devtools/page/49603B64B4F595F16E6FA9C12B478B6C');
let id=0;const p=new Map();
const send=(m,pa={})=>new Promise((r,j)=>{const i=++id;p.set(i,{r,j});ws.send(JSON.stringify({id:i,method:m,params:pa}));setTimeout(()=>{if(p.has(i)){p.delete(i);j(new Error('t'))}},15000)});
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const x=p.get(m.id);if(x){p.delete(m.id);x.r(m)}}};
ws.onopen=async()=>{ try{ await send('Page.enable'); await send('Page.reload',{ignoreCache:true}); await new Promise(r=>setTimeout(r,12000)); console.log('reloaded'); }catch(e){console.error(String(e.message||e))} ws.close(); };
ws.onerror=()=>{console.error('ws err');process.exit(1)};
setTimeout(()=>process.exit(0),30000);
