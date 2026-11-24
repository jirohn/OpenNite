const ws=new WebSocket('ws://127.0.0.1:9222/devtools/page/0F9797B2DA46B8B151654EE382BD8CF8');
ws.addEventListener('open',()=>ws.send(JSON.stringify({id:1,method:'Page.navigate',params:{url:'http://127.0.0.1:54719/index.html?mixamo=1'}})));
ws.addEventListener('message',()=>{ws.close();process.exit(0)}); setTimeout(()=>process.exit(0),4000);
