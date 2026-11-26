// Prueba de vehículos en el juego real (Electron).
// 1) Abre el juego con:  node_modules\electron\dist\electron.exe . --remote-debugging-port=9222
// 2) Ejecuta:            node scripts/vehicle-debug.mjs [mapId] [segundos] [bots]
// El jugador (invulnerable) sube al coche, conduce y se baja; luego se dejan
// los bots jugar y se imprime quién sube a qué vehículo, adónde va y cuándo baja.
const mapId = process.argv[2] || 'valle-terrazas';
const seconds = Number(process.argv[3] || 90);
const bots = Number(process.argv[4] || 8);
const port = Number(process.env.CDP_PORT || 9222);
const keepAlive = setInterval(() => {}, 1000);
let WS = globalThis.WebSocket;
if (!WS) WS = (await import('ws')).default;
const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = targets.find((t) => t.type === 'page' && !/devtools/.test(t.url)) || targets[0];
const ws = new WS(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let id = 0;
const pending = new Map();
ws.onmessage = (m) => {
  const msg = JSON.parse(typeof m.data === 'string' ? m.data : m.data.toString());
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
};
const evaluate = (expression) => new Promise((resolve, reject) => {
  const mid = ++id;
  pending.set(mid, (msg) => {
    if (msg.result?.exceptionDetails) reject(new Error(msg.result.exceptionDetails.exception?.description || 'error'));
    else resolve(msg.result?.result?.value);
  });
  ws.send(JSON.stringify({ id: mid, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const J = async (fn) => JSON.parse(await evaluate(`JSON.stringify((${fn})())`));

for (let i = 0; i < 60 && !(await evaluate('!!window.openniteApp?.game')); i++) await sleep(1000);
await evaluate(`(() => { const app = window.openniteApp; app.requestPause = () => {}; app.game.settings.set('maxBots', ${bots}); app.startMatch(${JSON.stringify(mapId)}); return 1; })()`);
for (let i = 0; i < 900; i++) { if ((await evaluate('window.openniteApp.game.mode')) === 'playing') break; await sleep(1000); }
console.log('Vehículos:', JSON.stringify(await J(`() => { const g = window.openniteApp.game; g.player.takeDamage = () => ({ damage: 0, killed: false }); g.botLog = []; return g.vehicles.list.map((v) => v.kind + '@' + v.position.toArray().map(Math.round)); }`)));

// Jugador: subir al coche, conducir, bajar.
await evaluate(`(() => { const g = window.openniteApp.game, p = g.player, v = g.vehicles.list.find((v) => v.kind === 'car') || g.vehicles.list[0];
  p.inBus = false; p.character.group.visible = true; const d = v.doorPoint(); p.position.set(d.x, d.y + 0.3, d.z); p.velocity.set(0, 0, 0); p.fallPeakY = d.y + 0.3; p.onFallDamage = () => {}; return 1; })()`);
await sleep(1500);
await evaluate(`window.openniteApp.game.input.keys.add('KeyE')`); await sleep(300); await evaluate(`window.openniteApp.game.input.keys.delete('KeyE')`);
await sleep(1500);
console.log('Subido:', await evaluate(`(() => { const r = window.openniteApp.game.player.ride; return r ? r.phase + ' ' + r.vehicle.kind : 'NO'; })()`));
await evaluate(`window.openniteApp.game.input.keys.add('KeyW')`); await sleep(3000);
await evaluate(`window.openniteApp.game.input.keys.add('KeyA')`); await sleep(1500);
console.log('Conduciendo:', JSON.stringify(await J(`() => { const g = window.openniteApp.game, v = g.player.ride?.vehicle; return v && { pos: v.position.toArray().map(Math.round), kmh: Math.round(v.realSpeed * 3.6), hp: v.health, fps: Math.round(1 / Math.max(1e-3, g.clock?.getDelta?.() || 0.016)) }; }`)));
await evaluate(`(() => { const k = window.openniteApp.game.input.keys; k.delete('KeyW'); k.delete('KeyA'); k.add('KeyS'); return 1; })()`); await sleep(1500);
await evaluate(`(() => { const k = window.openniteApp.game.input.keys; k.delete('KeyS'); k.add('KeyE'); return 1; })()`); await sleep(300); await evaluate(`window.openniteApp.game.input.keys.delete('KeyE')`);
await sleep(2000);
console.log('Bajado:', JSON.stringify(await J(`() => { const p = window.openniteApp.game.player; return { ride: !!p.ride, pos: p.position.toArray().map(Math.round), grounded: p.grounded }; }`)));

// Bots: se juntan cerca de los vehículos con destinos lejanos.
await evaluate(`(() => { const g = window.openniteApp.game; const vs = g.vehicles.list.filter((v) => v.def.mode === 'ground' || v.def.mode === 'heli');
  g.bots.forEach((b, i) => { const v = vs[i % vs.length]; if (!v || i >= vs.length * 2) return; b.body.inBus = false; b.body.gliding = false; b.brain.skydiving = false; const d = v.doorPoint(); b.body.position.set(d.x + 5, d.y + 1, d.z + 5); b.body.velocity.set(0, 0, 0); b.body.fallPeakY = d.y + 1; b.character.group.visible = true;
    b.brain.vehicleCd = 0; const a = Math.random() * 6.28; b.brain.roamPos = v.position.clone().set(Math.cos(a) * g.world.half * 0.7, 0, Math.sin(a) * g.world.half * 0.7); b.brain.goal.type = 'roam'; b.brain.thinkTimer = 0; });
  g.player.onFallDamage = () => {}; g.player.fallPeakY = 60; g.player.position.set(0, 60, 0); return 1; })()`);
let seen = 0;
const t0 = Date.now();
while (Date.now() - t0 < seconds * 1000) {
  await sleep(3000);
  const out = await J(`() => { const g = window.openniteApp.game; if (g.paused) g.resume?.();
    const log = (g.botLog || []).slice(${'SEEN'}).filter((e) => /vehicle/.test(e.ev));
    const st = g.bots.filter((b) => b.alive).map((b) => b.name + ':' + (b.body.ride ? 'EN-' + b.body.ride.vehicle.kind + '(' + Math.round(b.body.ride.vehicle.realSpeed * 3.6) + 'km/h)' : b.brain.goal.type) + '(' + b.position.toArray().map(Math.round) + ')');
    return { t: +g.matchTime.toFixed(1), total: (g.botLog || []).length, log, st, veh: g.vehicles.list.map((v) => v.kind + (v.wrecked ? 'X' : '') + ':' + Math.round(v.health)) }; }`.replace('SEEN', String(seen)));
  seen = out.total;
  for (const e of out.log) console.log('  ', JSON.stringify(e));
  console.log(`[${out.t}s] ${out.st.join(' ')} | ${out.veh.join(' ')}`);
}
ws.close();
clearInterval(keepAlive);
process.exit(0);
