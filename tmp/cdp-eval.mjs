import fs from 'fs';
const wsUrl = process.argv[2];
const expr = fs.readFileSync(process.argv[3],'utf8');
const ws = new WebSocket(wsUrl);
const out = await new Promise((resolve,reject)=>{
  ws.addEventListener('open', ()=> ws.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{expression:expr,returnByValue:true,awaitPromise:true}})));
  ws.addEventListener('message', e=>{ resolve(JSON.parse(e.data)); ws.close(); });
  ws.addEventListener('error', reject);
  setTimeout(()=>{ reject(new Error('timeout')); try{ws.close()}catch{} }, 15000);
});
console.log(JSON.stringify(out.result?.result?.value ?? out.result ?? out));
