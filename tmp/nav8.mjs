const ws=new WebSocket('ws://127.0.0.1:9222/devtools/page/B657126E68F531B84C94E57C5DD07035');
ws.addEventListener('open',()=>ws.send(JSON.stringify({id:1,method:'Page.navigate',params:{url:'http://127.0.0.1:62145/index.html?mixamo=1'}})));
ws.addEventListener('message',()=>{ws.close();process.exit(0)}); setTimeout(()=>process.exit(0),4000);
