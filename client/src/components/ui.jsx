import { useEffect, useState } from 'react';

export const fmtTime = t => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
export const fmtDay = t => {
  const d = new Date(t), today = new Date();
  if (d.toDateString() === today.toDateString()) return 'Today';
  const y = new Date(); y.setDate(today.getDate() - 1);
  return d.toDateString() === y.toDateString() ? 'Yesterday' : d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
};
export const fmtSize = n => (n > 1e6 ? (n / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1e3)) + ' KB');
export const fmtDur = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export const attLabel = a => (!a ? '' : a.kind === 'audio' ? 'Voice note' : a.kind === 'image' ? 'Photo' : a.name);
export const previewOf = m =>
  m.deleted ? 'Message deleted'
  : m.text || (m.attachment ? (m.attachment.kind === 'audio' ? '🎤 Voice note' : m.attachment.kind === 'image' ? '📷 Photo' : '📎 ' + m.attachment.name) : '');

/* Camera / microphone need a secure origin (https:// or localhost). Returns a friendly message, or null if OK. */
export function mediaSupport() {
  if (navigator.mediaDevices?.getUserMedia) return null;
  const { protocol, hostname } = window.location;
  if (protocol === 'http:' && !['localhost', '127.0.0.1'].includes(hostname))
    return 'Your browser blocks the camera and microphone on plain http. Open the https:// address printed in the server terminal (port 3443) and accept the one-time certificate warning.';
  return 'This browser does not support camera or microphone access.';
}
export function friendlyMediaError(e) {
  if (e?.name === 'NotAllowedError' || e?.name === 'SecurityError') return 'Permission was denied. Allow camera / microphone access in your browser settings and try again.';
  if (e?.name === 'NotFoundError' || e?.name === 'OverconstrainedError') return 'No camera or microphone was found on this device.';
  if (e?.name === 'NotReadableError') return 'The camera or microphone is being used by another app.';
  return e?.message || 'Could not access the camera or microphone.';
}

export function Avatar({ name = '?', src, online, size = 40 }) {
  const [bad, setBad] = useState(false);
  useEffect(() => setBad(false), [src]);
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {src && !bad ? <img src={src} alt="" onError={() => setBad(true)} /> : name[0]?.toUpperCase()}
      {online !== undefined && <i className={`dot ${online ? 'on' : ''}`} />}
    </span>
  );
}

export function Modal({ title, onClose, children, className = '' }) {
  useEffect(() => {
    const h = e => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="scrim" onClick={onClose}>
      <div className={`panel modal ${className}`} role="dialog" aria-label={title} onClick={e => e.stopPropagation()}>
        <header><h2>{title}</h2><button className="icon-btn" onClick={onClose} aria-label="Close">✕</button></header>
        {children}
      </div>
    </div>
  );
}

/* Full-size photo viewer — always shows the original upload, never a shrunk copy. */
export function Lightbox({ src, name, onClose }) {
  useEffect(() => {
    const h = e => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="scrim lightbox" onClick={onClose}>
      <img src={src} alt={name} onClick={e => e.stopPropagation()} />
      <div className="lightbox-bar" onClick={e => e.stopPropagation()}>
        <a className="btn btn-ghost" href={src} download={name}>Download original</a>
        <button className="btn btn-ghost" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
