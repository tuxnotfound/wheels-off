import { memo, useEffect, useMemo } from 'react'
import type { ReactNode } from 'react'
import * as THREE from 'three'
import { BOX, CYL, FLAT, PANEL } from '../look/geom'
import { decalMat, lineMat, paintMat } from '../look/materials'
import { roadTextTex, signTex } from '../look/textures'
import { KeiTruck, M, StopSign, UtilityPole } from './parts'
import { LitterView, PaintedLot, PropView, StreetTree } from './painted'
import { ObstacleView } from './ObstacleView'
import { blockObstacles, blockPlan, h, POLE_U } from './streetGen'
import type { BlockPlan } from './streetGen'
import { BLOCK, CURB, SIDEWALK } from './worldConfig'

export type BlockDesc = {
  key: string
  seed: number
  k: number
  ix: number // world position of intersection k
  iz: number
  dir: number
  width: number
  u0: number
}

const ROAD = '#86959a'
const WALK = '#c3cbc4'
const PAINT = '#f1f1ea'
const WIRE_Y = [7.45, 7.45, 6.9]
const WIRE_S = [-0.72, 0.72, 0]

/** Sagging wires between consecutive poles on the pole side, as one draw call. */
function useWires(plan: BlockPlan, half: number): THREE.LineSegments {
  const lines = useMemo(() => {
    const pts: number[] = []
    const s0 = plan.poleSide * (half + 0.4)
    const spans: [number, number][] = [
      [POLE_U[0], POLE_U[1]],
      [POLE_U[1], BLOCK + POLE_U[0]],
    ]
    for (const [a, b] of spans) {
      for (let w = 0; w < 3; w++) {
        const N = 10
        for (let i = 0; i < N; i++) {
          for (const j of [i, i + 1]) {
            const t = j / N
            pts.push(s0 + WIRE_S[w], WIRE_Y[w] - Math.sin(t * Math.PI) * 0.6, -(a + (b - a) * t))
          }
        }
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    return new THREE.LineSegments(g, lineMat('#2b3634'))
  }, [plan, half])
  useEffect(() => () => lines.geometry.dispose(), [lines])
  return lines
}

function Block({ seed, k, ix, iz, dir, width, u0 }: Omit<BlockDesc, 'key'>) {
  const plan = useMemo(() => blockPlan(seed, k, width, u0), [seed, k, width, u0])
  const obstacles = useMemo(() => blockObstacles(seed, k, width), [seed, k, width])
  const half = width / 2
  const wires = useWires(plan, half)
  const els: ReactNode[] = []
  const len = BLOCK - plan.roadFrom

  // road surface + paint
  els.push(<M key="road" g={FLAT} c={ROAD} p={[0, 0, -(plan.roadFrom + BLOCK) / 2]} s={[width, 1, len]} />)
  for (const { side, walk, gapStart, gapEnd } of plan.sides) {
    // sidewalk slab
    els.push(
      <M key={`walk${side}`} g={BOX} c={WALK} p={[side * (half + SIDEWALK / 2), CURB / 2, -(walk.a + walk.b) / 2]} s={[SIDEWALK, CURB, walk.b - walk.a]} />,
    )
    // solid edge line, broken where a side-street opens
    const a = Math.max(plan.roadFrom, gapStart) + 0.4
    const b = BLOCK - gapEnd - 0.4
    if (b > a) els.push(<M key={`edge${side}`} g={FLAT} m={paintMat(PAINT)} p={[side * (half - 0.35), 0, -(a + b) / 2]} s={[0.14, 1, b - a]} />)
  }
  const endPaint = plan.crosswalk ? BLOCK - plan.crosswalk - 3.2 : BLOCK
  if (width >= 7) {
    for (let u = plan.roadFrom + 2; u + 2.4 < endPaint; u += 5) {
      els.push(<M key={`dash${u}`} g={FLAT} m={paintMat(PAINT)} p={[0, 0, -(u + 1.2)]} s={[0.14, 1, 2.4]} />)
    }
  }
  if (plan.crosswalk) {
    const uc = BLOCK - plan.crosswalk - 1.5
    for (let s = -half + 0.7; s <= half - 0.6; s += 0.95) {
      els.push(<M key={`zebra${s}`} g={FLAT} m={paintMat(PAINT)} p={[s + 0.22, 0, -uc]} s={[0.48, 1, 2.2]} />)
    }
    els.push(<M key="stopline" g={FLAT} m={paintMat(PAINT)} p={[-half / 2, 0, -(uc - 1.8)]} s={[half - 0.4, 1, 0.3]} />)
    if (plan.stopText) {
      els.push(
        <M key="tomare" g={FLAT} m={decalMat('road:止まれ', roadTextTex('止まれ'), true)} p={[-half / 2, 0, -(uc - 5)]} s={[1.5, 1, 4.4]} />,
      )
    }
    els.push(<StopSign key="stop" s={-(half + 0.7)} u={BLOCK - plan.crosswalk - 3.2} />)
  }

  // painted buildings, walls, trees, and what stands on the sidewalk
  plan.lots.forEach((lot, i) => els.push(<PaintedLot key={`lot${i}`} lot={lot} half={half} />))
  plan.props.forEach((spot, i) => els.push(<PropView key={`prop${i}`} spot={spot} half={half} />))
  plan.trees.forEach((t, i) => els.push(<StreetTree key={`tree${i}`} side={t.side} u={t.u} half={half} />))
  plan.litter.forEach((l, i) => els.push(<LitterView key={`litter${i}`} l={l} />))

  // utility poles on one side, clear of openings
  const ps = plan.sides.find((x) => x.side === plan.poleSide)!
  POLE_U.forEach((u, i) => {
    if (u < ps.walk.a + 0.6 || u > ps.walk.b - 0.6) return
    els.push(<UtilityPole key={`pole${i}`} s={plan.poleSide * (half + 0.4)} u={u} transformer={h(seed, k, 700 + i) > 0.6} />)
  })
  els.push(<primitive key="wires" object={wires} />)

  if (plan.truck) els.push(<KeiTruck key="truck" s={plan.truck.side * (half + 0.2)} u={plan.truck.u} />)

  if (plan.overpass) {
    const uc = 16
    const span = width + 2 * SIDEWALK + 2
    const ss = -plan.poleSide * (half + SIDEWALK / 2 + 0.2)
    els.push(
      <group key="overpass">
        <M c="#8fd0bd" p={[0, 5.4, -uc]} s={[span, 0.45, 2.4]} />
        <M c="#a6dccb" p={[0, 6.1, -(uc - 1.15)]} s={[span, 1.0, 0.1]} />
        <M c="#a6dccb" p={[0, 6.1, -(uc + 1.15)]} s={[span, 1.0, 0.1]} />
        {[-1, 1].map((sd) => (
          <M key={sd} g={CYL} c="#7fc1ad" p={[sd * (half + SIDEWALK - 0.4), 2.7, -uc]} s={[0.45, 5.4, 0.45]} />
        ))}
        <M g={BOX} c="#8fd0bd" p={[ss, 2.7, -(uc - 1.2 - 4.5)]} s={[1.4, 0.3, 10.5]} r={[0.54, 0, 0]} />
        <M
          g={PANEL}
          m={decalMat('sign-h:歩道橋', signTex('歩道橋', '#e9f3ee', false))}
          p={[0, 5.45, -(uc - 1.23)]}
          s={[3.2, 0.8, 1]}
        />
      </group>,
    )
  }

  obstacles.forEach((ob) => els.push(<ObstacleView key={ob.id} ob={ob} k={k} />))

  return (
    <group position={[ix, 0, iz]} rotation-y={(-dir * Math.PI) / 2}>
      {els}
    </group>
  )
}

export const BlockView = memo(Block)

