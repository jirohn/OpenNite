const ws=new WebSocket("ws://127.0.0.1:9222/devtools/page/C27FF7F2E4995C8A8D64FD31967F9893");
ws.addEventListener("open",()=>{ws.send(JSON.stringify({id:1,method:"Page.reload",params:{ignoreCache:true}})); setTimeout(()=>{ws.close();process.exit(0)},3000);});
