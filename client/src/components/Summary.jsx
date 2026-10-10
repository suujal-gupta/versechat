import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Modal } from './ui.jsx';

const RANGES = [['50', 'Last 50'], ['200', 'Last 200'], ['today', 'Today']];

export default function SummaryModal({ convId, onClose }) {
  const [range, setRange] = useState('50');
  const [state, setState] = useState({ loading: true });

  useEffect(() => {
    let dead = false;
    setState({ loading: true });
    api.summarize(convId, range)
      .then(data => !dead && setState({ data }))
      .catch(e => !dead && setState({ error: e.message }));
    return () => { dead = true; };
  }, [convId, range]);

  const { data } = state;
  const s = data?.summary;
  const copy = () => navigator.clipboard?.writeText(
    [s.summary, s.keyPoints.length ? '\nKey points:\n' + s.keyPoints.map(k => '• ' + k).join('\n') : '',
      s.actionItems.length ? '\nTo follow up:\n' + s.actionItems.map(k => '• ' + k).join('\n') : ''].join('\n').trim());

  return (
    <Modal title="✨ Chat summary" onClose={onClose}>
      <div className="chips">
        {RANGES.map(([v, label]) => (
          <button key={v} className={`chip ${range === v ? 'on' : ''}`} onClick={() => setRange(v)}>{label}</button>
        ))}
      </div>
      <div className="summary">
        {state.loading && <p className="muted center">Reading the conversation…</p>}
        {state.error && <div className="error">{state.error}</div>}
        {s && (
          <>
            <p>{s.summary}</p>
            {s.keyPoints.length > 0 && <><h3>Key points</h3><ul>{s.keyPoints.map((k, i) => <li key={i}>{k}</li>)}</ul></>}
            {s.actionItems.length > 0 && <><h3>To follow up</h3><ul>{s.actionItems.map((k, i) => <li key={i}>{k}</li>)}</ul></>}
            <small className="muted">
              {data.source === 'ai' ? 'AI summary' : 'Quick summary'} · {data.count} messages
              {data.source === 'local' && ' · set ANTHROPIC_API_KEY on the server for full AI summaries'}
            </small>
          </>
        )}
      </div>
      {s && <button className="btn btn-ghost" onClick={copy}>Copy summary</button>}
    </Modal>
  );
}
