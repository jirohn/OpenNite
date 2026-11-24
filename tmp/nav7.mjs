const ws=new WebSocket('ws://127.0.0.1:9222/devtools/page/3255790C58E3330A905E37A8B76012DC');
ws.addEventListener('open',()=>ws.send(JSON.stringify({id:1,method:'Page.navigate',params:{url:'http://127.0.0.1:57250/index.html?mixamo=1'}})));
ws.addEventListener('message',()=>{ws.close();process.exit(0)}); setTimeout(()=>process.exit(0),4000);
