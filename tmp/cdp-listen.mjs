import fs from 'fs';
import http from 'http';
const logPath = 'tmp/electron-console.log';
fs.mkdirSync('tmp',{recursive:true});
fs.writeFileSync(logPath, `[listen start] ${new Date().toISOString()}\n`);
function log(line){ const s=`[${new Date().toISOString()}] ${line}\n`; fs.appendFileSync(logPath,s); console.log(s.trim()); }
async function getPageWs(){
  for(let i=0;i<40;i++){
    try{
      const list = await new Promise((res,rej)=>http.get('http://127.0.0.1:9222/json/list',r=>{let b='';r.on('data',d=>b+=d);r.on('end',()=>res(JSON.parse(b)));}).on('error',rej));
      const page=list.find(x=>x.type==='page');
      if(page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    }catch{}
    await new Promise(r=>setTimeout(r,500));
  }
  throw new Error('no page');
}
const wsUrl = await getPageWs();
log('page '+wsUrl);
const ws = new WebSocket(wsUrl);
let id=0; const send=(method,params={})=>{const msg={id:++id,method,params}; ws.send(JSON.stringify(msg));};
ws.addEventListener('open', ()=>{
  send('Runtime.enable');
  send('Log.enable');
  send('Network.enable');
  log('enabled');
});
ws.addEventListener('message', e=>{
  const d=JSON.parse(e.data);
  if(d.method==='Runtime.consoleAPICalled'){
    const args=(d.params.args||[]).map(a=>a.value ?? a.description ?? a.type).join(' ');
    log(`[console.${d.params.type}] ${args}`);
  } else if(d.method==='Runtime.exceptionThrown'){
    const ex=d.params.exceptionDetails;
    log(`[exception] ${ex.text} ${ex.exception?.description||ex.exception?.value||''} at ${ex.url||''}:${ex.lineNumber}:${ex.columnNumber}`);
  } else if(d.method==='Log.entryAdded'){
    const p=d.params.entry; log(`[log.${p.level}] ${p.text} (${p.url||''}:${p.lineNumber||''})`);
  }
});
ws.addEventListener('close', ()=>{ log('ws closed'); process.exit(0); });
ws.addEventListener('error', (e)=>{ log('ws error '+e.message); });
setInterval(()=>{},1000);
