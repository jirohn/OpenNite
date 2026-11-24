import re
p='src/game/character.js'
s=open(p,encoding='utf-8').read()
old="""    if (this.isUbc && this.needsGunAlign) {
      this.gunAlignTimer += dt;
      if (this.current === 'idleArmed' && this.gunAlignTimer > 0.45) {
        this.updateWeaponMount();
        this.needsGunAlign = false;
      }
    }"""
new="""    if (this.isUbc) {
      if (this.alwaysAlignForward) {
        this.updateWeaponMount();
      } else if (this.needsGunAlign) {
        this.gunAlignTimer += dt;
        if (this.current === 'idleArmed' && this.gunAlignTimer > 0.45) {
          this.updateWeaponMount();
          this.needsGunAlign = false;
        }
      }
    }"""
assert old in s, 'old not found'
s=s.replace(old,new)
open(p,'w',encoding='utf-8').write(s)
print('done')
