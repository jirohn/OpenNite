export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.buttons = new Set();
    this.dx = 0;
    this.dy = 0;
    this.wheel = 0;
    this.locked = false;
    this.autoLock = false;
    this.listeners = new Map();
    this.enabled = true;

    this._onKeyDown = (e) => {
      if (!this.enabled) return;
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code) && this.locked) e.preventDefault();
      if (!this.keys.has(e.code)) this.emit('keydown', e.code);
      this.keys.add(e.code);
      if (e.code.startsWith('Digit')) this.emit('digit', Number(e.code.slice(5)));
    };
    this._onKeyUp = (e) => {
      this.keys.delete(e.code);
      this.emit('keyup', e.code);
    };
    this._onMouseMove = (e) => {
      // movementX/Y funciona aunque el navegador deniegue el pointer lock.
      if (!this.enabled || (!this.locked && !this.autoLock)) return;
      this.dx += e.movementX || 0;
      this.dy += e.movementY || 0;
    };
    this._onMouseDown = (e) => {
      if (!this.enabled) return;
      // El pointer lock debe pedirse dentro de un gesto del usuario.
      if (this.autoLock && !this.locked) this.requestLock();
      this.buttons.add(e.button);
      this.emit('mousedown', e.button);
    };
    this._onMouseUp = (e) => {
      this.buttons.delete(e.button);
      this.emit('mouseup', e.button);
    };
    this._onWheel = (e) => {
      if (!this.enabled || (!this.locked && !this.autoLock)) return;
      this.wheel += Math.sign(e.deltaY);
    };
    this._onLockChange = () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) {
        this.keys.clear();
        this.buttons.clear();
      }
      this.emit('lockchange', this.locked);
    };
    this._onContext = (e) => { if (this.locked) e.preventDefault(); };
    this._onBlur = () => { this.keys.clear(); this.buttons.clear(); };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    window.addEventListener('wheel', this._onWheel, { passive: true });
    window.addEventListener('blur', this._onBlur);
    document.addEventListener('pointerlockchange', this._onLockChange);
    canvas.addEventListener('contextmenu', this._onContext);
  }

  on(event, fn) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(fn);
    return () => this.listeners.get(event).delete(fn);
  }

  emit(event, payload) {
    const set = this.listeners.get(event);
    if (set) for (const fn of set) {
      try { fn(payload); } catch (error) { console.error(error); }
    }
  }

  requestLock() {
    if (!this.locked && this.canvas.requestPointerLock) {
      const result = this.canvas.requestPointerLock();
      if (result?.catch) result.catch(() => {});
    }
  }

  releaseLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  isDown(code) { return this.keys.has(code); }

  consumeMouse() {
    const out = { x: this.dx, y: this.dy, wheel: this.wheel };
    this.dx = 0;
    this.dy = 0;
    this.wheel = 0;
    return out;
  }

  clear() {
    this.keys.clear();
    this.buttons.clear();
    this.dx = 0;
    this.dy = 0;
    this.wheel = 0;
  }

  destroy() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mouseup', this._onMouseUp);
    window.removeEventListener('wheel', this._onWheel);
    window.removeEventListener('blur', this._onBlur);
    document.removeEventListener('pointerlockchange', this._onLockChange);
    this.canvas.removeEventListener('contextmenu', this._onContext);
  }
}
