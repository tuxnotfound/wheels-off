import { create } from 'zustand'
import { worldRecord } from './leaderboard'
import { records } from './records'

type Toast = { id: number; text: string; kind: 'clear' | 'hit' }
type HudState = {
  started: boolean
  score: number
  combo: number
  speed: number // km/h
  streak: number // seconds above STREAK_KMH, to a tenth
  // the records (streak to a tenth), and whether the current run is the one setting them
  best: { score: number; streak: number; beatingScore: boolean; beatingStreak: boolean }
  // the leaderboard tops (streak to a tenth), and whether the live values are beating them
  wr: { score: number; scoreName: string; streak: number; streakName: string; beatingScore: boolean; beatingStreak: boolean }
  turns: { left: boolean; right: boolean } | null
  toast: Toast | null
  record: { id: number; score: number | null; streak: number | null } | null // records the last run set
  street: { id: number; name: string; kanji: string } | null
}

// Low-frequency mirror of the sim for the DOM overlay. Written only when a value changes.
export const useHud = create<HudState>(() => ({
  started: false,
  score: 0,
  combo: 0,
  speed: 0,
  streak: 0,
  best: { score: records.score, streak: Math.floor(records.streak * 10) / 10, beatingScore: false, beatingStreak: false },
  wr: {
    score: worldRecord('score')?.value ?? 0,
    scoreName: worldRecord('score')?.name ?? '',
    streak: Math.floor((worldRecord('speed')?.value ?? 0) * 10) / 10,
    streakName: worldRecord('speed')?.name ?? '',
    beatingScore: false,
    beatingStreak: false,
  },
  turns: null,
  toast: null,
  record: null,
  street: null,
}))
