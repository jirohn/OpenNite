const ws=new WebSocket("ws://127.0.0.1:9222/devtools/page/8D6EBD19E7EC26AA8DBDFCB3A50FCBC8");
ws.addEventListener("open",()=>{ws.send(JSON.stringify({id:1,method:"Runtime.evaluate",params:{expression:`(()=>{try{const e=window.__ed; const m=e.modelRoot; const bones=[]; m?.traverse(o=>{if(o.isBone) bones.push(o.name)}); const clips=[...document.getElementById('animSelect').options].map(o=>o.value).filter(Boolean); const cur=document.getElementById('animSelect').value; const clip=e?.currentClip; const trackSample=clip?.tracks?.slice(0,5).map(t=>t.name)||[]; const boneSample=bones.slice(0,10); // check matches
let matched=0,total=clip?.tracks?.length||0; for(const t of (clip?.tracks||[])){ const bn=t.name.split('.')[0]; if(bones.includes(bn)) matched++; }
return JSON.stringify({modelLoaded:!!m,bones:bones.length,boneSample,clips:clips.length,cur,trackSample,matched,total});}catch(err){return String(err)}})()`,returnByValue:true}}));});
ws.addEventListener("message",(e)=>{const d=JSON.parse(e.data); if(d.id===1){console.log(d.result?.result?.value); ws.close(); process.exit(0);} });
setTimeout(()=>{console.log('timeout'); process.exit(0);},8000);
