import { useState } from 'react';
import { api } from '../api.js';

export default function Auth({ onDone, onBack }) {
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async e => {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      onDone(await (mode === 'login' ? api.login : api.register)(username, password));
    } catch (err) { setError(err.message); }
    setBusy(false);
  };

  return (
    <main className="auth-wrap">
      <form className="panel auth-card" onSubmit={submit}>
        <button type="button" className="link-btn" onClick={onBack}>← VERSECHAT</button>
        <h1>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
        <p className="muted">{mode === 'login' ? 'Sign in to pick up where you left off.' : 'Pick a username and a password. That is all.'}</p>

        <label>Username
          <input value={username} onChange={e => setUsername(e.target.value)} autoFocus autoComplete="username" required />
        </label>
        <label>Password
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required />
        </label>

        {error && <div className="error" role="alert">{error}</div>}
        <button className="btn btn-primary" disabled={busy}>{busy ? 'One moment…' : mode === 'login' ? 'Sign in' : 'Create account'}</button>

        <p className="muted switch">
          {mode === 'login' ? 'New here?' : 'Already have an account?'}{' '}
          <button type="button" className="link-btn" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>
            {mode === 'login' ? 'Create an account' : 'Sign in'}
          </button>
        </p>
      </form>
    </main>
  );
}
