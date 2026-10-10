import { useEffect, useMemo, useRef, useState } from 'react';
import { fmtDur, friendlyMediaError, mediaSupport } from './ui.jsx';

const extFor = type => (type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'weba');
const MAX_SECS = 300;

/* Records from the microphone as soon as it mounts. Shows a timer; cancel discards, send hands back a File. */
export function VoiceRecorder({ onDone, onCancel, onError }) {
  const [secs, setSecs] = useState(0);
  const stopRef = useRef(() => {});

  useEffect(() => {
    let dead = false, discard = false, timer, recorder, stream, startedAt = 0;
    stopRef.current = send => {
      discard = !send;
      if (recorder && recorder.state !== 'inactive') recorder.stop();
      else stream?.getTracks().forEach(t => t.stop());
    };

    (async () => {
      const problem = mediaSupport();
      if (problem) return onError(problem);
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        if (dead) return stream.getTracks().forEach(t => t.stop());
        const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']
          .find(t => window.MediaRecorder?.isTypeSupported?.(t));
        recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
        const chunks = [];
        recorder.ondataavailable = e => e.data.size && chunks.push(e.data);
        recorder.onstop = () => {
          stream.getTracks().forEach(t => t.stop());
          clearInterval(timer);
          if (discard) return;
          const type = recorder.mimeType || mime || 'audio/webm';
          const seconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
          onDone(new File([new Blob(chunks, { type })], `voice-note.${extFor(type)}`, { type }), seconds);
        };
        recorder.start();
        startedAt = Date.now();
        timer = setInterval(() => {
          const s = Math.floor((Date.now() - startedAt) / 1000);
          setSecs(s);
          if (s >= MAX_SECS) stopRef.current(true);
        }, 250);
      } catch (e) { onError(friendlyMediaError(e)); }
    })();

    return () => {
      dead = true; discard = true; clearInterval(timer);
      if (recorder && recorder.state !== 'inactive') recorder.stop();
      else stream?.getTracks().forEach(t => t.stop());
    };
    // eslint-disable-next-line
  }, []);

  return (
    <div className="composer recording">
      <button type="button" className="icon-btn" title="Discard" aria-label="Discard recording" onClick={() => { stopRef.current(false); onCancel(); }}>🗑</button>
      <div className="rec-live"><i className="rec-dot" /><span>Recording</span><b>{fmtDur(secs)}</b></div>
      <button type="button" className="btn btn-primary send" onClick={() => stopRef.current(true)}>Send</button>
    </div>
  );
}

/* Voice-note bubble: play/pause, waveform-style progress bar, elapsed / total time. */
export function VoicePlayer({ src, duration }) {
  const audio = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [realDur, setRealDur] = useState(0);
  const total = duration || realDur || 0;

  // deterministic pseudo-waveform so each note looks distinct but stable
  const bars = useMemo(() => {
    let h = 0; for (const ch of src) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return Array.from({ length: 30 }, () => { h = (h * 1664525 + 1013904223) >>> 0; return 22 + (h % 78); });
  }, [src]);

  const toggle = () => {
    const a = audio.current; if (!a) return;
    if (a.paused) a.play().catch(() => {}); else a.pause();
  };
  const progress = total ? Math.min(1, pos / total) : 0;

  return (
    <div className="voice">
      <audio
        ref={audio} src={src} preload="metadata"
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setPos(0); }}
        onTimeUpdate={e => setPos(e.currentTarget.currentTime)}
        onLoadedMetadata={e => Number.isFinite(e.currentTarget.duration) && setRealDur(e.currentTarget.duration)}
      />
      <button type="button" className="voice-play" onClick={toggle} aria-label={playing ? 'Pause voice note' : 'Play voice note'}>{playing ? '❚❚' : '▶'}</button>
      <div className="voice-bars" aria-hidden="true">
        {bars.map((h, i) => <i key={i} className={i / bars.length < progress ? 'on' : ''} style={{ height: h + '%' }} />)}
      </div>
      <small className="voice-time">{fmtDur(playing || pos ? pos : total)}</small>
    </div>
  );
}
