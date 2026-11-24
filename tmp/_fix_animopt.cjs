const fs=require("fs"); let s=fs.readFileSync("tools/gun-editor.mjs","utf8");
const re = /function buildAnimOptions\(\) \{[\s\S]*?sel\.onchange = \(\) => \{ character\?\.play\(sel\.value\); \};\n\}/;
const neu = `function buildAnimOptions() {
  const sel = document.querySelector('#animSel');
  if (!sel) return;
  const keys = [...(animKeysByWeapon[weaponType] || []), ...EXTRA_TEST_ANIMS.filter(k => !(animKeysByWeapon[weaponType]||[]).includes(k))];
  sel.innerHTML = keys
    .map((k) => \`<option value="\${k}"\${k === 'idleArmed' ? ' selected' : ''}>\${UBC_ANIM_MAP[k] || k} - \${k}</option>\`)
    .join('');
  sel.onchange = () => { character?.play(sel.value); };
}`;
if(re.test(s)){ s=s.replace(re,neu); fs.writeFileSync("tools/gun-editor.mjs",s); console.log('ok'); } else console.log('no');
