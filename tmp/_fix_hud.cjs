const fs=require("fs");
let lines=fs.readFileSync("src/game/hud.js","utf8").split(/\r?\n/);
const start=131; // 0-based line 132
const end=156;   // 0-based line 157 exclusive? line 156 is index 155, end at 156 means replace up to index 155
// find by content
const sIdx = lines.findIndex(l=>l.includes("Prompt de recogida / salto del autob"));
const eIdx = lines.findIndex((l,i)=>i>sIdx && l.includes("// Banner / toasts"));
if(sIdx<0||eIdx<0){console.log('no',sIdx,eIdx); process.exit(1);}
const neu=[
"    // Prompt de recogida / salto del autobús / apertura cofre/puerta",
"    const co = game.chestOpening;",
"    const od = game.doorOpening;",
"    const nearDoor = (!player.inBus && player.alive && game.world?.findNearestDoor) ? game.world.findNearestDoor(player.position, 2.6) : null;",
"    if (player.inBus) {",
"      patch.pickupVisible = true;",
"      patch.pickupText = 'Pulsa ESPACIO para saltar del autobús';",
"      patch.chestOpening = null;",
"    } else if (co && player.alive) {",
"      const progress = Math.max(0, Math.min(1, co.time / (co.duration || 1)));",
"      patch.pickupVisible = true;",
"      patch.pickupText = 'Abriendo cofre...';",
"      patch.chestOpening = { progress, active: true };",
"    } else if (od && player.alive) {",
"      const progress = Math.max(0, Math.min(1, od.time / (od.duration || 0.5)));",
"      patch.pickupVisible = true;",
"      patch.pickupText = od.entity?.targetOpen ? 'Cerrando puerta...' : 'Abriendo puerta...';",
"      patch.chestOpening = { progress, active: true };",
"    } else {",
"      const near = loot.findNear(player.position, 3.4);",
"      if (near && player.alive) {",
"        patch.pickupVisible = true;",
"        patch.pickupText = near.isChest ? 'Mantén E para abrir cofre' : `${near.item.name} (E)`;",
"      } else if (nearDoor && player.alive) {",
"        patch.pickupVisible = true;",
"        patch.pickupText = nearDoor.targetOpen ? 'Mantén E para cerrar puerta' : 'Mantén E para abrir puerta';",
"      } else if (player.alive && player.glidePrompt) {",
"        patch.pickupVisible = true;",
"        patch.pickupText = 'Pulsa ESPACIO para abrir paracaídas';",
"      } else {",
"        patch.pickupVisible = false;",
"        patch.pickupText = '';",
"      }",
"      patch.chestOpening = null;",
"    }",
""
];
lines.splice(sIdx, eIdx-sIdx, ...neu);
fs.writeFileSync("src/game/hud.js", lines.join("\n"));
console.log('ok');
