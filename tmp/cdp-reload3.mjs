const ws=new WebSocket("");
ws.addEventListener("open",()=>{ws.send(JSON.stringify({id:1,method:"Page.reload",params:{ignoreCache:true}})); setTimeout(()=>{ws.close();process.exit(0)},3000);});
