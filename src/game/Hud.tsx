import { useHud } from './hudStore'
import { STREAK_KMH } from './records'

const secs = (s: number) =>
  s < 60 ? `${s.toFixed(1)}s` : `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`

/** The personal record under a live value; once beaten this session it follows the value. */
function Pr({ value, fresh }: { value: string; fresh: boolean }) {
  return (
    <span className={fresh ? 'hud-pr hud-pr--new' : 'hud-pr'}>
      <small>{fresh ? 'NEW PR' : 'PR'}</small>
      {value}
    </span>
  )
}

export function Hud() {
  const { started, score, combo, speed, streak, best, turns, toast, street } = useHud()
  return (
    <div className="hud">
      {!started && (
        <div className="title-card">
          <h1>WHEELS OFF</h1>
          <p className="title-card__jp">ホイールズ・オフ</p>
          <ul className="keys">
            <li><kbd>W</kbd> push <kbd>S</kbd> brake</li>
            <li><kbd>A</kbd><kbd>D</kbd> carve · hold into a side street to turn</li>
            <li><kbd>Space</kbd> ollie over the junk · tap twice to kickflip</li>
          </ul>
          <p className="title-card__go">press any key to roll</p>
        </div>
      )}
      {started && (
        <>
          <div className="hud-score">
            <div className="hud-score__now">
              <span className="hud-score__n">{score}</span>
              {combo > 1 && <span className="hud-score__combo">x{combo}</span>}
            </div>
            <Pr value={String(best.score)} fresh={best.newScore} />
          </div>
          <div className="hud-speed">
            <div>
              {speed}
              <small>km/h</small>
            </div>
            <span className={streak > 0 ? 'hud-streak hud-streak--on' : 'hud-streak'}>
              <small>over {STREAK_KMH}</small> {secs(streak)}
            </span>
            <Pr value={secs(best.streak)} fresh={best.newStreak} />
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
