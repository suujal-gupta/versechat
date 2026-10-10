import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { Avatar, fmtDur, friendlyMediaError, mediaSupport } from './ui.jsx';

async function getLocalStream() {
  const problem = mediaSupport();
  if (problem) throw new Error(problem);
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }
    });
  } catch (e) { throw new Error(friendlyMediaError(e)); }
}

/* One-to-one video calls. Socket.IO carries the signaling; audio/video go peer-to-peer over WebRTC.
   phase: calling → connecting → active   (caller)
          incoming → connecting → active  (callee)                                                   */
export function useCall({ sock, nameOf, flash }) {
  const [call, setCall] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const callRef = useRef(null);
  const pcRef = useRef(null);
  const localRef = useRef(null);
  const pending = useRef([]);
  const nameRef = useRef(nameOf);
  nameRef.current = nameOf;

  const update = useCallback(c => { callRef.current = c; setCall(c); }, []);

  const cleanup = useCallback(() => {
    if (pcRef.current) { pcRef.current.onconnectionstatechange = null; pcRef.current.close(); pcRef.current = null; }
    localRef.current?.getTracks().forEach(t => t.stop());
    localRef.current = null; pending.current = [];
    setLocalStream(null); setRemoteStream(null);
    update(null);
  }, [update]);

  const makePc = useCallback(async (convId, stream) => {
    let iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];
    try { iceServers = (await api.iceServers()).iceServers || iceServers; } catch { /* default STUN */ }
    const pc = new RTCPeerConnection({ iceServers });
    stream.getTracks().forEach(t => pc.addTrack(t, stream));
    pc.onicecandidate = e => e.candidate && sock.emit('call:signal', { convId, data: { candidate: e.candidate } });
    pc.ontrack = e => setRemoteStream(e.streams[0]);
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        const c = callRef.current;
        if (c && c.phase !== 'active') update({ ...c, phase: 'active', startedAt: Date.now() });
      } else if (pc.connectionState === 'failed') {
        flash('The call connection failed. Check that both devices are on a network that allows video calls.');
        sock.emit('call:end', { convId });
        cleanup();
      }
    };
    pcRef.current = pc;
    return pc;
  }, [sock, update, cleanup, flash]);

  /* ---- socket events ---- */
  useEffect(() => {
    if (!sock) return;

    const onIncoming = ({ convId, from, video }) => {
      if (callRef.current) return;
      update({ phase: 'incoming', convId, peerId: from, video, muted: false, camOff: false });
      if (document.visibilityState !== 'visible' && window.Notification?.permission === 'granted')
        new Notification('Incoming video call', { body: nameRef.current(from) + ' is calling you' });
    };

    const onAccepted = async ({ convId }) => {        // we are the caller
      const c = callRef.current;
      if (!c || c.convId !== convId || c.phase !== 'calling') return;
      update({ ...c, phase: 'connecting' });
      try {
        const pc = await makePc(convId, localRef.current);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sock.emit('call:signal', { convId, data: { sdp: pc.localDescription } });
      } catch { flash('Could not start the call.'); sock.emit('call:end', { convId }); cleanup(); }
    };

    const onSignal = async ({ convId, data }) => {
      const c = callRef.current, pc = pcRef.current;
      if (!c || c.convId !== convId || !pc || !data) return;
      try {
        if (data.sdp) {
          await pc.setRemoteDescription(data.sdp);
          for (const cand of pending.current.splice(0)) await pc.addIceCandidate(cand).catch(() => {});
          if (data.sdp.type === 'offer') {
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            sock.emit('call:signal', { convId, data: { sdp: pc.localDescription } });
          }
        } else if (data.candidate) {
          if (pc.remoteDescription) await pc.addIceCandidate(data.candidate).catch(() => {});
          else pending.current.push(data.candidate);
        }
      } catch { /* a bad signal should not crash the call */ }
    };

    const onEnded = ({ convId, reason }) => {
      const c = callRef.current;
      if (!c || c.convId !== convId) return;
      if (reason === 'declined' && c.phase === 'calling') flash(nameRef.current(c.peerId) + ' declined the call.');
      else if (reason === 'missed' && c.phase === 'calling') flash(nameRef.current(c.peerId) + ' did not answer.');
      cleanup();
    };

    const onDismiss = ({ convId }) => {                // answered on another device
      const c = callRef.current;
      if (c && c.convId === convId && c.phase === 'incoming') cleanup();
    };

    sock.on('call:incoming', onIncoming);
    sock.on('call:accepted', onAccepted);
    sock.on('call:signal', onSignal);
    sock.on('call:ended', onEnded);
    sock.on('call:dismiss', onDismiss);
    return () => {
      sock.off('call:incoming', onIncoming); sock.off('call:accepted', onAccepted); sock.off('call:signal', onSignal);
      sock.off('call:ended', onEnded); sock.off('call:dismiss', onDismiss);
    };
  }, [sock, update, makePc, cleanup, flash]);

  useEffect(() => () => {
    const c = callRef.current;
    if (c && sock) sock.emit('call:end', { convId: c.convId });
    cleanup();
    // eslint-disable-next-line
  }, []);

  /* ---- actions ---- */
  const start = async (convId, peerId) => {
    if (callRef.current || !sock) return;
    let stream;
    try { stream = await getLocalStream(); } catch (e) { return flash(e.message); }
    localRef.current = stream; setLocalStream(stream);
    update({ phase: 'calling', convId, peerId, video: true, muted: false, camOff: false });
    sock.emit('call:invite', { convId, video: true }, res => { if (res?.error) { flash(res.error); cleanup(); } });
  };

  const accept = async () => {
    const c = callRef.current;
    if (!c || c.phase !== 'incoming') return;
    let stream;
    try { stream = await getLocalStream(); }
    catch (e) { flash(e.message); sock.emit('call:reject', { convId: c.convId }); return cleanup(); }
    localRef.current = stream; setLocalStream(stream);
    update({ ...c, phase: 'connecting' });
    try { await makePc(c.convId, stream); } catch { flash('Could not start the call.'); sock.emit('call:reject', { convId: c.convId }); return cleanup(); }
    sock.emit('call:accept', { convId: c.convId });
  };

  const decline = () => { const c = callRef.current; if (c) sock.emit('call:reject', { convId: c.convId }); cleanup(); };
  const hangup = () => { const c = callRef.current; if (c) sock.emit('call:end', { convId: c.convId }); cleanup(); };

  const toggleMic = () => {
    const c = callRef.current; if (!c) return;
    localRef.current?.getAudioTracks().forEach(t => { t.enabled = c.muted; });
    update({ ...c, muted: !c.muted });
  };
  const toggleCam = () => {
    const c = callRef.current; if (!c) return;
    localRef.current?.getVideoTracks().forEach(t => { t.enabled = c.camOff; });
    update({ ...c, camOff: !c.camOff });
  };

  return { call, localStream, remoteStream, start, accept, decline, hangup, toggleMic, toggleCam };
}

/* soft repeating beep while ringing (best effort — browsers may block audio before any interaction) */
function useRing(on, incoming) {
  useEffect(() => {
    if (!on) return;
    let ctx;
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); ctx.resume?.(); } catch { return; }
    const beep = () => {
      const t = ctx.currentTime;
      [0, 0.28].forEach(off => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = incoming ? 880 : 480;
        o.connect(g); g.connect(ctx.destination);
        g.gain.setValueAtTime(0.0001, t + off);
        g.gain.exponentialRampToValueAtTime(0.12, t + off + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, t + off + 0.22);
        o.start(t + off); o.stop(t + off + 0.25);
      });
    };
    beep();
    const id = setInterval(beep, 2200);
    return () => { clearInterval(id); ctx.close?.(); };
  }, [on, incoming]);
}

function Stream({ stream, muted, mirror, className }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current && ref.current.srcObject !== (stream || null)) ref.current.srcObject = stream || null; }, [stream]);
  return <video ref={ref} className={className} autoPlay playsInline muted={muted} style={mirror ? { transform: 'scaleX(-1)' } : undefined} />;
}

function Timer({ since }) {
  const [, tick] = useState(0);
  useEffect(() => { const id = setInterval(() => tick(n => n + 1), 1000); return () => clearInterval(id); }, []);
  return <>{fmtDur(Math.max(0, Math.round((Date.now() - since) / 1000)))}</>;
}

export function CallUI({ state, nameOf, avatarOf }) {
  const { call, localStream, remoteStream, accept, decline, hangup, toggleMic, toggleCam } = state;
  useRing(call?.phase === 'incoming' || call?.phase === 'calling', call?.phase === 'incoming');
  if (!call) return null;
  const name = nameOf(call.peerId), avatar = avatarOf(call.peerId);

  if (call.phase === 'incoming') {
    return (
      <div className="scrim call-incoming" role="alertdialog" aria-label="Incoming video call">
        <div className="panel modal call-card">
          <Avatar name={name} src={avatar} size={88} />
          <h2>{name}</h2>
          <p className="muted">Incoming video call…</p>
          <div className="row gap">
            <button className="btn btn-ghost" onClick={decline}>Decline</button>
            <button className="btn btn-primary" onClick={accept}>Accept</button>
          </div>
        </div>
      </div>
    );
  }

  const status = call.phase === 'calling' ? 'Calling…' : call.phase === 'connecting' ? 'Connecting…' : null;
  return (
    <div className="call" role="dialog" aria-label="Video call">
      {/* one remote <video> only (it also plays the audio); hidden until the call is live */}
      {remoteStream && <Stream stream={remoteStream} className={`call-remote ${call.phase === 'active' ? '' : 'concealed'}`} />}
      {!(remoteStream && call.phase === 'active') && (
        <div className="call-wait"><Avatar name={name} src={avatar} size={110} /><h2>{name}</h2><p className="muted">{status}</p></div>
      )}
      <div className="call-top"><strong>{name}</strong>{call.phase === 'active' && <small className="muted"><Timer since={call.startedAt} /></small>}</div>
      <div className="call-pip">
        {call.camOff ? <div className="call-pip-off">Camera off</div> : <Stream stream={localStream} muted mirror />}
      </div>
      <div className="call-controls">
        <button className={`call-btn ${call.muted ? 'off' : ''}`} onClick={toggleMic} aria-label={call.muted ? 'Unmute' : 'Mute'} title={call.muted ? 'Unmute' : 'Mute'}>{call.muted ? '🔇' : '🎤'}</button>
        <button className={`call-btn ${call.camOff ? 'off' : ''}`} onClick={toggleCam} aria-label={call.camOff ? 'Turn camera on' : 'Turn camera off'} title={call.camOff ? 'Turn camera on' : 'Turn camera off'}>{call.camOff ? '🚫' : '📹'}</button>
        <button className="call-btn end" onClick={hangup} aria-label="End call" title="End call">✕</button>
      </div>
    </div>
  );
}
