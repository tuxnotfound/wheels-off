import { useMemo } from 'react'
import * as THREE from 'three'
import { BOX, PANEL, panelWindow } from '../look/geom'
import { decalMat } from '../look/materials'
import { signTex } from '../look/textures'
import { paintedDepth, paintedMat, propArt } from '../art/art'
import type { PropArt } from '../art/art'
import { M } from './parts'
import { FOOTBRIDGE } from './streetGen'
import { SIDEWALK } from './worldConfig'

// 歩道橋: a footbridge over the street. A deck on two pillars, its faces the painted span tile
// (`bridge-span`: a girder under a railing of bars) repeated across, and one flight of stairs
// down to the sidewalk. Block-local frame: +x across the street, -z forward (u grows).

const { u: U, deck: DECK, under: UNDER, walk: WALK, steps: STEPS, run: RUN } = FOOTBRIDGE
const STAIR_W = 1.4
const RAIL = 1.0 // the stairs' handrail, over each tread

/** One flight of steps as a solid: treads and risers on top, a sloped slab under them. */
function stairGeometry(): THREE.BufferGeometry {
  const rise = WALK / STEPS
  const s = new THREE.Shape()
  s.moveTo(0, WALK)
  for (let i = 0; i < STEPS; i++) {
    s.lineTo((i + 1) * RUN, WALK - i * rise)
    s.lineTo((i + 1) * RUN, WALK - (i + 1) * rise)
  }
  s.lineTo(STEPS * RUN - 0.6, 0)
  s.lineTo(0, WALK - 0.6)
  const g = new THREE.ExtrudeGeometry(s, { depth: STAIR_W, bevelEnabled: false })
  // the profile's x runs down the stairs: turn it to +z, and center the width on x = 0
  g.rotateY(-Math.PI / 2).translate(STAIR_W / 2, 0, 0)
  return g
}
let stairs: THREE.BufferGeometry | null = null

/** One face of the deck: the span tile repeated across, centered, the end tiles cut short. */
function Face({ art, span, z, rotY }: { art: PropArt; span: number; z: number; rotY: number }) {
  const T = art.width
  const n = Math.ceil(span / T - 0.01)
  const cut = (n * T - span) / 2 // cut from each end tile
  const mat = paintedMat(art.image)
  const depth = paintedDepth(art.image)
  return (
    <group position={[0, UNDER, z]} rotation={[0, rotY, 0]}>
      {Array.from({ length: n }, (_, i) => {
        const a = Math.max(0, i === 0 ? cut / T : 0)
        const b = Math.min(1, i === n - 1 ? 1 - cut / T : 1)
        const x = -span / 2 + (i * T - cut) + T * (a + b) * 0.5
        return <mesh key={i} geometry={panelWindow(a, 0, b, 1)} material={mat} position={[x, art.height / 2, 0]} scale={[T * (b - a), art.height, 1]} castShadow receiveShadow customDepthMaterial={depth} />
      })}
    </group>
  )
}

export function Footbridge({ half, poleSide }: { half: number; poleSide: number }) {
  const art = propArt('bridge-span')
  const color = art?.color ?? '#8fd0bd'
  const span = 2 * (half + SIDEWALK) - 0.2 // to just short of the facades
  const zc = -U
  const zNear = zc + DECK / 2 // the face riders come toward
  const ss = -poleSide * (half + SIDEWALK / 2 + 0.2)
  const run = STEPS * RUN
  const slope = Math.atan2(WALK, run)
  const posts = useMemo(() => Array.from({ length: Math.floor(run / 1.6) + 1 }, (_, i) => 0.3 + (i * (run - 0.6)) / Math.floor(run / 1.6)), [run])
  stairs ??= stairGeometry()
  return (
    <group>
      {/* the deck: its faces painted, the box between them in the paint's color */}
      <M c={color} p={[0, (UNDER + 0.05 + WALK) / 2, zc]} s={[span, WALK - UNDER - 0.05, DECK - 0.04]} />
      {art ? (
        <>
          <Face art={art} span={span} z={zNear} rotY={0} />
          <Face art={art} span={span} z={zc - DECK / 2} rotY={Math.PI} />
        </>
      ) : (
        [1, -1].map((e) => <M key={e} c={color} p={[0, WALK + 0.5, zc + (e * DECK) / 2]} s={[span, 1.0, 0.08]} />)
      )}
      <M g={PANEL} m={decalMat('sign-h:歩道橋', signTex('歩道橋', '#e9f3ee', false))} p={[0, UNDER + (WALK - UNDER) / 2, zNear + 0.02]} s={[1.5, 0.36, 1]} />
      {/* square steel pillars at the back of each sidewalk */}
      {[-1, 1].map((sd) => (
        <group key={sd} position={[sd * (half + SIDEWALK - 0.4), 0, zc]}>
          <M g={BOX} c={color} p={[0, UNDER / 2, 0]} s={[0.4, UNDER, 0.4]} />
          <M c="#5d6866" p={[0, 0.2, 0]} s={[0.6, 0.06, 0.6]} />
        </group>
      ))}
      {/* the stairs, from the near face down the sidewalk toward oncoming riders */}
      <group position={[ss, 0, zNear]}>
        <M g={stairs} c={color} p={[0, 0, 0]} s={[1, 1, 1]} />
        {[-1, 1].map((e) => (
          <group key={e} position={[(e * (STAIR_W - 0.08)) / 2, 0, 0]}>
            {posts.map((d) => (
              <M key={d} c={color} p={[0, WALK - Math.floor(d / RUN) * (WALK / STEPS) + RAIL / 2, d]} s={[0.05, RAIL, 0.05]} />
            ))}
            <M c={color} p={[0, WALK / 2 + RAIL, run / 2]} s={[0.06, 0.06, Math.hypot(run, WALK)]} r={[slope, 0, 0]} />
            <M c={color} p={[0, WALK / 2 + RAIL / 2, run / 2]} s={[0.04, 0.04, Math.hypot(run, WALK)]} r={[slope, 0, 0]} />
          </group>
        ))}
      </group>
    </group>
  )
}
