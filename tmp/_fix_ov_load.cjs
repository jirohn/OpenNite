const fs=require("fs"); let s=fs.readFileSync("tools/character-editor.mjs","utf8");
const old = `      const overrides = (await loadConfigJSON('anim-overrides.json')) || null;
      if (overrides && typeof overrides === 'object') {
        for (const [name, url] of Object.entries(overrides)) {
          try {
            const r = await fetch(url, { cache: 'no-store' });
            if (!r.ok) continue;
            const data = await r.json();
            const clip = THREE.AnimationClip.parse(data);
            if (clip?.tracks?.length) { clip.name = name; addClip(name, clip); }
          } catch (e) { console.warn('[editor] override failed', name, e); }
        }
      }`;
const neu = `      const overrides = (await loadConfigJSON('anim-overrides.json')) || null;
      if (overrides && typeof overrides === 'object') {
        const boneNames = new Set((bones||[]).map(b=>b.name));
        for (const [name, url] of Object.entries(overrides)) {
          try {
            const r = await fetch(url, { cache: 'no-store' });
            if (!r.ok) continue;
            const data = await r.json();
            const clip = THREE.AnimationClip.parse(data);
            if (!clip?.tracks?.length) continue;
            const tracks = clip.tracks.filter(t => {
              const m = String(t.name||'').match(/^(.+)\.(position|quaternion|scale|visible)$/);
              return m && boneNames.has(m[1]);
            });
            if (!tracks.length) continue;
            const cleaned = new THREE.AnimationClip(name, clip.duration, tracks);
            addClip(name, cleaned);
          } catch (e) { console.warn('[editor] override failed', name, e); }
        }
      }`;
if(!s.includes(old)){console.log('no'); process.exit(1);} fs.writeFileSync("tools/character-editor.mjs",s.replace(old,neu)); console.log('ok');
