const fs=require('fs');
for (const f of ['C:/Users/Trabajo/Documents/Anim/ch00.fbx','C:/Users/Trabajo/Documents/Anim/character.fbx']) {
  const b=fs.readFileSync(f);
  // binary FBX: look for AnimationStack names in property strings
  const s=b.toString('latin1');
  // find occurrences of "AnimationStack" followed by null-terminated name
  const idx=[]; let i=0;
  while(true){ i=s.indexOf('AnimationStack',i); if(i<0) break; idx.push(i); i++; }
  console.log('---',f,'hits',idx.length);
  for(const p of idx.slice(0,10)){
    console.log(s.slice(Math.max(0,p-40),p+120).replace(/[^\x20-\x7e]/g,' '));
  }
}
