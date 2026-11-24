const fs=require('fs');
const WS = globalThis.WebSocket;
const wsUrl = 'ws://127.0.0.1:9222/devtools/page/1831914951F43F1EBF38CB72CAA77E5F';
const ws = new WS(wsUrl);
let id=0; const pending=new Map();
const send=(method,params={})=>new Promise((res,rej)=>{const i=++id; pending.set(i,{res,rej}); ws.send(JSON.stringify({id:i,method,params})); setTimeout(()=>{if(pending.has(i)){pending.delete(i); rej(new Error('timeout '+method));}},10000);});
ws.addEventListener('message',e=>{const m=JSON.parse(e.data); if(m.id){const p=pending.get(m.id); if(p){pending.delete(m.id); m.error?p.rej(m.error):p.res(m.result);}} else { if(m.method==='Runtime.consoleAPICalled'||m.method==='Runtime.exceptionThrown') console.log('EV',m.method,JSON.stringify(m.params).slice(0,500)); }});
ws.addEventListener('open', async ()=>{
  try{
    await send('Runtime.enable');
    await send('Page.enable');
    // wait a bit for app to load
    await new Promise(r=>setTimeout(r,3000));
    const r = await send('Runtime.evaluate',{expression:`(() => { try { return JSON.stringify({clips: (window.__clips||[]).length, anims: document.getElementById('animSelect')?.options?.length, status: document.getElementById('statusBar')?.textContent?.slice(0,120)}); } catch(e){ return JSON.stringify({err:String(e)}); } })()`, returnByValue:true});
    console.log('RES', r.result?.value);
    // check for Extra_Falling
    const r2 = await send('Runtime.evaluate',{expression:`(() => { const sel=document.getElementById('animSelect'); const opts=[...sel.options].map(o=>o.value); return JSON.stringify({opts: opts.filter(o=>/Extra|Fall|slide|Jump|Climb/i.test(o)), hasExtra: opts.includes('Extra_Falling')}); })()`, returnByValue:true});
    console.log('RES2', r2.result?.value);
  }catch(e){ console.error('ERR',e); }
  ws.close();
});
ws.addEventListener('error',e=>console.error('WSERR',e.message||e));
setTimeout(()=>process.exit(0),12000);
