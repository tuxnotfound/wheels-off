import { CYL, RBOX, RING } from '../look/geom'
import { AdSlot } from '../ads/AdSlot'
import { M } from './parts'
import type { VehicleSpot } from './streetGen'

// Parked vehicles and bikes. Chunky rounded toon shapes, inked by the post pass like
// everything else. Nothing here collides: road vehicles park half up on the curb,
// clear of the rider's lane, and bikes stand on the sidewalk.
// Local frame: nose toward -Z, +X to the vehicle's right, ground at y = 0.

type V3 = [number, number, number]

const GLASS = '#41595c' // dark teal glass, per ART.md
const GLINT = '#8fb3b0'
const TIRE = '#2b3634'
const HUB = '#c9cdc5'
const WELL = '#1f2826'
const LAMP = '#fff0c8'
const TAIL = '#d9533f'
const KEI_PLATE = '#f2d24a' // kei cars wear yellow plates
const PLATE = '#eceadd'
const TRIM = '#5d6866'
const CHROME = '#b9bdb5'

export type VehicleKind = 'kei-truck' | 'kei-car' | 'van' | 'scooter' | 'bicycle'

/** Length along the street, used to keep parked vehicles from overlapping. */
export const VEHICLE_LEN: Record<VehicleKind, number> = {
  'kei-truck': 3.4,
  'kei-car': 3.4,
  van: 4.7,
  scooter: 1.8,
  bicycle: 1.8,
}

const PAINT: Record<VehicleKind, string[]> = {
  'kei-truck': ['#eef0ea', '#dfe3d8', '#cbd6cf', '#9fb8c9'],
  'kei-car': ['#f1e6cf', '#b9d6cc', '#e3b9b0', '#dfe3e6', '#f2d7a0', '#8fb0c8'],
  van: ['#f3f1e6', '#cfd8d6', '#e8d9bd'],
  scooter: ['#d9533f', '#4b6f8a', '#f1e6cf', '#6cc7b5'],
  bicycle: ['#e9ece6', '#d9533f', '#5aa6a0', '#e8b64a'],
}
const pick = (list: string[], r: number) => list[Math.floor(r * list.length) % list.length]

/** Tire in a dark wheel well, with a hub cap. Axle along X. */
function Wheel({ x, z, r = 0.27, w = 0.2 }: { x: number; z: number; r?: number; w?: number }) {
  const out = Math.sign(x)
  return (
    <group position={[x, r, z]} rotation={[0, 0, Math.PI / 2]}>
      <M g={CYL} c={WELL} p={[0, -out * 0.03, 0]} s={[r * 2.45, w + 0.02, r * 2.45]} />
      <M g={CYL} c={TIRE} p={[0, 0, 0]} s={[r * 2, w + 0.04, r * 2]} />
      <M g={CYL} c={HUB} p={[0, out * (w / 2 + 0.03), 0]} s={[r * 1.1, 0.02, r * 1.1]} />
      <M g={CYL} c={TRIM} p={[0, out * (w / 2 + 0.04), 0]} s={[r * 0.35, 0.02, r * 0.35]} />
    </group>
  )
}

/** Lamps, bumper and plate at one end. */
function End({ z, front, w, y = 0.62, kei = true, round = false }: { z: number; front: boolean; w: number; y?: number; kei?: boolean; round?: boolean }) {
  const d = front ? -1 : 1
  return (
    <group>
      {[-1, 1].map((sx) =>
        round && front ? (
          <M key={sx} g={CYL} c={LAMP} p={[sx * (w / 2 - 0.24), y, z + d * 0.02]} s={[0.22, 0.05, 0.22]} r={[Math.PI / 2, 0, 0]} />
        ) : (
          <M key={sx} c={front ? LAMP : TAIL} p={[sx * (w / 2 - 0.2), y, z + d * 0.02]} s={[front ? 0.28 : 0.16, front ? 0.14 : 0.3, 0.05]} />
        ),
      )}
      {!front && [-1, 1].map((sx) => <M key={`o${sx}`} c="#f0a040" p={[sx * (w / 2 - 0.2), y - 0.2, z + d * 0.02]} s={[0.16, 0.08, 0.05]} />)}
      <M g={RBOX} c={TRIM} p={[0, 0.36, z + d * 0.05]} s={[w + 0.04, 0.2, 0.16]} />
      <M c={kei ? KEI_PLATE : PLATE} p={[0, 0.4, z + d * 0.14]} s={[0.4, 0.2, 0.02]} />
      <M c="#3b4b48" p={[0, 0.41, z + d * 0.152]} s={[0.26, 0.05, 0.005]} />
    </group>
  )
}

/** A side window with a soft glint stripe. */
function Pane({ p, s, r }: { p: V3; s: V3; r?: V3 }) {
  const side = s[0] < s[2]
  return (
    <group position={p} rotation={r}>
      <M g={RBOX} c={GLASS} p={[0, 0, 0]} s={s} />
      <M c={GLINT} p={side ? [Math.sign(p[0]) * (s[0] / 2 + 0.002), 0.02, -s[2] * 0.15] : [0.18 * s[0], 0.02, (Math.sign(p[2]) * s[2]) / 2 + 0.002]} s={side ? [0.005, s[1] * 0.7, 0.1] : [0.12, s[1] * 0.7, 0.005]} r={[0, 0, side ? 0 : -0.5]} />
    </group>
  )
}

function Mirrors({ z, w, y = 1.2 }: { z: number; w: number; y?: number }) {
  return (
    <>
      {[-1, 1].map((sx) => (
        <group key={sx}>
          <M c={TRIM} p={[sx * (w / 2 + 0.06), y - 0.06, z]} s={[0.1, 0.03, 0.03]} />
          <M g={RBOX} c={TRIM} p={[sx * (w / 2 + 0.13), y, z]} s={[0.1, 0.16, 0.08]} />
        </group>
      ))}
    </>
  )
}

/** Flat-nose kei truck: cab forward, open bed with drop sides and some load. */
function KeiTruck({ r }: { r: number }) {
  const paint = pick(PAINT['kei-truck'], r)
  const load = Math.floor(r * 37) % 3 // 0 empty, 1 boxes, 2 tarp
  const W = 1.46
  return (
    <group>
      <M c="#2f3634" p={[0, 0.42, 0.15]} s={[1.2, 0.2, 3.1]} />
      {/* cab */}
      <M g={RBOX} c={paint} p={[0, 0.98, -1.08]} s={[W, 1.02, 1.1]} />
      <M g={RBOX} c={paint} p={[0, 1.55, -1.02]} s={[W - 0.04, 0.16, 1.0]} />
      <Pane p={[0, 1.24, -1.63]} s={[1.28, 0.5, 0.04]} r={[0.06, 0, 0]} />
      <Pane p={[0, 1.24, -0.52]} s={[1.1, 0.38, 0.04]} />
      {[-1, 1].map((sx) => (
        <group key={sx}>
          <Pane p={[sx * (W / 2 + 0.005), 1.24, -1.1]} s={[0.04, 0.44, 0.78]} />
          <M c={TRIM} p={[sx * (W / 2 + 0.01), 0.95, -0.84]} s={[0.02, 0.04, 0.14]} />
          <M c={TRIM} p={[sx * (W / 2 + 0.005), 0.8, -1.08]} s={[0.01, 0.62, 0.02]} />
        </group>
      ))}
      {/* wipers */}
      {[-0.3, 0.3].map((x) => (
        <M key={x} c="#2b3634" p={[x, 1.02, -1.66]} s={[0.4, 0.025, 0.02]} r={[0, 0, 0.35]} />
      ))}
      {/* bed: floor, drop sides with hinge lines, tailgate, headboard guard */}
      <M c={paint} p={[0, 0.66, 0.72]} s={[W, 0.1, 2.2]} />
      {[-1, 1].map((sx) => (
        <group key={sx}>
          <M c={paint} p={[sx * (W / 2 - 0.03), 0.86, 0.72]} s={[0.06, 0.34, 2.2]} />
          {[0.1, 0.72, 1.34].map((z) => (
            <M key={z} c={TRIM} p={[sx * (W / 2 + 0.005), 0.86, z]} s={[0.01, 0.32, 0.03]} />
          ))}
        </group>
      ))}
      <M c={paint} p={[0, 0.86, 1.8]} s={[W, 0.34, 0.06]} />
      <M c={CHROME} p={[0, 1.2, -0.44]} s={[W - 0.1, 0.9, 0.04]} />
      {[-0.4, 0, 0.4].map((x) => (
        <M key={x} c={TRIM} p={[x, 1.2, -0.42]} s={[0.03, 0.9, 0.05]} />
      ))}
      {load === 1 && (
        <>
          <M c="#c9a36f" p={[-0.3, 0.98, 0.35]} s={[0.62, 0.55, 0.6]} />
          <M c="#d8b680" p={[0.3, 0.92, 0.5]} s={[0.55, 0.42, 0.55]} r={[0, 0.2, 0]} />
          <M c="#5aa6a0" p={[0.05, 0.9, 1.3]} s={[1.0, 0.4, 0.55]} />
        </>
      )}
      {load === 2 && <M g={RBOX} c="#4f7fa8" p={[0, 1.02, 0.85]} s={[1.3, 0.62, 1.75]} />}
      <Mirrors z={-1.5} w={W} y={1.2} />
      <End z={-1.64} front w={W} round />
      <End z={1.83} front={false} w={W} y={0.72} />
      <Wheel x={-0.62} z={-0.98} />
      <Wheel x={0.62} z={-0.98} />
      <Wheel x={-0.62} z={1.25} />
      <Wheel x={0.62} z={1.25} />
    </group>
  )
}

/** Tall boxy kei hatchback, the one parked on every Japanese side street. */
function KeiCar({ r }: { r: number }) {
  const paint = pick(PAINT['kei-car'], r)
  const twoTone = r > 0.55
  const W = 1.46
  return (
    <group>
      <M g={RBOX} c={paint} p={[0, 0.7, 0]} s={[W, 0.72, 3.3]} />
      {/* short bonnet, then a tall glasshouse */}
      <M g={RBOX} c={paint} p={[0, 0.98, -1.2]} s={[W - 0.02, 0.3, 0.9]} r={[0.12, 0, 0]} />
      <M g={RBOX} c={twoTone ? '#f4f3ea' : paint} p={[0, 1.4, 0.25]} s={[W - 0.06, 0.78, 2.35]} />
      <M g={RBOX} c={twoTone ? '#f4f3ea' : paint} p={[0, 1.8, 0.3]} s={[W - 0.12, 0.08, 2.2]} />
      <Pane p={[0, 1.38, -0.96]} s={[1.24, 0.58, 0.05]} r={[-0.3, 0, 0]} />
      <Pane p={[0, 1.4, 1.43]} s={[1.2, 0.5, 0.04]} />
      {[-1, 1].map((sx) => (
        <group key={sx}>
          <Pane p={[sx * ((W - 0.06) / 2 + 0.005), 1.42, -0.25]} s={[0.04, 0.5, 0.95]} />
          <Pane p={[sx * ((W - 0.06) / 2 + 0.005), 1.42, 0.82]} s={[0.04, 0.48, 0.9]} />
          <M c={TRIM} p={[sx * (W / 2 + 0.005), 0.7, 0.28]} s={[0.01, 0.66, 0.02]} />
          <M c={TRIM} p={[sx * (W / 2 + 0.01), 0.92, -0.05]} s={[0.02, 0.04, 0.14]} />
          <M c={TRIM} p={[sx * (W / 2 + 0.01), 0.92, 0.95]} s={[0.02, 0.04, 0.14]} />
          <M c={TRIM} p={[sx * (W / 2 + 0.003), 0.42, 0]} s={[0.01, 0.08, 2.4]} />
        </group>
      ))}
      <M c="#2b3634" p={[0, 1.83, 0.9]} s={[0.02, 0.2, 0.02]} r={[0.4, 0, 0]} />
      <Mirrors z={-0.8} w={W} y={1.12} />
      <End z={-1.66} front w={W} y={0.78} />
      <End z={1.66} front={false} w={W} y={0.95} />
      <Wheel x={-0.64} z={-1.08} />
      <Wheel x={0.64} z={-1.08} />
      <Wheel x={-0.64} z={1.08} />
      <Wheel x={0.64} z={1.08} />
    </group>
  )
}

/** Delivery van; both flat sides carry an ad slot. */
function Van({ r, slot }: { r: number; slot: string }) {
  const paint = pick(PAINT.van, r)
  const W = 1.7
  return (
    <group>
      <M g={RBOX} c={paint} p={[0, 1.2, 0.3]} s={[W, 1.66, 3.5]} />
      <M g={RBOX} c={paint} p={[0, 0.88, -1.85]} s={[W - 0.04, 0.96, 1.0]} />
      <M g={RBOX} c={paint} p={[0, 1.55, -1.55]} s={[W - 0.06, 0.8, 0.9]} r={[-0.35, 0, 0]} />
      <Pane p={[0, 1.55, -1.83]} s={[1.5, 0.62, 0.06]} r={[-0.35, 0, 0]} />
      {[-1, 1].map((sx) => (
        <group key={sx}>
          <Pane p={[sx * (W / 2 + 0.005), 1.45, -1.25]} s={[0.04, 0.52, 0.72]} />
          <M c={TRIM} p={[sx * (W / 2 + 0.006), 1.05, -0.85]} s={[0.01, 1.0, 0.02]} />
          <M c={TRIM} p={[sx * (W / 2 + 0.006), 0.42, 0.3]} s={[0.01, 0.1, 3.3]} />
          <AdSlot format="van" r={r} slot={`${slot}:${sx}`} p={[sx * (W / 2 + 0.012), 1.3, 0.45]} rot={[0, (sx * Math.PI) / 2, 0]} />
        </group>
      ))}
      <M c={TRIM} p={[0, 2.06, 0.3]} s={[W - 0.2, 0.06, 3.0]} />
      {[-0.6, 0, 0.6].map((z) => (
        <M key={z} c={TRIM} p={[0, 2.1, z + 0.3]} s={[W - 0.1, 0.04, 0.05]} />
      ))}
      <Mirrors z={-2.0} w={W} y={1.3} />
      <End z={-2.36} front w={W} y={0.72} kei={false} />
      <End z={2.06} front={false} w={W} y={1.0} kei={false} />
      <Wheel x={-0.74} z={-1.6} r={0.31} w={0.22} />
      <Wheel x={0.74} z={-1.6} r={0.31} w={0.22} />
      <Wheel x={-0.74} z={1.45} r={0.31} w={0.22} />
      <Wheel x={0.74} z={1.45} r={0.31} w={0.22} />
    </group>
  )
}

/** A step-through scooter on its side stand, with a delivery box. */
function Scooter({ r }: { r: number }) {
  const paint = pick(PAINT.scooter, r)
  return (
    <group rotation={[0, 0, 0.1]}>
      <M g={RBOX} c={paint} p={[0, 0.55, 0.3]} s={[0.34, 0.36, 0.85]} />
      <M g={RBOX} c="#2f3634" p={[0, 0.34, -0.05]} s={[0.3, 0.1, 1.1]} />
      <M g={RBOX} c={paint} p={[0, 0.72, -0.5]} s={[0.36, 0.72, 0.2]} r={[-0.25, 0, 0]} />
      <M g={RBOX} c="#2b3634" p={[0, 0.8, 0.3]} s={[0.34, 0.1, 0.62]} />
      <M c={TRIM} p={[0, 1.12, -0.62]} s={[0.66, 0.04, 0.04]} />
      <M g={RBOX} c={paint} p={[0, 1.08, -0.64]} s={[0.26, 0.16, 0.14]} />
      <M c={LAMP} p={[0, 1.08, -0.72]} s={[0.12, 0.08, 0.02]} />
      <M g={RBOX} c={GLASS} p={[0, 1.3, -0.66]} s={[0.32, 0.24, 0.03]} r={[-0.35, 0, 0]} />
      <M g={RBOX} c="#e8b64a" p={[0, 1.08, 0.62]} s={[0.46, 0.4, 0.42]} />
      <M c={KEI_PLATE} p={[0, 0.6, 0.84]} s={[0.16, 0.1, 0.01]} />
      <M c={TAIL} p={[0, 0.78, 0.76]} s={[0.12, 0.06, 0.02]} />
      <Wheel x={0} z={-0.62} r={0.22} w={0.1} />
      <Wheel x={0} z={0.62} r={0.22} w={0.1} />
      <M g={CYL} c={TRIM} p={[-0.14, 0.18, 0.1]} s={[0.035, 0.38, 0.035]} r={[0, 0, 0.35]} />
    </group>
  )
}

/** Mamachari: step-through city bike with a front basket, on its kickstand. */
function Bicycle({ r }: { r: number }) {
  const paint = pick(PAINT.bicycle, r)
  const R = 0.33
  const tube = (a: V3, b: V3, t = 0.04, c = paint) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2]
    const len = Math.hypot(dx, dy, dz)
    return <M g={CYL} c={c} p={[(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]} s={[t, len, t]} r={[Math.atan2(dz, dy), 0, 0]} />
  }
  return (
    <group rotation={[0, 0, 0.12]}>
      {[-0.55, 0.55].map((z) => (
        <group key={z} position={[0, R, z]} rotation={[0, Math.PI / 2, 0]}>
          <M g={RING} c={TIRE} p={[0, 0, 0]} s={[R * 2, R * 2, 1.2]} />
          <M g={CYL} c={CHROME} p={[0, 0, 0]} s={[0.06, 0.06, 0.06]} r={[Math.PI / 2, 0, 0]} />
        </group>
      ))}
      {tube([0, R, 0.55], [0, 0.78, 0.15])}
      {tube([0, 0.78, 0.15], [0, 0.42, -0.1])}
      {tube([0, 0.42, -0.1], [0, 0.95, -0.42])}
      {tube([0, 0.95, -0.42], [0, R, -0.55], 0.035)}
      {tube([0, R, 0.55], [0, 0.42, -0.1], 0.03)}
      {tube([0, 0.95, -0.42], [0, 1.08, -0.4], 0.035, TRIM)}
      <M c={TRIM} p={[0, 1.08, -0.38]} s={[0.56, 0.03, 0.03]} />
      <M g={RBOX} c="#2b3634" p={[0, 0.93, 0.18]} s={[0.14, 0.06, 0.24]} />
      <M c={CHROME} p={[0, 0.84, -0.66]} s={[0.36, 0.24, 0.3]} />
      <M c="#dfe3e0" p={[0, 0.9, -0.66]} s={[0.32, 0.14, 0.26]} />
      <M c={TRIM} p={[0, 0.66, 0.6]} s={[0.24, 0.04, 0.3]} />
      <M c={LAMP} p={[0, 0.72, -0.84]} s={[0.08, 0.08, 0.04]} />
    </group>
  )
}

/** A parked vehicle or bike. Curb-parked ones sit half up on the sidewalk, tilted onto it. */
export function Vehicle({ spot, slot }: { spot: VehicleSpot; slot: string }) {
  const { kind, s, u, r, flip, curb, side } = spot
  const body =
    kind === 'kei-truck' ? (
      <KeiTruck r={r} />
    ) : kind === 'kei-car' ? (
      <KeiCar r={r} />
    ) : kind === 'van' ? (
      <Van r={r} slot={slot} />
    ) : kind === 'scooter' ? (
      <Scooter r={r} />
    ) : (
      <Bicycle r={r} />
    )
  return (
    <group position={[s, curb ? 0.08 : 0.16, -u]} rotation={[0, 0, curb ? side * 0.13 : 0]}>
      <group rotation={[0, flip ? Math.PI : 0, 0]}>{body}</group>
    </group>
  )
}
