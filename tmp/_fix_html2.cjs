const fs=require("fs"); let s=fs.readFileSync("tools/character-editor.html","utf8");
s=s.replace('<button id="btnLoadAnim">Cargar anim</button>','<button id="btnLoadAnim">Cargar anim</button>\n              <button id="btnReplaceAnim">Reemplazar anim</button>');
s=s.replace('<input id="animFile" type="file" accept=".fbx,.glb,.gltf" multiple style="display:none" />','<input id="animFile" type="file" accept=".fbx,.glb,.gltf" multiple style="display:none" />\n            <input id="replaceAnimFile" type="file" accept=".fbx,.glb,.gltf" style="display:none" />');
fs.writeFileSync("tools/character-editor.html",s); console.log('ok');
