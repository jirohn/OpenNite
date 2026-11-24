// Captura screenshot del juego por CDP y guarda en tmp/screenshot.png
import net from 'node:net';
import crypto from 'node:crypto';
import { writeFileSync, readFileSync } from 'node:fs';

let wsUrl = process.argv[2] || '';
try { if (!wsUrl) wsUrl = readFileSync('tmp/ws-url.txt', 'utf8').trim(); } catch { /* ignore */ }
if (!wsUrl) wsUrl = 'ws://127.0.0.1:9222/devtools/page/FAKE';

function parseWsUrl(url) {
  const u = new URL(url);
  return { host: u.hostname, port: Number(u.port || 80), path: u.pathname + u.search };
}

const { host, port, path } = parseWsUrl(wsUrl);
const key = crypto.randomBytes(16).toString('base64');
const sock = net.connect(port, host);

let leftover = Buffer.alloc(0);
let hsHandled = false;
let sendId = 0;
const pending = new Map();

function sendText(sock, str) {
  const buf = Buffer.from(str, 'utf8');
  const mask = crypto.randomBytes(4);
  const masked = Buffer.from(buf);
  for (let i = 0; i < masked.length; i++) masked[i] ^= mask[i % 4];
  const header = [0x81];
  const len = buf.length;
  if (len < 126) header.push(0x80 | len);
  else if (len < 65536) header.push(0x80 | 126, len >> 8, len & 0xff);
  else {
    header.push(0x80 | 127, 0, 0, 0, 0, 0, (len / 16777216) & 0xff, ((len / 65536) & 0xff), ((len / 256) & 0xff), len & 0xff);
  }
  sock.write(Buffer.concat([Buffer.from(header), mask, masked]));
}

function handleFrames(buf) {
  leftover = Buffer.concat([leftover, buf]);
  while (true) {
    if (leftover.length < 2) break;
    const b1 = leftover[1];
    const len = b1 & 0x7f;
    let off = 2;
    let total;
    if (len === 126) { if (leftover.length < 4) break; total = leftover.readUInt16BE(2); off = 4; }
    else if (len === 127) { if (leftover.length < 10) break; total = Number(leftover.readBigUInt64BE(2)); off = 10; }
    else total = len;
    if (leftover.length < off + total) break;
    const payload = leftover.subarray(off, off + total);
    leftover = leftover.subarray(off + total);
    let obj = null;
    try { obj = JSON.parse(payload.toString('utf8')); } catch {}
    if (obj) {
      if (obj.id && pending.has(obj.id)) { pending.get(obj.id)(obj); pending.delete(obj.id); }
    }
  }
}

const send = (method, params = {}) => new Promise((resolve) => {
  const id = ++sendId;
  pending.set(id, resolve);
  sendText(sock, JSON.stringify({ id, method, params }));
  setTimeout(() => { if (pending.has(id)) { pending.delete(id); resolve({ timeout: true }); } }, 10000);
});

sock.on('connect', () => {
  sock.write(
    `GET ${path} HTTP/1.1\r\n` +
    `Host: ${host}:${port}\r\n` +
    `Upgrade: websocket\r\n` +
    `Connection: Upgrade\r\n` +
    `Sec-WebSocket-Key: ${key}\r\n` +
    `Sec-WebSocket-Version: 13\r\n\r\n`
  );
});

let hsBuf = Buffer.alloc(0);
sock.on('data', (chunk) => {
  if (!hsHandled) {
    hsBuf = Buffer.concat([hsBuf, chunk]);
    const idx = hsBuf.indexOf('\r\n\r\n');
    if (idx >= 0) {
      const status = hsBuf.subarray(0, idx).toString('utf8').split('\r\n')[0];
      if (!status.includes('101')) { console.log('HS-ERR', status); process.exit(1); }
      hsHandled = true;
      handleFrames(hsBuf.subarray(idx + 4));
      main();
      return;
    }
    return;
  }
  handleFrames(chunk);
});

async function main() {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  if (r?.result?.data) {
    writeFileSync('tmp/screenshot.png', Buffer.from(r.result.data, 'base64'));
    console.log('saved tmp/screenshot.png', (r.result.data.length / 1024).toFixed(0), 'KB');
  } else {
    console.log('NO-SCREENSHOT', JSON.stringify(r).slice(0, 200));
  }
  process.exit(0);
}
setTimeout(() => { console.log('OVERALL-TIMEOUT'); process.exit(1); }, 15000);
