import { useEffect, useRef, useState } from 'react'
import type { ButtonHTMLAttributes, CSSProperties, MouseEvent, ReactNode } from 'react'
import { closeResult, resume, signName, skipRun, togglePause, toggleRecords, useArcade } from './arcadeStore'
import type { PendingRun } from './arcadeStore'
import {
  BOARD_JP,
  BOARD_SIZE,
  BOARD_TITLE,
  NAME_MAX,
  PERIODS,
  PERIOD_TITLE,
  cleanName,
  lastName,
  nameAllowed,
  tables,
  typedName,
  useBoards,
  weekTop,
  worldRecord,
} from './leaderboard'
import type { Board, Period } from './leaderboard'
import { useHud } from './hudStore'
import { roll, setMode, switchMode, useMode } from './mode'
import type { Mode } from './mode'
import { challengeLink, enterTrial, startAttempt, toggleGhost, useChallenge, useTrial } from './trial'
import type { TrialRun } from './trial'
import { Crown, Note, Trophy, lap, secs } from './icons'
import { records } from './records'
import { pressMusic, useMusic } from '../audio/music'
import { useWebGL } from './webgl'
import { PORTAL, SHARE_LINKS, SITE } from '../site'
import { touchDevice } from '../player/touch'

// What is drawn over the ride. First the landing page, over the attract ride, until someone
// takes over. Then the cards, all in the title card's look, with scores and names in arcade
// type: the pause card (P) with the top of each leaderboard and the switch to free roam (F);
// the hi-scores card (R) with both leaderboards in full, this week's or of all time; the name
// entry after a run that makes a leaderboard, with the run to share; and the burst behind it
// for a world record or the week's first place.

const ordinal = (i: number) => ['1ST', '2ND', '3RD'][i] ?? `${i + 1}TH`
const shown = (board: Board, value: number) => (board === 'score' ? String(value) : secs(Math.floor(value * 10) / 10))

/** How long until the weekly boards start over, at Monday 00:00 UTC. */
function untilMonday(): string {
  const now = new Date()
  const monday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 7 - ((now.getUTCDay() + 6) % 7))
  const hours = Math.ceil((monday - now.getTime()) / 3_600_000)
  return hours > 48 ? `${Math.floor(hours / 24)} days` : hours > 1 ? `${hours} hours` : 'under an hour'
}

function Leaderboard({ period, board }: { period: Period; board: Board }) {
  const list = tables[period][board]
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

/** On a touch screen, the buttons that stand in for a card's keys (Enter, Esc, P, R). */
function TapRow({ children }: { children: ReactNode }) {
  return <p className="title-card__go title-card__go--tap">{children}</p>
}

/** A board's top three of all time, for the marquee. */
const topThree = (board: Board) =>
  tables.all[board].slice(0, 3).map((e, i) => `${ordinal(i)} ${shown(board, e.value)} ${e.name.toUpperCase()}`)

/** This week's leader on each board, for the marquee, or the call to be the first. */
function weekLeaders(): string[] {
  const tops = (['score', 'speed'] as const).flatMap((board) => {
    const top = weekTop(board)
    return top ? [`${BOARD_TITLE[board].toUpperCase()} ${shown(board, top.value)} ${top.name.toUpperCase()}`] : []
  })
  return tops.length ? tops : ['NO RUNS YET', 'BE THE FIRST']
}

/**
 * The landing page, over the attract ride: the title, the two ways to ride, the keys, and the
 * hi-scores going round on a marquee. Any key rolls off in arcade, F in free roam; the page
 * clears away as the camera swings round behind the kid.
 */
function Landing() {
  const started = useHud((s) => s.started)
  const covered = useArcade((s) => s.menu !== null) // the hi-scores card, opened from here
  const musicOff = useMusic((s) => s.off)
  const no3d = !useWebGL((s) => s.ok)
  const challenge = useChallenge((s) => s.challenge) // the visit came by a challenge link
  const [gone, setGone] = useState(false)
  useEffect(() => {
    if (!started) return
    const t = setTimeout(() => setGone(true), LANDING_EXIT_MS)
    return () => clearTimeout(t)
  }, [started])
  if (gone) return null
  const marquee = [
    ['THIS WEEK', ...weekLeaders()],
    [BOARD_TITLE.score.toUpperCase(), ...topThree('score')],
    [BOARD_TITLE.speed.toUpperCase(), ...topThree('speed')],
    ...(records.score > 0 || records.streak > 0
      ? [['YOUR PR', `${BOARD_TITLE.score.toUpperCase()} ${records.score}`, `${BOARD_TITLE.speed.toUpperCase()} ${shown('speed', records.streak)}`]]
      : []),
    ['FREE PLAY'],
  ]
  return (
    <main className={started ? 'landing landing--off' : no3d ? 'landing landing--no3d' : 'landing'} aria-label="Wheels Off">
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
        {/* Enter opens the page without also starting the ride, as on the buttons */}
        <a className="chip" href={PORTAL ? `${SITE}/privacy` : '/privacy'} target="_blank" rel="noopener" onKeyDown={(e) => e.key === 'Enter' && e.stopPropagation()}>
          privacy
        </a>
      </nav>
      <div className="landing__body">
        <header className="landing__head">
          <h1 className="landing__title" aria-label="Wheels Off">
            <span className="landing__word" aria-hidden="true">
              {letters('WHEELS', 0)}
            </span>
            {/* OFF, with the title in Japanese centered under it */}
            <span className="landing__off" aria-hidden="true">
              <span className="landing__word landing__word--off">{letters('OFF', 6)}</span>
              <span className="landing__jp">ホイールズ・オフ</span>
            </span>
          </h1>
        </header>
        <div className="landing__go">
          {challenge && (
            <p className="landing__challenge" role="status">
              {challenge.stale
                ? 'THAT CHALLENGE’S WEEK IS OVER · THIS WEEK’S COURSE IS NEW'
                : `${(challenge.name ?? 'A FRIEND').toUpperCase()} RODE THIS WEEK’S TIME TRIAL IN ${lap(challenge.time)} · RACE THEIR GHOST`}
            </p>
          )}
          <div className="landing__modes">
            <button className="mode-card mode-card--arcade" {...landingButton(() => roll('arcade'))}>
              <span className="mode-card__name">ARCADE</span>
              <span className="mode-card__jp">アーケード</span>
              <span className="mode-card__what">ollie the obstacles and chain combos for the hi-scores. a wipeout ends the run.</span>
              <span className="mode-card__key">
                <kbd>Space</kbd> or any key
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
            <button className="mode-card mode-card--trial" {...landingButton(enterTrial)}>
              <span className="mode-card__name">TIME TRIAL</span>
              <span className="mode-card__jp">タイムトライアル</span>
              <span className="mode-card__what">this week's course against the clock and the ghosts.</span>
              <span className="mode-card__key">
                <kbd>T</kbd>
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
          {no3d && (
            <div className="landing__touch" role="alert">
              <p className="landing__touch-title">3D GRAPHICS ARE OFF</p>
              <p className="landing__touch-jp">3Dグラフィックがオフです</p>
              <p className="landing__touch-what">
                Your browser isn't letting the game use the graphics card, so the ride can't start. Turn on hardware
                acceleration in its settings (in Chrome: Settings, System, Use graphics acceleration when available),
                then relaunch the browser.
              </p>
            </div>
          )}
        </div>
      </div>
      {!covered && (
        <p className="landing__start">
          {touchDevice
            ? !challenge
              ? 'TAP A MODE TO RIDE'
              : 'TAP TIME TRIAL TO RACE'
            : !challenge
              ? 'PRESS SPACE TO START'
              : challenge.stale
                ? 'PRESS T FOR THIS WEEK’S TIME TRIAL'
                : 'PRESS T TO TAKE THE CHALLENGE'}
        </p>
      )}
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
const RULE: Record<Mode, string> = {
  arcade: 'a wipeout ends the run',
  free: 'free roam · no obstacles, no scores',
  trial: 'time trial · a wipeout only slows you down',
}

/** The three ways to ride, as the pause screen offers the other two: in the landing page's cards, smaller. */
const MODES: { mode: Mode; name: string; jp: string; what: string; key: string }[] = [
  { mode: 'arcade', name: 'ARCADE', jp: 'アーケード', what: 'ollie the obstacles and chain combos for the hi-scores.', key: 'A' },
  { mode: 'free', name: 'FREE ROAM', jp: 'フリーローム', what: 'the same endless town with no obstacles and no scores.', key: 'F' },
  { mode: 'trial', name: 'TIME TRIAL', jp: 'タイムトライアル', what: 'this week’s course against the clock and the ghosts.', key: 'T' },
]

/** Switches to a mode from the pause screen, as its key does, and rolls on. */
function pick(mode: Mode) {
  if (mode === 'trial') enterTrial()
  else setMode(mode)
  resume()
}

/**
 * The pause card (P): the title card, with how to play and the top of each leaderboard; below
 * it, the other two modes to try, each a card with its key (A, F, T), clickable too.
 */
function PauseCard() {
  const mode = useMode((s) => s.mode)
  return (
    <div className="overlay" role="dialog" aria-label="Paused">
      <div className="pause">
        <div className="title-card">
          <h1>WHEELS OFF</h1>
          <p className="title-card__jp">ホイールズ・オフ</p>
          <div className="title-card__tops">
            {(['score', 'speed'] as const).map((board) => {
              const top = worldRecord(board)
              const week = weekTop(board)
              return (
                <div key={board} className="title-card__top">
                  <span className="title-card__board">{BOARD_TITLE[board]}</span>
                  <span className="title-card__hi">HI-SCORE {top ? `${shown(board, top.value)} ${top.name.toUpperCase()}` : '---'}</span>
                  <span className="title-card__hi">THIS WEEK {week ? `${shown(board, week.value)} ${week.name.toUpperCase()}` : '---'}</span>
                </div>
              )
            })}
          </div>
          {touchDevice ? (
            <dl className="controls">
              <dt><kbd>left side</kbd></dt>
              <dd>drag to carve · hold into a side street to turn</dd>
              <dt><kbd>PUSH</kbd></dt>
              <dd>hold to push</dd>
              <dt><kbd>BRAKE</kbd></dt>
              <dd>hold to brake</dd>
              <dt><kbd>OLLIE</kbd></dt>
              <dd>tap · tap twice to kickflip</dd>
            </dl>
          ) : (
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
          )}
          <p className="title-card__rule">{RULE[mode]}</p>
          {mode === 'trial' && !touchDevice && (
            <p className="title-card__mode">
              <span>
                <kbd>T</kbd> restart the run
              </span>
              <span>
                <kbd>G</kbd> ghost on/off
              </span>
            </p>
          )}
          {touchDevice ? (
            <TapRow>
              <button type="button" className="chip" onClick={resume}>
                roll on
              </button>
            </TapRow>
          ) : (
            <p className="title-card__go">paused · press P to roll on</p>
          )}
        </div>
        <section className="other-modes" aria-label="Other modes">
          <p className="other-modes__title">try another mode{mode === 'arcade' ? ' · ends this run' : ''}</p>
          <div className="other-modes__cards">
            {MODES.filter((m) => m.mode !== mode).map((m) => (
              <button key={m.mode} className={`mode-card mode-card--small mode-card--${m.mode}`} {...landingButton(() => pick(m.mode))}>
                <span className="mode-card__name">{m.name}</span>
                <span className="mode-card__jp">{m.jp}</span>
                <span className="mode-card__what">{m.what}</span>
                <span className="mode-card__key">{touchDevice ? 'tap to play' : <>play · press <kbd>{m.key}</kbd></>}</span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

const SWITCH_KEYS = ['arrowleft', 'arrowright', 'a', 'd']

/**
 * The hi-scores card (R): both leaderboards in full, with your own PR under each. This week's
 * first, which start empty every Monday; the arrows (or a click) switch to all time and back.
 */
function HiScoresCard() {
  const [period, setPeriod] = useState<Period>('week')
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!SWITCH_KEYS.includes(e.key.toLowerCase()) || e.metaKey || e.ctrlKey || e.altKey) return
      e.preventDefault()
      setPeriod((p) => (p === 'week' ? 'all' : 'week'))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return (
    <div className="overlay" role="dialog" aria-label="Hi-scores">
      <div className="title-card">
        <h1>HI-SCORES</h1>
        <p className="title-card__jp">ハイスコア</p>
        <div className="periods" role="tablist">
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              role="tab"
              aria-selected={p === period}
              className={p === period ? 'periods__tab periods__tab--on' : 'periods__tab'}
              onClick={(e) => {
                if (e.detail) e.currentTarget.blur()
                setPeriod(p)
              }}
            >
              {PERIOD_TITLE[p]}
            </button>
          ))}
        </div>
        <div className="title-card__boards">
          <Leaderboard period={period} board="score" />
          <Leaderboard period={period} board="speed" />
          {period === 'week' && <TrialBoard />}
        </div>
        <p className="periods__when">
          {period === 'week' ? `new boards every monday · ${untilMonday()} to go` : 'every run since the start'}
        </p>
        {touchDevice ? (
          <TapRow>
            <button type="button" className="chip" onClick={toggleRecords}>
              back
            </button>
          </TapRow>
        ) : (
          <p className="title-card__go">← → switch · press R to go back</p>
        )}
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

/** A run's line on one board: its value, then where it places this week and of all time. */
function Result({ run, board, pr }: { run: PendingRun; board: Board; pr: boolean }) {
  const week = run.ranks.week[board]
  const all = run.ranks.all[board]
  const places = [
    week !== null && `${ordinal(week)} THIS WEEK`,
    all !== null && (all === 0 ? 'WORLD RECORD' : `${ordinal(all)} ALL TIME`),
  ].filter(Boolean)
  return (
    <li>
      {BOARD_TITLE[board].toUpperCase()} <b>{shown(board, board === 'score' ? run.score : run.streak)}</b>
      {pr && <span className="entry__pr">NEW PR</span>}
      <span className="entry__rank">{places.join(' · ')}</span>
    </li>
  )
}

// the ref marks a visit that came from a player's share, apart from my own posts (?ref=x)
const GAME_URL = 'https://playwheelsoff.com/?ref=share'

const nth = (i: number) => `${i + 1}${['st', 'nd', 'rd'][i] ?? 'th'}`

/** What a player shares about a run: its best place (a world record, or where it stands this week), and a dare. */
function shareLine(run: PendingRun): string {
  const board: Board = run.ranks.week.score !== null || run.ranks.all.score !== null ? 'score' : 'speed'
  const what = board === 'score' ? `${run.score} point${run.score === 1 ? '' : 's'}` : `${shown('speed', run.streak)} at full speed`
  const week = run.ranks.week[board]
  const all = run.ranks.all[board]
  if (all === 0) return `New world record on Wheels Off: ${what}. Can you beat it?`
  const place = week !== null ? `${nth(week)} this week` : `${nth(all ?? 0)} of all time`
  return `${what} on Wheels Off, ${place}. Can you beat it?`
}

/**
 * The run to share, under the name: a post on X with the line and the game's link filled in, or
 * the same copied, for anywhere else (WhatsApp, Discord). Mouse only: the keys type the name.
 * With `link` (a time trial run's challenge link, made on the first click), the game's link is
 * swapped for it, or kept when the challenge can't be made.
 */
function Share({ line, link }: { line: string; link?: () => Promise<string | null> }) {
  const [copy, setCopy] = useState<'ready' | 'done' | 'failed'>('ready')
  const intent = (url: string) => `https://x.com/intent/tweet?text=${encodeURIComponent(line)}&url=${encodeURIComponent(url)}`
  const url = () => (link ? link().then((u) => u ?? GAME_URL) : Promise.resolve(GAME_URL))
  const postOnX = (e: MouseEvent) => {
    if (!link) return // the plain link opens as it is
    // the tab opens now, inside the click, so no popup blocker stops it; it goes to X once the link is back
    e.preventDefault()
    const tab = window.open('', '_blank')
    if (tab) tab.opener = null
    void url().then((u) => (tab ? tab.location.replace(intent(u)) : window.open(intent(u), '_blank', 'noopener')))
  }
  const copyLine = () => {
    const text = url().then((u) => `${line} ${u}`)
    // a ClipboardItem takes the text while it is still on its way, inside the click, which Safari
    // asks for; writeText once it has arrived is the fallback
    const write =
      typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write
        ? navigator.clipboard
            .write([new ClipboardItem({ 'text/plain': text.then((t) => new Blob([t], { type: 'text/plain' })) })])
            .catch(() => text.then((t) => navigator.clipboard.writeText(t)))
        : text.then((t) => navigator.clipboard?.writeText(t) ?? Promise.reject(new Error('no clipboard')))
    write.then(
      () => setCopy('done'),
      () => setCopy('failed'),
    )
  }
  return (
    <div className="entry__share">
      <span className="entry__share-what">share it</span>
      <a className="chip" href={intent(GAME_URL)} target="_blank" rel="noopener noreferrer" onClick={postOnX}>
        post on X
      </a>
      <button className="chip" type="button" onClick={copyLine}>
        {copy === 'done' ? 'copied!' : copy === 'failed' ? 'can’t copy' : 'copy'}
      </button>
    </div>
  )
}

function NameEntry({ run }: { run: PendingRun }) {
  const [name, setName] = useState(lastName)
  const [refused, setRefused] = useState(false) // the boards turned the typed name away
  const field = useRef<HTMLInputElement>(null)
  useEffect(() => {
    field.current?.focus()
    field.current?.select()
  }, [])
  // a click anywhere else would take the keyboard away from the name
  const keepFocus = (e: MouseEvent) => {
    if (e.target !== field.current) e.preventDefault()
  }
  const wr = run.ranks.all.score === 0 || run.ranks.all.speed === 0
  const weekFirst = run.ranks.week.score === 0 || run.ranks.week.speed === 0
  const party = wr || weekFirst // a world record and the week's first place get the same burst
  return (
    <div className={party ? 'overlay overlay--wr' : 'overlay'} role="dialog" aria-label="Enter your name" onMouseDown={keepFocus}>
      {party && <WorldRecordBurst />}
      <form
        className="title-card entry"
        onSubmit={(e) => {
          e.preventDefault()
          const clean = cleanName(name)
          if (clean && !nameAllowed(clean)) setRefused(true)
          else signName(name)
        }}
      >
        {party && <Crown className="entry__crown" />}
        <h1 className={party ? 'entry__title--wr' : undefined}>
          {wr ? 'NEW WORLD RECORD!' : weekFirst ? 'TOP OF THE WEEK!' : 'HIGH SCORE!'}
        </h1>
        <ul className="entry__results">
          {(run.ranks.week.score !== null || run.ranks.all.score !== null) && <Result run={run} board="score" pr={run.prScore} />}
          {(run.ranks.week.speed !== null || run.ranks.all.speed !== null) && <Result run={run} board="speed" pr={run.prStreak} />}
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
            onChange={(e) => {
              setName(typedName(e.target.value))
              setRefused(false)
            }}
            onKeyDown={(e) => {
              if (e.key !== 'Escape') return
              e.preventDefault()
              skipRun()
            }}
          />
        </label>
        {SHARE_LINKS && <Share line={shareLine(run)} />}
        {refused ? (
          <p className="title-card__go">that name can’t go on the board · try another</p>
        ) : touchDevice ? (
          <TapRow>
            <button type="submit" className="chip">
              sign
            </button>
            <button type="button" className="chip" onClick={skipRun}>
              skip
            </button>
          </TapRow>
        ) : (
          <p className="title-card__go">press esc to skip</p>
        )}
      </form>
    </div>
  )
}

/** The time trial's board in the hi-scores card, this week only: the 10 fastest on the course. */
function TrialBoard() {
  const { board, pb } = useTrial()
  return (
    <section className="board">
      <h2 className="board__title">time trial</h2>
      <p className="board__jp">タイムトライアル</p>
      <p className="board__what">fastest on this week’s course</p>
      <ol>
        {Array.from({ length: BOARD_SIZE }, (_, i) => (
          <li key={i} className="board__row">
            <span className="board__rank">{ordinal(i)}</span>
            <span className="board__name">{board[i]?.name ?? '---'}</span>
            <span className="board__value">{board[i] ? lap(board[i].value) : ''}</span>
          </li>
        ))}
      </ol>
      <p className="board__pr">
        <Trophy />
        YOUR PB {pb !== null ? lap(pb) : '---'}
      </p>
    </section>
  )
}

/** What a player shares about a time trial run: the time, where it stands this week, and a dare. */
function trialShareLine(run: TrialRun): string {
  const where = run.rank === 0 ? ', fastest of the week' : run.rank !== null ? `, ${nth(run.rank)} this week` : ''
  return `${lap(run.time)} on this week’s Wheels Off time trial${where}. Can you beat it?`
}

/**
 * The time trial's finish card: the time, against your best and the week's board. A time that
 * makes the board asks for a name (Enter signs, Esc skips), with the run to share; first place
 * of the week gets the world record's burst. Then the next attempt lines up.
 */
function TrialResult({ run }: { run: TrialRun }) {
  const places = run.rank !== null
  const first = run.rank === 0
  const [name, setName] = useState(lastName)
  const [refused, setRefused] = useState(false)
  const field = useRef<HTMLInputElement>(null)
  useEffect(() => {
    field.current?.focus()
    field.current?.select()
  }, [])
  useEffect(() => {
    if (places) return
    // no name to type: Enter, Esc or T goes again
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      if (e.repeat || !(k === 'enter' || k === 'escape' || k === 't')) return
      e.preventDefault()
      closeResult(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [places])
  const keepFocus = (e: MouseEvent) => {
    if (places && e.target !== field.current) e.preventDefault()
  }
  // against your best before this run (none on your first this week)
  const versus = run.pb === null ? '' : run.newPb ? `${lap(run.pb - run.time)} under your PB` : `PB ${lap(run.pb)} · +${lap(run.time - run.pb)}`
  const stands = [places && `${ordinal(run.rank!)} THIS WEEK`, versus.toUpperCase()].filter(Boolean)
  return (
    <div className={first ? 'overlay overlay--wr' : 'overlay'} role="dialog" aria-label="Time trial result" onMouseDown={keepFocus}>
      {first && <WorldRecordBurst />}
      <form
        className="title-card entry"
        onSubmit={(e) => {
          e.preventDefault()
          if (!places) return closeResult(null)
          const clean = cleanName(name)
          if (clean && !nameAllowed(clean)) setRefused(true)
          else closeResult(name)
        }}
      >
        {first && <Crown className="entry__crown" />}
        <h1 className={first ? 'entry__title--wr' : undefined}>{first ? 'TOP OF THE WEEK!' : run.newPb ? 'NEW PB!' : 'FINISH!'}</h1>
        <ul className="entry__results">
          <li>
            TIME <b>{lap(run.time)}</b>
            {run.newPb && run.pb !== null && <span className="entry__pr">NEW PB</span>}
            <span className="entry__rank">{stands.join(' · ')}</span>
          </li>
        </ul>
        {places && (
          <label className="entry__label">
            enter your name
            <input
              ref={field}
              className="entry__field"
              value={name}
              maxLength={NAME_MAX}
              spellCheck={false}
              autoComplete="off"
              onChange={(e) => {
                setName(typedName(e.target.value))
                setRefused(false)
              }}
              onKeyDown={(e) => {
                if (e.key !== 'Escape') return
                e.preventDefault()
                closeResult(null)
              }}
            />
          </label>
        )}
        {SHARE_LINKS && (places || run.newPb) && <Share line={trialShareLine(run)} link={() => challengeLink(run, cleanName(name))} />}
        {touchDevice && !refused ? (
          <TapRow>
            {places ? (
              <>
                <button type="submit" className="chip">
                  sign
                </button>
                <button type="button" className="chip" onClick={() => closeResult(null)}>
                  skip
                </button>
              </>
            ) : (
              <button type="button" className="chip" onClick={() => closeResult(null)}>
                go again
              </button>
            )}
          </TapRow>
        ) : (
          <p className="title-card__go">
            {refused ? 'that name can’t go on the board · try another' : places ? 'enter to sign · esc to skip' : 'press enter to go again'}
          </p>
        )}
      </form>
    </div>
  )
}

export function Arcade() {
  const { menu, pending, result } = useArcade()
  useBoards((s) => s.version) // draws the landing page and the cards again when the boards change
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || e.target instanceof HTMLInputElement) return
      const k = e.key.toLowerCase()
      // P does nothing on the landing page; R opens the records from anywhere
      if (k === 'p' && useHud.getState().started) togglePause()
      else if (k === 'r') toggleRecords()
      else if (k === 'g') toggleGhost() // the time trial's ghost, off and on, from anywhere
      else if (k === 'escape') resume()
      else if (k === 'f') {
        // only on the landing page, which rolls off in free roam, or the pause screen, which
        // rolls on in the other mode: a stray F mid-ride never ends a run
        const { menu, pending, result } = useArcade.getState()
        if (pending || result || !(menu === 'pause' || (menu === null && !useHud.getState().started))) return
        switchMode()
        resume()
      } else if (k === 't') {
        // the landing page or the pause screen: into the time trial, or a fresh attempt in it; and
        // mid-ride in the trial, straight back to the start line
        const { menu, pending, result } = useArcade.getState()
        if (pending || result) return
        const landing = menu === null && !useHud.getState().started
        if (menu === 'pause' || landing) {
          enterTrial()
          resume()
        } else if (menu === null && useMode.getState().mode === 'trial') startAttempt()
      } else if (k === 'a' && useArcade.getState().menu === 'pause' && useMode.getState().mode !== 'arcade') {
        setMode('arcade')
        resume()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  let card = null
  if (pending) card = <NameEntry key={pending.id} run={pending} />
  else if (result) card = <TrialResult key={result.id} run={result} />
  else if (menu === 'records') card = <HiScoresCard />
  else if (menu === 'pause') card = <PauseCard />
  return (
    <>
      <Landing />
      {card}
    </>
  )
}
