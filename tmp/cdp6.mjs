const ws=new WebSocket('ws://127.0.0.1:9222/devtools/page/B657126E68F531B84C94E57C5DD07035');
ws.addEventListener('open',()=>ws.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{expression:`JSON.stringify({href:location.href,mode:window.__opennite?.game?.mode,hasPlayer:!!window.__opennite?.game?.player})`,returnByValue:true}})));
ws.addEventListener('message',(e)=>{const d=JSON.parse(e.data);if(d.id===1){console.log(d.result?.result?.value);ws.close();process.exit(0);}}); setTimeout(()=>process.exit(0),5000);
