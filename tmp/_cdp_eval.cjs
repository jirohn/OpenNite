const http=require('http');
const WebSocket=require('ws');
function getWs(){return new Promise((res,rej)=>{http.get('http://127.0.0.1:9222/json',r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{const pages=JSON.parse(d);const p=pages.find(x=>x.type==='page')||pages[0];res(p.webSocketDebuggerUrl);}catch(e){rej(e)}})}).on('error',rej)})}
(async()=>{const url=await getWs(); const ws=new WebSocket(url); await new Promise(r=>ws.on('open',r));
let id=1; const send=(method,params={})=>new Promise((resolve)=>{const my=id++; ws.on('message',function h(m){const o=JSON.parse(m); if(o.id===my){ws.off('message',h); resolve(o);} }); ws.send(JSON.stringify({id:my,method,params}));});
const expr=process.argv[2];
const r=await send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true});
console.log(JSON.stringify(r.result?.result?.value ?? r.result));
ws.close();
})().catch(e=>{console.error(e); process.exit(1)});
