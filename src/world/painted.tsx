import { BOX, PANEL, PRISM } from '../look/geom'
import { toonMat } from '../look/materials'
import { paintedDepth, paintedMat, propArt } from '../art/art'
import { M } from './parts'
import type { Lot, PropSpot } from './streetGen'
import { SIDEWALK } from './worldConfig'

type V3 = [number, number, number]
// Block-local frame: +x is the right of the street, -z is "forward" (u grows).
const at = (s: number, y: number, u: number): V3 => [s, y, -u]

/** A painted cut-out standing on the ground. rotY turns it; cross adds a second plane at 90°. */
export function Card({ path, w, h, p, rotY = 0, cross = false, double = false }: { path: string; w: number; h: number; p: V3; rotY?: number; cross?: boolean; double?: boolean }) {
  const mat = paintedMat(path, double || cross)
  const depth = paintedDepth(path)
  const plane = (ry: number) => (
    <mesh geometry={PANEL} material={mat} position={[0, h / 2, 0]} rotation={[0, ry, 0]} scale={[w, h, 1]} castShadow customDepthMaterial={depth} />
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
    const tree = propArt('tree')
    return (
      <group>
        {wall &&
          Array.from({ length: tiles }, (_, i) => {
            const a = lot.a + i * 3.2
            const w = Math.min(3.2, lot.a + lot.len - a)
            return <Card key={i} path={wall.image} w={w} h={wall.height} p={at(sd * (front + 0.2), 0, a + w / 2)} rotY={faceRoad(sd)} />
          })}
        {tree && lot.tree && <Card path={tree.image} w={tree.width} h={tree.height} p={at(sd * (front + 2.2 + lot.r), 0, cu)} cross />}
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
