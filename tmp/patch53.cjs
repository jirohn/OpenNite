const fs = require('fs');
const p = 'electron/main.js';
let s = fs.readFileSync(p, 'utf8');
const old = `    const startUrl = process.argv.includes('--editor')
      ? \`http://127.0.0.1:\${server.port}/tools/gun-editor.html\`
      : \`http://127.0.0.1:\${server.port}/index.html\`;`;
const neu = `    let startUrl = \`http://127.0.0.1:\${server.port}/index.html\`;
    if (process.argv.includes('--editor')) startUrl = \`http://127.0.0.1:\${server.port}/tools/gun-editor.html\`;
    if (process.argv.includes('--map-editor')) startUrl = \`http://127.0.0.1:\${server.port}/tools/map-editor.html\`;`;
if (!s.includes(old)) { console.error('old not found'); process.exit(1); }
s = s.replace(old, neu);
fs.writeFileSync(p, s, 'utf8');
console.log('done');
