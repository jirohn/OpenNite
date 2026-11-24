import { readFileSync, writeFileSync } from 'node:fs';
const wsUrl = process.argv[2] || readFileSync('tmp/ws-url.txt', 'utf8').trim();
const out = process.argv[3] || 'tmp/game-shot.png';
const ws = new WebSocket(wsUrl);
let id = 1;
const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((resolve) => {
  const i = id++;
  pending.set(i, resolve);
  ws.send(JSON.stringify({ id: i, method, params }));
  setTimeout(() => { if (pending.has(i)) { pending.delete(i); resolve({ timeout: true }); } }, 15000);
});
ws.onopen = async () => {
  try {
    // fuerza render + dataURL en una sola evaluación
    const expr = "(() => { const g = window.openniteApp?.game; if (!g?.renderer) return 'NORENDERER'; try { g.renderer.render(g.scene, g.camera); } catch(e){} return g.renderer.domElement.toDataURL('image/png'); })()";
    const res = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    const v = res.result?.result?.value;
    if (typeof v === 'string' && v.startsWith('data:image/png')) {
      writeFileSync(out, Buffer.from(v.split(',')[1], 'base64'));
      console.log('SHOT:' + out);
    } else {
      console.log('NOSHOT:' + String(v).slice(0, 200));
    }
  } catch (e) { console.log('ERR:' + e.message); }
  ws.close();
  process.exit(0);
};
setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 25000);
