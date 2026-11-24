const WS=globalThis.WebSocket;
const ws=new WS('ws://127.0.0.1:9222/devtools/page/49603B64B4F595F16E6FA9C12B478B6C');
let id=0;const p=new Map();
const send=(m,pa={})=>new Promise((r,j)=>{const i=++id;p.set(i,{r,j});ws.send(JSON.stringify({id:i,method:m,params:pa}));setTimeout(()=>{if(p.has(i)){p.delete(i);j(new Error('t'))}},25000)});
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const x=p.get(m.id);if(x){p.delete(m.id);m.error?x.j(new Error(m.error.message||JSON.stringify(m.error))):x.r(m.result)}}};
ws.onopen=async()=>{
 try{
  await send('Runtime.enable'); await send('Page.enable');
  await send('Page.navigate',{url:'http://127.0.0.1:63623/tools/character-editor.html'});
  await new Promise(r=>setTimeout(r,15000));
  const expr = `(()=>{
    const ed=window.__ed; const cur=ed?.currentClip; const clip=cur?.clip||cur;
    const tracks=clip?.tracks||[];
    const bones=window.__ed?.modelRoot?[]:null;
    // count resolvable
    let ok=0, miss=0; const misses=[];
    const resolve = (n)=>{ if(!n) return null; let b=window.__ed?null:null; return b; };
    // access internal resolveBone via applying
    const sample=tracks[0];
    return JSON.stringify({sel:document.getElementById('animSelect')?.value,ac:document.getElementById('animSelect')?.options?.length,cur:cur?.name||clip?.name,tn:tracks.length,first:tracks[0]?.name,playing:window.playing});
  })()`;
  const r=await send('Runtime.evaluate',{expression:expr,returnByValue:true});
  console.log(r.result?.value);
 }catch(e){console.error(String(e.message||e))}
 ws.close();
};
ws.onerror=()=>{console.error('ws err');process.exit(1)};
setTimeout(()=>process.exit(0),45000);
