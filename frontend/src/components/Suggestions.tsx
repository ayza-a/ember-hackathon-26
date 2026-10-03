// OWNER: workstream 3 (Frontend). Mode 2: the top meeting-place suggestions.
// "Cards" view: stacked ticket cards with a town illustration, metric bars, a row per friend and places chips.
// "Compare" view: the same numbers side by side, per town, with the best value in each row highlighted.
import { useState } from 'react'
import { hhmm } from '../format'
import type { Friend, MeetupSuggestion } from '../types'
import { TownArt } from '../ui/art'
import { Avatar, Icon } from '../ui/bits'
import { fmtDur, minsBetween, shortName } from '../ui/util'
import type { Hover } from './MapView'

interface Props {
  suggestions: MeetupSuggestion[]
  friends: Friend[]
  onPick: (s: MeetupSuggestion) => Promise<void> | void
  hover?: Hover
  onHover?: (h: Hover) => void
  active?: number
  onSelect?: (i: number) => void
  loading?: boolean
}

const MEDALS = ['🥇', '🥈', '🥉']
const LABEL_EMOJI: Record<string, string> = { Quickest: '⚡', Fairest: '⚖️', 'Most to do': '🎡' }
const PLACE_EMOJI: Record<string, string> = {
  cafe: '☕', food: '🍽️', restaurant: '🍽️', pub: '🍺', ice_cream: '🍦', viewpoint: '🌄', attraction: '🎡', museum: '🏛️',
  artwork: '🎨', castle: '🏰', monument: '🗿', park: '🌳', nature_reserve: '🦌', bakery: '🥐', books: '📚',
}

function whyLine(s: MeetupSuggestion, all: MeetupSuggestion[]) {
  const min = (k: 'total_travel_min' | 'total_km' | 'spread_min') => Math.min(...all.map((x) => x[k]))
  if (s.spread_min === min('spread_min')) return `Fairest pick: everyone arrives within ${fmtDur(s.spread_min)} of each other`
  if (s.total_travel_min === min('total_travel_min')) return 'Least time on buses for the group overall'
  if (s.total_km === min('total_km')) return 'Shortest distances for the group'
  return 'A good balance of time, distance and fairness'
}

export default function Suggestions({ suggestions, friends, onPick, hover, onHover, active = 0, onSelect, loading }: Props) {
  const [view, setView] = useState<'cards' | 'compare'>('cards')
  const [picking, setPicking] = useState<number | null>(null)

  if (loading) return <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-48" />)}</div>
  if (suggestions.length === 0) {
    return (
      <div className="card p-6 text-center">
        <p className="text-4xl">🧭</p>
        <p className="display mt-2 text-xl">Waiting for the crew</p>
        <p className="mt-1 text-sm text-ink-soft">
          {friends.length < 2 ? 'Once at least two friends have joined, we\'ll find the fairest places to meet.' : 'No town is reachable by everyone that day. Try an earlier departure.'}
        </p>
      </div>
    )
  }
  const pick = async (s: MeetupSuggestion, i: number) => {
    setPicking(i)
    try { await onPick(s) } finally { setPicking(null) }
  }
  const max = (k: 'total_travel_min' | 'total_km' | 'spread_min') => Math.max(...suggestions.map((s) => s[k]), 1)
  const min = (k: 'total_travel_min' | 'total_km' | 'spread_min') => Math.min(...suggestions.map((s) => s[k]))
  const byId = new Map(friends.map((f) => [f.id, f]))

  return (
    <div>
      <div className="mb-3 flex rounded-full bg-surface-2 p-1" role="tablist" aria-label="Suggestion view">
        {(['cards', 'compare'] as const).map((v) => (
          <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)}
            className={`flex-1 rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition ${view === v ? 'bg-ink text-bg' : 'text-ink-soft hover:text-ink'}`}>
            {v === 'cards' ? 'Top picks' : 'Compare towns'}
          </button>
        ))}
      </div>

      {view === 'cards' ? (
        <div className="space-y-5">
          {suggestions.map((s, i) => {
            const isHot = hover?.suggestionIndex === i || active === i
            return (
              <article
                key={s.area.id}
                className={`ticket animate-fade-up overflow-hidden transition ${isHot ? 'ring-4 ring-mint' : ''}`}
                style={{ animationDelay: `${i * 120}ms` }}
                onMouseEnter={() => onHover?.({ suggestionIndex: i })}
                onMouseLeave={() => onHover?.({})}
              >
                <button className="relative block w-full text-left" onClick={() => onSelect?.(i)} aria-label={`Show ${s.area.name} on the map`}>
                  <TownArt area={s.area} className="h-40 w-full" />
                  <span className="absolute top-3 left-3 rounded-full bg-surface px-3 py-1 font-display text-sm font-extrabold shadow">{MEDALS[i] ?? `#${i + 1}`} #{i + 1}</span>
                  {s.label && <span className="absolute bottom-3 left-3 rounded-full border-[3px] border-[#2b2226] bg-mint px-3 py-0.5 font-display text-sm font-extrabold text-[#2b2226] uppercase">{LABEL_EMOJI[s.label] ?? '✨'} {s.label}</span>}
                  {active === i && <span className="absolute top-3 right-3 rounded-full bg-ink px-3 py-1 text-xs font-bold text-bg">On the map</span>}
                </button>
                <div className="p-5">
                  <div className="flex items-end justify-between gap-3">
                    <h3 className="display text-3xl">{shortName(s.area.name)}</h3>
                    <p className="text-right"><span className="block text-[11px] font-bold tracking-wider text-ink-soft uppercase">meet at</span><span className="font-display text-2xl font-extrabold">{hhmm(s.meet_time)}</span></p>
                  </div>
                  <p className="mt-1 text-sm text-teal">✨ {whyLine(s, suggestions)}</p>

                  <div className="mt-4 space-y-2">
                    <Bar label="Time on buses" value={fmtDur(s.total_travel_min)} pct={s.total_travel_min / max('total_travel_min')} best={s.total_travel_min === min('total_travel_min')} />
                    <Bar label="Distance" value={`${Math.round(s.total_km)} km`} pct={s.total_km / max('total_km')} best={s.total_km === min('total_km')} />
                    <Bar label="Arrival gap" value={fmtDur(s.spread_min)} pct={s.spread_min / max('spread_min')} best={s.spread_min === min('spread_min')} />
                  </div>

                  <ul className="mt-4 divide-y divide-line rounded-2xl bg-surface-2 px-3">
                    {s.journeys.map((fp) => {
                      const f = byId.get(fp.friend_id)
                      if (!f) return null
                      const j = fp.journey
                      return (
                        <li key={fp.friend_id} className="flex items-center gap-2 py-2 text-sm">
                          <Avatar friend={f} size={26} />
                          <span className="w-16 truncate font-semibold">{f.name}</span>
                          {j ? (
                            <>
                              <span className="flex-1 tabular-nums text-ink-soft">{hhmm(j.departure)} → {hhmm(j.arrival)}</span>
                              <span className="font-semibold tabular-nums">{fmtDur(minsBetween(j.departure, j.arrival))}</span>
                              {j.changes > 0 && <span className="rounded-full bg-mint-soft px-1.5 text-[10px] font-bold">{j.changes}×</span>}
                            </>
                          ) : <span className="flex-1 text-ink-soft">{fp.note ?? 'already there'}</span>}
                        </li>
                      )
                    })}
                  </ul>

                  {Object.keys(s.places_summary).length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {Object.entries(s.places_summary).sort((a, b) => b[1] - a[1]).map(([cat, n]) => (
                        <span key={cat} className="chip" title={cat.replace('_', ' ')}>{PLACE_EMOJI[cat] ?? '📍'} {n}</span>
                      ))}
                    </div>
                  )}

                  <button className={`btn mt-5 w-full ${i === 0 ? 'btn-mint' : ''}`} onClick={() => pick(s, i)} disabled={picking != null}>
                    {picking === i ? 'Planning everyone\'s buses…' : <>Meet in {shortName(s.area.name)} <Icon name="arrow" className="h-4 w-4" /></>}
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      ) : (
        <div className="card overflow-x-auto p-2">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr>
                <th />
                {suggestions.map((s, i) => (
                  <th key={s.area.id} className="p-2 text-left align-bottom" onMouseEnter={() => onHover?.({ suggestionIndex: i })} onMouseLeave={() => onHover?.({})}>
                    <TownArt area={s.area} className="mb-2 h-16 w-full rounded-xl" />
                    <span className="display text-lg">{MEDALS[i]} {shortName(s.area.name)}</span>
                    {s.label && <span className="mt-1 block text-xs font-bold text-teal">{LABEL_EMOJI[s.label] ?? '✨'} {s.label}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="[&_td]:p-2 [&_th]:p-2 [&_tr]:border-t [&_tr]:border-line">
              <Row label="Meet at" cells={suggestions.map((s) => hhmm(s.meet_time))} />
              <Row label="Time on buses" cells={suggestions.map((s) => fmtDur(s.total_travel_min))} best={suggestions.map((s) => s.total_travel_min === min('total_travel_min'))} />
              <Row label="Distance" cells={suggestions.map((s) => `${Math.round(s.total_km)} km`)} best={suggestions.map((s) => s.total_km === min('total_km'))} />
              <Row label="Arrival gap" cells={suggestions.map((s) => fmtDur(s.spread_min))} best={suggestions.map((s) => s.spread_min === min('spread_min'))} />
              {friends.map((f) => {
                const mins = suggestions.map((s) => {
                  const j = s.journeys.find((fp) => fp.friend_id === f.id)?.journey
                  return j ? minsBetween(j.departure, j.arrival) : null
                })
                const lo = Math.min(...mins.filter((m): m is number => m != null))
                return (
                  <Row key={f.id} label={<span className="flex items-center gap-2"><Avatar friend={f} size={22} />{f.name}</span>}
                    cells={mins.map((m) => (m == null ? '—' : fmtDur(m)))} best={mins.map((m) => m === lo)} />
                )
              })}
              <Row label="Things to do" cells={suggestions.map((s) => `${Object.values(s.places_summary).reduce((a, b) => a + b, 0)} places`)} />
              <tr>
                <td />
                {suggestions.map((s, i) => (
                  <td key={s.area.id}>
                    <button className={`btn btn-sm w-full ${i === 0 ? 'btn-mint' : ''}`} onClick={() => pick(s, i)} disabled={picking != null}>
                      {picking === i ? '…' : 'Pick'}
                    </button>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Bar({ label, value, pct, best }: { label: string; value: string; pct: number; best: boolean }) {
  return (
    <div>
      <div className="flex justify-between text-xs">
        <span className="font-semibold text-ink-soft">{label}</span>
        <span className="font-bold">{value} {best && <span className="ml-1 rounded-full bg-teal px-1.5 text-[10px] text-white">BEST</span>}</span>
      </div>
      <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-surface-2">
        <div className={`animate-grow-x h-full rounded-full ${best ? 'bg-teal' : 'bg-mauve'}`} style={{ width: `${Math.max(pct * 100, 4)}%` }} />
      </div>
    </div>
  )
}

function Row({ label, cells, best }: { label: React.ReactNode; cells: string[]; best?: boolean[] }) {
  return (
    <tr>
      <th className="text-left text-xs font-semibold whitespace-nowrap text-ink-soft">{label}</th>
      {cells.map((c, i) => (
        <td key={i} className={`font-semibold tabular-nums ${best?.[i] ? 'rounded-lg bg-teal-soft text-teal' : ''}`}>{c}{best?.[i] && ' ✓'}</td>
      ))}
    </tr>
  )
}
