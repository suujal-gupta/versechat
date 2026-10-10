import TechText from './TechText.jsx';

export default function Landing({ onEnter }) {
  return (
    <main className="landing">
      <div className="landing-word">
        <TechText
          text="VERSECHAT"
          fontFamily="Sora, system-ui, sans-serif"
          fontWeight={800}
          fontSize={190}
          letterSpacing={-0.04}
          color="#ffffff"
          accentColor="#ffffff"
          reveal="letter"
          dashLength={4}
          dashGap={2}
          specks={15}
        />
      </div>
      <p className="landing-line">Private, instant conversations — on your Wi-Fi or anywhere.</p>
      <button className="btn btn-primary btn-lg" onClick={onEnter}>Start chatting</button>
      <p className="landing-hint">Hover or drag the letters. Click anywhere to send a ripple.</p>
    </main>
  );
}
