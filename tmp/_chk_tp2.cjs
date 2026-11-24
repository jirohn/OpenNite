const WS=globalThis.WebSocket;
const ws=new WS('ws://127.0.0.1:9222/devtools/page/C8FA0A63E0520D51712361F9E8F21D62');
let id=0;const p=new Map();
const send=(m,pa={})=>new Promise((r,j)=>{const i=++id;p.set(i,{r,j});ws.send(JSON.stringify({id:i,method:m,params:pa}));setTimeout(()=>{if(p.has(i)){p.delete(i);j(new Error('t'))}},12000)});
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const x=p.get(m.id);if(x){p.delete(m.id);x.r(m)}}};
ws.onopen=async()=>{
 try{
  await send('Runtime.enable');
  const expr = "JSON.stringify({sel:document.getElementById('animSelect')?.value,ac:document.getElementById('animSelect')?.options?.length,playing:typeof playing!=='undefined'?playing:null,cur:window.__ed?.currentClip?.name,tracks:window.__ed?.currentClip?.clip?.tracks?.length})";
  const r=await send('Runtime.evaluate',{expression:expr,returnByValue:true});
  console.log(r.result?.result?.value || JSON.stringify(r).slice(0,300));
 }catch(e){console.error(String(e.message||e))}
 ws.close();
};
ws.onerror=()=>{console.error('ws err');process.exit(1)};
setTimeout(()=>process.exit(0),15000);
