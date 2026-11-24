const WS = globalThis.WebSocket;
const ws = new WS('ws://127.0.0.1:9222/devtools/page/482A1221292964DD71DD0F4307C5ECCE');
let id = 0; const pending = new Map();
const send = (m, pa = {}) => new Promise((r, j) => { const i = ++id; pending.set(i, { r, j }); ws.send(JSON.stringify({ id: i, method: m, params: pa })); setTimeout(() => { if (pending.has(i)) { pending.delete(i); j(new Error('t')); } }, 12000); });
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id) { const x = pending.get(m.id); if (x) { pending.delete(m.id); x.r(m); } } };
ws.onopen = async () => {
  try {
    await send('Runtime.enable');
    const r = await send('Runtime.evaluate', { expression: "JSON.stringify({s:document.getElementById('leftStatus')?.textContent?.slice(0,200),hm:!!window.__ed?.modelRoot,ac:document.getElementById('animSelect')?.options?.length,an:[...document.getElementById('animSelect')?.options||[]].slice(0,8).map(o=>o.value)})", returnByValue: true });
    console.log(r.result.result.value);
  } catch (e) { console.error(String(e.message || e)); }
  ws.close();
};
ws.onerror = () => { console.error('ws err'); process.exit(1); };
setTimeout(() => process.exit(0), 15000);
