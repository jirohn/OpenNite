const WS=globalThis.WebSocket;
const ws=new WS('ws://127.0.0.1:9222/devtools/page/C8FA0A63E0520D51712361F9E8F21D62');
let id=0;const p=new Map(); const errs=[];
const send=(m,pa={})=>new Promise((r,j)=>{const i=++id;p.set(i,{r,j});ws.send(JSON.stringify({id:i,method:m,params:pa}));setTimeout(()=>{if(p.has(i)){p.delete(i);j(new Error('t'))}},25000)});
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const x=p.get(m.id);if(x){p.delete(m.id);m.error?x.j(new Error(m.error.message||JSON.stringify(m.error))):x.r(m.result)}} else if(m.method==='Runtime.exceptionThrown'){errs.push('ex:'+ (m.params.exceptionDetails?.exception?.description||m.params.exceptionDetails?.text||'').slice(0,180))} else if(m.method==='Runtime.consoleAPICalled'){if(m.params.type==='error'||m.params.type==='warning') errs.push(m.params.type+': '+(m.params.args||[]).map(a=>a.value||a.description||'').join(' ').slice(0,180))}};
ws.onopen=async()=>{
 try{
  await send('Runtime.enable'); await send('Page.enable');
  await send('Page.navigate',{url:'http://127.0.0.1:59928/tools/character-editor.html'});
  await new Promise(r=>setTimeout(r,15000));
  const r=await send('Runtime.evaluate',{expression:"JSON.stringify({s:document.getElementById('leftStatus')?.textContent?.slice(0,220),hm:!!window.__ed?.modelRoot,ac:document.getElementById('animSelect')?.options?.length,an:[...document.getElementById('animSelect')?.options||[]].slice(0,12).map(o=>o.value)})",returnByValue:true});
  console.log(r.result?.value);
  console.log('ERRS', JSON.stringify(errs.slice(-8)));
 }catch(e){console.error(String(e.message||e))}
 ws.close();
};
ws.onerror=()=>{console.error('ws err');process.exit(1)};
setTimeout(()=>process.exit(0),45000);
