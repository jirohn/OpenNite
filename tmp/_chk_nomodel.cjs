const WS=globalThis.WebSocket;
const ws=new WS('ws://127.0.0.1:9222/devtools/page/49603B64B4F595F16E6FA9C12B478B6C');
let id=0;const p=new Map(); const errs=[];
const send=(m,pa={})=>new Promise((r,j)=>{const i=++id;p.set(i,{r,j});ws.send(JSON.stringify({id:i,method:m,params:pa}));setTimeout(()=>{if(p.has(i)){p.delete(i);j(new Error('t'))}},12000)});
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const x=p.get(m.id);if(x){p.delete(m.id);m.error?x.j(new Error(m.error.message||'')):x.r(m.result)}} else if(m.method==='Runtime.exceptionThrown'){errs.push((m.params.exceptionDetails?.exception?.description||m.params.exceptionDetails?.text||'').slice(0,200))}};
ws.onopen=async()=>{
 try{
  await send('Runtime.enable');
  await new Promise(r=>setTimeout(r,2000));
  const r=await send('Runtime.evaluate',{expression:"JSON.stringify({s:document.getElementById('leftStatus')?.textContent?.slice(0,220),hm:!!window.__ed?.modelRoot,ac:document.getElementById('animSelect')?.options?.length,err:document.querySelector('#leftStatus')?.textContent})",returnByValue:true});
  console.log(r.result?.value);
  console.log('ERRS',JSON.stringify(errs.slice(-5)));
 }catch(e){console.error(String(e.message||e))}
 ws.close();
};
ws.onerror=()=>{console.error('ws err');process.exit(1)};
setTimeout(()=>process.exit(0),20000);
