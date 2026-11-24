const fs=require("fs"); let s=fs.readFileSync("tools/character-editor.mjs","utf8");
const old = `        try {
          const safe = String(replaceName).replace(/[^a-zA-Z0-9_-]+/g, '_');
          const clipJson = JSON.stringify(THREE.AnimationClip.toJSON(out));
          const relPath = \`public/models/opennite/characters/100avatars/anims/overrides/\${safe}.json\`;
          if (window.opennite?.app?.writeFile) {
            await window.opennite.app.writeFile(relPath, clipJson);
          }
          const overrides = (await loadConfigJSON('anim-overrides.json')) || {};
          overrides[replaceName] = \`/models/opennite/characters/100avatars/anims/overrides/\${safe}.json\`;
          await saveConfigJSON('anim-overrides.json', overrides, 'Override guardado');
        } catch (e) { console.warn('No se pudo guardar override', e); }`;
const neu = `        try {
          const safe = String(replaceName).replace(/[^a-zA-Z0-9_-]+/g, '_');
          const clipJson = JSON.stringify(THREE.AnimationClip.toJSON(out));
          const relUrl = \`/models/opennite/characters/100avatars/anims/overrides/\${safe}.json\`;
          if (window.opennite?.app?.writeFile) {
            await window.opennite.app.writeFile(\`public\${relUrl}\`, clipJson);
            try { await window.opennite.app.writeFile(\`dist\${relUrl}\`, clipJson); } catch {}
          }
          const overrides = (await loadConfigJSON('anim-overrides.json')) || {};
          overrides[replaceName] = relUrl;
          await saveConfigJSON('anim-overrides.json', overrides, 'Override guardado');
          try { if (window.opennite?.app?.writeFile) await window.opennite.app.writeFile('public/config/anim-overrides.json', JSON.stringify(overrides, null, 2)); } catch {}
          try { if (window.opennite?.app?.writeFile) await window.opennite.app.writeFile('dist/config/anim-overrides.json', JSON.stringify(overrides, null, 2)); } catch {}
        } catch (e) { console.warn('No se pudo guardar override', e); }`;
if(!s.includes(old)){console.log('no'); process.exit(1);} fs.writeFileSync("tools/character-editor.mjs",s.replace(old,neu)); console.log('ok');
