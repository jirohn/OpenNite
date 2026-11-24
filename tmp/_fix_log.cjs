const fs=require("fs"); let s=fs.readFileSync("tools/character-editor.mjs","utf8");
const old = `            const cleaned = new THREE.AnimationClip(name, clip.duration, tracks);
            addClip(name, cleaned);
          } catch (e) { console.warn('[editor] override failed', name, e); }
        }
      }`;
const neu = `            const cleaned = new THREE.AnimationClip(name, clip.duration, tracks);
            addClip(name, cleaned);
            console.info('[editor] override applied', name, tracks.length);
          } catch (e) { console.warn('[editor] override failed', name, e); }
        }
      }`;
if(!s.includes(old)){console.log('no'); process.exit(1);} fs.writeFileSync("tools/character-editor.mjs",s.replace(old,neu)); console.log('ok');
