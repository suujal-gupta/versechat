import { useState } from 'react';
import { Avatar, Modal } from './ui.jsx';

/* Contact card with a PRIVATE nickname (only you see it, like Instagram). */
export function ContactModal({ user, nickname, online, onSave, onClose }) {
  const [val, setVal] = useState(nickname || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const save = async v => {
    setBusy(true); setErr('');
    try { await onSave(v); onClose(); } catch (e) { setErr(e.message); setBusy(false); }
  };
  return (
    <Modal title="Contact" onClose={onClose}>
      <div className="profile-top">
        <Avatar name={user.username} src={user.avatar} online={online} size={72} />
        <div className="grow">
          <strong>{nickname || user.username}</strong>
          {nickname && <small className="muted">@{user.username}</small>}
          <small className="muted">{user.bio || (online ? 'Online' : 'Offline')}</small>
        </div>
      </div>
      <label>Nickname
        <input
          value={val} maxLength={30} placeholder={user.username} autoFocus
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !busy && val.trim() !== (nickname || '') && save(val)}
        />
        <small className="muted">Only you can see this nickname.</small>
      </label>
      {err && <div className="error">{err}</div>}
      <div className="row gap">
        <button className="btn btn-primary" disabled={busy || val.trim() === (nickname || '')} onClick={() => save(val)}>Save</button>
        {nickname && <button className="btn btn-ghost" disabled={busy} onClick={() => save('')}>Remove nickname</button>}
      </div>
    </Modal>
  );
}

/* Group member list; tap a member to open their contact card (and set a nickname). */
export function GroupModal({ conv, me, nameOf, avatarOf, userMap, online, onPick, onClose }) {
  return (
    <Modal title={conv.name} onClose={onClose}>
      <small className="muted">{conv.members.length} members</small>
      <div className="pick-list">
        {conv.members.map(id => (
          <button key={id} className="conv" onClick={() => id !== me.id && onPick(id)} style={id === me.id ? { cursor: 'default' } : undefined}>
            <Avatar name={nameOf(id)} src={avatarOf(id)} online={online.has(id)} size={36} />
            <span className="conv-body">
              <strong>{id === me.id ? 'You' : nameOf(id)}</strong>
              {id !== me.id && nameOf(id) !== userMap[id]?.username && <small className="muted">@{userMap[id]?.username}</small>}
            </span>
          </button>
        ))}
      </div>
    </Modal>
  );
}
