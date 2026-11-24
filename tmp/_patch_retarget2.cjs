const fs=require("fs"); let s=fs.readFileSync("tools/character-editor.mjs","utf8");
const old2 = `          let remapped = null;
          const sameFamily = (() => { let m=0,t=0; for(const tr of srcClip.tracks||[]){ const mm=tr.name.match(/^(.+)\\.(position|quaternion|scale)$/); if(!mm) continue; t++; if(byNorm.has(mm[1].replace(/^mixamorig\\d*:?/i,''))) m++; } return t>0 && m/t>0.6; })();
          if (sameFamily) {
            remapped = remapClipToSkeleton(srcClip, bones);
            if (remapped) remapped = stripRootPosition(remapped, modelRoot);
          }
          if (!remapped && targetSkin?.skeleton) {`;
const neu2 = `          let remapped = null;
          if (targetSkin?.skeleton) {`;
if(s.includes(old2)){ s=s.replace(old2,neu2); console.log('ok2'); } else console.log('no2');
// also remove trailing fallback "if (!remapped) remapped = remapClipToSkeleton..." after the retarget block in this GAME_EXTRA_ANIMS
fs.writeFileSync("tools/character-editor.mjs",s);
