const http=require('http');
http.get('http://127.0.0.1:9222/json',res=>{let d='';res.on('data',c=>d+=c);res.on('end',()=>{
  const pages=JSON.parse(d); const p=pages.find(x=>/character-editor/.test(x.url||''));
  if(!p){console.log('no'); process.exit(0);}
  const ws=new WebSocket(p.webSocketDebuggerUrl);
  ws.onopen=()=>{ws.send(JSON.stringify({id:1,method:'Page.reload',params:{ignoreCache:true}})); setTimeout(()=>ws.close(),500);};
  setTimeout(()=>process.exit(0),2000);
});}).on('error',e=>{console.log('err',e.message); process.exit(0)});
