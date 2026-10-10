import { useEffect, useRef, useState } from 'react';
import { Modal, fmtSize, friendlyMediaError, mediaSupport } from './ui.jsx';

/* In-app camera for desktops. Captures at the camera's full resolution (ImageCapture.takePhoto when available)
   and sends the untouched JPEG — no resizing or recompression beyond the camera's own. */
export default function CameraModal({ onSend, onClose }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [facing, setFacing] = useState('user');
  const [multi, setMulti] = useState(false);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState('');
  const [shot, setShot] = useState(null); // { blob, url }
  const [dims, setDims] = useState('');

  useEffect(() => {
    if (shot) return;
    let dead = false, stream;
    setReady(false); setErr('');
    (async () => {
      const problem = mediaSupport();
      if (problem) return setErr(problem);
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing, width: { ideal: 4096 }, height: { ideal: 2160 } }, audio: false
        });
        if (dead) return stream.getTracks().forEach(t => t.stop());
        streamRef.current = stream;
        const v = videoRef.current;
        if (v) { v.srcObject = stream; await v.play().catch(() => {}); }
        setReady(true);
        const devs = await navigator.mediaDevices.enumerateDevices();
        setMulti(devs.filter(d => d.kind === 'videoinput').length > 1);
      } catch (e) { setErr(friendlyMediaError(e)); }
    })();
    return () => { dead = true; (stream || streamRef.current)?.getTracks().forEach(t => t.stop()); streamRef.current = null; };
  }, [facing, shot]);

  useEffect(() => () => { if (shot) URL.revokeObjectURL(shot.url); }, [shot]);

  const snap = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    let blob = null;
    if (track && 'ImageCapture' in window) {
      try { blob = await new window.ImageCapture(track).takePhoto(); } catch { /* fall back to canvas */ }
    }
    if (!blob) {
      const v = videoRef.current;
      if (!v?.videoWidth) return;
      const c = document.createElement('canvas');
      c.width = v.videoWidth; c.height = v.videoHeight;
      c.getContext('2d').drawImage(v, 0, 0);
      blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.95));
    }
    if (blob) setShot({ blob, url: URL.createObjectURL(blob) });
  };

  const send = () => {
    const type = shot.blob.type || 'image/jpeg';
    const ext = type.includes('png') ? 'png' : 'jpg';
    onSend(new File([shot.blob], `photo-${Date.now()}.${ext}`, { type }));
  };

  return (
    <Modal title="Take a photo" onClose={onClose} className="cam">
      {err ? <div className="error">{err}</div> : shot ? (
        <>
          <img className="cam-view" src={shot.url} alt="Captured" onLoad={e => setDims(`${e.currentTarget.naturalWidth} × ${e.currentTarget.naturalHeight}`)} />
          <small className="muted center">Full quality · {dims} · {fmtSize(shot.blob.size)}</small>
          <div className="row gap cam-actions">
            <button className="btn btn-ghost" onClick={() => setShot(null)}>Retake</button>
            <button className="btn btn-primary" onClick={send}>Send photo</button>
          </div>
        </>
      ) : (
        <>
          <video ref={videoRef} className={`cam-view ${facing === 'user' ? 'mirror' : ''}`} playsInline muted autoPlay />
          <div className="row gap cam-actions">
            {multi && <button className="btn btn-ghost" onClick={() => setFacing(f => (f === 'user' ? 'environment' : 'user'))}>Flip camera</button>}
            <button className="btn btn-primary" disabled={!ready} onClick={snap}>{ready ? 'Capture' : 'Starting camera…'}</button>
          </div>
        </>
      )}
    </Modal>
  );
}
