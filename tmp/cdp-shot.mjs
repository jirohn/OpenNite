import fs from 'fs';
const wsUrl=process.argv[2];
const ws=new WebSocket(wsUrl);
const msg=(id,method,params={})=>new Promise((res,rej)=>{const h=e=>{const d=JSON.parse(e.data); if(d.id===id){ws.removeEventListener('message',h); res(d);} }; ws.addEventListener('message',h); ws.send(JSON.stringify({id,method,params})); setTimeout(()=>rej(new Error('timeout '+method)),15000);});
await new Promise(r=>ws.addEventListener('open',r));
const r=await msg(1,'Page.captureScreenshot',{format:'png'});
fs.writeFileSync('tmp/screen1.png',Buffer.from(r.result.data,'base64'));
console.log('ok');
ws.close();
