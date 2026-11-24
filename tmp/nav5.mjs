const ws=new WebSocket('ws://127.0.0.1:9222/devtools/page/85659C8100E211B4497338BB5280E952');
ws.addEventListener('open',()=>ws.send(JSON.stringify({id:1,method:'Page.navigate',params:{url:'http://127.0.0.1:53497/index.html?mixamo=1'}})));
ws.addEventListener('message',()=>{ws.close();process.exit(0)}); setTimeout(()=>process.exit(0),4000);
