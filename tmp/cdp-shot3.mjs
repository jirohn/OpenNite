import fs from "node:fs";
const ws=new WebSocket("ws://127.0.0.1:9222/devtools/page/C3888ADCFD1167E0A787D5317FF9E678");
ws.addEventListener("open",()=>{
  ws.send(JSON.stringify({id:1,method:"Runtime.evaluate",params:{expression:"JSON.stringify({status:document.getElementById('status')?.textContent,skins:document.querySelectorAll('#skinList li').length,err:window.__err||null})",returnByValue:true}}));
  ws.send(JSON.stringify({id:2,method:"Page.captureScreenshot",params:{format:"png"}}));
});
const out={};
ws.addEventListener("message",(e)=>{const d=JSON.parse(e.data); if(d.id){out[d.id]=d; if(out[1]&&out[2]){
  console.log(out[1].result?.result?.value);
  fs.writeFileSync("tmp/char-editor.png",Buffer.from(out[2].result.data,"base64"));
  ws.close(); process.exit(0);
}}});
setTimeout(()=>{console.log("timeout",Object.keys(out)); process.exit(0);},8000);
