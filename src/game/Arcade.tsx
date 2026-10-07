import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, MouseEvent } from 'react'
import { resume, signName, togglePause, useArcade } from './arcadeStore'
import type { PendingRun } from './arcadeStore'
import { BOARD_SIZE, DEFAULT_NAME, NAME_MAX, boards, lastName, worldRecord } from './leaderboard'
import type { Board } from './leaderboard'
import { useHud } from './hudStore'
import { Crown, secs } from './icons'
import { STREAK_KMH } from './records'

// The cards over the ride, all in the title card's look: the title card itself (at the start,
// and again as the pause screen), with the HI-SCORE and both leaderboards in arcade type; the
// name entry after a run that makes a leaderboard; and the burst behind it for a world record.

const ordinal = (i: number) => ['1ST', '2ND', '3RD'][i] ?? `${i + 1}TH`
const shown = (board: Board, value: number) => (board === 'score' ? String(value) : secs(Math.floor(value * 10) / 10))

function Leaderboard({ board }: { board: Board }) {
  const list = boards[board]
  return (
    <section className="board">
      <h2 className="board__title">
        {board === 'score' ? 'top scores' : 'full speed'}
        {board === 'speed' && <small> over {STREAK_KMH} km/h</small>}
      </h2>
      <ol>
        {Array.from({ length: BOARD_SIZE }, (_, i) => (
          <li key={i} className="board__row">
            <span className="board__rank">{ordinal(i)}</span>
            <span className="board__name">{list[i]?.name ?? '---'}</span>
            <span className="board__value">{list[i] ? shown(board, list[i].value) : ''}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}

/** The title card: shown before the first ride and again whenever the game is paused. */
function TitleCard({ paused }: { paused: boolean }) {
  const top = worldRecord('score')
  return (
    <div className="overlay" role={paused ? 'dialog' : undefined} aria-label={paused ? 'Paused' : undefined}>
      <div className="title-card">
        <h1>WHEELS OFF</h1>
        <p className="title-card__jp">ホイールズ・オフ</p>
        {top && (
          <p className="title-card__hi">
            HI-SCORE {top.value} {top.name}
          </p>
        )}
        <ul className="keys">
          <li><kbd>W</kbd> push <kbd>S</kbd> brake</li>
          <li><kbd>A</kbd><kbd>D</kbd> carve · hold into a side street to turn</li>
          <li><kbd>Space</kbd> ollie over the junk · tap twice to kickflip</li>
          <li><kbd>P</kbd> pause · a wipeout ends the run</li>
        </ul>
        <div className="title-card__boards">
          <Leaderboard board="score" />
          <Leaderboard board="speed" />
        </div>
        <p className="title-card__go">{paused ? 'paused · press P to roll on' : 'press any key to roll'}</p>
      </div>
    </div>
  )
}

// stars thrown out from the middle of the screen, in vmin
const STARS = Array.from({ length: 16 }, (_, i) => {
  const a = (i / 16) * Math.PI * 2
  const r = 48 + (i % 3) * 12
  return { '--dx': (Math.cos(a) * r).toFixed(1), '--dy': (Math.sin(a) * r).toFixed(1), '--delay': `${(i % 4) * 0.4}s` }
})

function WorldRecordBurst() {
  return (
    <div className="wr-burst" aria-hidden="true">
      <div className="wr-burst__rays" />
      <div className="wr-burst__flash" />
      {STARS.map((style, i) => (
        <span key={i} className="wr-burst__star" style={style as CSSProperties}>
          ★
        </span>
      ))}
    </div>
  )
}

function Result({ label, value, rank, pr }: { label: string; value: string; rank: number; pr: boolean }) {
  return (
    <li>
      {label} <b>{value}</b> <span className="entry__rank">{rank === 0 ? 'WR' : ordinal(rank)}</span>
      {pr && <span className="entry__pr">NEW PR</span>}
    </li>
  )
}

function NameEntry({ run }: { run: PendingRun }) {
  const [name, setName] = useState(lastName)
  const field = useRef<HTMLInputElement>(null)
  useEffect(() => {
    field.current?.focus()
    field.current?.select()
  }, [])
  // a click anywhere else would take the keyboard away from the name
  const keepFocus = (e: MouseEvent) => {
    if (e.target !== field.current) e.preventDefault()
  }
  const wr = run.scoreRank === 0 || run.speedRank === 0
  return (
    <div className={wr ? 'overlay overlay--wr' : 'overlay'} role="dialog" aria-label="Enter your name" onMouseDown={keepFocus}>
      {wr && <WorldRecordBurst />}
      <form
        className="title-card entry"
        onSubmit={(e) => {
          e.preventDefault()
          signName(name)
        }}
      >
        {wr && <Crown className="entry__crown" />}
        <h1 className={wr ? 'entry__title--wr' : undefined}>{wr ? 'NEW WORLD RECORD!' : 'HIGH SCORE!'}</h1>
        <ul className="entry__results">
          {run.scoreRank !== null && <Result label="SCORE" value={String(run.score)} rank={run.scoreRank} pr={run.prScore} />}
          {run.speedRank !== null && (
            <Result label="FULL SPEED" value={shown('speed', run.streak)} rank={run.speedRank} pr={run.prStreak} />
          )}
        </ul>
        <label className="entry__label">
          enter your name
          <input
            ref={field}
            className="entry__field"
            value={name}
            maxLength={NAME_MAX}
            spellCheck={false}
            autoComplete="off"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Escape') return
              e.preventDefault()
              signName(null)
            }}
          />
        </label>
        <p className="title-card__go">enter to sign · esc to play on as {DEFAULT_NAME}</p>
      </form>
    </div>
  )
}

export function Arcade() {
  const { menu, pending } = useArcade()
  const started = useHud((s) => s.started)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.target instanceof HTMLInputElement) return
      const k = e.key.toLowerCase()
      // P on the title card only starts the ride, like any key
      if (k === 'p' && useHud.getState().started) togglePause()
      else if (k === 'escape') resume()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  if (pending) return <NameEntry key={pending.id} run={pending} />
  if (!started || menu) return <TitleCard paused={started} />
  return null
}
