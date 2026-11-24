const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/30BF3AF7F4B1007837BBD56E23739791');
ws.addEventListener('open', () => ws.send(JSON.stringify({id:1, method:'Page.navigate', params:{url:'http://127.0.0.1:54719/index.html?mixamo=1'}})));
ws.addEventListener('message', (e) => { console.log(e.data.slice(0,120)); ws.close(); process.exit(0); });
setTimeout(()=>process.exit(0), 4000);
