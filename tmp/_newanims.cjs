const fs=require('fs');
const dir='C:/Users/Trabajo/Documents/Anim/New anims';
for(const f of fs.readdirSync(dir).filter(x=>/\.fbx$/i.test(x))){
  const b=fs.readFileSync(dir+'/'+f);
  const s=b.toString('latin1');
  // find animation stack names
  const stacks=[];
  let i=0;
  while(true){ i=s.indexOf('AnimStack::',i); if(i<0) break; const chunk=s.slice(i,i+120); const m=chunk.match(/AnimStack::([^\x00]+)/); if(m) stacks.push(m[1].replace(/[^\x20-\x7e]/g,'').trim()); i++; }
  if(!stacks.length){
    // try Take 001
    let j=0; while(true){ j=s.indexOf('AnimationStack',j); if(j<0) break; const chunk=s.slice(j,j+160); stacks.push(chunk.replace(/[^\x20-\x7e]/g,' ').replace(/\s+/g,' ').trim().slice(0,80)); j++; }
  }
  console.log(f+' => '+JSON.stringify(stacks.slice(0,3)));
}
