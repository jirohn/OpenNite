const fs=require("fs"); let s=fs.readFileSync("tools/character-editor.mjs","utf8");
const old = `function stripRootPosition(clip, root){
  if(!clip||!root) return clip;
  const hips = [];
  root.traverse?.(o=>{ if(o.isBone && /hip|pelvis/i.test(o.name)) hips.push(o.name); });
  if(!hips.length) return clip;
  clip.tracks = clip.tracks.filter(t => !hips.some(h => t.name === h+'.position'));
  return clip;
}`;
const neu = `function stripRootPosition(clip, root){
  if(!clip||!root) return clip;
  const hips = new Set();
  root.traverse?.(o=>{ if(o.isBone && /hip|pelvis/i.test(o.name)) { hips.add(o.name); hips.add(normalizeBoneName(o.name)); } });
  if(!hips.size) return clip;
  clip.tracks = clip.tracks.filter(t => {
    const { boneName, prop } = parseTrackName(t.name);
    if (prop !== 'position') return true;
    return !(hips.has(boneName) || hips.has(normalizeBoneName(boneName)));
  });
  return clip;
}`;
if(s.includes(old)){s=s.replace(old,neu); fs.writeFileSync("tools/character-editor.mjs",s); console.log('ok')} else console.log('no')
