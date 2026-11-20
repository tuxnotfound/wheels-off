import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import type { ReactNode } from 'react'
import * as THREE from 'three'
import { BOX, FLAT } from '../look/geom'
import { decalMat, inkMat, paintMat } from '../look/materials'
import { poleArt } from '../art/art'
import { roadTextTex } from '../look/textures'
import { M, StopSign, UtilityPole } from './parts'
import { Vehicle } from './vehicles'
import { Nobori, RooftopBillboard, StreetBanner, WallPoster } from '../ads/fixtures'
import { LitterView, PaintedLot, PropView, StreetTree } from './painted'
import { BlockObstacles } from './ObstacleView'
import { Footbridge } from './Footbridge'
import { blockPlan, h, POLE_U } from './streetGen'
import type { BlockPlan } from './streetGen'
import { BLOCK, CURB, SIDEWALK } from './worldConfig'
import { useMode } from '../game/mode'
import { input } from '../player/input'
import { bakeStatic } from './bake'

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
// where the code pole's wires meet it: across from its middle, and up from the road
const CODE_WIRES: [number, number][] = [
  [-0.72, 7.45],
  [0.72, 7.45],
  [0, 6.9],
]
const WIRE_W = 0.03 // drawn about as thick as an ink line nearby, thinning to a hairline far off

/**
 * Sagging wires between consecutive poles on the pole side, as one draw call: from the painted
 * pole's insulators, each a ribbon crossed with another, so it has a width seen from below or
 * from the side.
 */
function useWires(plan: BlockPlan, half: number): THREE.Mesh {
  const mesh = useMemo(() => {
    const pole = poleArt()
    const anchors = pole?.wires?.map(([x, y]) => [x, y + CURB]) ?? CODE_WIRES
    const pts: number[] = []
    const s0 = plan.poleSide * (half + 0.4)
    const spans: [number, number][] = [
      [POLE_U[0], POLE_U[1]],
      [POLE_U[1], BLOCK + POLE_U[0]],
    ]
    const N = 12
    for (const [a, b] of spans) {
      anchors.forEach(([x, y], w) => {
        const sag = 0.5 + 0.09 * (w % 3) // not all hung alike
        const p = (t: number) => [s0 + x, y - Math.sin(t * Math.PI) * sag, -(a + (b - a) * t)]
        for (let i = 0; i < N; i++) {
          const q = p(i / N)
          const r = p((i + 1) / N)
          // one quad up and down, one side to side
          for (const [dx, dy] of [
            [0, WIRE_W / 2],
            [WIRE_W / 2, 0],
          ]) {
            pts.push(q[0] - dx, q[1] - dy, q[2], r[0] - dx, r[1] - dy, r[2], r[0] + dx, r[1] + dy, r[2])
            pts.push(q[0] - dx, q[1] - dy, q[2], r[0] + dx, r[1] + dy, r[2], q[0] + dx, q[1] + dy, q[2])
          }
        }
      })
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    return new THREE.Mesh(g, inkMat('#2b3634'))
  }, [plan, half])
  useEffect(() => () => mesh.geometry.dispose(), [mesh])
  return mesh
}

function Block({ seed, k, ix, iz, dir, width, u0 }: Omit<BlockDesc, 'key'>) {
  // on the time trial's course, the side streets it doesn't take are built over
  const course = useMode((s) => s.mode === 'trial') && input.started
  const plan = useMemo(() => blockPlan(seed, k, width, u0, course), [seed, k, width, u0, course])
  // once mounted, the block's static parts are merged into a few meshes (bake.ts)
  const root = useRef<THREE.Group>(null!)
  useLayoutEffect(() => bakeStatic(root.current), [plan])
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
  plan.trees.forEach((t, i) => els.push(<StreetTree key={`tree${i}`} side={t.side} u={t.u} half={half} kind={t.kind} r={t.r} />))
  plan.litter.forEach((l, i) => els.push(<LitterView key={`litter${i}`} l={l} />))

  // utility poles on one side, clear of openings
  const ps = plan.sides.find((x) => x.side === plan.poleSide)!
  POLE_U.forEach((u, i) => {
    if (u < ps.walk.a + 0.6 || u > ps.walk.b - 0.6) return
    els.push(<UtilityPole key={`pole${i}`} s={plan.poleSide * (half + 0.4)} u={u} transformer={h(seed, k, 700 + i) > 0.6} />)
  })
  els.push(<primitive key="wires" object={wires} />)

  // parked vehicles and bikes, and the ad fixtures (slot ids are stable per block)
  const id = `${seed}:${k}`
  plan.vehicles.forEach((v, i) => els.push(<Vehicle key={`veh${i}`} spot={v} slot={`${id}:van${i}`} />))
  plan.billboards.forEach((b, i) => els.push(<RooftopBillboard key={`bb${i}`} {...b} slot={`${id}:billboard${i}`} />))
  if (plan.banner) els.push(<StreetBanner key="banner" u={plan.banner.u} half={half} r={plan.banner.r} slot={`${id}:banner`} />)
  plan.nobori.forEach((n, i) => els.push(<Nobori key={`nobori${i}`} {...n} slot={`${id}:nobori${i}`} />))
  plan.posters.forEach((p, i) => els.push(<WallPoster key={`poster${i}`} {...p} slot={`${id}:poster${i}`} />))

  if (plan.overpass) els.push(<Footbridge key="overpass" half={half} poleSide={plan.poleSide} />)

  els.push(<BlockObstacles key="obstacles" seed={seed} k={k} width={width} />)

  return (
    <group ref={root} position={[ix, 0, iz]} rotation-y={(-dir * Math.PI) / 2}>
      {els}
    </group>
  )
}

export const BlockView = memo(Block)

