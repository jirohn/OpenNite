const fs=require("fs"); let s=fs.readFileSync("src/game/ubc-character.js","utf8");
const start = "  /** Reproduce un clip de UAL por nombre. once = se queda en el último fotograma. */\n  async playClip(name, { fade = 0.2, once = false, speed = 1, restart = false } = {}) {";
const end = "  get playing() { return this._currentName; }";
const i=s.indexOf(start), j=s.indexOf(end);
if(i<0||j<0||j<i){ console.log('no'); process.exit(1); }
const neu = `  /** Reproduce un clip de UAL por nombre. once = se queda en el último fotograma. */
  async playClip(name, { fade = 0.2, once = false, speed = 1, restart = false } = {}) {
    const clip = this._mixamoClips?.get(name) || this._remappedClips?.get(name) || (this._mixamoTest ? null : (!this._customModel ? this.kit.clips.get(name) : null)) || (this._customModel ? this.kit.clips.get(name) : null) || (this._customModel ? this.clipFor(name) : null);
    if (!clip) {
      if (this._mixamoTest && !this._warnedMissing?.has(name)) { this._warnedMissing = this._warnedMissing || new Set(); this._warnedMissing.add(name); console.warn('[mixamo-test] missing clip', name); }
      return false;
    }
    if (this._currentName === name && this._current && !restart) {
      this._current.timeScale = speed;
      this._current.paused = false;
      return true;
    }
    const next = this.mixer.clipAction(this.clipFor(name, { clip }));
    next.reset();
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
    next.clampWhenFinished = once;
    next.timeScale = speed;
    next.paused = false;
    next.play();
    if (this._current && this._current !== next) next.crossFadeFrom(this._current, fade, false);
    this._current = next;
    this._currentName = name;
    return true;
  }

  async seekClip(name, t01, { fade = 0.12 } = {}) {
    const clip = this._mixamoClips?.get(name) || this._remappedClips?.get(name) || (this._mixamoTest ? null : (!this._customModel ? this.kit.clips.get(name) : null)) || (this._customModel ? this.kit.clips.get(name) : null) || (this._customModel ? this.clipFor(name) : null);
    if (!clip) return false;
    const next = this.mixer.clipAction(this.clipFor(name, { clip }));
    if (this._currentName !== name || this._current !== next) {
      next.reset();
      next.setLoop(THREE.LoopOnce, 1);
      next.clampWhenFinished = true;
      next.play();
      if (this._current && this._current !== next) next.crossFadeFrom(this._current, fade, false);
      this._current = next;
      this._currentName = name;
    }
    next.paused = true;
    next.timeScale = 0;
    next.time = Math.max(0, Math.min(0.999, t01)) * (clip.duration || 1);
    this.mixer.update(0);
    return true;
  }

`;
s=s.slice(0,i)+neu+s.slice(j);
fs.writeFileSync("src/game/ubc-character.js",s);
console.log('ok');
