import { readFileSync, writeFileSync } from 'node:fs';
const wsUrl = readFileSync('tmp/ws-url.txt', 'utf8').trim();
const ws = new WebSocket(wsUrl);
let id = 1;
const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((resolve) => {
  const i = id++;
  pending.set(i, resolve);
  ws.send(JSON.stringify({ id: i, method, params }));
  setTimeout(() => { if (pending.has(i)) { pending.delete(i); resolve({ timeout: true }); } }, 10000);
});
ws.onopen = async () => {
  try {
    await send('Page.enable');
    // Move camera high
    await send('Runtime.evaluate', { expression: "(() => { const g=window.openniteApp?.game; if(g){g.camera.position.set(0,250,0);g.camera.lookAt(0,0,0);return 'ok';} return 'no'; })()", returnByValue: true });
    await new Promise(r => setTimeout(r, 2000));
    const res = await send('Page.captureScreenshot', { format: 'png' });
    if (res.result?.data) {
      writeFileSync('tmp/map-shot.png', Buffer.from(res.result.data, 'base64'));
      console.log('SHOT:tmp/map-shot.png');
    } else {
      console.log('NOSHOT:' + JSON.stringify(res).slice(0, 200));
    }
  } catch (e) { console.log('ERR:' + e.message); }
  ws.close();
  process.exit(0);
};
setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 30000);
