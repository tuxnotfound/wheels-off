import { pressMusic, useMusic } from '../audio/music'
import { togglePause } from './arcadeStore'
import { useHud } from './hudStore'
import { Crown, Flame, Note, Pause, Restart, Trophy, lap, secs } from './icons'
import { BOARD_TITLE } from './leaderboard'
import { useMode } from './mode'
import { startAttempt, toggleGhost, useChallenge, useGhost, useTrial } from './trial'

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

/**
 * The time trial's panel, in place of the score: the clock, the meters to the finish, your best
 * this week and the week's fastest. Over the ride, the countdown and GO.
 */
function TrialPanel() {
  const { phase, count, clock, toGo, pb, leader } = useTrial()
  const challenge = useChallenge((s) => s.challenge)
  return (
    <>
      <div className="hud-score">
        <span className="hud-board">time trial</span>
        <div className="hud-score__now">
          <span className="hud-score__n">{secs(clock)}</span>
        </div>
        <span className="hud-togo">{toGo} m to go</span>
        <span className="hud-pr">
          <Trophy className="hud-trophy" />
          <small>PB</small>
          {pb !== null ? lap(pb) : '---'}
        </span>
        <span className="hud-pr">
          <Crown />
          <small>WEEK</small>
          {leader ? lap(leader.value) : '---'}
          <span className="hud-wr__name">{leader?.name ?? ''}</span>
        </span>
        {challenge && !challenge.stale && (
          <span className="hud-pr">
            <small>VS</small>
            {lap(challenge.time)}
            <span className="hud-wr__name">{challenge.name ?? ''}</span>
          </span>
        )}
      </div>
      {phase === 'countdown' && (
        <div className="countdown" key={`count-${count}`} role="status">
          {count}
        </div>
      )}
      {phase === 'riding' && clock < 0.8 && (
        <div className="countdown countdown--go" role="status">
          GO!
        </div>
      )}
    </>
  )
}

/**
 * The time trial's turn, big, on the side it goes: the course turns at the next intersection
 * and riding straight on ends in the wall. Shown from about 2.4 s out (upcomingTurn).
 */
function TurnSign({ left }: { left: boolean }) {
  return (
    <div className={left ? 'turn-sign turn-sign--left' : 'turn-sign'} role="status">
      <svg className="turn-sign__arrow" viewBox="0 0 100 60" aria-hidden="true">
        <path d="M8 21h50V6l36 24-36 24V39H8z" />
      </svg>
      <span className="turn-sign__what">{left ? 'TURN LEFT' : 'TURN RIGHT'}</span>
    </div>
  )
}

// The cards below are keyed by the sim time of their event so a new one replays its
// animation. Two can start on the same frame (a wipeout and its record banner), and they
// share a parent, so each kind gets its own key prefix: a duplicate key makes React copy
// the card again on every render.
export function Hud() {
  const { started, score, combo, speed, streak, best, wr, turns, toast, street, record } = useHud()
  const musicOff = useMusic((s) => s.off)
  const ghostOff = useGhost((s) => s.off)
  // free roam scores nothing: the speed alone, under the mode's name; the time trial has its clock
  const mode = useMode((s) => s.mode)
  const free = mode === 'free'
  return (
    <div className="hud">
      {started && mode === 'trial' && <TrialPanel />}
      {started && mode === 'arcade' && (
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
      )}
      {started && (
        <div className="hud-speed">
          <span className="hud-board">{free ? 'free roam' : mode === 'trial' ? 'speed' : BOARD_TITLE.speed}</span>
          <div>
            {speed}
            <small>km/h</small>
          </div>
          {mode === 'arcade' && (
            <>
              <span className={streak > 0 ? 'hud-streak hud-streak--on' : 'hud-streak'}>
                <small>full speed</small> {secs(streak)}
                {(best.beatingStreak || wr.beatingStreak) && <Flame wr={wr.beatingStreak} />}
              </span>
              <Pr value={secs(best.streak)} beating={best.beatingStreak} popId={record?.streak != null ? record.id : 0} />
              <Wr value={secs(wr.beatingStreak ? streak : wr.streak)} name={wr.streakName} beating={wr.beatingStreak} />
            </>
          )}
        </div>
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
          {toast.points != null && <span className="toast__points">+{toast.points}</span>}
          <span>{toast.text}</span>
        </div>
      )}
      {started && (
        <div className="hud-keys">
          {mode === 'trial' && (
            <button
              type="button"
              className={ghostOff ? 'hud-key hud-key--button hud-key--dim' : 'hud-key hud-key--button'}
              aria-label={ghostOff ? 'G turns the ghost on' : 'G turns the ghost off'}
              onMouseDown={(e) => e.preventDefault()}
              onClick={toggleGhost}
            >
              <span className="hud-key__what">{ghostOff ? 'ghost off' : 'ghost'}</span>
              <kbd>G</kbd>
            </button>
          )}
          {mode === 'trial' && (
            // clickable too; it never takes the focus, so Space stays an ollie
            <button
              type="button"
              className="hud-key hud-key--button"
              aria-label="T restarts the run"
              onMouseDown={(e) => e.preventDefault()}
              onClick={startAttempt}
            >
              <Restart />
              <span className="hud-key__what">restart</span>
              <kbd>T</kbd>
            </button>
          )}
          {/* tappable too, for a touch screen; they never take the focus, so Space stays an ollie */}
          <button type="button" className="hud-key hud-key--button" aria-label="P pauses" onMouseDown={(e) => e.preventDefault()} onClick={togglePause}>
            <Pause />
            <kbd>P</kbd>
          </button>
          <button
            type="button"
            className={musicOff ? 'hud-key hud-key--button hud-key--off' : 'hud-key hud-key--button'}
            aria-label={musicOff ? 'music off' : 'music on'}
            onMouseDown={(e) => e.preventDefault()}
            onClick={pressMusic}
          >
            <Note off={musicOff} />
            <kbd>M</kbd>
          </button>
        </div>
      )}
      {started && mode === 'trial' && turns && <TurnSign left={turns.left} />}
      {started && mode !== 'trial' && turns && (
        <div className="turns">
          <span className={turns.left ? 'on' : ''}>◀</span>
          <span className={turns.right ? 'on' : ''}>▶</span>
        </div>
      )}
    </div>
  )
}
