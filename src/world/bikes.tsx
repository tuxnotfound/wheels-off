import * as THREE from 'three'
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import { CYL, RBOX, SPHERE } from '../look/geom'
import { M } from './parts'

// The parked scooter and bicycle, modeled after their painted designs (ART.md, Vehicles): a
// step-through scooter with a delivery box and a mamachari with a front basket, each upright on
// its center stand. Painted views can't hold a thin, open frame together as the chase camera
// swings past it, so these are built from parts like the rest of the code-drawn world, in the
// art's colors, and inked by the post pass. They merge into each block's one mesh.
// Local frame: nose toward -Z, +X to the bike's right, ground at y = 0.

type V3 = [number, number, number]
type P2 = [number, number] // a point of the side view: z (toward the tail), y (up)

const TIRE = '#4a4d4b'
const CHROME = '#c9cdc5'
const STEEL = '#9da29e'
const DARK = '#3f4443'
const LAMP = '#fff0c8'
const TAIL = '#b8383a'
const AMBER = '#f0a040'
const PLATE = '#eceadd'

const pick = (list: string[], r: number) => list[Math.floor(r * list.length) % list.length]

const shapes = new Map<string, THREE.BufferGeometry>()
/** A geometry built once, under its key, and shared by every bike: a block allocates none. */
function once(key: string, make: () => THREE.BufferGeometry) {
  let g = shapes.get(key)
  if (!g) shapes.set(key, (g = make()))
  return g
}

/** Thin rods: a cylinder with few sides is round enough at a few centimeters. */
const ROD = new THREE.CylinderGeometry(0.5, 0.5, 1, 6)
const Y = new THREE.Vector3(0, 1, 0)
const dir = new THREE.Vector3()
const quat = new THREE.Quaternion()
const euler = new THREE.Euler()

/** A straight tube of radius t from a to b. */
function Rod({ a, b, t, c }: { a: V3; b: V3; t: number; c: string }) {
  dir.set(b[0] - a[0], b[1] - a[1], b[2] - a[2])
  const len = dir.length()
  euler.setFromQuaternion(quat.setFromUnitVectors(Y, dir.normalize()))
  return <M g={t > 0.015 ? CYL : ROD} c={c} p={[(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]} s={[t * 2, len, t * 2]} r={[euler.x, euler.y, euler.z]} />
}

/** Both of a left-right pair: the part at +x, mirrored to -x. */
const pair = (p: V3): [V3, V3] => [p, [-p[0], p[1], p[2]]]

/** A tube of radius t bent through points. */
const bent = (key: string, t: number, pts: V3[]) =>
  once(`bent:${key}`, () => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), pts.length * 6, t, 7))

/** Points on an arc of the side view around (z, y), from angle a0 to a1 (degrees, 0 toward the tail, 90 up). */
function arc(z: number, y: number, r: number, a0: number, a1: number, n = 12): P2[] {
  const out: P2[] = []
  for (let i = 0; i <= n; i++) {
    const a = THREE.MathUtils.degToRad(a0 + ((a1 - a0) * i) / n)
    out.push([z + r * Math.cos(a), y + r * Math.sin(a)])
  }
  return out
}

/**
 * A panel cut to a side-view outline, `w` wide and centered across, its edges rounded by `round`;
 * `narrow` scales its width at a point of the side view (a shield narrowing toward the top).
 */
function slab(key: string, outline: P2[], w: number, round = 0.012, narrow?: (z: number, y: number) => number) {
  return once(`slab:${key}`, () => {
    const shape = new THREE.Shape(outline.map(([z, y]) => new THREE.Vector2(z, y)))
    const depth = Math.max(w - 2 * round, 0.001)
    const ex = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: round, bevelSize: round, bevelOffset: -round, bevelSegments: 2, curveSegments: 8 })
    // the shape's x is the bike's z, its extrusion runs across
    ex.rotateY(-Math.PI / 2).translate(depth / 2, 0, 0)
    ex.deleteAttribute('uv')
    ex.deleteAttribute('normal')
    const g = mergeVertices(ex, 1e-5)
    ex.dispose()
    if (narrow) {
      const p = g.attributes.position
      for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) * narrow(p.getZ(i), p.getY(i)))
    }
    g.computeVertexNormals()
    return g
  })
}

/** A tire around an axle along x, `R` to its tread, `t` the half thickness of its section. */
const tire = (R: number, t: number) => once(`tire:${R}:${t}`, () => new THREE.TorusGeometry(R - t, t, 8, 36).rotateY(Math.PI / 2))

/** A spoked wheel with its hub at (z, y). */
function Wheel({ z, y, R, t, rim, spokes, spoke, hub }: { z: number; y: number; R: number; t: number; rim: number; spokes: number; spoke: number; hub: number }) {
  const ends: [V3, V3][] = []
  for (let i = 0; i < spokes; i++) {
    const a = ((i + 0.5) / spokes) * Math.PI * 2
    const c = Math.cos(a)
    const s = Math.sin(a)
    // the spokes come off both flanges of the hub in turn
    ends.push([
      [i % 2 ? 0.025 : -0.025, y + s * hub, z + c * hub],
      [0, y + s * rim, z + c * rim],
    ])
  }
  return (
    <group>
      <M g={tire(R, t)} c={TIRE} p={[0, y, z]} s={[1, 1, 1]} />
      <M g={tire(rim + 0.008, 0.008)} c={CHROME} p={[0, y, z]} s={[1, 1, 1]} />
      <M g={CYL} c={CHROME} p={[0, y, z]} s={[hub * 2, 0.1, hub * 2]} r={[0, 0, Math.PI / 2]} />
      {ends.map(([a, b], i) => (
        <Rod key={i} a={a} b={b} t={spoke} c={STEEL} />
      ))}
    </group>
  )
}

// ---- the scooter: a step-through with a white leg shield, after scooter-mint ----

const SCOOTER_BODY = ['#b6ccb5', '#e6dcc4', '#c9553f', '#5f7f99']
const SHIELD = '#e9e5de'
const BOX_WHITE = '#e3e0da'
const SEAT = '#505454'
const ENGINE = '#9a9f9b'
const S_FRONT = -0.61 // the hubs, along the side view
const S_REAR = 0.613
const S_HUB = 0.235

/** The leg shield from the side: down from under the headlight to the floor. */
const LEG_SHIELD: P2[] = [
  [-0.355, 0.779], [-0.417, 0.62], [-0.412, 0.449], [-0.368, 0.277], [-0.299, 0.147], [-0.078, 0.137],
  [-0.049, 0.301], [-0.069, 0.4], [-0.147, 0.461], [-0.216, 0.559], [-0.262, 0.681], [-0.289, 0.767],
]
/** The body from the floor to the tail: under the seat, over the rear wheel, down to the fender's end. */
const REAR_BODY: P2[] = [
  [-0.069, 0.4], [-0.012, 0.468], [0.054, 0.547], [0.123, 0.566], [0.441, 0.571], [0.613, 0.566], [0.76, 0.547],
  [0.882, 0.485], [0.951, 0.4], [0.944, 0.297], [0.902, 0.301],
  ...arc(S_REAR, S_HUB, 0.255, 15, 150, 10),
  [0.368, 0.314], [0.245, 0.289], [0.098, 0.289], [-0.049, 0.301],
]

export function Scooter({ r }: { r: number }) {
  const body = pick(SCOOTER_BODY, r)
  return (
    <group>
      <Wheel z={S_FRONT} y={S_HUB} R={S_HUB} t={0.03} rim={0.17} spokes={10} spoke={0.003} hub={0.06} />
      <Wheel z={S_REAR} y={S_HUB} R={S_HUB} t={0.03} rim={0.17} spokes={10} spoke={0.003} hub={0.065} />
      {/* front fork, fender and the cowl with its headlight */}
      {pair([0.06, S_HUB, S_FRONT]).map((a, i) => (
        <Rod key={i} a={a} b={[a[0] * 0.8, 0.7, -0.44]} t={0.018} c={CHROME} />
      ))}
      <M g={slab('s-front-fender', [...arc(0, 0, 0.29, 50, 128), ...arc(0, 0, 0.265, 128, 50)], 0.1, 0.01)} c={body} p={[0, S_HUB, S_FRONT]} s={[1, 1, 1]} />
      <M g={SPHERE} c={body} p={[0, 0.87, -0.35]} s={[0.22, 0.17, 0.25]} />
      <M g={CYL} c={CHROME} p={[0, 0.88, -0.446]} s={[0.14, 0.02, 0.14]} r={[Math.PI / 2, 0, 0]} />
      <M g={CYL} c={LAMP} p={[0, 0.88, -0.458]} s={[0.115, 0.012, 0.115]} r={[Math.PI / 2, 0, 0]} />
      {/* handlebar, grips and mirrors */}
      {pair([0.1, 0.89, -0.3]).map((a, i) => (
        <group key={i}>
          <Rod a={a} b={[a[0] * 1.8, 0.893, -0.285]} t={0.013} c={CHROME} />
          <Rod a={[a[0] * 1.8, 0.893, -0.285]} b={[a[0] * 2.85, 0.896, -0.26]} t={0.019} c={DARK} />
          <Rod a={[a[0] * 1.7, 0.9, -0.29]} b={[a[0] * 2.45, 1.05, -0.3]} t={0.007} c={CHROME} />
          <M g={CYL} c="#d6dcda" p={[a[0] * 2.5, 1.08, -0.3]} s={[0.09, 0.014, 0.09]} r={[Math.PI / 2, 0, 0]} />
        </group>
      ))}
      {/* the leg shield, its blinkers, the body, the seat */}
      <M g={slab('s-shield', LEG_SHIELD, 0.32, 0.02, (_, y) => 1 - 0.45 * THREE.MathUtils.smoothstep(y, 0.3, 0.78))} c={SHIELD} p={[0, 0, 0]} s={[1, 1, 1]} />
      {pair([0.13, 0.62, -0.43]).map((p, i) => (
        <M key={i} g={SPHERE} c={AMBER} p={p} s={[0.045, 0.04, 0.035]} />
      ))}
      <M g={slab('s-body', REAR_BODY, 0.26, 0.03, (z) => 1 - 0.35 * THREE.MathUtils.smoothstep(z, 0.6, 0.95))} c={body} p={[0, 0, 0]} s={[1, 1, 1]} />
      <M g={SPHERE} c={SEAT} p={[0, 0.645, 0.225]} s={[0.25, 0.15, 0.46]} />
      {/* engine, its round cover, the chain case on the left, the muffler on the right */}
      <M g={RBOX} c={ENGINE} p={[0, 0.245, 0.02]} s={[0.22, 0.2, 0.3]} />
      <M g={CYL} c={CHROME} p={[-0.12, 0.25, -0.04]} s={[0.15, 0.04, 0.15]} r={[0, 0, Math.PI / 2]} />
      <M g={RBOX} c="#878c88" p={[-0.1, 0.265, 0.4]} s={[0.05, 0.1, 0.58]} />
      <M g={bent('s-muffler', 0.04, [[0.09, 0.15, -0.05], [0.13, 0.17, 0.2], [0.135, 0.21, 0.5], [0.135, 0.24, 0.78]])} c="#7e8582" p={[0, 0, 0]} s={[1, 1, 1]} />
      {/* rear shocks, half under a cover */}
      {pair([0.13, 0.62, 0.534]).map((a, i) => (
        <group key={i}>
          <Rod a={a} b={[a[0], 0.45, 0.57]} t={0.024} c={body} />
          <Rod a={[a[0], 0.45, 0.57]} b={[a[0], S_HUB + 0.03, S_REAR]} t={0.013} c={CHROME} />
        </group>
      ))}
      {/* rack and delivery box */}
      {pair([0.09, 0.64, 0.45]).map((a, i) => (
        <Rod key={i} a={a} b={[a[0], 0.64, 0.84]} t={0.009} c={CHROME} />
      ))}
      <M g={RBOX} c={BOX_WHITE} p={[0, 0.77, 0.79]} s={[0.38, 0.25, 0.37]} />
      <M g={RBOX} c="#cfcbc3" p={[0, 0.822, 0.79]} s={[0.39, 0.014, 0.38]} />
      <M c={DARK} p={[0, 0.79, 0.977]} s={[0.05, 0.05, 0.01]} />
      {/* tail: lamp, blinkers, plate */}
      <M g={RBOX} c={TAIL} p={[0, 0.53, 0.925]} s={[0.12, 0.08, 0.06]} />
      {pair([0.14, 0.51, 0.85]).map((p, i) => (
        <M key={i} g={SPHERE} c={AMBER} p={p} s={[0.045, 0.035, 0.05]} />
      ))}
      <M c={PLATE} p={[0, 0.37, 0.955]} s={[0.17, 0.1, 0.01]} r={[-0.25, 0, 0]} />
      {/* footpegs and the center stand */}
      {pair([0.1, 0.19, 0.03]).map((a, i) => (
        <Rod key={i} a={a} b={[a[0] * 2, 0.19, 0.03]} t={0.013} c={DARK} />
      ))}
      {pair([0.07, 0.15, 0.1]).map((a, i) => (
        <Rod key={i} a={a} b={[a[0] * 1.4, 0.01, 0.15]} t={0.011} c={DARK} />
      ))}
    </group>
  )
}

// ---- the bicycle: a mamachari with a solid front basket, after bicycle-cream ----

const FRAME = ['#e5dac1', '#e9ece6', '#d9533f', '#5aa6a0', '#e8b64a']
const SADDLE = '#966446'
const GRIP = '#885940'
const B_FRONT = -0.6
const B_REAR = 0.6
const B_HUB = 0.325
const BB: V3 = [0, 0.293, 0.079] // the crank's axle
const SEAT_LUG: V3 = [0, 0.66, 0.211]
const HEAD_LOW: V3 = [0, 0.64, -0.405]
const HEAD_TOP: V3 = [0, 0.88, -0.345]

/** The chain guard from the side: round over the chainring, tapering to the rear hub. */
const CHAIN_GUARD = (() => {
  const front = arc(BB[2], BB[1], 0.1, 90, 270, 10)
  const rear = arc(B_REAR, B_HUB - 0.005, 0.065, -90, 90, 8)
  return [...front, ...rear]
})()

/** Basket: an open box ahead of the head tube, ribbed on its sides like the painted one's. */
function Basket({ c }: { c: string }) {
  const [z0, z1, y0, y1, w, t] = [-0.8, -0.44, 0.69, 0.93, 0.36, 0.012]
  const zc = (z0 + z1) / 2
  const len = z1 - z0
  const h = y1 - y0
  const rib = '#c9bda0'
  return (
    <group>
      <M c={c} p={[0, y0 + t / 2, zc]} s={[w, t, len]} />
      <M c={c} p={[0, y0 + h / 2, z0 + t / 2]} s={[w, h, t]} />
      <M c={c} p={[0, y0 + h / 2, z1 - t / 2]} s={[w, h, t]} />
      {[-1, 1].map((sx) => (
        <M key={sx} c={c} p={[sx * (w / 2 - t / 2), y0 + h / 2, zc]} s={[t, h, len]} />
      ))}
      {/* the rim, a lip all round */}
      {[-1, 1].map((sx) => (
        <M key={`l${sx}`} c={c} p={[sx * (w / 2 + 0.002), y1 - 0.015, zc]} s={[0.014, 0.03, len + 0.018]} />
      ))}
      {[z0, z1].map((z) => (
        <M key={`e${z}`} c={c} p={[0, y1 - 0.015, z + (z < zc ? -0.002 : 0.002)]} s={[w + 0.018, 0.03, 0.014]} />
      ))}
      {/* ribs on the outside, front and sides */}
      {[0.35, 0.55, 0.75].map((f) => (
        <group key={f}>
          <M c={rib} p={[0, y0 + h * f, z0 - 0.002]} s={[w - 0.06, 0.008, 0.005]} />
          {[-1, 1].map((sx) => (
            <M key={sx} c={rib} p={[sx * (w / 2 + 0.002), y0 + h * f, zc]} s={[0.005, 0.008, len - 0.06]} />
          ))}
        </group>
      ))}
    </group>
  )
}

export function Bicycle({ r }: { r: number }) {
  const paint = pick(FRAME, r)
  return (
    <group>
      <Wheel z={B_FRONT} y={B_HUB} R={B_HUB} t={0.022} rim={0.272} spokes={6} spoke={0.0055} hub={0.028} />
      <Wheel z={B_REAR} y={B_HUB} R={B_HUB} t={0.022} rim={0.272} spokes={6} spoke={0.0055} hub={0.03} />
      {/* fenders */}
      <M g={slab('b-fender', [...arc(0, 0, 0.37, -5, 105), ...arc(0, 0, 0.355, 105, -5)], 0.065, 0.006)} c={paint} p={[0, B_HUB, B_FRONT]} s={[1, 1, 1]} />
      <M g={slab('b-rear-fender', [...arc(0, 0, 0.37, 8, 140), ...arc(0, 0, 0.355, 140, 8)], 0.065, 0.006)} c={paint} p={[0, B_HUB, B_REAR]} s={[1, 1, 1]} />
      {/* frame: fork, head tube, the swooping main tube, seat tube, stays */}
      {pair([0.04, B_HUB, B_FRONT]).map((a, i) => (
        <Rod key={i} a={a} b={[a[0] * 0.75, HEAD_LOW[1], HEAD_LOW[2] - 0.005]} t={0.012} c={paint} />
      ))}
      <Rod a={HEAD_LOW} b={HEAD_TOP} t={0.026} c={paint} />
      <M g={bent('b-main', 0.02, [[0, 0.78, -0.37], [0, 0.69, -0.293], [0, 0.529, -0.236], [0, 0.397, -0.169], [0, 0.33, -0.087], [0, 0.302, 0.012], [0, 0.293, 0.079]])} c={paint} p={[0, 0, 0]} s={[1, 1, 1]} />
      <Rod a={BB} b={SEAT_LUG} t={0.018} c={paint} />
      {pair([0.045, B_HUB, B_REAR]).map((a, i) => (
        <group key={i}>
          <Rod a={a} b={[a[0] * 0.4, SEAT_LUG[1] - 0.01, SEAT_LUG[2] + 0.01]} t={0.011} c={paint} />
          <Rod a={a} b={[a[0], BB[1], BB[2] + 0.04]} t={0.012} c={paint} />
        </group>
      ))}
      <M g={CYL} c={paint} p={BB} s={[0.05, 0.09, 0.05]} r={[0, 0, Math.PI / 2]} />
      <M g={slab('b-chain-guard', CHAIN_GUARD, 0.035, 0.008)} c={paint} p={[0.065, 0, 0]} s={[1, 1, 1]} />
      {/* cranks and pedals, one forward and down on the left, the other back and up on the right */}
      {([[-1, -0.117, -0.094], [1, 0.117, 0.094]] as const).map(([sx, dz, dy]) => (
        <group key={sx}>
          <Rod a={[sx * 0.075, BB[1], BB[2]]} b={[sx * 0.09, BB[1] + dy, BB[2] + dz]} t={0.01} c={STEEL} />
          <M c={DARK} p={[sx * 0.14, BB[1] + dy, BB[2] + dz]} s={[0.09, 0.022, 0.06]} />
          <M c={AMBER} p={[sx * 0.14, BB[1] + dy, BB[2] + dz - 0.031]} s={[0.07, 0.012, 0.004]} />
        </group>
      ))}
      {/* seat post and saddle, wide at the back */}
      <Rod a={SEAT_LUG} b={[0, 0.77, 0.227]} t={0.012} c={CHROME} />
      <M g={SPHERE} c={SADDLE} p={[0, 0.8, 0.27]} s={[0.18, 0.075, 0.2]} />
      <M g={SPHERE} c={SADDLE} p={[0, 0.805, 0.17]} s={[0.09, 0.06, 0.18]} />
      {/* stem, handlebar sweeping back, grips */}
      <Rod a={HEAD_TOP} b={[0, 1.02, -0.315]} t={0.014} c={CHROME} />
      <M
        g={bent('b-bar', 0.012, [[-0.21, 1.08, -0.21], [-0.15, 1.06, -0.27], [-0.07, 1.03, -0.31], [0, 1.02, -0.315], [0.07, 1.03, -0.31], [0.15, 1.06, -0.27], [0.21, 1.08, -0.21]])}
        c={CHROME}
        p={[0, 0, 0]}
        s={[1, 1, 1]}
      />
      {pair([0.21, 1.08, -0.21]).map((a, i) => (
        <Rod key={i} a={a} b={[a[0] * 1.43, 1.085, -0.1]} t={0.017} c={GRIP} />
      ))}
      {/* basket on its stays */}
      <Basket c={paint} />
      {pair([0.05, 0.69, -0.6]).map((a, i) => (
        <Rod key={i} a={a} b={[0.045 * Math.sign(a[0]), B_HUB, B_FRONT]} t={0.006} c={STEEL} />
      ))}
      <Rod a={[0, 0.75, -0.45]} b={[0, 0.76, -0.37]} t={0.012} c={paint} />
      {/* rear rack on its struts, a red reflector under it */}
      {pair([0.075, 0.707, 0.434]).map((a, i) => (
        <group key={i}>
          <Rod a={a} b={[a[0], 0.707, 0.806]} t={0.009} c={paint} />
          <Rod a={[a[0], 0.7, 0.79]} b={[0.05 * Math.sign(a[0]), B_HUB, B_REAR + 0.01]} t={0.008} c={paint} />
          <Rod a={a} b={[0.03 * Math.sign(a[0]), SEAT_LUG[1] - 0.02, SEAT_LUG[2] + 0.04]} t={0.008} c={paint} />
        </group>
      ))}
      {[0.45, 0.63, 0.8].map((z) => (
        <Rod key={z} a={[-0.075, 0.707, z]} b={[0.075, 0.707, z]} t={0.008} c={paint} />
      ))}
      <M c={TAIL} p={[0, 0.5, 0.93]} s={[0.045, 0.05, 0.015]} r={[-0.5, 0, 0]} />
      {/* the rear center stand, down */}
      {pair([0.05, B_HUB, B_REAR]).map((a, i) => (
        <Rod key={i} a={a} b={[a[0] * 2.2, 0.012, B_REAR + 0.05]} t={0.009} c={STEEL} />
      ))}
      <Rod a={[-0.11, 0.012, B_REAR + 0.05]} b={[0.11, 0.012, B_REAR + 0.05]} t={0.009} c={STEEL} />
    </group>
  )
}
