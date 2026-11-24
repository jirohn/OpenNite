const fs=require('fs');
const p='tools/character-editor.mjs';
let s=fs.readFileSync(p,'utf8');
// add helper
if(!s.includes('function stripRootPosition(')){
  s = s.replace('function remapClipToSkeleton(', `function stripRootPosition(clip, root){
  if(!clip||!root) return clip;
  const hips = [];
  root.traverse?.(o=>{ if(o.isBone && /hip|pelvis/i.test(o.name)) hips.push(o.name); });
  if(!hips.length) return clip;
  clip.tracks = clip.tracks.filter(t => !hips.some(h => t.name === h+'.position'));
  return clip;
}
function remapClipToSkeleton(`);
}
// patch retarget results
s = s.replace(/if \(out\?\.tracks\?\.length\) remapped = out;/g, 'if (out?.tracks?.length) { remapped = stripRootPosition(out, modelRoot); }');
s = s.replace(/if \(out\?\.tracks\?\.length\) { out\.name = clip\.name; return stripRootPos\(out\); }/g, 'if (out?.tracks?.length) { out.name = clip.name; return stripRootPos(out); }'); // ubc already done
// also strip in animFile handler when out is set
s = s.replace(/if \(!out\?\.tracks\?\.length\) out = null;\n            } catch \{\}\n          }\n        }\n        if \(!out\) out = remapClipToSkeleton\(a, bones\);\n        if \(out\?\.tracks\?\.length\) addClip\(out\.name \|\| a\.name \|\| f\.name\.replace\(\/\\\.\[\^.\]\+\$\/,''\), out\);/, 
`if (!out?.tracks?.length) out = null;\n            } catch {}\n          }\n        }\n        if (!out) out = remapClipToSkeleton(a, bones);\n        if (out?.tracks?.length) { stripRootPosition(out, modelRoot); addClip(out.name || a.name || f.name.replace(/\\.[^.]+$/,''), out); }`);
fs.writeFileSync(p,s);
console.log('ok');
