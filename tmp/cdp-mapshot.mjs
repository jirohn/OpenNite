import { readFileSync, writeFileSync } from 'node:fs';
const wsUrl = readFileSync('tmp/ws-url.txt', 'utf8').trim();
const out = 'tmp/map-shot.png';
const ws = new WebSocket(wsUrl);
let id = 1;
const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((resolve) => {
  const i = id++;
  pending.set(i, resolve);
  ws.send(JSON.stringify({ id: i, method, params }));
  setTimeout(() => { if (pending.has(i)) { pending.delete(i); resolve({ timeout: true }); } }, 30000);
});
ws.onopen = async () => {
  try {
    // Move camera high
    await send('Runtime.evaluate', { expression: "(() => { const g=window.openniteApp?.game; if(g){g.camera.position.set(0,250,0);g.camera.lookAt(0,0,0);return 'ok';} return 'no'; })()", returnByValue: true });
    await new Promise(r => setTimeout(r, 1000));
    // Render and capture
    const res = await send('Runtime.evaluate', { expression: "(() => { const g=window.openniteApp?.game; if(!g?.renderer) return 'NORENDERER'; try{g.renderer.render(g.scene,g.camera);}catch(e){} return g.renderer.domElement.toDataURL('image/png'); })()", returnByValue: true, awaitPromise: true });
    const v = res.result?.result?.value;
    if (typeof v === 'string' && v.startsWith('data:image/png')) {
      writeFileSync(out, Buffer.from(v.split(',')[1], 'base64'));
      console.log('SHOT:' + out);
    } else {
      console.log('NOSHOT:' + String(v).slice(0, 100));
    }
  } catch (e) { console.log('ERR:' + e.message); }
  ws.close();
  process.exit(0);
};
setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 60000);
