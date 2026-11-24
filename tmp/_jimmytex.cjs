const fs=require('fs');
const b=fs.readFileSync('C:/Users/Trabajo/Documents/Monetizeti/OPENCODENITE/public/models/opennite/characters/100avatars/100Avatars_003_Jimmy.fbx');
const s=b.toString('latin1');
console.log('size',b.length);
console.log('hasTexture',/Texture|Video|\.png|\.jpg|\.tga/i.test(s));
console.log('material',/Material::/.test(s));
console.log('phong',/Phong/i.test(s));
console.log('lambert',/Lambert/i.test(s));
// look for texture filenames
const m=s.match(/[A-Za-z0-9_\-]+\.(png|jpg|jpeg|tga|bmp)/ig);
console.log('texfiles',[...new Set(m||[])].slice(0,20));
