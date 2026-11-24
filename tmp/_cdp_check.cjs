const WS = globalThis.WebSocket;
const ws = new WS('ws://127.0.0.1:9222/devtools/page/482A1221292964DD71DD0F4307C5ECCE');
let id = 0;
const pending = new Map();
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); setTimeout(() => { if (pending.has(i)) { pending.delete(i); rej(new Error('timeout')); } }, 10000); });
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id) { const p = pending.get(m.id); if (p) { pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } } };
ws.onopen = async () => {
  try {
    await send('Runtime.enable');
    await new Promise(r => setTimeout(r, 3000));
    const r = await send('Runtime.evaluate', { expression: `JSON.stringify({screen:window.openniteApp?.ui?.current, hasGame:!!window.openniteApp?.game, mode:window.openniteApp?.game?.mode, skinPreviewMode:window.openniteApp?.game?.skinPreviewMode, previewCharVisible:window.openniteApp?.game?.previewCharacter?.group?.visible, previewSkins:(window.openniteApp?.game?.previewSkins||[]).map(s=>({v:s.group.visible,x:+s.group.position.x.toFixed(2),sc:+s.group.scale.x.toFixed(2),id:s.group.userData.skinId}))})`, returnByValue: true });
    console.log(r.result.value);
  } catch (e) { console.error('ERR', e.message); }
  ws.close();
};
ws.onerror = e => { console.error('WSERR'); process.exit(1); };
setTimeout(() => process.exit(0), 15000);
