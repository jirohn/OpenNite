const fs=require('fs');
const p='tools/character-editor.mjs';
let s=fs.readFileSync(p,'utf8');
const a=s.indexOf('const GAME_CHARACTERS = [');
const b=s.indexOf('];',a)+2;
const neu = `const GAME_CHARACTERS = [
  { id: '100avatars_001_crimsom', name: '01 Crimsom (Default)', path: '/models/opennite/characters/100avatars/100Avatars_001_Crimsom.glb', default: true },
  { id: '100avatars_002_coolalien', name: '02 CoolAlien', path: '/models/opennite/characters/100avatars/100Avatars_002_CoolAlien.glb' },
  { id: '100avatars_003_jimmy', name: '03 Jimmy', path: '/models/opennite/characters/100avatars/100Avatars_003_Jimmy.fbx' },
  { id: '100avatars_004_oldmoustache', name: '04 OldMoustache', path: '/models/opennite/characters/100avatars/100Avatars_004_OldMoustache.fbx' },
  { id: '100avatars_005_skull', name: '05 Skull', path: '/models/opennite/characters/100avatars/100Avatars_005_Skull.fbx' },
  { id: '100avatars_006_cappy', name: '06 Cappy', path: '/models/opennite/characters/100avatars/100Avatars_006_Cappy.fbx' },
];`;
fs.writeFileSync(p, s.slice(0,a)+neu+s.slice(b));
console.log('ok');
