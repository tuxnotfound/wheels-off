import { useEffect, useState } from 'react'
import App from './App'
import { characterUrl, loadManifest, loadTextures } from './art/art'
import { loadAds } from './ads/ads'
import { loadRig } from './player/VrmRider'
import { useWebGL } from './game/webgl'

// The boot splash. The town (painted art, ads, the character) downloads behind a title and
// a progress bar instead of a white page; index.html carries the same splash statically for
// the gap before this bundle arrives. Without WebGL nothing downloads: the landing page
// already says why the ride can't start.

let started: Promise<void> | null = null
let notify: (f: number) => void = () => {}

function preload(onProgress: (f: number) => void): Promise<void> {
  notify = onProgress // StrictMode mounts twice: rebind the bar, download once
  started ??= run()
  return started
}

async function run() {
  const m = await loadManifest()
  const url = characterUrl()
  await Promise.all([
    loadTextures([...m.buildings.map((b) => b.front), ...m.props.map((p) => p.image)]),
    loadAds(),
    // the character is most of the bytes, so its download alone drives the bar
    url
      ? loadRig(url, (e) => {
          if (e.lengthComputable) notify(e.loaded / e.total)
        })
      : null,
  ])
}

export default function Boot() {
  const webgl = useWebGL((s) => s.ok)
  const [frac, setFrac] = useState(0)
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading')
  useEffect(() => {
    if (!webgl) return
    let on = true
    preload((f) => {
      if (on) setFrac(f)
    })
      .then(() => {
        if (on) setState('ready')
      })
      .catch((e: unknown) => {
        console.error('[wheels-off] the town did not load:', e)
        if (on) setState('failed')
      })
    return () => {
      on = false
    }
  }, [webgl])
  if (!webgl || state === 'ready') return <App />
  const pct = Math.round(frac * 100)
  return (
    <main className="boot" aria-label="Wheels Off is loading">
      <h1 className="boot__title">WHEELS OFF</h1>
      <p className="boot__jp">ホイールズ・オフ</p>
      {state === 'failed' ? (
        <div className="boot__fail" role="alert">
          <p className="boot__fail-title">THE TOWN DIDN'T LOAD</p>
          <p className="boot__fail-jp">町が読み込めませんでした</p>
          <p className="boot__fail-what">Something didn't download. Check the connection, then try again.</p>
          <button className="boot__retry" onClick={() => window.location.reload()}>
            TRY AGAIN
          </button>
        </div>
      ) : (
        <>
          <div className="boot__bar">
            <div className={frac ? 'boot__fill' : 'boot__fill boot__fill--wait'} style={frac ? { width: `${pct}%` } : undefined} />
          </div>
          <p className="boot__note">loading the town…{frac ? ` ${pct}%` : ''}</p>
        </>
      )}
    </main>
  )
}
