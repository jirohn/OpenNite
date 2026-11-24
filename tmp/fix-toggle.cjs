const fs=require('fs');
const f='src/game/player.js';
let s=fs.readFileSync(f,'utf8');
const start=s.indexOf('  /** Activa o desactiva el paracaídas durante la caída. */\n  toggleGlider() {');
const end=s.indexOf('\n  }\n\n  /** ESPACIO:',start)+4;
if(start<0||end<4){console.error('bad',start,end);process.exit(1);}
const neu=`  /** Activa o desactiva el paracaídas durante la caída. */
  toggleGlider() {
    if (!this.alive || this.inBus || this.grounded || this.swimming) return;
    this.gliding = !this.gliding;
    this.gliderManualOff = !this.gliding;
    // Cada cambio reinicia la referencia: al cerrarlo se empieza una caída nueva.
    this.fallPeakY = this.position.y;
    this.audio.play(this.gliding ? 'glide' : 'jump');
    if (this.gliding) this.character.play('jump');
  }`;
fs.writeFileSync(f,s.slice(0,start)+neu+s.slice(end));
console.log('ok');
