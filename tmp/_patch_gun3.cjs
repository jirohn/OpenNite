const fs=require("fs"); let s=fs.readFileSync("tools/gun-editor.mjs","utf8");

s = s.replace(
  `function buildAnimOptions() {
  const sel = document.querySelector('#animSel');
  if (!sel) return;
  sel.innerHTML = (animKeysByWeapon[weaponType] || [])
    .map((k) => \`<option value="\${k}"\${k === 'fire' ? ' selected' : ''}>\${UBC_ANIM_MAP[k] || k} ��' \${k}</option>\`)
    .join('');
  sel.onchange = () => { character?.play(sel.value); };
}`,
  `function buildAnimOptions() {
  const sel = document.querySelector('#animSel');
  if (!sel) return;
  const keys = [...(animKeysByWeapon[weaponType] || []), ...EXTRA_TEST_ANIMS.filter(k => !(animKeysByWeapon[weaponType]||[]).includes(k))];
  sel.innerHTML = keys
    .map((k) => \`<option value="\${k}"\${k === 'idleArmed' ? ' selected' : ''}>\${UBC_ANIM_MAP[k] || k} - \${k}</option>\`)
    .join('');
  sel.onchange = () => { character?.play(sel.value); };
}`
);

s = s.replace(
  `async function main() {`,
  `function populateSkinSelect() {
  const sel = document.querySelector('#skinSel');
  if (!sel) return;
  sel.innerHTML = GAME_SKINS.map(s => \`<option value="\${s.id}" \${s.default ? 'selected' : ''}>\${s.name}</option>\`).join('');
}
async function loadCharacterSkin(skinId) {
  const skin = GAME_SKINS.find(s => s.id === skinId) || GAME_SKINS.find(s => s.default) || GAME_SKINS[0];
  if (!skin) return;
  if (character?.kitChar?.dispose) { try { character.kitChar.dispose(); } catch {} }
  else if (character?.group) { try { character.group.removeFromParent(); } catch {} }
  character = await CharacterWrapper.create(window.__openniteGunKit, { color: skin.color || 0xffb45c, modelPath: skin.modelPath });
  character.group.position.set(0, 0, 0);
  character.group.rotation.y = 0.6;
  character.manualGunAlign = manualMode;
  character.play('idleArmed');
  scene.add(character.group);
  await attachWeapon(character, weaponType);
  gun = character.weaponMount.children[0];
  syncSlidersFromGun(); setReadouts(); buildAnimOptions();
  const animSel0 = document.querySelector('#animSel');
  if (animSel0) animSel0.value = 'idleArmed';
  if (outlineOn) applyOutlineTargets();
  setStatus('Skin cargada: ' + skin.name);
}

async function main() {`
);

s = s.replace(
  `    const ubcKit = await loadUbcKit('/models/opennite/ubc/');
    const kit = { type: 'ubc', ubc: ubcKit };
    character = await CharacterWrapper.create(kit, { color: 0xffb45c });
    character.group.position.set(0, 0, 0);
    character.group.rotation.y = 0.6;
    character.play('idleArmed');
    scene.add(character.group);
    await loadGunConfig();
    weaponType = 'ar';
    await attachWeapon(character, weaponType);
    gun = character.weaponMount.children[0];

    buildWeaponOptions();
    buildAnimOptions();
    const animSel0 = document.querySelector('#animSel');
    if (animSel0) animSel0.value = 'idleArmed';`,
  `    const ubcKit = await loadUbcKit('/models/opennite/ubc/');
    const kit = { type: 'ubc', ubc: ubcKit };
    window.__openniteGunKit = kit;
    await loadGunConfig();
    weaponType = 'ar';
    populateSkinSelect();
    const defSkin = GAME_SKINS.find(s => s.default) || GAME_SKINS[0];
    await loadCharacterSkin(defSkin?.id);
    buildWeaponOptions();
    const skinSel = document.querySelector('#skinSel');
    if (skinSel) skinSel.onchange = () => loadCharacterSkin(skinSel.value);`
);

fs.writeFileSync("tools/gun-editor.mjs",s);
console.log('ok');
