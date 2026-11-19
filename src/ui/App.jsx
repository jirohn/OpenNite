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
      <div className="loader-logo">
        <span className="loader-o">O</span><span className="loader-gun">▰</span>
      </div>
      <div className="loader-title">OPENNITE</div>
      <div className="loader-bar"><div id="loader-fill" style={{ width: `${loading.percent}%` }} /></div>
      <div id="loader-text">{loading.text}</div>
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
