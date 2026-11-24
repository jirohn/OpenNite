const fs=require("fs"); let s=fs.readFileSync("tools/character-editor.html","utf8");
const old=`            <div class="row">
              <button id="btnLoadAnim">Cargar anim</button>
              <button id="btnNewAnim">Nueva anim</button>
            </div>
            <input id="animFile" type="file" accept=".fbx,.glb,.gltf" multiple style="display:none" />`;
const neu=`            <div class="row">
              <button id="btnLoadAnim">Cargar anim</button>
              <button id="btnReplaceAnim">Reemplazar anim</button>
              <button id="btnNewAnim">Nueva anim</button>
            </div>
            <input id="animFile" type="file" accept=".fbx,.glb,.gltf" multiple style="display:none" />
            <input id="replaceAnimFile" type="file" accept=".fbx,.glb,.gltf" style="display:none" />`;
if(!s.includes(old)){console.log('no'); process.exit(1);} fs.writeFileSync("tools/character-editor.html",s.replace(old,neu)); console.log('ok');
