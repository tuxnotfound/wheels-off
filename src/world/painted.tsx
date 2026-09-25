import { BOX, FLAT, PANEL, PRISM } from '../look/geom'
import { toonMat } from '../look/materials'
import { decalPaintMat, paintedDepth, paintedMat, propArt } from '../art/art'
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
  const side = toonMat(b.side)
  const roof = toonMat(b.roof)
  return (
    <group>
      <Card path={b.front} w={b.width} h={b.height} p={at(sd * front, 0, cu)} rotY={faceRoad(sd)} />
      {/* BoxGeometry groups: +x, -x, +y, -y, +z, -z */}
      <M g={BOX} m={[side, side, roof, roof, side, side]} p={at(bodyS, b.bodyHeight / 2, cu)} s={[b.depth, b.bodyHeight, lot.len - 0.05]} />
      {b.roofShape === 'gable' && roofH > 0.5 && (
        // the painted gable faces the street, so the ridge runs back from it
        <M g={PRISM} c={b.roof} p={at(bodyS, b.bodyHeight + roofH / 2, cu)} s={[b.width + 0.3, roofH, b.depth]} r={[0, Math.PI / 2, 0]} />
      )}
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
