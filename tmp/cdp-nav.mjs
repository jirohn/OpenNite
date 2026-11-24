// Naviga la pestaña del juego (cdp) a una URL y evalúa una expresión.
// Uso: node tmp/cdp-nav.mjs <url> [waitMs]
import { readFileSync } from 'node:fs';
import net from 'node:net';
import crypto from 'node:crypto';

const [, , url, waitMsArg, evalFile] = process.argv;
const wsUrl = readFileSync('tmp/ws-url.txt', 'utf8').trim();
const expr = evalFile ? readFileSync(evalFile, 'utf8') : `(() => ({ navOk: true }))()`;
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
    if (url) {
      const nav = await send('Page.navigate', { url });
      writeNav(nav);
    }
    await wait(Number(waitMsArg) || 300);
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    const v = r.result?.result;
    const ed = r.result?.exceptionDetails;
    if (ed) console.log('EVAL-ERROR:', (ed.exception?.description || ed.text).slice(0, 500));
    else console.log('RESULT', typeof v?.value === 'string' ? v.value : JSON.stringify(v?.value ?? v));
  } catch (e) { console.log('ERR', e.message); }
  ws.close();
  process.exit(0);
};
setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 15000);

function writeNav(nav) {
  console.log('NAV', nav?.result?.frameId ? 'ok' : JSON.stringify(nav).slice(0, 120));
}
