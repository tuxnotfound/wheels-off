import * as THREE from 'three'

// One place for the time-of-day look, so sky, lights, fog and the color grade agree.
// Golden hour: a low warm sun, dusky blue overhead, peach at the horizon, violet shade.

/** Direction *toward* the sun in world space (fixed, so each street meets it differently). */
export const SUN_DIR = new THREE.Vector3(-0.55, 0.36, -0.75).normalize()

export const LIGHT = {
  sun: '#ffb46e',
  sunIntensity: 2.0,
  ambient: '#a69ed8',
  ambientIntensity: 2.5,
}

export const SKY = {
  top: '#5d7fb8', // dusky blue
  mid: '#c9a3c4', // lavender band
  horizon: '#ffc59a', // peach
  sunGlow: '#ffe2a6',
  sunDisc: '#fff4d6',
  cloud: '#ffd9c2',
  cloudShade: '#d98fa2', // pink undersides
  cloudLit: '#ffe9b0', // gold rims toward the sun
}

export const FOG = { color: '#f2bf9e', near: 55, far: 125 }

/** Post-pass grade: shadows pushed violet, highlights pushed gold. */
export const GRADE = {
  shadow: '#b4a9e8',
  highlight: '#ffdcb0',
  strength: 0.45,
}
