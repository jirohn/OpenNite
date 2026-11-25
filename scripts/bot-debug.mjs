// Depuración de bots en el juego real (Electron).
// 1) Abre el juego con:  node_modules\electron\dist\electron.exe . --remote-debugging-port=9222
// 2) Ejecuta:            node scripts/bot-debug.mjs [mapId] [segundos] [bots]
// Empieza una partida en ese mapa (jugador invulnerable), y va imprimiendo dónde
// quiere aterrizar cada bot, cuándo salta, dónde cae (tierra/agua) y qué hace.
const mapId = process.argv[2] || 'isla-de-san-borondon';
const seconds = Number(process.argv[3] || 70);
const bots = Number(process.argv[4] || 19);
const port = Number(process.env.CDP_PORT || 9222);

// Mantiene vivo el proceso (Node 24 sale con 'unsettled top-level await' si no hay nada pendiente).
const keepAlive = setInterval(() => {}, 1000);
let WS = globalThis.WebSocket;
if (!WS) WS = (await import('ws')).default;

const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = targets.find((t) => t.type === 'page' && !/devtools/.test(t.url)) || targets[0];
if (!page) throw new Error('No hay ventana del juego en el puerto ' + port);
console.log('Ventana:', page.title, page.url);
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

for (let i = 0; i < 60 && !(await evaluate('!!window.openniteApp?.game')); i++) await sleep(1000);
await evaluate(`(() => { const app = window.openniteApp; app.requestPause = () => {}; app.game.settings.set('maxBots', ${bots}); app.startMatch(${JSON.stringify(mapId)}); return 1; })()`);
for (let i = 0; i < 900; i++) {
  const mode = await evaluate('window.openniteApp.game.mode');
  if (mode === 'playing') break;
  if (i % 15 === 0) console.log('Cargando partida...', mode);
  await sleep(1000);
}
await evaluate(`(() => { const g = window.openniteApp.game; g.player.takeDamage = () => ({ damage: 0, killed: false }); g.botLog = g.botLog || []; return 1; })()`);
console.log('Ruta:', await evaluate(`JSON.stringify((() => { const g = window.openniteApp.game, r = g.busRoute; return { start: r.start.toArray().map(Math.round), dir: r.dir.toArray().map((v) => +v.toFixed(2)), dur: +r.duration.toFixed(1), half: g.world.half, landingSpots: g.getLandingSpots().length, chests: g.world.chestSpots.length, items: g.loot.items.length }; })())`));
let seen = 0;
const t0 = Date.now();
while (Date.now() - t0 < seconds * 1000) {
  await sleep(3000);
  const out = JSON.parse(await evaluate(`JSON.stringify((() => {
    const g = window.openniteApp.game;
    if (g.paused) g.resume?.();
    const log = (g.botLog || []).slice(${'${seen}'});
    const st = g.bots.map((b) => b.name + ':' + (!b.alive ? 'muerto' : b.inBus ? 'bus' : b.brain.skydiving ? (b.gliding ? 'planea' : 'cae') : (b.swimming ? 'NADA-' : '') + b.brain.goal.type) + '(' + Math.round(b.position.x) + ',' + Math.round(b.position.y) + ',' + Math.round(b.position.z) + ')');
    return { t: +g.matchTime.toFixed(1), mode: g.mode, total: (g.botLog || []).length, log, st };
  })())`.replace('${seen}', String(seen))));
  seen = out.total;
  for (const e of out.log) console.log('  ', JSON.stringify(e));
  console.log(`[${out.t}s ${out.mode}] ` + out.st.join(' '));
  if (out.mode !== 'playing') break;
}
ws.close();
clearInterval(keepAlive);
process.exit(0);
