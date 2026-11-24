const fs=require("fs"); let s=fs.readFileSync("tools/character-editor.mjs","utf8");
const anchor=`$('btnLoadAnim').onclick = () => $('animFile').click();`;
const neu=`$('btnLoadAnim').onclick = () => $('animFile').click();
$('btnReplaceAnim').onclick = () => {
  if (!currentClip) { setStatus('Selecciona una animación para reemplazar.'); return; }
  $('replaceAnimFile').click();
};
$('replaceAnimFile').addEventListener('change', async e => {
  const f = (e.target.files||[])[0];
  e.target.value = '';
  if (!f) return;
  if (!currentClip) { setStatus('Selecciona una animación para reemplazar.'); return; }
  const replaceName = currentClip.name;
  try {
    const url = URL.createObjectURL(f);
    const obj = await loadAny(url, f.name);
    const anims = obj.animations || [];
    if (!anims.length) { setStatus(\`Sin animaciones en \${f.name}\`); return; }
    const targetSkin = modelRoot?.getObjectByProperty?.('isSkinnedMesh', true);
    const byNorm = new Map();
    modelRoot?.traverse?.((o) => { if (o.isBone) byNorm.set(String(o.name).replace(/^mixamorig\d*:?/i, ''), o.name); });
    let replaced = 0;
    for (const a of anims) {
      let out = null;
      const sameFamily = (() => { let m=0,t=0; for(const tr of a.tracks||[]){ const mm=tr.name.match(/^(.+)\\.(position|quaternion|scale)$/); if(!mm) continue; t++; if(byNorm.has(mm[1].replace(/^mixamorig\\d*:?/i,''))) m++; } return t>0 && m/t>0.6; })();
      if (sameFamily) { out = remapClipToSkeleton(a, bones); if (out) out = stripRootPosition(out, modelRoot); }
      if (!out && targetSkin?.skeleton) {
        let srcSkin = obj.getObjectByProperty?.('isSkinnedMesh', true);
        if (!srcSkin?.skeleton) { const sb=[]; obj.traverse?.(o=>{ if(o.isBone) sb.push(o); }); if (sb.length) { srcSkin = obj; srcSkin.skeleton = new THREE.Skeleton(sb); try{srcSkin.skeleton.calculateInverses();}catch{} try{srcSkin.updateMatrixWorld(true);}catch{} } }
        if (srcSkin?.skeleton) {
          const srcByNorm = new Map(); obj.traverse?.(o=>{ if(o.isBone) srcByNorm.set(String(o.name).replace(/^mixamorig\\d*:?/i,''), o.name); });
          const mmNames = {}; for (const [norm,tgtName] of byNorm.entries()) { const src=srcByNorm.get(norm); if(src) mmNames[tgtName]=src; }
          try {
            const saved = targetSkin.skeleton.bones.map(b=>({p:b.position.clone(),q:b.quaternion.clone(),s:b.scale.clone()}));
            const ret = SkeletonUtils.retargetClip(targetSkin, srcSkin, a, { hip: byNorm.get('Hips')||'Hips', names: mmNames, preservePosition:false, useFirstFramePosition:false });
            targetSkin.skeleton.bones.forEach((b,i)=>{ const sv=saved[i]; if(sv){ b.position.copy(sv.p); b.quaternion.copy(sv.q); b.scale.copy(sv.s); }});
            targetSkin.updateMatrixWorld(true);
            if (ret?.tracks?.length) out = ret;
          } catch {}
        }
      }
      if (!out) out = remapClipToSkeleton(a, bones);
      if (out?.tracks?.length) { stripRootPosition(out, modelRoot); out.name = replaceName; addClip(replaceName, out); replaced++; break; }
    }
    if (replaced) { selectClip(replaceName); setStatus(\`Animación reemplazada: \${replaceName} <- \${f.name}\`); }
    else setStatus(\`No se pudo retargetear \${f.name}\`);
  } catch(err) { console.error(err); setStatus('Error reemplazando anim: '+err.message); }
});`;
if(!s.includes(anchor)){console.log('no'); process.exit(1);} fs.writeFileSync("tools/character-editor.mjs",s.replace(anchor,neu)); console.log('ok');
