const ws=new WebSocket('ws://127.0.0.1:9222/devtools/page/85659C8100E211B4497338BB5280E952');
ws.addEventListener('open',()=>ws.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{expression:`(()=>{try{
const g=window.__opennite; const p=g?.game?.player; const c=p?.character; const k=c?.kitChar;
const root=k?.root; const box=root?new THREE.Box3().setFromObject(root):null;
const size=box?{x:box.max.x-box.min.x,y:box.max.y-box.min.y,z:box.max.z-box.min.z}:null;
let meshes=0,vis=0; root?.traverse(o=>{if(o.isMesh){meshes++; if(o.visible) vis++;}});
return JSON.stringify({mixamo:k?._mixamoTest,hasRoot:!!root,meshes,vis,scale:root?.scale?.toArray(),holder:k?.holder?.scale?.toArray(),size,pos:root?.getWorldPosition(new THREE.Vector3()).toArray()});
}catch(e){return String(e)}})()`,returnByValue:true}})));
ws.addEventListener('message',(e)=>{const d=JSON.parse(e.data); if(d.id===1){console.log(d.result?.result?.value||JSON.stringify(d.result)); ws.close(); process.exit(0);} });
setTimeout(()=>process.exit(0),6000);
