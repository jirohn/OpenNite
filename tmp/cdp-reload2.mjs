const ws=new WebSocket("ws://127.0.0.1:9222/devtools/page/DAAA93664444C099BBB5F93C3D236540");
ws.addEventListener("open",()=>{ws.send(JSON.stringify({id:1,method:"Page.reload",params:{ignoreCache:true}})); setTimeout(()=>{ws.close();process.exit(0)},2500);});
