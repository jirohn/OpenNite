import fs from 'fs';
const wsUrl = 'ws://127.0.0.1:9222/devtools/page/F9D30584669AB404E715D9252F16DCFB';
const ws = new WebSocket(wsUrl);
const send = (id, method, params={}) => ws.send(JSON.stringify({id, method, params}));
ws.addEventListener('open', () => {
  send(1, 'Runtime.evaluate', { expression: `(() => {
    const g = window.__opennite;
    const game = g?.game;
    const p = game?.player;
    const c = p?.character?.kitChar;
    if (!c) return JSON.stringify({noChar:true, mode:game?.mode});
    const clip = c.kit.clips.get('Extra_Slide');
    const trackSample = clip?.tracks?.slice(0,3).map(t=>t.name);
    const bones = c.bones ? [...c.bones].slice(0,5) : null;
    const filtered = clip ? clip.tracks.filter(t => c.bones.has(c._trackBoneName(t.name))).length : -1;
    return JSON.stringify({mode:game?.mode, hasClip:!!clip, tracks:clip?.tracks?.length, trackSample, bones, filtered});
  })()`, returnByValue: true });
});
ws.addEventListener('message', (e) => {
  const d = JSON.parse(e.data);
  if (d.id === 1) { console.log(d.result?.result?.value || JSON.stringify(d.result)); ws.close(); process.exit(0); }
});
ws.addEventListener('error', () => { console.error('err'); process.exit(1); });
setTimeout(() => { console.log('timeout'); process.exit(0); }, 6000);
