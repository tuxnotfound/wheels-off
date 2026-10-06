import { useHud } from './hudStore'

const secs = (s: number) =>
  s < 60 ? `${s.toFixed(1)}s` : `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`

/** Lit next to a live value while it is beating its record. */
function Flame() {
  return (
    <svg className="hud-flame" viewBox="0 0 24 24" aria-label="beating your record">
      <path
        className="hud-flame__outer"
        d="M12 2C13 6 18 8.5 18 14.5a6 6 0 0 1-12 0C6 11.5 7.7 9.6 8.4 7.6 9.7 8.8 10.3 9.9 10.4 11 11.6 8.2 11.1 5 12 2Z"
      />
      <path className="hud-flame__inner" d="M12 12.2c.9 1.9 3 3 3 5.2a3 3 0 0 1-6 0c0-1.6 1.1-2.6 1.5-3.8.6.7.9 1.3.9 2 .5-1.1.6-2.2.6-3.4Z" />
    </svg>
  )
}

function Trophy() {
  return (
    <svg className="hud-trophy" viewBox="0 0 24 24" aria-hidden="true">
      <path className="hud-trophy__handles" d="M6.5 5H3.8a2.6 2.6 0 0 0 3.4 4.6M17.5 5h2.7a2.6 2.6 0 0 1-3.4 4.6" />
      <path className="hud-trophy__cup" d="M6 3h12v5.5a6 6 0 0 1-12 0Z" />
      <path className="hud-trophy__cup" d="M10.5 14.2h3L13.2 18h-2.4ZM7.5 18h9v3.2h-9Z" />
    </svg>
  )
}

/** The record under a live value. While the run is beating it, it follows the value in red. */
function Pr({ value, beating }: { value: string; beating: boolean }) {
  return (
    <span className={beating ? 'hud-pr hud-pr--beating' : 'hud-pr'}>
      <Trophy />
      <small>PR</small>
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
              {best.beatingScore && <Flame />}
              {combo > 1 && <span className="hud-score__combo">x{combo}</span>}
            </div>
            <Pr value={String(best.score)} beating={best.beatingScore} />
          </div>
          <div className="hud-speed">
            <div>
              {speed}
              <small>km/h</small>
            </div>
            <span className={streak > 0 ? 'hud-streak hud-streak--on' : 'hud-streak'}>
              <small>full speed</small> {secs(streak)}
              {best.beatingStreak && <Flame />}
            </span>
            <Pr value={secs(best.streak)} beating={best.beatingStreak} />
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
