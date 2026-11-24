const fs=require("fs"); let s=fs.readFileSync("tools/character-editor.mjs","utf8");
const helper = `function parseTrackName(name) {
  const s = String(name || '');
  const m = s.match(/\\.?bones\\[(.+?)\\]\\.(position|quaternion|scale)$/);
  if (m) return { boneName: m[1], prop: m[2] };
  const p = s.match(/^(.+)\\.(position|quaternion|scale)$/);
  if (p) return { boneName: p[1], prop: p[2] };
  const i = s.lastIndexOf('.');
  return { boneName: i >= 0 ? s.slice(0, i) : s, prop: i >= 0 ? s.slice(i + 1) : '' };
}
`;
if(!s.includes('function parseTrackName')){
  s = s.replace('function applyClipAtTime(t) {', helper + 'function applyClipAtTime(t) {');
}
s = s.replace(
  "    const boneName = tr.name.split('.')[0];\n    const prop = tr.name.split('.').slice(1).join('.');\n    const bone = resolveBone(boneName);",
  "    const { boneName, prop } = parseTrackName(tr.name);\n    const bone = resolveBone(boneName);"
);
s = s.replace(
  "    const boneName = t.name.split('.')[0];\n    const prop = t.name.split('.').slice(1).join('.');\n    let target = boneList.find(x => x.name === boneName);",
  "    const { boneName, prop } = parseTrackName(t.name);\n    let target = boneList.find(x => x.name === boneName);"
);
s = s.replace(
  "selectedKey = { trackName: p.track.name, index: p.keyIndex, bone: p.track.name.split('.')[0] };",
  "selectedKey = { trackName: p.track.name, index: p.keyIndex, bone: parseTrackName(p.track.name).boneName };"
);
s = s.replace(
  "selectedKey = { trackName: tr.name, index: draggingKey.index, bone: tr.name.split('.')[0] };",
  "selectedKey = { trackName: tr.name, index: draggingKey.index, bone: parseTrackName(tr.name).boneName };"
);
fs.writeFileSync("tools/character-editor.mjs",s);
console.log('ok');
