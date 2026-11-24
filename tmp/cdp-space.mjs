import fs from 'fs';
const wsUrl=process.argv[2];
const ws=new WebSocket(wsUrl);
let id=0;
const msg=(method,params={})=>new Promise((res,rej)=>{const my=++id; const h=e=>{const d=JSON.parse(e.data); if(d.id===my){ws.removeEventListener('message',h); res(d);} }; ws.addEventListener('message',h); ws.send(JSON.stringify({id:my,method,params})); setTimeout(()=>rej(new Error('timeout '+method)),15000);});
await new Promise(r=>ws.addEventListener('open',r));
await msg('Runtime.evaluate',{expression:"document.querySelector('canvas')?.click(); 'ok'", returnByValue:true});
for(const type of ['keyDown','keyUp']){
  await msg('Input.dispatchKeyEvent',{type, key:' ', code:'Space', windowsVirtualKeyCode:32, nativeVirtualKeyCode:32});
}
await new Promise(r=>setTimeout(r,500));
console.log('ok'); ws.close();
