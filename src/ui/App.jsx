import React from 'react';
import { useHud, useUi } from './store.js';
import { Hud } from './Hud.jsx';
import {
  MenuScreen, LobbyScreen, SettingsScreen, MapsScreen,
  CreditsScreen, PauseScreen, ResultsScreen, UpdateScreen,
  TiendaScreen, TaquillaScreen, BattlePassScreen, AccountScreen,
} from './screens.jsx';

const SCREENS = {
  menu: MenuScreen,
  lobby: LobbyScreen,
  settings: SettingsScreen,
  maps: MapsScreen,
  credits: CreditsScreen,
  pause: PauseScreen,
  results: ResultsScreen,
  update: UpdateScreen,
  tienda: TiendaScreen,
  taquilla: TaquillaScreen,
  battlepass: BattlePassScreen,
  account: AccountScreen,
};

function Loading({ loading }) {
  return (
    <div id="loading-screen" className={loading.visible ? '' : 'hidden'}>
      <img className="splash-art" src="./assets/opennite-splash.png" alt="" aria-hidden="true" draggable="false" />
      <div className="splash-vignette" />
      <div className="splash-content">
        <div className="splash-status">
          <span className="splash-kicker">OPENNITE</span>
          <span id="loader-text">{loading.text}</span>
        </div>
        <div className="splash-progress">
          <div className="splash-progress-track"><div id="loader-fill" style={{ width: `${loading.percent ?? 0}%` }} /></div>
          <span className="splash-percent">{Math.round(loading.percent ?? 0)}%</span>
        </div>
      </div>
    </div>
  );
}

function ToastStack() {
  const { toasts } = useHud();
  return (
    <div className="toast-stack" id="toast-stack">
      {toasts.map((t) => <div className={`toast ${t.type}`} key={t.id}>{t.text}</div>)}
    </div>
  );
}

export function App() {
  const { screen, props, loading } = useUi();
  const Screen = SCREENS[screen];
  return (
    <>
      {loading.mounted && <Loading loading={loading} />}
      {Screen && <Screen {...props} />}
      <Hud />
      <ToastStack />
    </>
  );
}
