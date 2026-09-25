import { useHud } from './hudStore'

export function Hud() {
  const { started, score, combo, speed, turns, toast, street } = useHud()
  return (
    <div className="hud">
      {!started && (
        <div className="title-card">
          <h1>WHEELS OFF</h1>
          <p className="title-card__jp">ホイールズ・オフ</p>
          <ul className="keys">
            <li><kbd>W</kbd> push <kbd>S</kbd> brake</li>
            <li><kbd>A</kbd><kbd>D</kbd> carve · hold into a side street to turn</li>
            <li><kbd>Space</kbd> ollie over the junk</li>
          </ul>
          <p className="title-card__go">press any key to roll</p>
        </div>
      )}
      {started && (
        <>
          <div className="hud-score">
            <span className="hud-score__n">{score}</span>
            {combo > 1 && <span className="hud-score__combo">x{combo}</span>}
          </div>
          <div className="hud-speed">
            {speed}
            <small>km/h</small>
          </div>
        </>
      )}
      {street && (
        <div className="street-card" key={street.id}>
          <span className="street-card__jp">{street.kanji}</span>
          <span className="street-card__en">{street.name}</span>
        </div>
      )}
      {toast && (
        <div className={`toast toast--${toast.kind}`} key={toast.id}>
          {toast.text}
        </div>
      )}
      {started && turns && (
        <div className="turns">
          <span className={turns.left ? 'on' : ''}>◀</span>
          <span className={turns.right ? 'on' : ''}>▶</span>
        </div>
      )}
    </div>
  )
}
