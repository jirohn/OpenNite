import { readFileSync } from 'node:fs';
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
const expr = `(() => {
  const g = window.openniteApp?.game;
  if (!g) return JSON.stringify({mode:'no-game'});
  return JSON.stringify({ mode: g.mode, worldLoaded: !!g.world?.loaded, player: !!g.player, bots: (g.bots||[]).length });
})()`;
ws.onopen = async () => {
  for (let i = 0; i < 120; i++) {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    const v = r.result?.result?.value;
    console.log('TICK', i, v);
    try {
      const j = JSON.parse(v);
      if (j.mode === 'playing' && j.worldLoaded) { console.log('READY'); ws.close(); process.exit(0); }
    } catch {}
    await new Promise(res => setTimeout(res, 2000));
  }
  console.log('GAVE_UP');
  ws.close();
  process.exit(1);
};
setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 260000);
