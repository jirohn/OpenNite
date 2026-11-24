import fs from 'fs';
const wsUrl = 'ws://127.0.0.1:9222/devtools/page/5C4F0B2D39F3D7A0EB252EF011BD0709';
const ws = new WebSocket(wsUrl);
ws.addEventListener('open', () => {
  ws.send(JSON.stringify({id:1, method:'Runtime.evaluate', params:{expression:`(() => { const g=window.__opennite; const c=g?.game?.player?.character?.kitChar?.kit?.clips; return JSON.stringify({mode:g?.game?.mode, extra: c ? [...c.keys()].filter(k=>k.startsWith('Extra')) : null}); })()`, returnByValue:true}}));
});
ws.addEventListener('message', (e) => { const d=JSON.parse(e.data); if(d.id===1){ console.log(d.result?.result?.value); ws.close(); process.exit(0);} });
ws.addEventListener('error', () => { console.error('err'); process.exit(1); });
setTimeout(()=>{ console.log('timeout'); process.exit(0); }, 5000);
