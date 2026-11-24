const fs=require("fs"); let s=fs.readFileSync("tools/character-editor.mjs","utf8");
const start = "      await Promise.all(GAME_EXTRA_ANIMS.map(async ({ file, name: aname }) => {";
const startIdx = s.indexOf(start);
if(startIdx<0){ console.log('no start'); process.exit(1); }
// find the matching closing: it ends with "        } catch (e) { console.warn('[editor] extra anim failed', aname, e); }\n      }));"
const endMarker = "        } catch (e) { console.warn('[editor] extra anim failed', aname, e); }\n      }));";
const endIdx = s.indexOf(endMarker, startIdx);
if(endIdx<0){ console.log('no end'); process.exit(1); }
const clean = `      await Promise.all(GAME_EXTRA_ANIMS.map(async ({ file, name: aname }) => {
        try {
          const fbx = await loadAny(baseUbc + file, file);
          const srcClip = fbx.animations?.[0];
          if (!srcClip) return;
          let remapped = null;
          if (targetSkin?.skeleton) {
            let srcSkin = fbx.getObjectByProperty('isSkinnedMesh', true);
            if (!srcSkin?.skeleton) {
              const sb = []; fbx.traverse((o) => { if (o.isBone) sb.push(o); });
              if (sb.length) { srcSkin = fbx; srcSkin.skeleton = new THREE.Skeleton(sb); try{srcSkin.skeleton.calculateInverses();}catch{} try{srcSkin.updateMatrixWorld(true);}catch{} }
            }
            if (srcSkin?.skeleton) {
              const srcByNorm = new Map();
              fbx.traverse((o) => { if (o.isBone) srcByNorm.set(String(o.name).replace(/^mixamorig\\d*:?/i, ''), o.name); });
              const mmNames = {};
              for (const [norm, tgtName] of byNorm.entries()) { const src = srcByNorm.get(norm); if (src) mmNames[tgtName] = src; }
              try {
                const saved = targetSkin.skeleton.bones.map((b) => ({ p: b.position.clone(), q: b.quaternion.clone(), s: b.scale.clone() }));
                const out = SkeletonUtils.retargetClip(targetSkin, srcSkin, srcClip, { hip: byNorm.get('Hips') || 'Hips', names: mmNames, preservePosition: false, useFirstFramePosition: false });
                targetSkin.skeleton.bones.forEach((b, i) => { const sv = saved[i]; if (sv) { b.position.copy(sv.p); b.quaternion.copy(sv.q); b.scale.copy(sv.s); } });
                targetSkin.updateMatrixWorld(true);
                if (out?.tracks?.length) remapped = stripRootPosition(out, modelRoot);
              } catch {}
            }
          }
          if (!remapped) { remapped = remapClipToSkeleton(srcClip, bones); if (remapped) remapped = stripRootPosition(remapped, modelRoot); }
          if (remapped?.tracks?.length) { remapped.name = aname; addClip(aname, remapped); }
        } catch (e) { console.warn('[editor] extra anim failed', aname, e); }
      }));`;
s = s.slice(0,startIdx) + clean + s.slice(endIdx + endMarker.length);
fs.writeFileSync("tools/character-editor.mjs",s);
console.log('ok');
