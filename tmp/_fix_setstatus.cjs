const fs=require("fs"); let s=fs.readFileSync("tools/gun-editor.mjs","utf8");
s=s.replace("setStatus('Skin cargada: ' + skin.name);","console.log('[gun-editor] Skin cargada:', skin.name);");
fs.writeFileSync("tools/gun-editor.mjs",s); console.log('ok');
