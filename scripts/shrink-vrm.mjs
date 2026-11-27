// Slims a VRM (a GLB container) for the game. VRoid exports carry 57 face blendshapes of which
// the expressions drive 14 (blink, mouth shapes, moods), a 2048px thumbnail the game never
// shows and normal maps the cel shader can't: the blendshapes no expression uses go, and the
// embedded PNGs are resampled. The rig, the expressions and every VRM extension load as
// before. Resampling uses sips, so macOS only. ART.md, Character.
// Usage: npm run art:vrm -- <file.vrm> [<out.vrm>] [--author <name>]
//  out       where to write it (default: over the input)
//  --author  the author in the model's metadata, in place of what VRoid filled in
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

const MAX = { color: 1024, normal: 512, thumbnail: 256 } // longest side, per texture kind

const { values: o, positionals } = parseArgs({ allowPositionals: true, options: { author: { type: 'string' } } })
const [file, out = file] = positionals
if (!file) throw new Error('usage: npm run art:vrm -- <file.vrm> [<out.vrm>] [--author <name>]')
const glb = readFileSync(file)

// ---------- GLB container ----------
if (glb.readUInt32LE(0) !== 0x46546c67) throw new Error('not a GLB file')
const chunks = []
for (let at = 12; at < glb.readUInt32LE(8); ) {
  const len = glb.readUInt32LE(at)
  chunks.push({ type: glb.readUInt32LE(at + 4), body: glb.subarray(at + 8, at + 8 + len) })
  at += 8 + len
}
const json = JSON.parse(chunks.find((c) => c.type === 0x4e4f534a).body.toString())
const bin = chunks.find((c) => c.type === 0x004e4942).body
const vrm1 = json.extensions?.VRMC_vrm
const vrm0 = json.extensions?.VRM

// ---------- blendshapes no expression uses ----------
// every expression's morph bind, with the mesh its index counts in (VRM 1.0 names a node, 0.x a mesh)
const binds = []
for (const e of Object.values({ ...vrm1?.expressions?.preset, ...vrm1?.expressions?.custom }))
  for (const b of e.morphTargetBinds ?? []) binds.push({ mesh: json.nodes[b.node].mesh, bind: b })
for (const g of vrm0?.blendShapeMaster?.blendShapeGroups ?? []) for (const b of g.binds ?? []) binds.push({ mesh: b.mesh, bind: b })
for (const [mi, mesh] of json.meshes.entries()) {
  const n = mesh.primitives[0]?.targets?.length ?? 0
  if (!n || !(vrm1 || vrm0)) continue
  const used = [...new Set(binds.filter((b) => b.mesh === mi).map((b) => b.bind.index))].sort((a, b) => a - b)
  if (used.length === n) continue
  const pick = (list) => used.map((k) => list[k])
  for (const p of mesh.primitives) {
    if (!p.targets) continue
    p.targets = pick(p.targets)
    if (p.extras?.targetNames) p.extras.targetNames = pick(p.extras.targetNames)
    if (!p.targets.length) delete p.targets
  }
  if (mesh.weights) mesh.weights = pick(mesh.weights)
  if (mesh.extras?.targetNames) mesh.extras.targetNames = pick(mesh.extras.targetNames)
  for (const b of binds) if (b.mesh === mi) b.bind.index = used.indexOf(b.bind.index)
  console.log(`${mesh.name}: ${n} blendshapes -> ${used.length}`)
}

// ---------- resample each embedded PNG ----------
const tmp = mkdtempSync(join(tmpdir(), 'shrink-vrm-'))
const sips = (...args) => execFileSync('sips', args, { stdio: ['ignore', 'pipe', 'ignore'] }).toString()
const replaced = new Map() // bufferView index -> new bytes
for (const im of json.images ?? []) {
  if (im.mimeType !== 'image/png' || im.bufferView == null) continue
  const bv = json.bufferViews[im.bufferView]
  const name = im.name ?? `image-${im.bufferView}`
  const max = name === 'Thumbnail' ? MAX.thumbnail : name.endsWith('_nml') ? MAX.normal : MAX.color
  const src = join(tmp, `${im.bufferView}.png`)
  writeFileSync(src, bin.subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength))
  const side = Math.max(...[...sips('-g', 'pixelWidth', '-g', 'pixelHeight', src).matchAll(/: (\d+)/g)].map((m) => +m[1]))
  if (side <= max) continue // sips -Z would upscale a smaller image
  const dst = join(tmp, `${im.bufferView}-out.png`)
  sips('-Z', String(max), src, '--out', dst)
  const bytes = readFileSync(dst)
  const note = `${name}: ${side}px ${(bv.byteLength / 1024).toFixed(0)}K -> ${max}px ${(bytes.length / 1024).toFixed(0)}K`
  if (bytes.length >= bv.byteLength) {
    console.log(`${note} (kept: no smaller)`)
    continue
  }
  console.log(note)
  replaced.set(im.bufferView, bytes)
}
rmSync(tmp, { recursive: true })

// ---------- keep only the accessors and buffer views still in use ----------
const accUsed = new Set()
for (const m of json.meshes)
  for (const p of m.primitives) {
    Object.values(p.attributes).forEach((a) => accUsed.add(a))
    if (p.indices != null) accUsed.add(p.indices)
    for (const t of p.targets ?? []) Object.values(t).forEach((a) => accUsed.add(a))
  }
for (const s of json.skins ?? []) if (s.inverseBindMatrices != null) accUsed.add(s.inverseBindMatrices)
for (const an of json.animations ?? []) for (const s of an.samplers) accUsed.add(s.input), accUsed.add(s.output)
const accKeep = [...accUsed].sort((a, b) => a - b)
const acc = (a) => accKeep.indexOf(a)
json.accessors = accKeep.map((a) => json.accessors[a])
for (const m of json.meshes)
  for (const p of m.primitives) {
    for (const k in p.attributes) p.attributes[k] = acc(p.attributes[k])
    if (p.indices != null) p.indices = acc(p.indices)
    for (const t of p.targets ?? []) for (const k in t) t[k] = acc(t[k])
  }
for (const s of json.skins ?? []) if (s.inverseBindMatrices != null) s.inverseBindMatrices = acc(s.inverseBindMatrices)
for (const an of json.animations ?? []) for (const s of an.samplers) (s.input = acc(s.input)), (s.output = acc(s.output))

const bvUsed = new Set()
for (const a of json.accessors) {
  if (a.bufferView != null) bvUsed.add(a.bufferView)
  if (a.sparse) bvUsed.add(a.sparse.indices.bufferView), bvUsed.add(a.sparse.values.bufferView)
}
for (const im of json.images ?? []) if (im.bufferView != null) bvUsed.add(im.bufferView)
const bvKeep = [...bvUsed].sort((a, b) => a - b)
const view = (v) => bvKeep.indexOf(v)
for (const a of json.accessors) {
  if (a.bufferView != null) a.bufferView = view(a.bufferView)
  if (a.sparse) (a.sparse.indices.bufferView = view(a.sparse.indices.bufferView)), (a.sparse.values.bufferView = view(a.sparse.values.bufferView))
}
for (const im of json.images ?? []) if (im.bufferView != null) im.bufferView = view(im.bufferView)

// ---------- rebuild the binary chunk ----------
const parts = []
let offset = 0
json.bufferViews = bvKeep.map((i) => {
  const bv = json.bufferViews[i]
  const bytes = replaced.get(i) ?? bin.subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength)
  parts.push(bytes)
  const moved = { ...bv, byteOffset: offset, byteLength: bytes.length }
  offset += bytes.length
  if (offset % 4) parts.push(Buffer.alloc(4 - (offset % 4))), (offset += 4 - (offset % 4))
  return moved
})
const newBin = Buffer.concat(parts)
json.buffers = [{ byteLength: newBin.length }]

if (o.author && vrm1) vrm1.meta.authors = [o.author]
if (o.author && vrm0) vrm0.meta.author = o.author

let jsonBody = Buffer.from(JSON.stringify(json))
if (jsonBody.length % 4) jsonBody = Buffer.concat([jsonBody, Buffer.alloc(4 - (jsonBody.length % 4), 0x20)])
const header = Buffer.alloc(12 + 8), binHeader = Buffer.alloc(8)
header.writeUInt32LE(0x46546c67, 0)
header.writeUInt32LE(2, 4)
header.writeUInt32LE(12 + 8 + jsonBody.length + 8 + newBin.length, 8)
header.writeUInt32LE(jsonBody.length, 12)
header.writeUInt32LE(0x4e4f534a, 16)
binHeader.writeUInt32LE(newBin.length, 0)
binHeader.writeUInt32LE(0x004e4942, 4)
writeFileSync(out, Buffer.concat([header, jsonBody, binHeader, newBin]))
console.log(`${out}: ${(glb.length / 1e6).toFixed(1)} MB -> ${((12 + 8 + jsonBody.length + 8 + newBin.length) / 1e6).toFixed(1)} MB`)
