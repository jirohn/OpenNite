const fs=require("fs"); let s=fs.readFileSync("tools/gun-editor.mjs","utf8");
s = s.replace("const EXTRA_TEST_ANIMS = ['idle','walk','run','sprint','jump','fall','land','landRoll','slide','mantle','dance','swim','swimFwd','death','chestOpen','hit','pickup','interact'];\nconst animKeysByWeaponBase = {\n};\n", "const EXTRA_TEST_ANIMS = ['idle','walk','run','sprint','jump','fall','land','landRoll','slide','mantle','dance','swim','swimFwd','death','chestOpen','hit','pickup','interact'];\n");
fs.writeFileSync("tools/gun-editor.mjs",s);
console.log(s.includes('animKeysByWeaponBase')?'bad':'ok');
