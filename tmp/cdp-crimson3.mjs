const ws=new WebSocket("");
ws.addEventListener("open",()=>{ws.send(JSON.stringify({id:1,method:"Runtime.evaluate",params:{expression:`(async()=>{try{const r=await fetch('/config/01_Crimsom.glb'); const b=await r.arrayBuffer(); // parse with GLTFLoader
const loader=new window.__ed.THREE ? null : null; return JSON.stringify({size:b.byteLength});}catch(e){return String(e)}})()`,awaitPromise:true,returnByValue:true}}));});
ws.addEventListener("message",(e)=>{const d=JSON.parse(e.data); if(d.id===1){console.log(d.result?.result?.value); ws.close(); process.exit(0);} });
setTimeout(()=>process.exit(0),10000);
