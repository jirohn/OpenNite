const WS=globalThis.WebSocket;
const ws=new WS('ws://127.0.0.1:9222/devtools/page/4AEDD88A8C143538A43758A931B4884D');
let id=0; const pending=new Map();
const send=(method,params={})=>new Promise((res,rej)=>{const i=++id; pending.set(i,{res,rej}); ws.send(JSON.stringify({id:i,method,params})); setTimeout(()=>{if(pending.has(i)){pending.delete(i); rej(new Error('timeout '+method));}},15000);});
ws.onmessage=e=>{const m=JSON.parse(e.data); if(m.id){const p=pending.get(m.id); if(p){pending.delete(m.id); m.error?p.rej(m.error):p.res(m.result);}} else if(m.method==='Runtime.exceptionThrown'){console.log('EXC', JSON.stringify(m.params.exceptionDetails?.text||m.params).slice(0,400)); if(m.params.exceptionDetails?.exception?.description) console.log('DESC', m.params.exceptionDetails.exception.description.slice(0,400)); } else if(m.method==='Runtime.consoleAPICalled'){const args=(m.params.args||[]).map(a=>a.value??a.description??a.type).join(' '); console.log('LOG',m.params.type,args.slice(0,300));}};
ws.onopen=async()=>{ try{
  await send('Runtime.enable'); await send('Page.enable');
  await new Promise(r=>setTimeout(r,4000));
  let r=await send('Runtime.evaluate',{expression:`JSON.stringify({status:document.getElementById('statusBar')?.textContent?.slice(0,150), opts:[...document.getElementById('animSelect').options].map(o=>o.value).slice(0,20), hasExtra:[...document.getElementById('animSelect').options].some(o=>o.value==='Extra_Falling')})`,returnByValue:true});
  console.log('STATE',r.result?.value);
  // load Jimmy
  r=await send('Runtime.evaluate',{expression:`(async()=>{ document.getElementById('gameCharSelect').value='100Avatars_003_Jimmy'; document.getElementById('btnLoadGameChar').click(); return 'clicked'; })()`,returnByValue:true});
  await new Promise(r=>setTimeout(r,8000));
  r=await send('Runtime.evaluate',{expression:`JSON.stringify({status:document.getElementById('statusBar')?.textContent?.slice(0,180), optCount:document.getElementById('animSelect').options.length, extras:[...document.getElementById('animSelect').options].map(o=>o.value).filter(v=>/Extra/.test(v))})`,returnByValue:true});
  console.log('AFTER',r.result?.value);
  // select Extra_Falling
  r=await send('Runtime.evaluate',{expression:`(async()=>{ const sel=document.getElementById('animSelect'); if([...sel.options].some(o=>o.value==='Extra_Falling')){ sel.value='Extra_Falling'; sel.dispatchEvent(new Event('change')); await new Promise(r=>setTimeout(r,1000)); return JSON.stringify({ok:true, sel:sel.value}); } return JSON.stringify({ok:false}); })()`,awaitPromise:true,returnByValue:true});
  console.log('SEL',r.result?.value);
  await new Promise(r=>setTimeout(r,2000));
  r=await send('Runtime.evaluate',{expression:`JSON.stringify({playing: !!window.__playing, status:document.getElementById('statusBar')?.textContent?.slice(0,120)})`,returnByValue:true});
  console.log('PLAY',r.result?.value);
}catch(e){ console.error('ERR',String(e).slice(0,300)); }
  ws.close();
}; setTimeout(()=>process.exit(0),25000);
