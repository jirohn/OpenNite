const ws=new WebSocket("ws://127.0.0.1:9222/devtools/page/8D6EBD19E7EC26AA8DBDFCB3A50FCBC8");
ws.addEventListener("open",()=>{ws.send(JSON.stringify({id:1,method:"Page.reload",params:{ignoreCache:true}})); setTimeout(()=>{ws.close();process.exit(0)},3000);});
