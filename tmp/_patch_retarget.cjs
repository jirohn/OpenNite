const fs=require("fs"); let s=fs.readFileSync("tools/character-editor.mjs","utf8");

// Replace in NEW_MIXAMO_GAME_ANIMS block: prefer retargetClip
const old1 = `              let remapped = null;
              const sameFamily = (() => { let m=0,t=0; for(const tr of srcClip.tracks||[]){ const mm=tr.name.match(/^(.+)\\.(position|quaternion|scale)$/); if(!mm) continue; t++; if(byNorm.has(mm[1].replace(/^mixamorig\\d*:?/i,''))) m++; } return t>0 && m/t>0.6; })();
              if (sameFamily) {
                remapped = remapClipToSkeleton(srcClip, bones);
                if (remapped) remapped = stripRootPosition(remapped, modelRoot);
              }
              if (!remapped && targetSkin?.skeleton) {
                let srcSkin = fbx.getObjectByProperty('isSkinnedMesh', true);
                if (!srcSkin?.skeleton) { const sb=[]; fbx.traverse(o=>{if(o.isBone)sb.push(o);}); if(sb.length){srcSkin=fbx; srcSkin.skeleton=new THREE.Skeleton(sb); try{srcSkin.skeleton.calculateInverses();}catch{} try{srcSkin.updateMatrixWorld(true);}catch{}} }
                if (srcSkin?.skeleton) {
                  const srcByNorm = new Map(); fbx.traverse(o=>{if(o.isBone) srcByNorm.set(String(o.name).replace(/^mixamorig\\d*:?/i,''), o.name);});
                  const mmNames={}; for(const [norm,tgtName] of byNorm.entries()){ const src=srcByNorm.get(norm); if(src) mmNames[tgtName]=src; }
                  try { const saved=targetSkin.skeleton.bones.map(b=>({p:b.position.clone(),q:b.quaternion.clone(),s:b.scale.clone()})); const out=SkeletonUtils.retargetClip(targetSkin,srcSkin,srcClip,{hip:byNorm.get('Hips')||'Hips',names:mmNames,preservePosition:false,useFirstFramePosition:false}); targetSkin.skeleton.bones.forEach((b,i)=>{const sv=saved[i]; if(sv){b.position.copy(sv.p); b.quaternion.copy(sv.q); b.scale.copy(sv.s);}}); targetSkin.updateMatrixWorld(true); if(out?.tracks?.length) remapped=stripRootPosition(out, modelRoot); } catch {}
                }
              }
              if (!remapped) remapped = remapClipToSkeleton(srcClip, bones);`;

const neu1 = `              let remapped = null;
              // Prefer SkeletonUtils.retargetClip for correct rest-pose handling across 100Avatars
              if (targetSkin?.skeleton) {
                let srcSkin = fbx.getObjectByProperty('isSkinnedMesh', true);
                if (!srcSkin?.skeleton) { const sb=[]; fbx.traverse(o=>{if(o.isBone)sb.push(o);}); if(sb.length){srcSkin=fbx; srcSkin.skeleton=new THREE.Skeleton(sb); try{srcSkin.skeleton.calculateInverses();}catch{} try{srcSkin.updateMatrixWorld(true);}catch{}} }
                if (srcSkin?.skeleton) {
                  const srcByNorm = new Map(); fbx.traverse(o=>{if(o.isBone) srcByNorm.set(String(o.name).replace(/^mixamorig\\d*:?/i,''), o.name);});
                  const mmNames={}; for(const [norm,tgtName] of byNorm.entries()){ const src=srcByNorm.get(norm); if(src) mmNames[tgtName]=src; }
                  try { const saved=targetSkin.skeleton.bones.map(b=>({p:b.position.clone(),q:b.quaternion.clone(),s:b.scale.clone()})); const out=SkeletonUtils.retargetClip(targetSkin,srcSkin,srcClip,{hip:byNorm.get('Hips')||'Hips',names:mmNames,preservePosition:false,useFirstFramePosition:false}); targetSkin.skeleton.bones.forEach((b,i)=>{const sv=saved[i]; if(sv){b.position.copy(sv.p); b.quaternion.copy(sv.q); b.scale.copy(sv.s);}}); targetSkin.updateMatrixWorld(true); if(out?.tracks?.length) remapped=stripRootPosition(out, modelRoot); } catch {}
                }
              }
              if (!remapped) remapped = remapClipToSkeleton(srcClip, bones);
              if (remapped) remapped = stripRootPosition(remapped, modelRoot);`;

if(s.includes(old1)){ s=s.replace(old1,neu1); console.log('ok1'); } else console.log('no1');
fs.writeFileSync("tools/character-editor.mjs",s);
