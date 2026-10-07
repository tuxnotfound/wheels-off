// Lo-fi hip hop, composed live in Web Audio, with no audio files. A tune is a key, a tempo, a
// loop of four jazz chords on an electric piano, a boom-bap beat and a bass that follows the
// kick. It runs 32 bars (about a minute and a half): an intro on the keys alone, a melody in
// the second half and a breakdown without drums. Then the next tune starts in another key.
// Everything goes through a tape (slow pitch wobble, soft saturation) with vinyl crackle on top.

const BARS = 32
const STEPS = 16 // a bar in 16ths

const mtof = (m: number) => 440 * 2 ** ((m - 69) / 12)
const rand = (a: number, b: number) => a + Math.random() * (b - a)
const chance = (p: number) => Math.random() < p
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)]
/** The note of pitch class pc in the octave from lo up. */
const place = (pc: number, lo: number) => lo + ((((pc - lo) % 12) + 12) % 12)

// the tones above the root that the right hand plays (the root goes to the bass and left hand)
const CHORDS = {
  maj9: [4, 7, 11, 14],
  m9: [3, 7, 10, 14],
  m7: [3, 7, 10],
  m11: [3, 10, 14, 17],
  dom9: [4, 7, 10, 14],
  dom13: [4, 10, 14, 21],
  dom7b9: [4, 7, 10, 13],
} as const
type Chord = { degree: number; quality: keyof typeof CHORDS } // degree: semitones above the key
const same = (a: Chord, b: Chord) => a.degree === b.degree && a.quality === b.quality

const ch = (degree: number, quality: Chord['quality']): Chord => ({ degree, quality })
const PROGRESSIONS: { chords: Chord[]; minor: boolean }[] = [
  { chords: [ch(2, 'm9'), ch(7, 'dom13'), ch(0, 'maj9'), ch(9, 'm9')], minor: false }, // ii V I vi
  { chords: [ch(5, 'maj9'), ch(4, 'm7'), ch(2, 'm9'), ch(0, 'maj9')], minor: false }, // IV iii ii I
  { chords: [ch(5, 'maj9'), ch(4, 'dom7b9'), ch(9, 'm9'), ch(0, 'dom9')], minor: false }, // IV III vi I7
  { chords: [ch(0, 'maj9'), ch(9, 'm9'), ch(2, 'm11'), ch(7, 'dom7b9')], minor: false }, // I vi ii V
  { chords: [ch(0, 'm9'), ch(5, 'm9'), ch(8, 'maj9'), ch(7, 'dom7b9')], minor: true }, // i iv VI V
  { chords: [ch(0, 'm11'), ch(0, 'm11'), ch(5, 'dom9'), ch(5, 'dom9')], minor: true }, // i IV, dorian
]
const KEYS = [0, 2, 3, 5, 7, 8, 10] // C D Eb F G Ab Bb
const KICKS = [[0, 10], [0, 7, 10], [0, 3, 10], [0, 8, 11]]
const SNARES = [4, 12]
// how the keys comp each bar: where a chord is struck, for how many 16ths, how hard
const COMPS = [
  [{ step: 0, len: 16, vel: 1 }],
  [{ step: 0, len: 6, vel: 1 }, { step: 6, len: 10, vel: 0.7 }],
  [{ step: 0, len: 10, vel: 1 }, { step: 10, len: 6, vel: 0.75 }],
  [{ step: 0, len: 3, vel: 0.9 }, { step: 3, len: 7, vel: 0.65 }, { step: 10, len: 6, vel: 0.75 }],
]
const PENTA = { major: [0, 2, 4, 7, 9], minor: [0, 3, 5, 7, 10] }

type Tune = {
  key: number // pitch class of the tonic
  bpm: number
  swing: number // how late the off 16ths land, as a share of a 16th
  chords: Chord[]
  minor: boolean
  barsPerChord: number
  kicks: number[]
  comp: (typeof COMPS)[number]
  hats: number // chance of an extra hat on an off 16th
}

function newTune(prev: Tune | null): Tune {
  const prog = pick(PROGRESSIONS.filter((p) => p.chords !== prev?.chords))
  const vamp = same(prog.chords[0], prog.chords[1])
  return {
    key: pick(KEYS.filter((k) => k !== prev?.key)),
    bpm: Math.round(rand(70, 86)),
    swing: rand(0.18, 0.36),
    chords: prog.chords,
    minor: prog.minor,
    barsPerChord: vamp ? 1 : pick([1, 1, 2]),
    kicks: pick(KICKS),
    comp: pick(COMPS),
    hats: rand(0.05, 0.3),
  }
}

/** The right hand: the chord's upper tones, each in the octave from G3, so chords move by small steps. */
const voice = (root: number, c: Chord) => CHORDS[c.quality].map((i) => place(root + i, 55)).sort((a, b) => a - b)

/** Melody notes over a chord: its own tones, plus the tune's pentatonic notes that do not rub against it. */
function melodyNotes(tune: Tune, c: Chord): number[] {
  const root = tune.key + c.degree
  const tones = [0, ...CHORDS[c.quality]].map((i) => (root + i) % 12)
  const near = (a: number, b: number) => Math.min((a - b + 12) % 12, (b - a + 12) % 12) === 1
  const scale = PENTA[tune.minor ? 'minor' : 'major'].map((i) => (tune.key + i) % 12)
  const pcs = new Set([...tones, ...scale.filter((s) => !tones.some((t) => near(s, t)))])
  const notes: number[] = []
  for (let m = 65; m <= 81; m++) if (pcs.has(m % 12)) notes.push(m)
  return notes
}

/** A second of white noise, for the drums to filter. */
function noiseBuffer(ctx: BaseAudioContext) {
  const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  return buf
}

/** Vinyl: a low hiss with sparse clicks and the odd louder pop, each channel its own. */
function crackleBuffer(ctx: BaseAudioContext) {
  const seconds = 7.3 // loops, at an odd length so it never lines up with the beat
  const buf = ctx.createBuffer(2, Math.round(ctx.sampleRate * seconds), ctx.sampleRate)
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c)
    let hiss = 0
    for (let i = 0; i < d.length; i++) {
      hiss += ((Math.random() * 2 - 1) * 0.02 - hiss) * 0.25 // a one-pole lowpass takes the hiss's edge off
      d[i] = hiss
    }
    for (let n = 0; n < seconds * 9; n++) {
      const at = Math.floor(Math.random() * (d.length - 8))
      const amp = (chance(0.08) ? rand(0.12, 0.25) : rand(0.03, 0.12)) * (chance(0.5) ? 1 : -1)
      for (let k = 0; k < 6; k++) d[at + k] += amp * 0.5 ** k
    }
  }
  return buf
}

/** A soft clip: loud peaks round off instead of breaking up, like a pushed tape. */
function tapeCurve(drive: number) {
  const curve = new Float32Array(1025)
  for (let i = 0; i < curve.length; i++) {
    const x = (i / 512 - 1) * drive
    curve[i] = Math.tanh(x) / Math.tanh(drive)
  }
  return curve
}

function lfo(ctx: BaseAudioContext, hz: number, depth: number, param: AudioParam) {
  const osc = ctx.createOscillator()
  const amount = ctx.createGain()
  osc.frequency.value = hz
  amount.gain.value = depth
  osc.connect(amount).connect(param)
  osc.start()
}


export type Lofi = {
  /** Starts the first tune at a context time. */
  start(at: number): void
  /** Schedules every 16th that starts before `until` (context time). Called often, a little ahead of the clock. */
  fill(until: number): void
}

/** The band, playing into `out`. Nothing sounds until start and fill. */
export function createLofi(ctx: BaseAudioContext, out: AudioNode): Lofi {
  // tape: a short delay whose length drifts slowly (wow) and quickly (flutter) bends the pitch
  const tape = ctx.createDelay(0.1)
  tape.delayTime.value = 0.02
  lfo(ctx, 0.45, 0.0018, tape.delayTime)
  lfo(ctx, 5.8, 0.00012, tape.delayTime)
  const warm = ctx.createWaveShaper()
  warm.curve = tapeCurve(1.4)
  warm.oversample = '2x'
  tape.connect(warm).connect(out)

  // the electric piano's tremolo, and the dip under each kick
  const keys = ctx.createGain()
  const tremolo = ctx.createGain()
  tremolo.gain.value = 0.93
  lfo(ctx, 4.2, 0.07, tremolo.gain)
  const duck = ctx.createGain()
  keys.connect(tremolo).connect(duck).connect(tape)

  const drums = ctx.createGain()
  const dull = ctx.createBiquadFilter() // lowpass
  dull.frequency.value = 9000
  drums.connect(dull).connect(tape)

  const noise = noiseBuffer(ctx)
  const vinyl = ctx.createBufferSource()
  const vinylLevel = ctx.createGain()
  vinyl.buffer = crackleBuffer(ctx)
  vinyl.loop = true
  vinylLevel.gain.value = 1.6
  vinyl.connect(vinylLevel).connect(out)
  vinyl.start()

  let tune = newTune(null)
  let bar = 0
  let step = 0
  let next = 0 // when the next 16th starts, in context time
  let chord = tune.chords[0]
  let voicing: number[] = []
  let approach = false // the bass walks into the next bar's chord
  let melodyFree = 0 // when the melody's last note ends
  let melodyLast = 72

  const chordAt = (b: number) => tune.chords[Math.floor(b / tune.barsPerChord) % tune.chords.length]

  function play(t: number) {
    const s = step
    const sd = 60 / tune.bpm / 4
    const at = t + (s % 2 ? tune.swing * sd : 0)
    const intro = bar < 4
    const beat = !intro && !(bar >= 20 && bar < 24) && bar < BARS - 1 // drums out for the breakdown and the last bar
    const root = tune.key + chordAt(bar).degree

    if (s === 0) {
      chord = chordAt(bar)
      voicing = voice(root, chord)
      approach = bar < BARS - 1 && !same(chordAt(bar + 1), chord) && chance(0.4)
    }

    // keys: a quick strum up the voicing over a low root
    const repeat = bar % tune.barsPerChord === 1
    for (const hit of tune.comp) {
      if (hit.step !== s) continue
      const vel = hit.vel * (repeat ? 0.8 : 1)
      const len = hit.len * sd
      epiano(at, place(root, 43), len, vel * 0.75)
      voicing.forEach((m, i) => epiano(at + 0.012 * (i + 1) + rand(0, 0.006), m, len, vel * rand(0.8, 1)))
    }

    // bass: on the kick, the root first, then the root, fifth or octave
    if (!intro) {
      const low = place(root, 36)
      const end = approach ? 14 : STEPS
      if (tune.kicks.includes(s) && s < end) {
        const after = tune.kicks.find((k) => k > s) ?? STEPS
        const note = s === 0 ? low : pick([low, low, low + 7 > 47 ? low - 5 : low + 7, low + 12])
        bass(at, note, (Math.min(after, end) - s) * sd, rand(0.85, 1))
      }
      if (approach && s === 14) bass(at, place(tune.key + chordAt(bar + 1).degree, 36) + pick([-1, 1]), 2 * sd, 0.8)
    }

    if (beat) {
      if (tune.kicks.includes(s)) {
        kick(at, s === 0 ? 1 : 0.85)
        dip(at)
      }
      if (SNARES.includes(s)) snare(at + rand(0, 0.008), rand(0.85, 1))
      else if ((s === 7 || s === 15) && chance(0.12)) snare(at, 0.25)
      const late = rand(-0.004, 0.006)
      if (s === 14 && chance(0.2)) hat(at + late, 0.6, true)
      else if (s % 2 === 0) hat(at + late, s % 4 === 0 ? 0.65 : 0.5, false)
      else if (chance(tune.hats)) hat(at + late, 0.28, false)
    }

    // melody: short phrases on the 8ths from bar 12, busier on even bars, resting through the breakdown
    const melody = (bar >= 12 && bar < 20) || bar >= 24
    if (melody && s % 2 === 0 && at >= melodyFree - 0.01 && chance(bar % 2 ? 0.15 : 0.5)) {
      const notes = melodyNotes(tune, chord)
      const near = notes.filter((m) => m !== melodyLast && Math.abs(m - melodyLast) <= 5)
      const note = pick(near.length ? near : notes)
      const len = pick([2, 2, 3, 4, 6]) * sd
      epiano(at, note, len, rand(0.55, 0.8))
      melodyLast = note
      melodyFree = at + len
    }
  }

  /** A soft FM electric piano: bright at the strike, mellowing as it rings. */
  function epiano(t: number, midi: number, len: number, vel: number) {
    const f = mtof(midi)
    const carrier = ctx.createOscillator()
    const mod = ctx.createOscillator()
    const depth = ctx.createGain()
    const amp = ctx.createGain()
    const pan = ctx.createStereoPanner()
    carrier.frequency.value = f
    carrier.detune.value = rand(-5, 5)
    mod.frequency.value = f
    depth.gain.setValueAtTime(f * (0.5 + 1.1 * vel), t)
    depth.gain.setTargetAtTime(f * 0.18, t, 0.25)
    const peak = 0.12 * vel
    amp.gain.setValueAtTime(0, t)
    amp.gain.linearRampToValueAtTime(peak, t + 0.005)
    amp.gain.setTargetAtTime(0, t + 0.005, Math.max(0.5, 1.2 + (72 - midi) * 0.02))
    amp.gain.setTargetAtTime(0, t + len, 0.07)
    pan.pan.value = Math.max(-0.4, Math.min(0.4, (midi - 62) / 30))
    mod.connect(depth).connect(carrier.frequency)
    carrier.connect(amp).connect(pan).connect(keys)
    for (const o of [carrier, mod]) {
      o.start(t)
      o.stop(t + len + 0.5)
    }
  }

  function bass(t: number, midi: number, len: number, vel: number) {
    const f = mtof(midi)
    const tri = ctx.createOscillator()
    const sine = ctx.createOscillator()
    const lp = ctx.createBiquadFilter()
    const amp = ctx.createGain()
    tri.type = 'triangle'
    tri.frequency.value = f
    sine.frequency.value = f
    lp.frequency.value = 450
    amp.gain.setValueAtTime(0, t)
    amp.gain.linearRampToValueAtTime(0.07 * vel, t + 0.01)
    amp.gain.setTargetAtTime(0.045 * vel, t + 0.01, 0.3)
    amp.gain.setTargetAtTime(0, t + Math.max(0.02, len - 0.03), 0.03)
    tri.connect(lp).connect(amp)
    sine.connect(amp)
    amp.connect(tape)
    for (const o of [tri, sine]) {
      o.start(t)
      o.stop(t + len + 0.3)
    }
  }

  function dip(t: number) {
    duck.gain.setValueAtTime(1, t)
    duck.gain.linearRampToValueAtTime(0.72, t + 0.015)
    duck.gain.setTargetAtTime(1, t + 0.015, 0.14)
  }

  function kick(t: number, vel: number) {
    const osc = ctx.createOscillator()
    const amp = ctx.createGain()
    osc.frequency.setValueAtTime(150, t)
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.12)
    amp.gain.setValueAtTime(0.45 * vel, t)
    amp.gain.exponentialRampToValueAtTime(0.001, t + 0.42)
    osc.connect(amp).connect(drums)
    osc.start(t)
    osc.stop(t + 0.45)
  }

  function snare(t: number, vel: number) {
    burst(t, 0.06, 'bandpass', 1500, 0.45 * vel).Q.value = 0.6
    const body = ctx.createOscillator()
    const amp = ctx.createGain()
    body.type = 'triangle'
    body.frequency.value = 180
    amp.gain.setValueAtTime(0.25 * vel, t)
    amp.gain.setTargetAtTime(0, t, 0.03)
    body.connect(amp).connect(drums)
    body.start(t)
    body.stop(t + 0.2)
  }

  function hat(t: number, vel: number, open: boolean) {
    burst(t, open ? 0.07 : 0.012, 'highpass', 5000, 0.2 * vel)
  }

  /** Filtered noise dying away with time constant `decay`: the snare's rattle and the hats. */
  function burst(t: number, decay: number, type: BiquadFilterType, hz: number, level: number) {
    const src = ctx.createBufferSource()
    const filter = ctx.createBiquadFilter()
    const amp = ctx.createGain()
    src.buffer = noise
    filter.type = type
    filter.frequency.value = hz
    amp.gain.setValueAtTime(level, t)
    amp.gain.setTargetAtTime(0, t, decay)
    src.connect(filter).connect(amp).connect(drums)
    src.start(t, rand(0, 0.5))
    src.stop(t + decay * 6)
    return filter
  }

  return {
    start(at) {
      next = at
    },
    fill(until) {
      // fell behind (the page stalled): skip ahead rather than play a pile of notes at once
      if (next < ctx.currentTime) next = ctx.currentTime + 0.02
      while (next < until) {
        play(next)
        next += 60 / tune.bpm / 4
        if (++step < STEPS) continue
        step = 0
        if (++bar < BARS) continue
        bar = 0
        tune = newTune(tune)
      }
    },
  }
}
