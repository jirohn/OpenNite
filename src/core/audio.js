/** Sonido 100% sintetizado con WebAudio: sin ficheros externos ni licencias. */
export class AudioEngine {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.master = null;
    this.sfx = null;
    this.music = null;
    this.noiseBuffer = null;
    this.lastStep = 0;
    this.enabled = true;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.sfx = this.ctx.createGain();
      this.music = this.ctx.createGain();
      this.sfx.connect(this.master);
      this.music.connect(this.master);
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 2;
      const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBuffer = buffer;
      this.applyVolumes();
    } catch (error) {
      console.warn('Audio no disponible:', error);
      this.enabled = false;
    }
  }

  applyVolumes() {
    if (!this.ctx) return;
    const m = this.settings.get('masterVolume') ?? 0.75;
    const s = this.settings.get('sfxVolume') ?? 0.9;
    const b = this.settings.get('musicVolume') ?? 0.4;
    this.master.gain.setTargetAtTime(m, this.ctx.currentTime, 0.05);
    this.sfx.gain.setTargetAtTime(s, this.ctx.currentTime, 0.05);
    this.music.gain.setTargetAtTime(b, this.ctx.currentTime, 0.05);
  }

  get now() { return this.ctx ? this.ctx.currentTime : 0; }

  tone({ freq = 440, end = null, type = 'sine', dur = 0.15, gain = 0.2, delay = 0, attack = 0.005, dest = null, detune = 0 }) {
    if (!this.ctx || !this.enabled) return;
    const t = this.now + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(1, freq), t);
    if (end) osc.frequency.exponentialRampToValueAtTime(Math.max(1, end), t + dur);
    osc.detune.value = detune;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(dest || this.sfx);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  noise({ dur = 0.12, gain = 0.2, delay = 0, filter = 'lowpass', freq = 1800, endFreq = null, Q = 1, dest = null }) {
    if (!this.ctx || !this.enabled || !this.noiseBuffer) return;
    const t = this.now + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const biquad = this.ctx.createBiquadFilter();
    biquad.type = filter;
    biquad.frequency.setValueAtTime(Math.max(20, freq), t);
    if (endFreq) biquad.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t + dur);
    biquad.Q.value = Q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(biquad).connect(g).connect(dest || this.sfx);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  play(name, opts = {}) {
    if (!this.ctx || !this.enabled) return;
    switch (name) {
      case 'shoot': {
        const w = opts.weapon || 'ar';
        const power = { pistol: 0.42, smg: 0.28, ar: 0.38, shotgun: 0.65, sniper: 0.72 }[w] || 0.4;
        this.noise({ dur: w === 'shotgun' || w === 'sniper' ? 0.3 : 0.13, gain: power, filter: 'bandpass', freq: w === 'sniper' ? 900 : 1900, endFreq: 260, Q: 0.8 });
        this.tone({ freq: w === 'sniper' ? 110 : 170, end: 42, type: 'square', dur: 0.13, gain: power * 0.45 });
        this.noise({ dur: 0.32, gain: power * 0.2, filter: 'lowpass', freq: 500, endFreq: 90, delay: 0.02 });
        break;
      }
      case 'hit':
        this.tone({ freq: opts.head ? 1500 : 1050, end: opts.head ? 2300 : 1400, type: 'square', dur: 0.055, gain: 0.1 });
        if (opts.head) this.tone({ freq: 2400, type: 'sine', dur: 0.1, gain: 0.09, delay: 0.05 });
        break;
      case 'hitmark':
        this.tone({ freq: 880, end: 1320, type: 'triangle', dur: 0.05, gain: 0.075 });
        break;
      case 'kill':
        this.tone({ freq: 620, end: 940, type: 'triangle', dur: 0.12, gain: 0.15 });
        this.tone({ freq: 940, end: 1400, type: 'triangle', dur: 0.16, gain: 0.12, delay: 0.08 });
        break;
      case 'reload':
        this.noise({ dur: 0.05, gain: 0.17, filter: 'highpass', freq: 2600 });
        this.noise({ dur: 0.06, gain: 0.14, filter: 'bandpass', freq: 1400, delay: 0.19 });
        this.tone({ freq: 320, end: 190, type: 'square', dur: 0.05, gain: 0.08, delay: 0.34 });
        break;
      case 'pickup':
        this.tone({ freq: 620, end: 1180, type: 'sine', dur: 0.12, gain: 0.12 });
        this.tone({ freq: 940, end: 1600, type: 'sine', dur: 0.1, gain: 0.07, delay: 0.06 });
        break;
      case 'chest':
        this.noise({ dur: 0.4, gain: 0.16, filter: 'bandpass', freq: 700, endFreq: 2200 });
        this.tone({ freq: 480, end: 1200, type: 'triangle', dur: 0.25, gain: 0.11, delay: 0.18 });
        break;
      case 'click':
        this.tone({ freq: 540, end: 340, type: 'triangle', dur: 0.05, gain: 0.09 });
        break;
      case 'hover':
        this.tone({ freq: 780, type: 'sine', dur: 0.025, gain: 0.025 });
        break;
      case 'empty':
        this.noise({ dur: 0.04, gain: 0.12, filter: 'highpass', freq: 3200 });
        break;
      case 'jump':
        this.noise({ dur: 0.13, gain: 0.09, filter: 'bandpass', freq: 600, endFreq: 1600 });
        break;
      case 'land':
        this.noise({ dur: 0.16, gain: 0.2, filter: 'lowpass', freq: 420, endFreq: 90 });
        this.tone({ freq: 90, end: 45, type: 'sine', dur: 0.13, gain: 0.12 });
        break;
      case 'step':
        this.noise({ dur: 0.055, gain: 0.045, filter: 'lowpass', freq: 700 + Math.random() * 350, endFreq: 180 });
        break;
      case 'glide':
        this.noise({ dur: 1.2, gain: 0.075, filter: 'bandpass', freq: 380, endFreq: 900, Q: 0.5 });
        break;
      case 'storm':
        this.noise({ dur: 2.2, gain: 0.16, filter: 'lowpass', freq: 220, endFreq: 70 });
        this.tone({ freq: 55, end: 38, type: 'sawtooth', dur: 1.8, gain: 0.045 });
        break;
      case 'hurt':
        this.tone({ freq: 200, end: 110, type: 'sawtooth', dur: 0.16, gain: 0.1 });
        this.noise({ dur: 0.12, gain: 0.1, filter: 'lowpass', freq: 900, endFreq: 200 });
        break;
      case 'shieldbreak':
        this.tone({ freq: 1300, end: 180, type: 'sawtooth', dur: 0.55, gain: 0.13 });
        this.noise({ dur: 0.5, gain: 0.14, filter: 'highpass', freq: 2800, endFreq: 400 });
        break;
      case 'explode':
        this.noise({ dur: 0.7, gain: 0.5, filter: 'lowpass', freq: 1400, endFreq: 60 });
        this.tone({ freq: 90, end: 28, type: 'sawtooth', dur: 0.5, gain: 0.24 });
        break;
      case 'victory':
        [523, 659, 784, 1046].forEach((f, i) => this.tone({ freq: f, type: 'triangle', dur: 0.5, gain: 0.13, delay: i * 0.11 }));
        break;
      case 'defeat':
        [330, 277, 220].forEach((f, i) => this.tone({ freq: f, type: 'sine', dur: 0.55, gain: 0.12, delay: i * 0.16 }));
        break;
      case 'scope':
        this.tone({ freq: 300, end: 1200, type: 'sine', dur: 0.09, gain: 0.06 });
        break;
      case 'bus':
        this.tone({ freq: 70, end: 95, type: 'sawtooth', dur: 1.4, gain: 0.055, dest: this.music });
        this.noise({ dur: 1.6, gain: 0.035, filter: 'lowpass', freq: 320, dest: this.music });
        break;
      default:
        break;
    }
  }

  footstep(running = false) {
    const t = performance.now();
    if (t - this.lastStep < (running ? 250 : 390)) return;
    this.lastStep = t;
    this.play('step');
  }
}
