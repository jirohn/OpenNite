const wsUrl = (await import('node:fs')).readFileSync('tmp/ws-url.txt', 'utf8').trim();
console.log('connecting to', wsUrl);
const ws = new WebSocket(wsUrl);
ws.addEventListener('open', () => {
  console.log('open');
  ws.send(JSON.stringify({ id: 1, method: 'Runtime.enable' }));
  ws.send(JSON.stringify({ id: 2, method: 'Runtime.evaluate', params: { expression: 'document.readyState', returnByValue: true } }));
  setTimeout(() => { console.log('done waiting'); ws.close(); process.exit(0); }, 4000);
});
ws.addEventListener('close', (e) => console.log('close', e.code));
ws.addEventListener('error', (e) => console.log('error', e.message || 'error'));
ws.addEventListener('message', (e) => {
  console.log('MSG', String(e.data).slice(0, 200));
});
setTimeout(() => { console.log('overall timeout'); process.exit(1); }, 12000);
