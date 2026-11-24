const WS=globalThis.WebSocket;
const ws=new WS('ws://127.0.0.1:9222/devtools/page/C8FA0A63E0520D51712361F9E8F21D62');
let id=0;const p=new Map();
const send=(m,pa={})=>new Promise((r,j)=>{const i=++id;p.set(i,{r,j});ws.send(JSON.stringify({id:i,method:m,params:pa}));setTimeout(()=>{if(p.has(i)){p.delete(i);j(new Error('t'))}},12000)});
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const x=p.get(m.id);if(x){p.delete(m.id);m.error?x.j(new Error(m.error.message||JSON.stringify(m.error))):x.r(m.result)}}};
ws.onopen=async()=>{
 try{
  await send('Runtime.enable');
  const r=await send('Runtime.evaluate',{expression:(()=>{
    const ed=window.__ed; if(!ed) return 'noed';
    const cur=ed.currentClip; const mixer=ed.mixer; // mixer not exposed, try
    const sel=document.getElementById('animSelect')?.value;
    const hasModel=!!ed.modelRoot;
    // check if any action running
    const w=window;
    return JSON.stringify({sel,hasModel,clipName:cur?.name,tracks:cur?.clip?.tracks?.length, dur:cur?.duration, playing:window.playing, time:window.currentTime});
  })(),returnByValue:true});
  console.log(r.result?.value);
 }catch(e){console.error(String(e.message||e))}
 ws.close();
};
ws.onerror=()=>{console.error('ws err');process.exit(1)};
setTimeout(()=>process.exit(0),15000);
