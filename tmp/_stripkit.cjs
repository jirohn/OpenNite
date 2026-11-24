const fs=require('fs'); const p='src/game/ubc-character.js'; let s=fs.readFileSync(p,'utf8');
const old=`        if (retargeted.tracks.length) {
          clips.set(name, retargeted);
          console.info('[ubc] Extra anim loaded', name, retargeted.tracks.length, 'tracks');
        }`;
const neu=`        if (retargeted.tracks.length) {
          retargeted.tracks = retargeted.tracks.filter(t => { if(!t.name.endsWith('.position')) return true; const n=t.name.slice(0,-9).replace(/^mixamorig\\d*:?/i,'').toLowerCase(); return !(n==='hips'||n==='pelvis'); });
          clips.set(name, retargeted);
          console.info('[ubc] Extra anim loaded', name, retargeted.tracks.length, 'tracks');
        }`;
if(!s.includes(old)){console.error('not found'); process.exit(1);} fs.writeFileSync(p,s.replace(old,neu)); console.log('ok');
