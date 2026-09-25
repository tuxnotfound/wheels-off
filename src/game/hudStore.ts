import { create } from 'zustand'

type Toast = { id: number; text: string; kind: 'clear' | 'hit' }
type HudState = {
  started: boolean
  score: number
  combo: number
  speed: number // km/h
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
  turns: null,
  toast: null,
  street: null,
}))
