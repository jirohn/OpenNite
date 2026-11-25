/**
 * Teclado y ratón virtuales para un bot.
 *
 * Tiene la misma forma que `Input` (isDown, keys, buttons), así que el bot
 * maneja un `Player` real exactamente igual que una persona: la IA solo decide
 * qué teclas pulsar y hacia dónde mover el ratón.
 */
export class VirtualInput {
  constructor() {
    this.keys = new Set();
    this.buttons = new Set();
    this.locked = true;
  }

  isDown(code) { return this.keys.has(code); }

  key(code, down) {
    if (down) this.keys.add(code);
    else this.keys.delete(code);
  }

  button(index, down) {
    if (down) this.buttons.add(index);
    else this.buttons.delete(index);
  }

  /** Suelta todas las teclas de movimiento (W A S D, correr, agacharse). */
  releaseMovement() {
    for (const k of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ControlLeft']) this.keys.delete(k);
  }

  clear() {
    this.keys.clear();
    this.buttons.clear();
  }

  consumeMouse() { return { x: 0, y: 0, wheel: 0 }; }
}
