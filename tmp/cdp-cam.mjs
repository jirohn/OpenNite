const ws=new WebSocket("");
ws.addEventListener("open",()=>{ws.send(JSON.stringify({id:1,method:"Runtime.evaluate",params:{expression:`(()=>{try{const c=window.__opennite; return JSON.stringify({cam:camera?.position?.toArray?.(),target:orbit?.target?.toArray?.(),hasModel:!!modelRoot,box:modelRoot?(()=>{const b=new THREE.Box3().setFromObject(modelRoot); const s=b.getSize(new THREE.Vector3()); const ct=b.getCenter(new THREE.Vector3()); return {size:s.toArray(),center:ct.toArray(),min:b.min.toArray(),max:b.max.toArray()};})():null})}catch(e){return String(e)}})()`,returnByValue:true}}));});
ws.addEventListener("message",(e)=>{const d=JSON.parse(e.data); if(d.id===1){console.log(d.result?.result?.value); ws.close(); process.exit(0);} });
setTimeout(()=>process.exit(0),6000);
