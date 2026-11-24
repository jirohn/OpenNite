import fs from "node:fs";
const ws=new WebSocket("ws://127.0.0.1:9222/devtools/page/DAAA93664444C099BBB5F93C3D236540");
ws.addEventListener("open",()=>{ws.send(JSON.stringify({id:1,method:"Runtime.evaluate",params:{expression:"JSON.stringify({status:document.getElementById('status')?.textContent,clips:document.getElementById('animSelect')?.options?.length,cur:document.getElementById('animSelect')?.value,playing:document.getElementById('btnPlay')?.textContent})",returnByValue:true}}));});
ws.addEventListener("message",(e)=>{const d=JSON.parse(e.data); if(d.id===1){console.log(d.result?.result?.value); ws.close(); process.exit(0);} });
setTimeout(()=>process.exit(0),6000);
