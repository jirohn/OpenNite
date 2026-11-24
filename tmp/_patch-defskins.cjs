const fs=require('fs');
const p='src/game/game.js';
let s=fs.readFileSync(p,'utf8');
const start=s.indexOf('const DEFAULT_SKIN_CATALOG = [');
const end=s.indexOf('];', start)+2;
const neu = `const DEFAULT_SKIN_CATALOG = [
  { id: '100avatars_001_crimsom', name: '01 Crimsom', color: 0xe53935, modelPath: '/models/opennite/characters/100avatars/100Avatars_001_Crimsom.glb', anim: 'idle' },
  { id: '100avatars_002_coolalien', name: '02 CoolAlien', color: 0x43a047, modelPath: '/models/opennite/characters/100avatars/100Avatars_002_CoolAlien.glb', anim: 'idle' },
  { id: '100avatars_003_jimmy', name: '03 Jimmy', color: 0x1e88e5, modelPath: '/models/opennite/characters/100avatars/100Avatars_003_Jimmy.fbx', anim: 'idle' },
  { id: '100avatars_004_oldmoustache', name: '04 OldMoustache', color: 0x8e24aa, modelPath: '/models/opennite/characters/100avatars/100Avatars_004_OldMoustache.fbx', anim: 'idle' },
  { id: '100avatars_005_skull', name: '05 Skull', color: 0xfdd835, modelPath: '/models/opennite/characters/100avatars/100Avatars_005_Skull.fbx', anim: 'idle' },
  { id: '100avatars_006_cappy', name: '06 Cappy', color: 0xfb8c00, modelPath: '/models/opennite/characters/100avatars/100Avatars_006_Cappy.fbx', anim: 'idle' },
];`;
fs.writeFileSync(p, s.slice(0,start)+neu+s.slice(end));
console.log('ok');
