// What the game (src/game/leaderboard.ts) and the API that keeps the boards for everyone
// (functions/api/leaderboard.ts) agree on: the boards' shape and the rules for a name.

export type Board = 'score' | 'speed'
export type Entry = { name: string; value: number } // speed values in seconds
export type Boards = Record<Board, Entry[]>

export const BOARD_SIZE = 10
export const NAME_MAX = 12

// A name holds letters, digits, spaces and . - _ ! ? ' only: what the arcade type can draw, and
// nothing that can hide a word from the filter below.
const NOT_IN_A_NAME = /[^A-Za-z0-9 .\-_!?']/g

/** A name as it is typed: what a name may not hold is dropped, as the keys are pressed. */
export const typedName = (raw: string) => raw.replace(NOT_IN_A_NAME, '').slice(0, NAME_MAX)

/** A typed name made fit for the table: single spaces, at most NAME_MAX characters. */
export function cleanName(raw: string): string {
  return typedName(raw.replace(/\s+/g, ' ').trim()).trim()
}

// Names the boards turn away. Read past look-alike digits (5H1T) and repeated letters (FUUUCK),
// so each word is written with no double letters. A word in ANYWHERE is caught inside a longer
// name; a word in ALONE only on its own, as it hides inside harmless ones (class, title, grape).
// A first line only: rows are hidden by hand for the rest (README, Leaderboards).
// (Kept off ANYWHERE for the Japanese names they sit in: fuk for Fukuda, niga for Niigata.)
const ANYWHERE = [
  'fuck', 'shit', 'cunt', 'niger', 'fagot', 'bitch', 'whore', 'slut', 'pusy', 'penis', 'vagina',
  'porn', 'jiz', 'nazi', 'hitler', 'retard', 'ashole', 'trany',
]
const ALONE = [
  'as', 'cum', 'tit', 'tits', 'dick', 'cock', 'fag', 'fuk', 'niga', 'nigas', 'rape', 'kike', 'spic',
  'chink', 'dyke', 'anal', 'kys', 'wank', 'wanker',
]
const LOOKALIKE: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '!': 'i' }

const squeeze = (s: string) => s.replace(/(.)\1+/g, '$1')

/** Whether a cleaned name may go on the boards. */
export function nameAllowed(name: string): boolean {
  if (!name) return false
  const read = name.toLowerCase().replace(/[0-9!]/g, (c) => LOOKALIKE[c] ?? c)
  const letters = squeeze(read.replace(/[^a-z]/g, ''))
  if (ANYWHERE.some((w) => letters.includes(w))) return false
  const words = read.split(/[^a-z]+/).map(squeeze)
  return !words.some((w) => ALONE.includes(w))
}
