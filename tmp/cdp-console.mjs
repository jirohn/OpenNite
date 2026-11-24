// Vuelca consola de la página por CDP (errores + logs).
import net from 'node:net';
import crypto from 'node:crypto';

const wsUrl = process.argv[2] || 'ws://127.0.0.1:9222/devtools/page/80E21E0175B0DBC63DDC1232F2FACF10';
const { host, port, path } = (() => { const u = new URL(wsUrl); return { host: u.hostname, port: Number(u.port || 80), path: u.pathname + u.search }; })();
const key = crypto.randomBytes(16).toString('base64');
const sock = net.connect(port, host);
let leftover = Buffer.alloc(0);
let hsHandled = false;
let id = 1;
const pending = new Map();
function sendText(str) {
  const buf = Buffer.from(str, 'utf8');
  const mask = crypto.randomBytes(4);
  const masked = Buffer.from(buf);
  for (let i = 0; i < masked.length; i++) masked[i] ^= mask[i % 4];
  const len = buf.length;
  sock.write(Buffer.concat([Buffer.from([0x81, 0x80 | len]), mask, masked]));
}
function handleFrames(buf) {
  leftover = Buffer.concat([leftover, buf]);
  while (true) {
    if (leftover.length < 2) break;
    const len = leftover[1] & 0x7f;
    let off = 2, total = len;
    if (len === 126) { if (leftover.length < 4) break; total = leftover.readUInt16BE(2); off = 4; }
    else if (len === 127) { if (leftover.length < 10) break; total = Number(leftover.readBigUInt64BE(2)); off = 10; }
    if (leftover.length < off + total) break;
    const payload = leftover.subarray(off, off + total);
    leftover = leftover.subarray(off + total);
    let obj = null;
    try { obj = JSON.parse(payload.toString('utf8')); } catch {}
    if (obj) {
      if (obj.id && pending.has(obj.id)) { const r = pending.get(obj.id); pending.delete(obj.id); r(obj); }
      else if (obj.method === 'Runtime.exceptionThrown') { console.log('EXCEPTION:', (obj.params.exceptionDetails?.exception?.description || obj.params.text || '').slice(0, 500)); }
      else if (obj.method === 'Runtime.consoleAPICalled') {
        const args = obj.params.args || [];
        const text = args.map((a) => a.value ?? a.description ?? '').join(' ');
        if (/error|Error|uncaught|exception/i.test(text) || obj.params.type === 'error' || obj.params.type === 'warning') {
          console.log(`CONSOLE[${obj.params.type}]:`, text.slice(0, 400));
        }
      }
      else if (obj.method === 'Page.javascriptDialogOpening') { console.log('DIALOG:', obj.params.message); }
    }
  }
}
const send = (method, params = {}) => new Promise((resolve) => {
  const i = id++;
  pending.set(i, resolve);
  sendText(JSON.stringify({ id: i, method, params }));
  setTimeout(() => { if (pending.has(i)) { pending.delete(i); resolve({ timeout: true }); } }, 8000);
});
sock.on('connect', () => {
  sock.write(`GET ${path} HTTP/1.1\r\nHost: ${host}:${port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`);
});
let hsBuf = Buffer.alloc(0);
sock.on('data', (chunk) => {
  if (!hsHandled) {
    hsBuf = Buffer.concat([hsBuf, chunk]);
    const idx = hsBuf.indexOf('\r\n\r\n');
    if (idx >= 0) { hsHandled = true; handleFrames(hsBuf.subarray(idx + 4)); main(); return; }
    return;
  }
  handleFrames(chunk);
});
async function main() {
  await send('Runtime.enable');
  await send('Log.enable').catch(() => {});
  await send('Page.enable');
  console.log('--- console state ---');
  const r = await send('Runtime.evaluate', { expression: `JSON.stringify({mode: window.openniteApp?.game?.mode, hasWorld: !!window.openniteApp?.game?.world, loadingText: document.getElementById('loader-text')?.textContent, assetsReady: window.openniteApp?.assetsReady, running: window.openniteApp?.game?.running, paused: window.openniteApp?.game?.paused, errors: window.errors || null})`, returnByValue: true });
  console.log('STATE:', r.result?.result?.value || r.result?.exceptionDetails?.text);
  setTimeout(() => process.exit(0), 4000);
}
setTimeout(() => process.exit(1), 15000);
