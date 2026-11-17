import type * as THREE from 'three'
import { BOX, FLAT, PANEL, PRISM, panelWindow, roofSlab } from '../look/geom'
import { decalMat, toonMat } from '../look/materials'
import { roofTileTex, sideWall } from '../look/buildingTex'
import { art, decalPaintMat, paintedDepth, paintedMat, propArt } from '../art/art'
import type { BuildingArt } from '../art/art'
import { M } from './parts'
import type { Litter, Lot, PropSpot } from './streetGen'
import { Tree3D } from './Tree3D'
import type { TreeKind } from './Tree3D'
import { CURB, SIDEWALK } from './worldConfig'

type V3 = [number, number, number]
// Block-local frame: +x is the right of the street, -z is "forward" (u grows).
const at = (s: number, y: number, u: number): V3 => [s, y, -u]

/** A painted cut-out standing on the ground. rotY turns it; cross adds a second plane at 90°. */
export function Card({ path, w, h, p, rotY = 0, cross = false, double = false, glow = false }: { path: string; w: number; h: number; p: V3; rotY?: number; cross?: boolean; double?: boolean; glow?: boolean }) {
  const mat = paintedMat(path, double || cross, glow)
  const depth = paintedDepth(path)
  const plane = (ry: number) => (
    <mesh geometry={PANEL} material={mat} position={[0, h / 2, 0]} rotation={[0, ry, 0]} scale={[w, h, 1]} castShadow receiveShadow customDepthMaterial={depth} />
  )
  return (
    <group position={p} rotation={[0, rotY, 0]}>
      {plane(0)}
      {cross && plane(Math.PI / 2)}
    </group>
  )
}

/** Faces the card toward the road from a lot on the given side. */
const faceRoad = (side: number) => (-side * Math.PI) / 2

/** A lot: painted facade on the street line with a plain 3D body behind it. */
export function PaintedLot({ lot, half }: { lot: Lot; half: number }) {
  const sd = lot.side
  const front = half + SIDEWALK + 0.3
  const cu = lot.a + lot.len / 2

  if (lot.kind === 'wall') {
    const tiles = Math.ceil(lot.len / 3.2 - 0.01)
    const wall = propArt('wall-block')
    return (
      <group>
        {wall &&
          Array.from({ length: tiles }, (_, i) => {
            const a = lot.a + i * 3.2
            const w = Math.min(3.2, lot.a + lot.len - a)
            return <Card key={i} path={wall.image} w={w} h={wall.height} p={at(sd * (front + 0.2), 0, a + w / 2)} rotY={faceRoad(sd)} />
          })}
        {lot.tree && <Tree3D p={at(sd * (front + 2.6 + lot.r), 0, cu)} r={lot.r} kind={lot.tree} />}
      </group>
    )
  }

  const b = lot.art
  const roofH = b.height - b.bodyHeight
  const bodyS = sd * (front + 0.04 + b.depth / 2)
  const along = lot.len - 0.05
  const side = toonMat(b.side)
  const roof = toonMat(b.roof)
  const pitched = b.roofShape === 'pitched'
  const walls = sideWall(art.buildings, b.id)
  const wall = decalMat(`sides:${walls.tex.uuid}`, walls.tex, true)
  const wallGeo = panelWindow(...walls.cell)
  return (
    <group>
      <Facade b={b} p={at(sd * front, 0, cu)} rotY={faceRoad(sd)} />
      {/* BoxGeometry groups: +x, -x, +y, -y, +z, -z */}
      <M g={BOX} m={[side, side, roof, roof, side, side]} p={at(bodyS, b.bodyHeight / 2, cu)} s={[b.depth, b.bodyHeight, along]} />
      {/* the drawn side walls, mirrored where needed so the front corner stays at the front;
          they only take shadows, the box casts them */}
      {[1, -1].map((e) => (
        <mesh key={e} geometry={wallGeo} material={wall} position={at(bodyS, b.bodyHeight / 2, cu - e * (along / 2 + 0.01))} scale={[e * sd * b.depth, b.bodyHeight, 1]} rotation={[0, e > 0 ? 0 : Math.PI, 0]} receiveShadow />
      ))}
      {b.roofShape === 'gable' && roofH > 0.5 && (
        // the painted gable faces the street, so the ridge runs back from it
        <M g={PRISM} c={b.roof} p={at(bodyS, b.bodyHeight + roofH / 2, cu)} s={[b.width + 0.3, roofH, b.depth]} r={[0, Math.PI / 2, 0]} />
      )}
      {pitched && <PitchedRoof b={b} p={at(bodyS, b.bodyHeight, cu)} along={along} />}
    </group>
  )
}

const AWNING_OUT = 0.9 // how far an awning's lower edge stands out from the wall
const PITCH = Math.tan((20 * Math.PI) / 180) // a pitched roof's slope
const EAVES = 0.55 // its overhang at the front and the back
const VERGE = 0.3 // and at the sides
const ROOF_T = 0.14 // its thickness

/**
 * The painted front, cut where 3D parts take over: above the eaves under a pitched roof, and
 * the awning's band, which leans out from the wall on its own.
 */
function Facade({ b, p, rotY }: { b: BuildingArt; p: V3; rotY: number }) {
  const H = b.height
  const top = b.roofShape === 'pitched' ? b.bodyHeight : H
  const bands: [number, number][] = b.awning ? [[0, b.awning[0]], [b.awning[1], top]] : [[0, top]]
  const mat = paintedMat(b.front)
  const depth = paintedDepth(b.front)
  const piece = (key: string, geo: THREE.BufferGeometry, m: THREE.Material, pos: V3, scale: V3, rx = 0) => (
    <mesh key={key} geometry={geo} material={m} position={pos} rotation={[rx, 0, 0]} scale={scale} castShadow receiveShadow customDepthMaterial={depth} />
  )
  let awning = null
  if (b.awning) {
    const [a0, a1] = b.awning
    const slope = Math.hypot(a1 - a0, AWNING_OUT)
    // hinged where it meets the wall, its lower edge out over the sidewalk
    awning = piece('awning', panelWindow(0, a0 / H, 1, a1 / H), paintedMat(b.front, true), [0, (a0 + a1) / 2, AWNING_OUT / 2], [b.width, slope, 1], -Math.atan2(AWNING_OUT, a1 - a0))
  }
  return (
    <group position={p} rotation={[0, rotY, 0]}>
      {bands.map(([y0, y1]) => y1 > y0 && piece(`${y0}`, panelWindow(0, y0 / H, 1, y1 / H), mat, [0, (y0 + y1) / 2, 0], [b.width, y1 - y0, 1]))}
      {awning}
    </group>
  )
}

/**
 * A tiled roof on the body, its ridge along the street: two slopes overhanging the walls, a
 * ridge cap, and the gable ends filled in the wall color. `p` is the middle of the body's top.
 */
function PitchedRoof({ b, p, along }: { b: BuildingArt; p: V3; along: number }) {
  const half = b.depth / 2
  const rise = half * PITCH
  const cos = 1 / Math.hypot(1, PITCH)
  const sin = PITCH * cos
  const run = (half + EAVES) / cos // ridge to eave tip, down the slope
  const slab = roofSlab(run, ROOF_T, along + 2 * VERGE)
  const tiles = decalMat(`tiles:${b.roof}`, roofTileTex(b.roof))
  // each slope's underside runs from the ridge (0, rise) through the wall top (±half, 0) to the tip
  const midX = (half + EAVES) / 2
  const midY = (rise - EAVES * PITCH) / 2
  return (
    <group position={p}>
      {[1, -1].map((e) => (
        <M key={e} g={slab} m={tiles} p={[e * (midX + (ROOF_T / 2) * sin), midY + (ROOF_T / 2) * cos, 0]} s={[1, 1, 1]} r={[0, 0, -e * Math.atan(PITCH)]} />
      ))}
      <M g={BOX} c={b.roof} p={[0, rise + ROOF_T / cos + 0.06, 0]} s={[0.34, 0.24, along + 2 * VERGE]} />
      <M g={PRISM} c={b.side} p={[0, rise / 2, 0]} s={[b.depth, rise, along]} />
    </group>
  )
}

/** Something on the sidewalk, backed against the lots. */
export function PropView({ spot, half }: { spot: PropSpot; half: number }) {
  const a = propArt(spot.id)
  if (!a) return null
  const s = spot.side * (half + SIDEWALK - 0.2 - (a.depth ?? 0.3) / 2)
  if (a.mode === 'box') {
    const d = a.depth ?? 0.8
    return (
      <group position={at(s, 0, spot.u)}>
        <M c={a.color ?? '#cccccc'} p={[0, a.height / 2, 0]} s={[d, a.height, a.width]} />
        <Card path={a.image} w={a.width} h={a.height} p={[(-spot.side * (d / 2 + 0.01)), 0, 0]} rotY={faceRoad(spot.side)} />
      </group>
    )
  }
  return <Card path={a.image} w={a.width} h={a.height} p={at(s, 0, spot.u)} rotY={faceRoad(spot.side)} cross={a.mode === 'cross'} double />
}

/** An occasional tree at the back of the sidewalk, its canopy arching over the pavement. */
export function StreetTree({ side, u, half, kind, r }: { side: number; u: number; half: number; kind: TreeKind; r: number }) {
  return <Tree3D p={at(side * (half + SIDEWALK - 0.5), CURB, u)} r={r} kind={kind} />
}

/** Fallen petals lying on the sidewalk or the road. */
export function LitterView({ l }: { l: Litter }) {
  const a = propArt('petals-ground')
  if (!a) return null
  return (
    <mesh
      geometry={FLAT}
      material={decalPaintMat(a.image)}
      position={at(l.s, l.onWalk ? CURB : 0, l.u)}
      rotation={[0, l.rot, 0]}
      scale={[l.size, 1, l.size]}
      receiveShadow
    />
  )
}
