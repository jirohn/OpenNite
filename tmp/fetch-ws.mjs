import { writeFileSync, readFileSync } from 'node:fs';
const resp = await fetch('http://127.0.0.1:9222/json');
console.log('status', resp.status);
const r = await resp.json();
console.log('len', Array.isArray(r), JSON.stringify(r).slice(0, 400));
const page = r.find((p) => p.type === 'page' || p.webSocketDebugUrl) || r[0];
if (page?.webSocketDebuggerUrl) {
  writeFileSync('tmp/ws-url.txt', page.webSocketDebuggerUrl, 'utf8');
  console.log('ws:', page.webSocketDebuggerUrl);
} else {
  const cur = (() => { try { return readFileSync('tmp/ws-url.txt', 'utf8').trim(); } catch { return ''; } })();
  console.log('no-page-url, current:', cur.slice(0, 40));
}
