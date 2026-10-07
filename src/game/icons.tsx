// Inked HUD icons, drawn to match the cel outlines of the game.

/** Seconds as 12.4s, or 1:05.3 past a minute. */
export const secs = (s: number) =>
  s < 60 ? `${s.toFixed(1)}s` : `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`

/** Lit next to a live value while it is beating a record; hotter while it is beating the world record. */
export function Flame({ wr = false }: { wr?: boolean }) {
  return (
    <svg className={wr ? 'hud-flame hud-flame--wr' : 'hud-flame'} viewBox="0 0 24 24" aria-label="beating a record">
      <path
        className="hud-flame__outer"
        d="M12 2C13 6 18 8.5 18 14.5a6 6 0 0 1-12 0C6 11.5 7.7 9.6 8.4 7.6 9.7 8.8 10.3 9.9 10.4 11 11.6 8.2 11.1 5 12 2Z"
      />
      <path className="hud-flame__inner" d="M12 12.2c.9 1.9 3 3 3 5.2a3 3 0 0 1-6 0c0-1.6 1.1-2.6 1.5-3.8.6.7.9 1.3.9 2 .5-1.1.6-2.2.6-3.4Z" />
    </svg>
  )
}

export function Trophy({ className = 'hud-trophy' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path className="hud-trophy__handles" d="M6.5 5H3.8a2.6 2.6 0 0 0 3.4 4.6M17.5 5h2.7a2.6 2.6 0 0 1-3.4 4.6" />
      <path className="hud-trophy__cup" d="M6 3h12v5.5a6 6 0 0 1-12 0Z" />
      <path className="hud-trophy__cup" d="M10.5 14.2h3L13.2 18h-2.4ZM7.5 18h9v3.2h-9Z" />
    </svg>
  )
}

/** The world record's mark. */
export function Crown({ className = 'hud-crown' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path className="hud-trophy__cup" d="M3.6 8.6 8 12.2 12 5.2l4 7 4.4-3.6-1.8 9.6H5.4Z" />
      <path className="hud-trophy__cup" d="M5.4 18.2h13.2v3H5.4Z" />
      <circle className="hud-crown__gem" cx="3.6" cy="8.2" r="1.5" />
      <circle className="hud-crown__gem" cx="12" cy="4.6" r="1.5" />
      <circle className="hud-crown__gem" cx="20.4" cy="8.2" r="1.5" />
    </svg>
  )
}

/** The music's mark: two beamed notes, struck through while it is off. */
export function Note({ off }: { off: boolean }) {
  return (
    <svg className="hud-note" viewBox="0 0 24 24" aria-hidden="true">
      <path className="hud-trophy__handles" d="M8.6 17.4V6.2l11-2.6v11.2" />
      <path className="hud-trophy__cup" d="M8.6 6.2l11-2.6v3.4l-11 2.6Z" />
      <ellipse className="hud-trophy__cup" cx="6" cy="17.6" rx="3" ry="2.4" />
      <ellipse className="hud-trophy__cup" cx="17" cy="15" rx="3" ry="2.4" />
      {off && <path className="hud-note__off" d="M3 3l18 18" />}
    </svg>
  )
}
