const fs=require("fs"); let s=fs.readFileSync("tools/gun-editor.mjs","utf8");

const skins = `const GAME_SKINS = [
  { id: '100avatars_001_crimsom', name: '01 Crimsom', modelPath: '/models/opennite/characters/100avatars/100Avatars_001_Crimsom.fbx', color: '#e53935' },
  { id: '100avatars_002_coolalien', name: '02 CoolAlien', modelPath: '/models/opennite/characters/100avatars/100Avatars_002_CoolAlien.fbx', color: '#43a047' },
  { id: '100avatars_003_jimmy', name: '03 Jimmy', modelPath: '/models/opennite/characters/100avatars/100Avatars_003_Jimmy.fbx', color: '#1e88e5', default: true },
  { id: '100avatars_004_oldmoustache', name: '04 OldMoustache', modelPath: '/models/opennite/characters/100avatars/100Avatars_004_OldMoustache.fbx', color: '#8d6e63' },
  { id: '100avatars_005_skull', name: '05 Skull', modelPath: '/models/opennite/characters/100avatars/100Avatars_005_Skull.fbx', color: '#eeeeee' },
  { id: '100avatars_006_cappy', name: '06 Cappy', modelPath: '/models/opennite/characters/100avatars/100Avatars_006_Cappy.fbx', color: '#fdd835' },
];
`;
if(!s.includes('const GAME_SKINS')) s = s.replace('const animKeysByWeapon = {', skins + 'const animKeysByWeapon = {');

// expand anim keys
s = s.replace(
  "  pickaxe: ['fire', 'idleArmed'],",
  "  pickaxe: ['fire', 'idleArmed'],\n};\nconst EXTRA_TEST_ANIMS = ['idle','walk','run','sprint','jump','fall','land','landRoll','slide','mantle','dance','swim','swimFwd','death','chestOpen','hit','pickup','interact'];\nconst animKeysByWeaponBase = {"
);
// That replacement is risky if structure differs. Let's do safer approach.
fs.writeFileSync("tools/gun-editor.mjs",s);
console.log('ok');
