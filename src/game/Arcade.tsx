import { useEffect, useRef, useState } from 'react'
import type { ButtonHTMLAttributes, CSSProperties, MouseEvent } from 'react'
import { resume, signName, togglePause, toggleRecords, useArcade } from './arcadeStore'
import type { PendingRun } from './arcadeStore'
import { BOARD_JP, BOARD_SIZE, BOARD_TITLE, NAME_MAX, boards, lastName, worldRecord } from './leaderboard'
import type { Board } from './leaderboard'
import { useHud } from './hudStore'
import { roll, switchMode, useMode } from './mode'
import { Crown, Note, Trophy, secs } from './icons'
import { records } from './records'
import { pressMusic, useMusic } from '../audio/music'

// What is drawn over the ride. First the landing page, over the attract ride, until someone
// takes over. Then the cards, all in the title card's look, with scores and names in arcade
// type: the pause card (P) with the top of each leaderboard and the switch to free roam (F);
// the hi-scores card (R) with both leaderboards in full; the name entry after a run that makes
// a leaderboard; and the burst behind it for a world record.

const ordinal = (i: number) => ['1ST', '2ND', '3RD'][i] ?? `${i + 1}TH`
const shown = (board: Board, value: number) => (board === 'score' ? String(value) : secs(Math.floor(value * 10) / 10))

function Leaderboard({ board }: { board: Board }) {
  const list = boards[board]
  const pr = board === 'score' ? records.score : records.streak
  return (
    <section className="board">
      <h2 className="board__title">{BOARD_TITLE[board]}</h2>
      <p className="board__jp">{BOARD_JP[board]}</p>
      <p className="board__what">{board === 'score' ? 'best tricks score' : 'best speed score'}</p>
      <ol>
        {Array.from({ length: BOARD_SIZE }, (_, i) => (
          <li key={i} className="board__row">
            <span className="board__rank">{ordinal(i)}</span>
            <span className="board__name">{list[i]?.name ?? '---'}</span>
            <span className="board__value">{list[i] ? shown(board, list[i].value) : ''}</span>
          </li>
        ))}
      </ol>
      <p className="board__pr">
        <Trophy />
        YOUR PR {pr > 0 ? shown(board, pr) : '---'}
      </p>
    </section>
  )
}

// how long the landing page takes to clear away once the ride starts (its CSS exit animation)
const LANDING_EXIT_MS = 800

const letters = (word: string, from: number) =>
  [...word].map((c, i) => (
    <span key={i} style={{ '--i': from + i } as CSSProperties}>
      {c}
    </span>
  ))

/**
 * A landing page button. It takes its own Enter and Space, so pressing it doesn't also start
 * the ride, and a mouse click lets go of the focus, so the next Space is an ollie, not a press.
 */
const landingButton = (act: () => void): ButtonHTMLAttributes<HTMLButtonElement> => ({
  type: 'button',
  onKeyDown: (e) => {
    if (e.key === 'Enter' || e.key === ' ') e.stopPropagation()
  },
  onClick: (e) => {
    if (e.detail) e.currentTarget.blur()
    act()
  },
})

/** A board's top three, for the marquee. */
const topThree = (board: Board) =>
  boards[board].slice(0, 3).map((e, i) => `${ordinal(i)} ${shown(board, e.value)} ${e.name.toUpperCase()}`)

/**
 * The landing page, over the attract ride: the title, the two ways to ride, the keys, and the
 * hi-scores going round on a marquee. Any key rolls off in arcade, F in free roam; the page
 * clears away as the camera swings round behind the kid.
 */
function Landing() {
  const started = useHud((s) => s.started)
  const covered = useArcade((s) => s.menu !== null) // the hi-scores card, opened from here
  const musicOff = useMusic((s) => s.off)
  const [gone, setGone] = useState(false)
  useEffect(() => {
    if (!started) return
    const t = setTimeout(() => setGone(true), LANDING_EXIT_MS)
    return () => clearTimeout(t)
  }, [started])
  if (gone) return null
  const marquee = [
    [BOARD_TITLE.score.toUpperCase(), ...topThree('score')],
    [BOARD_TITLE.speed.toUpperCase(), ...topThree('speed')],
    ...(records.score > 0 || records.streak > 0
      ? [['YOUR PR', `${BOARD_TITLE.score.toUpperCase()} ${records.score}`, `${BOARD_TITLE.speed.toUpperCase()} ${shown('speed', records.streak)}`]]
      : []),
    ['FREE PLAY'],
  ]
  return (
    <main className={started ? 'landing landing--off' : 'landing'} aria-label="Wheels Off">
      <nav className="landing__chips">
        <button className="chip chip--scores" {...landingButton(toggleRecords)}>
          <kbd>R</kbd> hi-scores
        </button>
        {/* its own click decides the music, not the first-click wake-up behind it */}
        <button
          className={musicOff ? 'chip chip--off' : 'chip'}
          aria-label={musicOff ? 'music off' : 'music on'}
          {...landingButton(pressMusic)}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <Note off={musicOff} />
          <kbd>M</kbd>
        </button>
      </nav>
      <div className="landing__body">
        <header className="landing__head">
          <h1 className="landing__title" aria-label="Wheels Off">
            <span className="landing__word" aria-hidden="true">
              {letters('WHEELS', 0)}
            </span>
            <span className="landing__word landing__word--off" aria-hidden="true">
              {letters('OFF', 6)}
            </span>
          </h1>
          <p className="landing__sub">
            <span className="landing__jp">ホイールズ・オフ</span>
          </p>
        </header>
        <div className="landing__go">
          <div className="landing__modes">
            <button className="mode-card mode-card--arcade" {...landingButton(() => roll('arcade'))}>
              <span className="mode-card__name">ARCADE</span>
              <span className="mode-card__jp">アーケード</span>
              <span className="mode-card__what">ollie the obstacles and chain combos for the hi-scores. a wipeout ends the run.</span>
              <span className="mode-card__key">
                <kbd>Enter</kbd> or any key
              </span>
            </button>
            <button className="mode-card mode-card--free" {...landingButton(() => roll('free'))}>
              <span className="mode-card__name">FREE ROAM</span>
              <span className="mode-card__jp">フリーローム</span>
              <span className="mode-card__what">the same endless town with no obstacles and no scores.</span>
              <span className="mode-card__key">
                <kbd>F</kbd>
              </span>
            </button>
          </div>
          <p className="landing__keys">
            <span><kbd>W</kbd> push</span>
            <span><kbd>S</kbd> brake</span>
            <span><kbd>A</kbd><kbd>D</kbd> carve</span>
            <span><kbd>Space</kbd> ollie</span>
            <span><kbd>P</kbd> pause</span>
          </p>
          <div className="landing__touch">
            <p className="landing__touch-title">MOBILE VERSION SOON</p>
            <p className="landing__touch-jp">スマホ版、近日公開</p>
            <p className="landing__touch-what">Wheels Off is made for a desktop browser. Open it on a computer to ride.</p>
          </div>
        </div>
      </div>
      {!covered && <p className="landing__start">PRESS START</p>}
      <div className="marquee" aria-hidden="true">
        <div className="marquee__track">
          {[0, 1].map((copy) => (
            <div key={copy} className="marquee__copy">
              {marquee.map(([head, ...rest], i) => (
                <span key={i} className="marquee__item">
                  <b>{head}</b>
                  {rest.map((x, j) => (
                    <span key={j}>{x}</span>
                  ))}
                  <i>★</i>
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}

/** The pause card (P): the title card, with how to play and the top of each leaderboard. */
function PauseCard() {
  const free = useMode((s) => s.mode === 'free')
  return (
    <div className="overlay" role="dialog" aria-label="Paused">
      <div className="title-card">
        <h1>WHEELS OFF</h1>
        <p className="title-card__jp">ホイールズ・オフ</p>
        <div className="title-card__tops">
          {(['score', 'speed'] as const).map((board) => {
            const top = worldRecord(board)
            return (
              <div key={board} className="title-card__top">
                <span className="title-card__board">{BOARD_TITLE[board]}</span>
                <span className="title-card__hi">HI-SCORE {top ? `${shown(board, top.value)} ${top.name.toUpperCase()}` : '---'}</span>
              </div>
            )
          })}
        </div>
        <dl className="controls">
          <dt><kbd>W</kbd><span className="controls__or">/</span><kbd className="kbd--arrow">↑</kbd></dt>
          <dd>push</dd>
          <dt><kbd>S</kbd><span className="controls__or">/</span><kbd className="kbd--arrow">↓</kbd></dt>
          <dd>brake</dd>
          <dt>
            <kbd>A</kbd><kbd>D</kbd><span className="controls__or">/</span><kbd className="kbd--arrow">←</kbd><kbd className="kbd--arrow">→</kbd>
          </dt>
          <dd>carve · hold into a side street to turn</dd>
          <dt><kbd>Space</kbd></dt>
          <dd>ollie · tap twice to kickflip</dd>
          <dt><kbd>P</kbd></dt>
          <dd>pause</dd>
          <dt><kbd>R</kbd></dt>
          <dd>high scores</dd>
          <dt><kbd>M</kbd></dt>
          <dd>music on/off</dd>
        </dl>
        <p className="title-card__rule">{free ? 'free roam · no obstacles, no scores' : 'a wipeout ends the run'}</p>
        <p className="title-card__mode">
          <kbd>F</kbd> {free ? 'back to arcade' : 'free roam · ends this run'}
        </p>
        <p className="title-card__go">paused · press P to roll on</p>
      </div>
    </div>
  )
}

/** The hi-scores card (R): both leaderboards in full, with your own PR under each. */
function HiScoresCard() {
  return (
    <div className="overlay" role="dialog" aria-label="Hi-scores">
      <div className="title-card">
        <h1>HI-SCORES</h1>
        <p className="title-card__jp">ハイスコア</p>
        <div className="title-card__boards">
          <Leaderboard board="score" />
          <Leaderboard board="speed" />
        </div>
        <p className="title-card__go">press R to go back</p>
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
          {run.scoreRank !== null && (
            <Result label={BOARD_TITLE.score.toUpperCase()} value={String(run.score)} rank={run.scoreRank} pr={run.prScore} />
          )}
          {run.speedRank !== null && (
            <Result label={BOARD_TITLE.speed.toUpperCase()} value={shown('speed', run.streak)} rank={run.speedRank} pr={run.prStreak} />
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
        <p className="title-card__go">press esc to continue</p>
      </form>
    </div>
  )
}

export function Arcade() {
  const { menu, pending } = useArcade()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || e.target instanceof HTMLInputElement) return
      const k = e.key.toLowerCase()
      // P does nothing on the landing page; R opens the records from anywhere
      if (k === 'p' && useHud.getState().started) togglePause()
      else if (k === 'r') toggleRecords()
      else if (k === 'escape') resume()
      else if (k === 'f') {
        // only on the landing page, which rolls off in free roam, or the pause screen, which
        // rolls on in the other mode: a stray F mid-ride never ends a run
        const { menu, pending } = useArcade.getState()
        if (pending || !(menu === 'pause' || (menu === null && !useHud.getState().started))) return
        switchMode()
        resume()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  let card = null
  if (pending) card = <NameEntry key={pending.id} run={pending} />
  else if (menu === 'records') card = <HiScoresCard />
  else if (menu === 'pause') card = <PauseCard />
  return (
    <>
      <Landing />
      {card}
    </>
  )
}
