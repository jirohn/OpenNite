const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/018CCF6AFAC51C22DE9B493F066E105E');
ws.addEventListener('open', () => ws.send(JSON.stringify({id:1, method:'Page.navigate', params:{url:'http://127.0.0.1:53171/index.html?mixamo=1'}})));
ws.addEventListener('message', (e) => { console.log(e.data.slice(0,200)); ws.close(); process.exit(0); });
setTimeout(()=>process.exit(0), 4000);
