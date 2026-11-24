const WS = globalThis.WebSocket;
const ws = new WS('ws://127.0.0.1:9222/devtools/page/BD7670CD91FE42C2BE0AD1E3AA1568FD');
let id = 0; const pending = new Map();
const send = (m, pa = {}) => new Promise((r, j) => { const i = ++id; pending.set(i, { r, j }); ws.send(JSON.stringify({ id: i, method: m, params: pa })); setTimeout(() => { if (pending.has(i)) { pending.delete(i); j(new Error('t')); } }, 15000); });
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id) { const x = pending.get(m.id); if (x) { pending.delete(m.id); x.r(m); } } };
ws.onopen = async () => {
  try {
    await send('Runtime.enable');
    await send('Page.enable');
    await send('Page.navigate', { url: 'http://127.0.0.1:60751/tools/character-editor.html' });
    await new Promise(r => setTimeout(r, 10000));
    const r = await send('Runtime.evaluate', { expression: "JSON.stringify({s:document.getElementById('leftStatus')?.textContent?.slice(0,220),hm:!!window.__ed?.modelRoot,ac:document.getElementById('animSelect')?.options?.length,an:[...document.getElementById('animSelect')?.options||[]].slice(0,10).map(o=>o.value),title:document.title})", returnByValue: true });
    console.log(r.result?.result?.value || JSON.stringify(r).slice(0,300));
  } catch (e) { console.error(String(e.message || e)); }
  ws.close();
};
ws.onerror = () => { console.error('ws err'); process.exit(1); };
setTimeout(() => process.exit(0), 30000);
