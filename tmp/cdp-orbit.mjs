// Orbit test con input real de CDP: pulsar-arrastrar-soltar sobre el canvas.
import { readFileSync } from 'node:fs';
import net from 'node:net';
import crypto from 'node:crypto';

const wsUrl = readFileSync('tmp/ws-url.txt', 'utf8').trim();
const ws = new WebSocket(wsUrl);
let id = 1;
const pending = new Map();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
};
const send = (method, params = {}) => new Promise((resolve) => {
  const i = id++;
  pending.set(i, resolve);
  ws.send(JSON.stringify({ id: i, method, params }));
  setTimeout(() => { if (pending.has(i)) { pending.delete(i); resolve({ timeout: true }); } }, 6000);
});
ws.onopen = async () => {
  try {
    const before = await send('Runtime.evaluate', { expression: 'JSON.stringify(window.openniteEditorDebug?.().camPos)', returnByValue: true });
    const b = before.result?.result?.value;
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 420, y: 320, button: 'left', clickCount: 1 });
    for (let i = 1; i <= 8; i++) {
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 420 + i * 16, y: 320 - i * 6, button: 'left', buttons: 1 });
      await wait(20);
    }
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 548, y: 272, button: 'left', clickCount: 1 });
    await wait(400);
    const after = await send('Runtime.evaluate', { expression: 'JSON.stringify(window.openniteEditorDebug?.().camPos)', returnByValue: true });
    const a = after.result?.result?.value;
    console.log('CAMBEFORE', b);
    console.log('CAMAFTER', a);
    console.log('ORBITED', b !== a);
  } catch (e) { console.log('ERR', e.message); }
  ws.close();
  process.exit(0);
};
setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 20000);
