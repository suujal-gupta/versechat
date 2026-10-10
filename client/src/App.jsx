import { useEffect, useState } from 'react';
import CursorGrid from './components/CursorGrid.jsx';
import Landing from './components/Landing.jsx';
import Auth from './components/Auth.jsx';
import Chat from './components/Chat.jsx';
import { api, getToken, setToken } from './api.js';

export default function App() {
  const [stage, setStage] = useState(getToken() ? 'loading' : 'landing');
  const [me, setMe] = useState(null);

  useEffect(() => {
    if (!getToken()) return;
    api.me().then(({ user }) => { setMe(user); setStage('chat'); })
      .catch(() => { setToken(null); setStage('landing'); });
  }, []);

  const signedIn = ({ token, user }) => { setToken(token); setMe(user); setStage('chat'); };
  const signOut = () => { setToken(null); setMe(null); setStage('landing'); };

  return (
    <>
      <div className="bg-grid" aria-hidden="true">
        <CursorGrid
          cellSize={64} color="#ffffff" radius={190} falloff="smooth"
          holdTime={450} fadeDuration={1100} lineWidth={1.1}
          maxOpacity={0.9} fillOpacity={0.035} gridOpacity={0.035}
          clickPulse pulseSpeed={650}
        />
      </div>
      <div className="app-layer">
        {stage === 'landing' && <Landing onEnter={() => setStage('auth')} />}
        {stage === 'auth' && <Auth onDone={signedIn} onBack={() => setStage('landing')} />}
        {stage === 'chat' && me && <Chat me={me} setMe={setMe} onSignOut={signOut} />}
        {stage === 'loading' && <div className="center-note">Reconnecting…</div>}
      </div>
    </>
  );
}
