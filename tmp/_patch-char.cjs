const fs=require('fs');
const p='tools/character-editor.mjs';
let s=fs.readFileSync(p,'utf8');
const start=s.indexOf('const GAME_DEFAULT_SKINS = [');
const end=s.indexOf('];', start)+2;
const neu = `const GAME_DEFAULT_SKINS = [
  { id:'100avatars_001_crimsom', name:'01 Crimsom', rarity:'common', price:0, currency:'chapas', saleStart:null, saleEnd:null, battlePassGift:false, battlePassLevel:null, modelPath:'/models/opennite/characters/100avatars/100Avatars_001_Crimsom.glb', notes:'Básico/default. 100Avatars CC BY 4.0', color:'#e53935', default:true },
  { id:'100avatars_002_coolalien', name:'02 CoolAlien', rarity:'rare', price:500, currency:'chapas', saleStart:null, saleEnd:null, battlePassGift:false, battlePassLevel:null, modelPath:'/models/opennite/characters/100avatars/100Avatars_002_CoolAlien.glb', notes:'Venta 500 chapas. 100Avatars CC BY 4.0', color:'#43a047' },
  { id:'100avatars_003_jimmy', name:'03 Jimmy', rarity:'rare', price:1000, currency:'chapas', saleStart:null, saleEnd:null, battlePassGift:false, battlePassLevel:null, modelPath:'/models/opennite/characters/100avatars/100Avatars_003_Jimmy.fbx', notes:'Venta 1000 chapas. 100Avatars CC BY 4.0', color:'#1e88e5' },
  { id:'100avatars_004_oldmoustache', name:'04 OldMoustache', rarity:'epic', price:19000, currency:'chapas', saleStart:null, saleEnd:null, battlePassGift:false, battlePassLevel:null, modelPath:'/models/opennite/characters/100avatars/100Avatars_004_OldMoustache.fbx', notes:'Épico 19000 chapas. 100Avatars CC BY 4.0', color:'#8e24aa' },
  { id:'100avatars_005_skull', name:'05 Skull', rarity:'epic', price:0, currency:'chapas', saleStart:null, saleEnd:null, battlePassGift:true, battlePassLevel:10, modelPath:'/models/opennite/characters/100avatars/100Avatars_005_Skull.fbx', notes:'Pase batalla nivel 10. 100Avatars CC BY 4.0', color:'#fdd835' },
  { id:'100avatars_006_cappy', name:'06 Cappy', rarity:'rare', price:0, currency:'chapas', saleStart:null, saleEnd:null, battlePassGift:true, battlePassLevel:5, modelPath:'/models/opennite/characters/100avatars/100Avatars_006_Cappy.fbx', notes:'Pase batalla nivel 5. 100Avatars CC BY 4.0', color:'#fb8c00' }
];`;
if(start<0||end<2){console.log('not found'); process.exit(1);}
fs.writeFileSync(p, s.slice(0,start)+neu+s.slice(end));
console.log('ok');
