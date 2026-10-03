// OWNER: workstream 3 (Frontend). "While you wait at X": a bit of local history (Wikipedia), read aloud on demand,
// a podcast search, and who's waiting there with you.
import { useEffect, useRef, useState } from 'react'
import type { Area, Friend, Plan } from '../../types'
import { TownArt } from '../../ui/art'
import { Avatar, Icon } from '../../ui/bits'
import { fmtDur, podcastSearchUrl, townOf, waits, wikiSummary, type WikiSummary } from '../../ui/util'

export default function WaitCard({ area, plan, friends, onClose }: { area: Area; plan: Plan; friends: Friend[]; onClose: () => void }) {
  const town = townOf(area)
  const [loaded, setLoaded] = useState<{ town: string; wiki: WikiSummary | null } | null>(null)
  const wiki = loaded?.town === town ? loaded.wiki : undefined // undefined = still loading
  const [speaking, setSpeaking] = useState(false)
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    let alive = true
    wikiSummary(town).then((w) => alive && setLoaded({ town, wiki: w }))
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    return () => { alive = false; speechSynthesis.cancel() }
  }, [town])

  const waiting = plan.friends.flatMap((fp) => waits(fp.journey).filter((w) => w.area.id === area.id).map((w) => ({ fp, w })))

  useEffect(() => () => setSpeaking(false), [town])
  function listen() {
    if (speaking) { speechSynthesis.cancel(); setSpeaking(false); return }
    if (!wiki) return
    const u = new SpeechSynthesisUtterance(`A little about ${wiki.title}. ${wiki.extract}`)
    u.lang = 'en-GB'
    u.rate = 0.98
    u.onend = () => setSpeaking(false)
    speechSynthesis.speak(u)
    setSpeaking(true)
  }

  return (
    <section ref={ref} className="ticket animate-fade-up overflow-hidden" aria-label={`While you wait at ${town}`}>
      <div className="relative">
        <TownArt area={area} className="h-28 w-full" />
        <button onClick={onClose} className="absolute top-3 right-3 rounded-full bg-surface p-1.5 shadow" aria-label="Close"><Icon name="close" className="h-4 w-4" /></button>
      </div>
      <div className="p-5">
        <p className="text-xs font-bold tracking-widest text-mustard-deep uppercase">While you wait</p>
        <h3 className="display text-3xl">at {town}</h3>
        {waiting.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {waiting.map(({ fp, w }) => {
              const f = friends.find((x) => x.id === fp.friend_id)
              return f && (
                <span key={fp.friend_id} className="chip"><Avatar friend={f} size={20} /> {f.name} · {fmtDur(w.min)}</span>
              )
            })}
          </div>
        )}

        <div className="mt-4 rounded-2xl bg-surface-2 p-4">
          <p className="flex items-center gap-2 text-sm font-bold"><Icon name="book" className="h-4 w-4 text-teal" /> A bit of history</p>
          {wiki === undefined && <div className="mt-2 space-y-2"><div className="skeleton h-3" /><div className="skeleton h-3 w-4/5" /><div className="skeleton h-3 w-3/5" /></div>}
          {wiki === null && <p className="mt-2 text-sm text-ink-soft">We couldn't find a story for {town}. Ask a local!</p>}
          {wiki && (
            <>
              <p className="mt-2 line-clamp-5 text-sm leading-relaxed">{wiki.extract}</p>
              {wiki.url && <a href={wiki.url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-teal underline">Read more on Wikipedia</a>}
            </>
          )}
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <button className="btn btn-teal btn-sm" onClick={listen} disabled={!wiki || !('speechSynthesis' in window)}>
            <Icon name={speaking ? 'pause' : 'listen'} className="h-4 w-4" /> {speaking ? 'Stop' : 'Listen to its history'}
          </button>
          <a className="btn btn-ghost btn-sm" href={podcastSearchUrl(town)} target="_blank" rel="noreferrer">🎙️ Find a {town} podcast</a>
        </div>
        <p className="mt-3 text-xs text-ink-soft">☕ Cafés and sights near the stop are in <b>Explore nearby</b> below.</p>
      </div>
    </section>
  )
}
