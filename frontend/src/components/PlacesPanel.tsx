// OWNER: workstream 4 (Discovery). Places near the meeting point / change stops.
// FROZEN PROPS (used by pages/Meetup.tsx): areaIds, onSelectPlace(lat, lon).
// Fetches once per set of areas; category chips filter client-side.
import { useEffect, useState } from 'react'
import { api } from '../api'
import type { Place } from '../types'
import PlaceCard from './PlaceCard'
import { categoryMeta, categoryOrder } from './placeMeta'

interface Props {
  areaIds: number[]
  onSelectPlace: (lat: number, lon: number) => void
}

const FETCH_LIMIT = 60
const SHOW_FIRST = 6

export default function PlacesPanel({ areaIds, onSelectPlace }: Props) {
  const [places, setPlaces] = useState<Place[]>([])
  const [loading, setLoading] = useState(false)
  const [category, setCategory] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const key = [...new Set(areaIds)].join(',')

  useEffect(() => {
    setCategory(null)
    setShowAll(false)
    if (!key) {
      setPlaces([])
      return
    }
    let cancelled = false
    const ids = key.split(',').map(Number)
    setLoading(true)
    api
      .places(ids, undefined, FETCH_LIMIT)
      .then((p) => {
        // Gems first, then the first area (the destination) before change stops, then nearest.
        const rank = (x: Place) => [x.source === 'curated' ? 0 : 1, ids.indexOf(x.near_area_id ?? -1), x.distance_m ?? 0]
        p.sort((a, b) => {
          const [ra, rb] = [rank(a), rank(b)]
          return ra[0] - rb[0] || ra[1] - rb[1] || ra[2] - rb[2]
        })
        if (!cancelled) setPlaces(p)
      })
      .catch(() => !cancelled && setPlaces([]))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [key])

  const counts = places.reduce<Record<string, number>>((acc, p) => ((acc[p.category] = (acc[p.category] ?? 0) + 1), acc), {})
  const chips = Object.keys(counts).sort((a, b) => indexOf(a) - indexOf(b))
  const filtered = category ? places.filter((p) => p.category === category) : places
  const visible = showAll ? filtered : filtered.slice(0, SHOW_FIRST)
  const gems = places.filter((p) => p.source === 'curated').length

  return (
    <div className="rounded-xl bg-white p-4 shadow">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-semibold">🧭 Explore nearby</h2>
        {places.length > 0 && (
          <p className="text-xs text-slate-500">
            {gems > 0 && `${gems} local gem${gems > 1 ? 's' : ''} · `}
            {places.length}
            {places.length >= FETCH_LIMIT && '+'} spots within a short walk
          </p>
        )}
      </div>

      {chips.length > 1 && (
        <div className="-mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1 pb-1">
          <Chip active={category === null} onClick={() => setCategory(null)}>
            All
          </Chip>
          {chips.map((c) => (
            <Chip key={c} active={category === c} onClick={() => (setCategory(category === c ? null : c), setShowAll(false))}>
              {categoryMeta(c).emoji} {categoryMeta(c).label} <span className="opacity-60">{counts[c]}</span>
            </Chip>
          ))}
        </div>
      )}

      {loading && places.length === 0 ? (
        <div className="mt-3 space-y-2" aria-label="Loading places">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex animate-pulse gap-3 rounded-lg border border-slate-100 p-3">
              <div className="h-10 w-10 rounded-lg bg-slate-200" />
              <div className="flex-1 space-y-2 py-1">
                <div className="h-3 w-2/3 rounded bg-slate-200" />
                <div className="h-2 w-1/3 rounded bg-slate-100" />
              </div>
            </div>
          ))}
        </div>
      ) : places.length === 0 ? (
        <div className="mt-3 rounded-lg bg-slate-50 p-4 text-center text-sm text-slate-500">
          <p className="text-2xl" aria-hidden>
            🗺️
          </p>
          {key
            ? 'Nothing listed within walking distance here. The view from the bus window will have to do!'
            : 'Cafés, castles and viewpoints near your meeting point will show up here once friends have joined.'}
        </div>
      ) : (
        <>
          <div className="mt-3 space-y-2">
            {visible.map((p) => (
              <PlaceCard key={p.id} place={p} onSelect={() => onSelectPlace(p.lat, p.lon)} />
            ))}
          </div>
          {filtered.length > SHOW_FIRST && (
            <button
              type="button"
              onClick={() => setShowAll(!showAll)}
              className="mt-2 w-full rounded-lg py-2 text-sm font-medium text-ember hover:bg-slate-50"
            >
              {showAll ? 'Show less' : `Show ${filtered.length - SHOW_FIRST} more`}
            </button>
          )}
        </>
      )}
    </div>
  )
}

function indexOf(c: string) {
  const i = categoryOrder.indexOf(c)
  return i === -1 ? categoryOrder.length : i
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium transition ${
        active ? 'border-ember bg-ember text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-ember'
      }`}
    >
      {children}
    </button>
  )
}
