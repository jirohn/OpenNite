const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/E95F28CA9068FB07F0167B5D90BB2286');
ws.onopen = () => { ws.send(JSON.stringify({id:1,method:'Page.reload',params:{ignoreCache:true}})); setTimeout(()=>ws.close(),500); };
setTimeout(()=>process.exit(0), 2000);
