const fs=require('fs');
const p='tools/map-editor.html';
let s=fs.readFileSync(p,'utf8');
const old=`  <div id="terrainControls" style="display:none">
    <h3>Terreno</h3>
    <label class="small">Tama\u00f1o pincel</label>
    <input id="brushSize" type="range" min="1" max="18" value="4">
    <label class="small">Fuerza (studs por paso)</label>
    <input id="brushStrength" type="range" min="1" max="8" step="1" value="1">
    <label class="small">Ca\u00edda / forma</label>
    <select id="falloffMode">
      <option value="smooth">Suave (monta\u00f1a)</option>
      <option value="cliff">Picado (acantilado)</option>
      <option value="flat">Plana (meseta)</option>
    </select>
    <label class="small">Altura objetivo (aplanar/agua, studs)</label>
    <input id="targetHeight" type="number" value="1" step="0.5">
    <label class="small">Profundidad lago (studs)</label>
    <input id="waterDepth" type="number" value="2" min="0.5" max="20" step="0.5">
  </div>`;
const neu=`  <div id="terrainControls" style="display:none">
    <h3 id="brushTitle">Pincel</h3>
    <label class="small" id="brushSizeLabel">Tama\u00f1o pincel</label>
    <input id="brushSize" type="range" min="1" max="18" value="4">
    <label class="small" id="brushDensityLabel" style="display:none">Densidad</label>
    <input id="brushDensity" type="range" min="1" max="10" step="1" value="5" style="display:none">
    <div id="terrainOnlyControls">
      <label class="small">Fuerza (studs por paso)</label>
      <input id="brushStrength" type="range" min="1" max="8" step="1" value="1">
      <label class="small">Ca\u00edda / forma</label>
      <select id="falloffMode">
        <option value="smooth">Suave (monta\u00f1a)</option>
        <option value="cliff">Picado (acantilado)</option>
        <option value="flat">Plana (meseta)</option>
      </select>
      <label class="small">Altura objetivo (aplanar/agua, studs)</label>
      <input id="targetHeight" type="number" value="1" step="0.5">
      <label class="small">Profundidad lago (studs)</label>
      <input id="waterDepth" type="number" value="2" min="0.5" max="20" step="0.5">
    </div>
  </div>`;
if(!s.includes(old)){console.log('no'); process.exit(1);}
fs.writeFileSync(p,s.replace(old,neu));
console.log('ok');
