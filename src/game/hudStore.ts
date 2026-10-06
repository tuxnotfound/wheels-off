import { create } from 'zustand'
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
  turns: { left: boolean; right: boolean } | null
  toast: Toast | null
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
  turns: null,
  toast: null,
  street: null,
}))
