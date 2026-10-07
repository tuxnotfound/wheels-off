import { useMusic } from '../audio/music'
import { useHud } from './hudStore'
import { Crown, Flame, Note, Trophy, secs } from './icons'
import { BOARD_TITLE } from './leaderboard'

/**
 * The record under a live value. While the run is beating it, it follows the value in red.
 * Its trophy pops when a run ends having set it (popId, re-keyed so the animation replays).
 */
function Pr({ value, beating, popId }: { value: string; beating: boolean; popId: number }) {
  return (
    <span className={beating ? 'hud-pr hud-pr--beating' : 'hud-pr'}>
      <Trophy key={popId} className={popId ? 'hud-trophy hud-trophy--pop' : 'hud-trophy'} />
      <small>PR</small>
      {value}
    </span>
  )
}

/** The world record under the personal one. While the run is beating it, it follows the value as YOU. */
function Wr({ value, name, beating }: { value: string; name: string; beating: boolean }) {
  return (
    <span className={beating ? 'hud-pr hud-pr--beating' : 'hud-pr'}>
      <Crown />
      <small>WR</small>
      {value}
      <span className="hud-wr__name">{beating ? 'YOU' : name}</span>
    </span>
  )
}

// The cards below are keyed by the sim time of their event so a new one replays its
// animation. Two can start on the same frame (a wipeout and its record banner), and they
// share a parent, so each kind gets its own key prefix: a duplicate key makes React copy
// the card again on every render.
export function Hud() {
  const { started, score, combo, speed, streak, best, wr, turns, toast, street, record } = useHud()
  const musicOff = useMusic((s) => s.off)
  return (
    <div className="hud">
      {started && (
        <>
          <div className="hud-score">
            <span className="hud-board">{BOARD_TITLE.score}</span>
            <div className="hud-score__now">
              <span className="hud-score__n">{score}</span>
              {(best.beatingScore || wr.beatingScore) && <Flame wr={wr.beatingScore} />}
              {combo > 1 && <span className="hud-score__combo">x{combo}</span>}
            </div>
            <Pr value={String(best.score)} beating={best.beatingScore} popId={record?.score != null ? record.id : 0} />
            <Wr value={String(wr.beatingScore ? score : wr.score)} name={wr.scoreName} beating={wr.beatingScore} />
          </div>
          <div className="hud-speed">
            <span className="hud-board">{BOARD_TITLE.speed}</span>
            <div>
              {speed}
              <small>km/h</small>
            </div>
            <span className={streak > 0 ? 'hud-streak hud-streak--on' : 'hud-streak'}>
              <small>full speed</small> {secs(streak)}
              {(best.beatingStreak || wr.beatingStreak) && <Flame wr={wr.beatingStreak} />}
            </span>
            <Pr value={secs(best.streak)} beating={best.beatingStreak} popId={record?.streak != null ? record.id : 0} />
            <Wr value={secs(wr.beatingStreak ? streak : wr.streak)} name={wr.streakName} beating={wr.beatingStreak} />
          </div>
        </>
      )}
      {record && (
        <div className="record-card" key={`record-${record.id}`} role="status">
          <Trophy className="record-card__trophy" />
          <div>
            <span className="record-card__title">
              {record.score !== null && record.streak !== null ? 'NEW RECORDS!' : 'NEW RECORD!'}
            </span>
            {record.score !== null && (
              <span className="record-card__what">
                {BOARD_TITLE.score} <b>{record.score}</b>
              </span>
            )}
            {record.streak !== null && (
              <span className="record-card__what">
                {BOARD_TITLE.speed} <b>{secs(record.streak)}</b>
              </span>
            )}
          </div>
        </div>
      )}
      {street && (
        <div className="street-card" key={`street-${street.id}`}>
          <span className="street-card__jp">{street.kanji}</span>
          <span className="street-card__en">{street.name}</span>
        </div>
      )}
      {toast && (
        <div className={`toast toast--${toast.kind}`} key={`toast-${toast.id}`}>
          {toast.text}
        </div>
      )}
      {started && (
        <div className={musicOff ? 'hud-music hud-music--off' : 'hud-music'} role="status" aria-label={musicOff ? 'music off' : 'music on'}>
          <Note off={musicOff} />
          <kbd>M</kbd>
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
