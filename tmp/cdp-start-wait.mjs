import { readFileSync } from 'node:fs';
const wsUrl = readFileSync('tmp/ws-url.txt', 'utf8').trim();
const ws = new WebSocket(wsUrl);
let id = 1;
const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((resolve) => {
  const i = id++; pending.set(i, resolve); ws.send(JSON.stringify({ id: i, method, params }));
  setTimeout(() => { if (pending.has(i)) { pending.delete(i); resolve({ timeout: true }); } }, 10000);
});
ws.onopen = async () => {
  await send('Runtime.evaluate', { expression: `(() => { try { window.openniteApp.startMatch(); return 'ok'; } catch(e){ return e.message; } })()`, returnByValue: true });
  console.log('started');
  const expr = `(() => { const g=window.openniteApp?.game; const l=uiStore?.getState?.()?.loading; return JSON.stringify({mode:g?.mode, world:!!g?.world?.loaded, pct:l?.percent, txt:l?.text}); })()`;
  for (let i = 0; i < 90; i++) {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    console.log('T', i, r.result?.result?.value);
    try { const j = JSON.parse(r.result?.result?.value); if (j.mode==='playing' && j.world) { console.log('READY'); ws.close(); process.exit(0); } } catch {}
    await new Promise(res => setTimeout(res, 3000));
  }
  console.log('GAVE_UP'); ws.close(); process.exit(1);
};
setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 300000);