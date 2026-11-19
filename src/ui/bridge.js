/** Puente entre los componentes React y el motor/controladores existentes. */
export const bridge = {
  app: null,
  ui: null,
  hud: null,
  settings: null,
  maps: null,
  audio: null,
  account: null,
  refs: {},
};

export const click = (fn) => (event) => {
  bridge.audio?.init?.();
  bridge.audio?.play?.('click');
  fn(event);
};

export const hover = () => bridge.audio?.play?.('hover');
