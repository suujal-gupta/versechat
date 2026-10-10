import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import { Avatar, Modal } from './ui.jsx';

const SIZE = 260; // crop stage in CSS px
const OUT = 384;  // saved picture size in px

/* Drag to reposition, slider to zoom. Saves a square JPEG; the circle is just how it is displayed. */
function Cropper({ file, onCancel, onDone }) {
  const [img, setImg] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [off, setOff] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const canvas = useRef(null);
  const drag = useRef(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const i = new Image();
    i.onload = () => setImg(i);
    i.onerror = () => setErr('That image could not be opened. Try a JPG or PNG.');
    i.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const dims = useMemo(() => {
    if (!img) return null;
    const base = SIZE / Math.min(img.naturalWidth, img.naturalHeight); // "cover" scale
    return { w: img.naturalWidth * base * zoom, h: img.naturalHeight * base * zoom };
  }, [img, zoom]);

  const clamp = (o, d) => ({
    x: Math.max(-(d.w - SIZE) / 2, Math.min((d.w - SIZE) / 2, o.x)),
    y: Math.max(-(d.h - SIZE) / 2, Math.min((d.h - SIZE) / 2, o.y))
  });
  const pos = dims ? clamp(off, dims) : off;

  useEffect(() => {
    const c = canvas.current;
    if (!c || !dims) return;
    const ctx = c.getContext('2d');
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.drawImage(img, SIZE / 2 + pos.x - dims.w / 2, SIZE / 2 + pos.y - dims.h / 2, dims.w, dims.h);
  }, [img, dims, pos.x, pos.y]);

  const save = async () => {
    setBusy(true); setErr('');
    const k = OUT / SIZE;
    const c = document.createElement('canvas'); c.width = c.height = OUT;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, OUT, OUT);
    ctx.drawImage(img, (SIZE / 2 + pos.x - dims.w / 2) * k, (SIZE / 2 + pos.y - dims.h / 2) * k, dims.w * k, dims.h * k);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9));
    try { await onDone(blob); } catch (e) { setErr(e.message); setBusy(false); }
  };

  return (
    <>
      <div
        className="crop-stage"
        onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY }; }}
        onPointerMove={e => {
          if (!drag.current || !dims) return;
          const dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y;
          drag.current = { x: e.clientX, y: e.clientY };
          setOff(o => clamp({ x: o.x + dx, y: o.y + dy }, dims));
        }}
        onPointerUp={() => { drag.current = null; }}
        onPointerCancel={() => { drag.current = null; }}
      >
        <canvas ref={canvas} width={SIZE * 2} height={SIZE * 2} />
      </div>
      <label>Zoom
        <input type="range" min="1" max="4" step="0.01" value={zoom} onChange={e => setZoom(+e.target.value)} />
      </label>
      <small className="muted center">Drag the photo to reposition it.</small>
      {err && <div className="error">{err}</div>}
      <div className="row gap cam-actions">
        <button className="btn btn-ghost" onClick={onCancel} disabled={busy}>Back</button>
        <button className="btn btn-primary" onClick={save} disabled={!img || busy}>{busy ? 'Saving…' : 'Use this photo'}</button>
      </div>
    </>
  );
}

export default function Profile({ me, setMe, onClose }) {
  const [bio, setBio] = useState(me.bio || '');
  const [picked, setPicked] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const saveBio = async () => {
    setBusy(true); setErr('');
    try { const r = await api.updateBio(bio); setMe(r.user); onClose(); }
    catch (e) { setErr(e.message); setBusy(false); }
  };
  const removePhoto = async () => {
    setErr('');
    try { const r = await api.removeAvatar(); setMe(r.user); } catch (e) { setErr(e.message); }
  };

  if (picked) {
    return (
      <Modal title="Edit profile picture" onClose={() => setPicked(null)}>
        <Cropper
          file={picked}
          onCancel={() => setPicked(null)}
          onDone={async blob => { const r = await api.setAvatar(blob); setMe(r.user); setPicked(null); }}
        />
      </Modal>
    );
  }

  return (
    <Modal title="Your profile" onClose={onClose}>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => { const f = e.target.files[0]; e.target.value = ''; if (f) setPicked(f); }} />
      <div className="profile-top">
        <Avatar name={me.username} src={me.avatar} size={72} />
        <div className="grow">
          <strong>{me.username}</strong>
          <div className="row gap wrap-row">
            <button className="btn btn-ghost small-btn" onClick={() => fileRef.current.click()}>{me.avatar ? 'Change photo' : 'Add photo'}</button>
            {me.avatar && <button className="btn btn-ghost small-btn" onClick={removePhoto}>Remove</button>}
          </div>
        </div>
      </div>
      <label>Status
        <input value={bio} maxLength={140} placeholder="What are you up to?" onChange={e => setBio(e.target.value)} />
      </label>
      {err && <div className="error">{err}</div>}
      <button className="btn btn-primary" onClick={saveBio} disabled={busy}>Save</button>
    </Modal>
  );
}
