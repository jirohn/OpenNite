const fs = require('fs');
const p = 'tools/gun-editor.html';
let s = fs.readFileSync(p, 'utf8');
const anchor = '  <div class="sl"><span>Muzzle (local)</span><span id="muzzleLocal"></span></div>';
const insert = `  <h3>IK / Mano derecha (mira)</h3>
  <div class="sl"><span>IKDer X</span><span id="rikXv"></span><input type="range" id="rikX" min="-2" max="2" step="0.01"></div>
  <div class="sl"><span>IKDer Y</span><span id="rikYv"></span><input type="range" id="rikY" min="-2" max="2" step="0.01"></div>
  <div class="sl"><span>IKDer Z</span><span id="rikZv"></span><input type="range" id="rikZ" min="-2" max="2" step="0.01"></div>
  <small class="hint">Punto objetivo del brazo derecho (mira). Si no se define, usa el frente del personaje.</small>

  <h3>Solapa del arma</h3>
`;
if (!s.includes(anchor)) { console.error('anchor not found'); process.exit(1); }
s = s.replace(anchor, insert + anchor);
fs.writeFileSync(p, s, 'utf8');
console.log('done');
