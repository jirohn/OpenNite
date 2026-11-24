const WS=globalThis.WebSocket;
const ws=new WS('ws://127.0.0.1:9222/devtools/page/4AEDD88A8C143538A43758A931B4884D');
ws.onopen=()=>{console.log('open'); ws.close();};
ws.onerror=e=>{console.log('err');};
setTimeout(()=>process.exit(0),5000);
