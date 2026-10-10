import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { api, getToken } from '../api.js';
import { Avatar, Modal, Lightbox, fmtTime, fmtDay, fmtSize, attLabel, previewOf, mediaSupport } from './ui.jsx';
import { VoiceRecorder, VoicePlayer } from './Voice.jsx';
import CameraModal from './Camera.jsx';
import SummaryModal from './Summary.jsx';
import Profile from './Profile.jsx';
import { ContactModal, GroupModal } from './Contact.jsx';
import { useCall, CallUI } from './Call.jsx';

const EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];
const PICKER = ['😀','😂','🥹','😍','😎','🤔','🙌','👏','🔥','✨','💯','🎉','👀','🙏','😴','🤝'];

export default function Chat({ me, setMe, onSignOut }) {
  const [users, setUsers] = useState([]);
  const [convs, setConvs] = useState([]);
  const [messages, setMessages] = useState({});      // convId -> message[]
  const [activeId, setActiveId] = useState(null);
  const [online, setOnline] = useState(new Set());
  const [typing, setTyping] = useState({});          // convId -> {userId: true}
  const [panel, setPanel] = useState(null);          // 'new' | 'group' | 'profile' | null
  const [info, setInfo] = useState(null);            // { type: 'contact', userId } | { type: 'group', convId }
  const [filter, setFilter] = useState('');
  const [connected, setConnected] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [socket, setSocket] = useState(null);
  const [toast, setToast] = useState('');

  const sock = useRef(null);
  const activeRef = useRef(null);
  const typingTimers = useRef({});
  const toastTimer = useRef(null);
  activeRef.current = activeId;

  const flash = useCallback(msg => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 5000);
  }, []);

  const userMap = useMemo(() => Object.fromEntries(users.map(u => [u.id, u])), [users]);
  // Private nicknames (set by me, visible only to me) win over usernames everywhere.
  const nameOf = id => me.nicknames?.[id] || userMap[id]?.username || (id === me.id ? me.username : 'Unknown');
  const avatarOf = id => (id === me.id ? me.avatar : userMap[id]?.avatar) || '';
  const otherId = c => c.members.find(m => m !== me.id);
  const convName = c => (c.type === 'group' ? c.name : nameOf(otherId(c)));
  const active = convs.find(c => c.id === activeId);

  const callState = useCall({ sock: socket, nameOf, flash });

  /* ---- initial load + socket ---- */
  useEffect(() => {
    api.users().then(r => setUsers(r.users));
    api.conversations().then(r => setConvs(r.conversations));

    const s = io({ auth: { token: getToken() } });
    sock.current = s;
    setSocket(s);
    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));
    s.on('connect_error', e => e.message === 'unauthorized' && onSignOut());
    s.on('presence', ({ online }) => setOnline(new Set(online)));
    s.on('user:new', u => setUsers(p => (p.some(x => x.id === u.id) ? p : [...p, u])));
    s.on('user:update', u => setUsers(p => p.map(x => (x.id === u.id ? u : x))));
    s.on('nicknames:update', nicknames => setMe(m => ({ ...m, nicknames })));
    s.on('conversation:new', c => setConvs(p => (p.some(x => x.id === c.id) ? p : [c, ...p])));

    s.on('message:new', m => {
      const isActive = activeRef.current === m.convId && document.visibilityState === 'visible';
      setMessages(p => (p[m.convId] ? { ...p, [m.convId]: [...p[m.convId], m] } : p));
      setConvs(p => p.map(c => c.id === m.convId
        ? { ...c, last: m, unread: m.senderId !== me.id && !isActive ? c.unread + 1 : c.unread } : c));
      if (m.senderId !== me.id) {
        if (isActive) s.emit('read', { convId: m.convId });
        else if (window.Notification?.permission === 'granted')
          new Notification('New message', { body: previewOf(m) || 'Sent an attachment' });
      }
    });
    s.on('message:update', m => {
      setMessages(p => p[m.convId] ? { ...p, [m.convId]: p[m.convId].map(x => (x.id === m.id ? m : x)) } : p);
      setConvs(p => p.map(c => (c.last?.id === m.id ? { ...c, last: m } : c)));
    });
    s.on('read', ({ convId, userId }) =>
      setMessages(p => p[convId] ? { ...p, [convId]: p[convId].map(m => (m.readBy.includes(userId) ? m : { ...m, readBy: [...m.readBy, userId] })) } : p));
    s.on('typing', ({ convId, userId, isTyping }) => {
      const key = convId + userId;
      clearTimeout(typingTimers.current[key]);
      setTyping(p => ({ ...p, [convId]: { ...p[convId], [userId]: isTyping } }));
      if (isTyping) typingTimers.current[key] = setTimeout(() =>
        setTyping(p => ({ ...p, [convId]: { ...p[convId], [userId]: false } })), 4000);
    });

    return () => s.disconnect();
    // eslint-disable-next-line
  }, []);

  /* ---- unread count in tab title ---- */
  useEffect(() => {
    const n = convs.reduce((a, c) => a + c.unread, 0);
    document.title = n ? `(${n}) VERSECHAT` : 'VERSECHAT';
  }, [convs]);

  /* ---- open a conversation ---- */
  const openConv = useCallback(async id => {
    setActiveId(id); setPanel(null); setSidebarOpen(false);
    if (!messages[id]) {
      const r = await api.messages(id);
      setMessages(p => ({ ...p, [id]: r.messages }));
    }
    sock.current?.emit('read', { convId: id });
    setConvs(p => p.map(c => (c.id === id ? { ...c, unread: 0 } : c)));
    if (window.Notification?.permission === 'default') Notification.requestPermission();
  }, [messages]);

  const startDm = async userId => {
    const { conversation } = await api.openDm(userId);
    setConvs(p => (p.some(c => c.id === conversation.id) ? p : [conversation, ...p]));
    openConv(conversation.id);
  };

  const makeGroup = async (name, members) => {
    const { conversation } = await api.createGroup(name, members);
    setConvs(p => (p.some(c => c.id === conversation.id) ? p : [conversation, ...p]));
    openConv(conversation.id);
  };

  const saveNickname = async (userId, nickname) => {
    const r = await api.setNickname(userId, nickname);
    setMe(m => ({ ...m, nicknames: r.nicknames }));
  };

  const q = filter.toLowerCase();
  const sorted = [...convs]
    .filter(c => convName(c).toLowerCase().includes(q) || (c.type === 'dm' && (userMap[otherId(c)]?.username || '').toLowerCase().includes(q)))
    .sort((a, b) => (b.last?.createdAt || b.createdAt) - (a.last?.createdAt || a.createdAt));

  const infoConv = info?.type === 'group' ? convs.find(c => c.id === info.convId) : null;

  return (
    <div className={`chat-shell ${sidebarOpen ? 'show-side' : ''}`}>
      {/* ---------- sidebar ---------- */}
      <aside className="panel side">
        <header className="side-head">
          <button className="me" onClick={() => setPanel('profile')} title="Your profile">
            <Avatar name={me.username} src={me.avatar} online={connected} size={36} />
            <span><strong>{me.username}</strong><small>{connected ? 'Connected' : 'Reconnecting…'}</small></span>
          </button>
          <div className="row gap">
            <button className="icon-btn" title="New chat" onClick={() => setPanel('new')}>＋</button>
            <button className="icon-btn" title="New group" onClick={() => setPanel('group')}>👥</button>
          </div>
        </header>

        <input className="search" placeholder="Search chats" value={filter} onChange={e => setFilter(e.target.value)} />

        <div className="conv-list">
          {sorted.length === 0 && (
            <div className="empty small">
              <p>No chats yet.</p>
              <button className="btn btn-ghost" onClick={() => setPanel('new')}>Start your first chat</button>
            </div>
          )}
          {sorted.map(c => {
            const isTyping = Object.entries(typing[c.id] || {}).some(([, v]) => v);
            return (
              <button key={c.id} className={`conv ${c.id === activeId ? 'active' : ''}`} onClick={() => openConv(c.id)}>
                <Avatar name={convName(c)} src={c.type === 'dm' ? avatarOf(otherId(c)) : ''} online={c.type === 'dm' ? online.has(otherId(c)) : undefined} />
                <span className="conv-body">
                  <span className="conv-top">
                    <strong>{convName(c)}</strong>
                    {c.last && <small>{fmtTime(c.last.createdAt)}</small>}
                  </span>
                  <span className="conv-bottom">
                    <span className="preview">
                      {isTyping ? 'typing…' : c.last
                        ? (c.last.deleted ? 'Message deleted' : (c.last.senderId === me.id ? 'You: ' : c.type === 'group' && !c.last.call ? nameOf(c.last.senderId) + ': ' : '') + previewOf(c.last))
                        : 'Say hello'}
                    </span>
                    {c.unread > 0 && <b className="badge">{c.unread}</b>}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <footer className="side-foot">
          <button className="btn btn-ghost" onClick={onSignOut}>Sign out</button>
        </footer>
      </aside>

      {/* ---------- main ---------- */}
      <section className="panel main">
        {active ? (
          <Thread
            key={active.id}
            conv={active} me={me} name={convName(active)} nameOf={nameOf} avatarOf={avatarOf} userMap={userMap} online={online}
            otherId={otherId(active)}
            list={messages[active.id]}
            typers={Object.entries(typing[active.id] || {}).filter(([, v]) => v).map(([id]) => nameOf(id))}
            sock={socket}
            onBack={() => setSidebarOpen(true)}
            onInfo={() => setInfo(active.type === 'dm' ? { type: 'contact', userId: otherId(active) } : { type: 'group', convId: active.id })}
            onCall={() => callState.start(active.id, otherId(active))}
            callBusy={!!callState.call}
          />
        ) : (
          <div className="empty">
            <h2>Pick a conversation</h2>
            <p className="muted">Choose a chat on the left, or find someone new to talk to.</p>
            <button className="btn btn-primary" onClick={() => setPanel('new')}>Find people</button>
            <button className="link-btn only-mobile" onClick={() => setSidebarOpen(true)}>Open chats</button>
          </div>
        )}
      </section>

      {panel === 'new' && <NewChat users={users.filter(u => u.id !== me.id)} online={online} nameOf={nameOf} onPick={startDm} onClose={() => setPanel(null)} />}
      {panel === 'group' && <NewGroup users={users.filter(u => u.id !== me.id)} nameOf={nameOf} onCreate={makeGroup} onClose={() => setPanel(null)} />}
      {panel === 'profile' && <Profile me={me} setMe={setMe} onClose={() => setPanel(null)} />}

      {info?.type === 'contact' && userMap[info.userId] && (
        <ContactModal
          user={userMap[info.userId]} nickname={me.nicknames?.[info.userId]} online={online.has(info.userId)}
          onSave={nick => saveNickname(info.userId, nick)} onClose={() => setInfo(null)}
        />
      )}
      {infoConv && (
        <GroupModal
          conv={infoConv} me={me} nameOf={nameOf} avatarOf={avatarOf} userMap={userMap} online={online}
          onPick={userId => setInfo({ type: 'contact', userId })} onClose={() => setInfo(null)}
        />
      )}

      <CallUI state={callState} nameOf={nameOf} avatarOf={avatarOf} />
      {toast && <div className="toast" role="status" onClick={() => setToast('')}>{toast}</div>}
    </div>
  );
}

/* =================== Thread =================== */
function Thread({ conv, me, name, nameOf, avatarOf, userMap, online, otherId, list, typers, sock, onBack, onInfo, onCall, callBusy }) {
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [camOpen, setCamOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [err, setErr] = useState('');
  const endRef = useRef(null);
  const fileRef = useRef(null);
  const camRef = useRef(null);
  const typingOff = useRef(null);
  const isTypingRef = useRef(false);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [list?.length, typers.length]);

  const stopTyping = () => { if (isTypingRef.current) { sock.emit('typing', { convId: conv.id, isTyping: false }); isTypingRef.current = false; } };
  const onType = v => {
    setText(v);
    if (!isTypingRef.current) { sock.emit('typing', { convId: conv.id, isTyping: true }); isTypingRef.current = true; }
    clearTimeout(typingOff.current);
    typingOff.current = setTimeout(stopTyping, 1500);
  };

  // caption=false: send the attachment on its own and leave whatever is typed in the box (used for voice notes)
  const send = (attachment = null, { caption = true } = {}) => {
    const value = caption ? text.trim() : '';
    if (!value && !attachment) return;
    if (editing && !attachment) {
      sock.emit('message:edit', { id: editing.id, text: value });
      setEditing(null); setText(''); return;
    }
    sock.emit('message:send', { convId: conv.id, text: value, attachment, replyTo: replyTo?.id }, res => res?.error && setErr(res.error));
    if (caption) setText('');
    setReplyTo(null); stopTyping();
  };

  const uploadAndSend = async (file, extraHeaders, opts) => {
    setUploading(true); setErr('');
    try { send((await api.upload(file, extraHeaders)).attachment, opts); }
    catch (er) { setErr(er.message); }
    setUploading(false);
  };

  const onFile = e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (file) uploadAndSend(file);
  };

  // Phones: open the native camera app (full-resolution original, no resizing). Desktops: in-app camera.
  const openCamera = () => {
    if (window.matchMedia?.('(pointer: coarse)').matches) camRef.current.click();
    else setCamOpen(true);
  };

  const startRecording = () => {
    const problem = mediaSupport();
    if (problem) return setErr(problem);
    setErr(''); setRecording(true);
  };

  const visible = (list || []).filter(m => !search || m.text.toLowerCase().includes(search.toLowerCase()));
  const others = conv.members.filter(m => m !== me.id);
  const seen = m => others.every(o => m.readBy.includes(o));
  const other = userMap[otherId];
  const nicked = conv.type === 'dm' && other && name !== other.username;
  const subtitle = typers.length ? `${typers.join(', ')} typing…`
    : conv.type === 'group' ? conv.members.map(id => (id === me.id ? 'You' : nameOf(id))).join(', ')
    : [nicked && '@' + other.username, online.has(otherId) ? 'Online' : other?.bio || 'Offline'].filter(Boolean).join(' · ');

  let lastDay = '';
  return (
    <>
      <header className="thread-head">
        <button className="icon-btn only-mobile" onClick={onBack} aria-label="Back to chats">←</button>
        <button className="head-id" onClick={onInfo} title={conv.type === 'dm' ? 'View profile & set nickname' : 'Group members'}>
          <Avatar name={name} src={conv.type === 'dm' ? avatarOf(otherId) : ''} online={conv.type === 'dm' ? online.has(otherId) : undefined} />
          <div className="grow">
            <strong>{name}</strong>
            <small className="muted">{subtitle}</small>
          </div>
        </button>
        <button className="icon-btn" title="Summarize this chat" aria-label="Summarize this chat" onClick={() => setSummaryOpen(true)}>✨</button>
        {conv.type === 'dm' && (
          <button className="icon-btn" title="Video call" aria-label="Start video call" onClick={onCall} disabled={callBusy}>📹</button>
        )}
        <button className="icon-btn" title="Search messages" onClick={() => { setShowSearch(s => !s); setSearch(''); }}>🔍</button>
      </header>
      {showSearch && <input className="search in-thread" autoFocus placeholder="Search in this chat" value={search} onChange={e => setSearch(e.target.value)} />}

      <div className="messages" onClick={() => setEmojiOpen(false)}>
        {!list && <p className="muted center">Loading…</p>}
        {list && list.length === 0 && <div className="empty small"><p>No messages yet. Say hello to {name}.</p></div>}
        {visible.map(m => {
          const day = fmtDay(m.createdAt);
          const sep = day !== lastDay; lastDay = day;
          return (
            <div key={m.id}>
              {sep && <div className="day-sep"><span>{day}</span></div>}
              {m.call ? (
                <div className="call-log"><span>{m.text} · {fmtTime(m.createdAt)}</span></div>
              ) : (
                <Bubble
                  m={m} mine={m.senderId === me.id} group={conv.type === 'group'}
                  nameOf={nameOf} seen={seen(m)} meId={me.id} query={search}
                  onReply={() => { setReplyTo(m); setEditing(null); }}
                  onEdit={() => { setEditing(m); setText(m.text); setReplyTo(null); }}
                  onDelete={() => sock.emit('message:delete', { id: m.id })}
                  onReact={emoji => sock.emit('message:react', { id: m.id, emoji })}
                />
              )}
            </div>
          );
        })}
        {typers.length > 0 && <div className="typing-bubble"><i /><i /><i /></div>}
        <div ref={endRef} />
      </div>

      {err && <div className="error bar" role="alert" onClick={() => setErr('')}>{err}</div>}
      {(replyTo || editing) && (
        <div className="context-bar">
          <span>{editing ? 'Editing message' : `Replying to ${nameOf(replyTo.senderId)}: ${(replyTo.text || attLabel(replyTo.attachment)).slice(0, 60)}`}</span>
          <button className="link-btn" onClick={() => { setReplyTo(null); setEditing(null); setText(''); }}>Cancel</button>
        </div>
      )}

      {recording ? (
        <VoiceRecorder
          onCancel={() => setRecording(false)}
          onError={msg => { setRecording(false); setErr(msg); }}
          onDone={(file, secs) => {
            setRecording(false);
            uploadAndSend(file, { 'x-kind': 'voice', 'x-duration': String(secs) }, { caption: false });
          }}
        />
      ) : (
        <form className="composer" onSubmit={e => { e.preventDefault(); send(); }}>
          <input ref={fileRef} type="file" hidden onChange={onFile} />
          <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={onFile} />
          <button type="button" className="icon-btn" title="Attach image or file" onClick={() => fileRef.current.click()} disabled={uploading}>{uploading ? '…' : '📎'}</button>
          <button type="button" className="icon-btn" title="Take a photo (full quality)" aria-label="Open camera" onClick={openCamera} disabled={uploading}>📷</button>
          <div className="emoji-wrap">
            <button type="button" className="icon-btn" title="Emoji" onClick={() => setEmojiOpen(o => !o)}>🙂</button>
            {emojiOpen && <div className="emoji-pop">{PICKER.map(e => <button type="button" key={e} onClick={() => { setText(t => t + e); }}>{e}</button>)}</div>}
          </div>
          <textarea
            rows={1} value={text} placeholder="Write a message" maxLength={4000}
            onChange={e => onType(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          />
          {text.trim() || editing
            ? <button className="btn btn-primary send" disabled={!text.trim()}>{editing ? 'Save' : 'Send'}</button>
            : <button type="button" className="btn btn-primary send mic" title="Record a voice note" aria-label="Record a voice note" onClick={startRecording} disabled={uploading}>🎤</button>}
        </form>
      )}

      {camOpen && <CameraModal onClose={() => setCamOpen(false)} onSend={file => { setCamOpen(false); uploadAndSend(file); }} />}
      {summaryOpen && <SummaryModal convId={conv.id} onClose={() => setSummaryOpen(false)} />}
    </>
  );
}

/* =================== Bubble =================== */
function Highlight({ text, query }) {
  if (!query) return text;
  const i = text.toLowerCase().indexOf(query.toLowerCase());
  if (i < 0) return text;
  return <>{text.slice(0, i)}<mark>{text.slice(i, i + query.length)}</mark>{text.slice(i + query.length)}</>;
}

function Bubble({ m, mine, group, nameOf, seen, meId, query, onReply, onEdit, onDelete, onReact }) {
  const [menu, setMenu] = useState(false);
  const [zoom, setZoom] = useState(false);
  const reactions = Object.entries(m.reactions || {});
  return (
    <div className={`msg ${mine ? 'mine' : 'theirs'}`}>
      <div className="bubble-wrap">
        <div className={`bubble ${m.deleted ? 'deleted' : ''}`}>
          {group && !mine && <b className="sender">{nameOf(m.senderId)}</b>}
          {m.replyTo && !m.deleted && (
            <div className="quote"><b>{nameOf(m.replyTo.senderId)}</b><span>{m.replyTo.text}</span></div>
          )}
          {m.deleted ? <em>This message was deleted</em> : (
            <>
              {m.attachment?.kind === 'image' && (
                <button type="button" className="img-btn" onClick={() => setZoom(true)} aria-label="View full-size photo">
                  <img src={m.attachment.url} alt={m.attachment.name} loading="lazy" />
                </button>
              )}
              {m.attachment?.kind === 'audio' && <VoicePlayer src={m.attachment.url} duration={m.attachment.duration} />}
              {m.attachment?.kind === 'file' && (
                <a className="file-chip" href={m.attachment.url} download={m.attachment.name}>
                  <span>📄</span><span><b>{m.attachment.name}</b><small>{fmtSize(m.attachment.size)}</small></span>
                </a>
              )}
              {m.text && <p><Highlight text={m.text} query={query} /></p>}
            </>
          )}
          <span className="meta">
            {m.editedAt && !m.deleted && 'edited · '}{fmtTime(m.createdAt)}
            {mine && !m.deleted && <span className={`ticks ${seen ? 'seen' : ''}`} title={seen ? 'Seen' : 'Delivered'}>{seen ? '✓✓' : '✓'}</span>}
          </span>
        </div>

        {!m.deleted && (
          <div className="actions">
            {EMOJIS.slice(0, 3).map(e => <button key={e} onClick={() => onReact(e)}>{e}</button>)}
            <button onClick={() => setMenu(v => !v)} aria-label="More">⋯</button>
            {menu && (
              <div className="menu" onMouseLeave={() => setMenu(false)}>
                <div className="menu-emojis">{EMOJIS.map(e => <button key={e} onClick={() => { onReact(e); setMenu(false); }}>{e}</button>)}</div>
                <button onClick={() => { onReply(); setMenu(false); }}>Reply</button>
                {mine && m.text && <button onClick={() => { onEdit(); setMenu(false); }}>Edit</button>}
                {m.text && <button onClick={() => { navigator.clipboard?.writeText(m.text); setMenu(false); }}>Copy</button>}
                {mine && <button className="danger" onClick={() => { onDelete(); setMenu(false); }}>Delete</button>}
              </div>
            )}
          </div>
        )}
      </div>
      {reactions.length > 0 && (
        <div className="reactions">
          {reactions.map(([e, ids]) => (
            <button key={e} className={ids.includes(meId) ? 'mine' : ''} onClick={() => onReact(e)} title={ids.map(i => nameOf(i)).join(', ')}>{e} {ids.length}</button>
          ))}
        </div>
      )}
      {zoom && <Lightbox src={m.attachment.url} name={m.attachment.name} onClose={() => setZoom(false)} />}
    </div>
  );
}

/* =================== Modals =================== */
function NewChat({ users, online, nameOf, onPick, onClose }) {
  const [q, setQ] = useState('');
  const list = users.filter(u => (u.username + ' ' + nameOf(u.id)).toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => online.has(b.id) - online.has(a.id));
  return (
    <Modal title="Start a chat" onClose={onClose}>
      <input className="search" autoFocus placeholder="Search people" value={q} onChange={e => setQ(e.target.value)} />
      <div className="pick-list">
        {list.length === 0 && <p className="muted center">{users.length ? 'No one matches that name.' : 'No one else has joined yet. Ask a friend to open this site and sign up.'}</p>}
        {list.map(u => (
          <button key={u.id} className="conv" onClick={() => onPick(u.id)}>
            <Avatar name={nameOf(u.id)} src={u.avatar} online={online.has(u.id)} />
            <span className="conv-body">
              <strong>{nameOf(u.id)}{nameOf(u.id) !== u.username && <small className="muted"> @{u.username}</small>}</strong>
              <small className="muted">{u.bio || (online.has(u.id) ? 'Online' : 'Offline')}</small>
            </span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

function NewGroup({ users, nameOf, onCreate, onClose }) {
  const [name, setName] = useState('');
  const [sel, setSel] = useState([]);
  const [err, setErr] = useState('');
  const toggle = id => setSel(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id]));
  return (
    <Modal title="Create a group" onClose={onClose}>
      <input className="search" autoFocus placeholder="Group name" value={name} onChange={e => setName(e.target.value)} maxLength={40} />
      <div className="pick-list">
        {users.map(u => (
          <label key={u.id} className="conv check">
            <input type="checkbox" checked={sel.includes(u.id)} onChange={() => toggle(u.id)} />
            <Avatar name={nameOf(u.id)} src={u.avatar} size={32} /><strong>{nameOf(u.id)}</strong>
          </label>
        ))}
        {users.length === 0 && <p className="muted center">No one to add yet.</p>}
      </div>
      {err && <div className="error">{err}</div>}
      <button className="btn btn-primary" disabled={!name.trim() || sel.length < 2}
        onClick={() => onCreate(name, sel).catch(e => setErr(e.message))}>
        {sel.length < 2 ? 'Pick at least 2 people' : `Create group with ${sel.length} people`}
      </button>
    </Modal>
  );
}
