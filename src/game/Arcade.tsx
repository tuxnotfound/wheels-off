import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, MouseEvent } from 'react'
import { resume, signName, togglePause, useArcade } from './arcadeStore'
import type { PendingRun } from './arcadeStore'
import { BOARD_SIZE, DEFAULT_NAME, NAME_MAX, boards, lastName } from './leaderboard'
import type { Board } from './leaderboard'
import { useHud } from './hudStore'
import { Crown, secs } from './icons'
import { STREAK_KMH } from './records'

// The arcade screens over the ride: pause (how to play and the leaderboards), the name entry
// after a run that makes a leaderboard, and the burst when that run is a world record.

const ordinal = (i: number) => ['1ST', '2ND', '3RD'][i] ?? `${i + 1}TH`
const shown = (board: Board, value: number) => (board === 'score' ? String(value) : secs(Math.floor(value * 10) / 10))

function Leaderboard({ board }: { board: Board }) {
  const list = boards[board]
  return (
    <section className="board">
      <h3>{board === 'score' ? 'TOP SCORES' : 'FULL SPEED'}</h3>
      <ol>
        {Array.from({ length: BOARD_SIZE }, (_, i) => (
          <li key={i} className="board__row">
            <span>{ordinal(i)}</span>
            <span className="board__name">{list[i]?.name ?? '---'}</span>
            <span className="board__value">{list[i] ? shown(board, list[i].value) : ''}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}

function PauseScreen() {
  return (
    <div className="arcade" role="dialog" aria-label="Paused">
      <div className="arcade__panel">
        <h2 className="arcade__title arcade__blink">PAUSED</h2>
        <div className="arcade__cols">
          <section className="howto">
            <h3>HOW TO PLAY</h3>
            <ul>
              <li><kbd>W</kbd> push <kbd>S</kbd> brake</li>
              <li><kbd>A</kbd><kbd>D</kbd> carve, hold into a side street to turn</li>
              <li><kbd>Space</kbd> ollie, tap twice to kickflip</li>
              <li><kbd>P</kbd> pause</li>
            </ul>
            <p>Ollie the junk to score. Every clear in a row is worth more than the last.</p>
            <p>Hold full speed, over {STREAK_KMH} km/h, for as long as you can.</p>
            <p>A wipeout ends the run. Beat your PR, chase the WR, sign the top 10.</p>
          </section>
          <Leaderboard board="score" />
          <Leaderboard board="speed" />
        </div>
        <p className="arcade__hint">PRESS P TO PLAY</p>
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
    <li className={rank === 0 ? 'entry__result entry__result--wr' : 'entry__result'}>
      <span>{label}</span>
      <b>{value}</b>
      <span>{rank === 0 ? 'WR' : ordinal(rank)}</span>
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
    <div className={wr ? 'arcade arcade--wr' : 'arcade'} role="dialog" aria-label="Enter your name" onMouseDown={keepFocus}>
      {wr && <WorldRecordBurst />}
      <form
        className="arcade__panel entry"
        onSubmit={(e) => {
          e.preventDefault()
          signName(name)
        }}
      >
        {wr && <Crown className="entry__crown" />}
        <h2 className={wr ? 'arcade__title entry__wr' : 'arcade__title'}>{wr ? 'NEW WORLD RECORD!' : 'HIGH SCORE!'}</h2>
        <ul className="entry__results">
          {run.scoreRank !== null && <Result label="SCORE" value={String(run.score)} rank={run.scoreRank} pr={run.prScore} />}
          {run.speedRank !== null && (
            <Result label="FULL SPEED" value={shown('speed', run.streak)} rank={run.speedRank} pr={run.prStreak} />
          )}
        </ul>
        <label className="entry__label">
          ENTER YOUR NAME
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
        <p className="arcade__hint">ENTER TO SIGN · ESC TO PLAY ON AS {DEFAULT_NAME.toUpperCase()}</p>
      </form>
    </div>
  )
}

export function Arcade() {
  const { menu, pending } = useArcade()
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
  if (menu) return <PauseScreen />
  return null
}
