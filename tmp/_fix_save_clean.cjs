const fs=require("fs"); let s=fs.readFileSync("tools/character-editor.mjs","utf8");
const old = `        stripRootPosition(out, modelRoot); out.name = replaceName; addClip(replaceName, out); replaced++;
        try {
          const safe = String(replaceName).replace(/[^a-zA-Z0-9_-]+/g, '_');
          const clipJson = JSON.stringify(THREE.AnimationClip.toJSON(out));`;
const neu = `        stripRootPosition(out, modelRoot); out.name = replaceName;
        const boneNames = new Set((bones||[]).map(b=>b.name));
        const cleanTracks = out.tracks.filter(t => { const m = String(t.name||'').match(/^(.+)\\.(position|quaternion|scale)$/); return m && boneNames.has(m[1]); });
        const cleanOut = cleanTracks.length ? new THREE.AnimationClip(replaceName, out.duration, cleanTracks) : out;
        addClip(replaceName, cleanOut); replaced++;
        try {
          const safe = String(replaceName).replace(/[^a-zA-Z0-9_-]+/g, '_');
          const clipJson = JSON.stringify(THREE.AnimationClip.toJSON(cleanOut));`;
if(!s.includes(old)){console.log('no'); process.exit(1);} fs.writeFileSync("tools/character-editor.mjs",s.replace(old,neu)); console.log('ok');
