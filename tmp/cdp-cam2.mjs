const ws=new WebSocket("ws://127.0.0.1:9222/devtools/page/2E8B094E1ED357D30447321B442E2C81");
ws.addEventListener("open",()=>{ws.send(JSON.stringify({id:1,method:"Runtime.evaluate",params:{expression:`(()=>{try{
  const box=modelRoot?new THREE.Box3().setFromObject(modelRoot):null;
  const s=box?box.getSize(new THREE.Vector3()).toArray():null;
  const c=box?box.getCenter(new THREE.Vector3()).toArray():null;
  return JSON.stringify({cam:camera.position.toArray(),t:orbit.target.toArray(),s,c,meshes:modelRoot?modelRoot.getObjectsByProperty('isMesh',true).length:0,vis:modelRoot?modelRoot.getObjectsByProperty('isMesh',true).filter(m=>m.visible).length:0,scale:modelRoot?.scale?.toArray()});
}catch(e){return String(e)}})()`,returnByValue:true}}));});
ws.addEventListener("message",(e)=>{const d=JSON.parse(e.data); if(d.id===1){console.log(d.result?.result?.value); ws.close(); process.exit(0);} });
setTimeout(()=>process.exit(0),6000);
