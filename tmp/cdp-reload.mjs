import fs from 'fs';
const wsUrl=process.argv[2]; const ws=new WebSocket(wsUrl);
let id=0; const msg=(m,p={})=>new Promise((res,rej)=>{const my=++id; const h=e=>{const d=JSON.parse(e.data); if(d.id===my){ws.removeEventListener('message',h); res(d);}}; ws.addEventListener('message',h); ws.send(JSON.stringify({id:my,method:m,params:p})); setTimeout(()=>rej(new Error('t')),15000);});
await new Promise(r=>ws.addEventListener('open',r));
await msg('Page.reload',{ignoreCache:true});
console.log('ok'); ws.close();
