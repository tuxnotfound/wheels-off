// Where a visit came from, as the play tracker records it (worker/play.ts): the link's ?ref
// (x, share, itch, ...), else the referring site's host, else direct. Kept short and plain so a
// read can group by it.

export function cleanSource(raw: string): string {
  const s = raw
    .trim()
    .toLowerCase()
    .replace(/^www\./, '')
    .replace(/[^a-z0-9._-]/g, '')
    .slice(0, 40)
  return s || 'direct'
}
