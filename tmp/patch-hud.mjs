import fs from 'node:fs';
const p='src/game/hud.js';
let s=fs.readFileSync(p,'utf8');
const old = `    // Prompt de recogida / salto del autobús
    if (player.inBus) {
      patch.pickupVisible = true;
      patch.pickupText = 'Pulsa ESPACIO para saltar del autobús';
    } else {
      const near = loot.findNear(player.position, 3.4);
      patch.pickupVisible = !!near && player.alive;
      if (near) patch.pickupText = near.isChest ? 'Abrir cofre (E)' : \`${'${near.item.name}'} (E)\`;
      else if (patch.pickupVisible === false) patch.pickupText = '';
    }`;
const neu = `    // Prompt de recogida / salto del autobús / apertura de cofre
    const co = game.chestOpening;
    if (player.inBus) {
      patch.pickupVisible = true;
      patch.pickupText = 'Pulsa ESPACIO para saltar del autobús';
      patch.chestOpening = null;
    } else if (co && player.alive) {
      const progress = Math.max(0, Math.min(1, co.time / (co.duration || 1)));
      patch.pickupVisible = true;
      patch.pickupText = 'Abriendo cofre...';
      patch.chestOpening = { progress, active: true };
    } else {
      const near = loot.findNear(player.position, 3.4);
      patch.pickupVisible = !!near && player.alive;
      if (near) patch.pickupText = near.isChest ? 'Mantén E para abrir cofre' : \`${'${near.item.name}'} (E)\`;
      else if (patch.pickupVisible === false) patch.pickupText = '';
      patch.chestOpening = null;
    }`;
if(!s.includes(old)){console.log('not found'); process.exit(1);} 
fs.writeFileSync(p,s.replace(old,neu)); console.log('ok');