const ws=new WebSocket("ws://127.0.0.1:9222/devtools/page/0697A0865577AE1D249EF66CFC2E316E");
ws.addEventListener("open",()=>{ws.send(JSON.stringify({id:1,method:"Runtime.evaluate",params:{expression:"JSON.stringify({status:document.getElementById('status')?.textContent,clips:[...document.getElementById('animSelect').options].map(o=>o.value).filter(Boolean).slice(-10),total:document.getElementById('animSelect').options.length})",returnByValue:true}}));});
ws.addEventListener("message",(e)=>{const d=JSON.parse(e.data); if(d.id===1){console.log(d.result?.result?.value); ws.close(); process.exit(0);} });
setTimeout(()=>process.exit(0),6000);
