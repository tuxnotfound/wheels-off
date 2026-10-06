import { create } from 'zustand'
import { standing } from './records'

type Toast = { id: number; text: string; kind: 'clear' | 'hit' }
type HudState = {
  started: boolean
  score: number
  combo: number
  speed: number // km/h
  streak: number // seconds above STREAK_KMH, to a tenth
  best: { score: number; streak: number } // the records this run has to beat, streak to a tenth
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
  best: { score: standing.score, streak: Math.floor(standing.streak * 10) / 10 },
  turns: null,
  toast: null,
  street: null,
}))
