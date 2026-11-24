const ws=new WebSocket("ws://127.0.0.1:9222/devtools/page/AD7BA88D331E45C1FBB9A7F174271620");
ws.addEventListener("open",()=>{ws.send(JSON.stringify({id:1,method:"Page.reload",params:{ignoreCache:true}})); setTimeout(()=>{ws.close();process.exit(0)},4000);});
