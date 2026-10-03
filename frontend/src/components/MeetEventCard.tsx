// OWNER: workstream 4 (Discovery). "Ben boards Anna's bus at Perth" / "25 min together at Glasgow, Café X nearby".
// FROZEN PROPS (used by pages/Meetup.tsx): event, friends.
// same_change events suggest one nearby place the group can walk to and back within the wait.
import { useEffect, useState } from 'react'
import { api } from '../api'
import { hhmm } from '../format'
import type { Friend, MeetEvent, Place } from '../types'
import { categoryMeta, duration, walkMin } from './placeMeta'

const BUFFER_MIN = 5 // back at the stop this long before the bus leaves

const VERB: Record<string, string> = {
  cafe: 'Grab a coffee at',
  food: 'Grab a bite at',
  pub: 'Grab a drink at',
  shop: 'Browse',
}

export default function MeetEventCard({ event, friends }: { event: MeetEvent; friends: Friend[] }) {
  const who = event.friend_ids.map((id) => friends.find((f) => f.id === id)).filter(Boolean) as Friend[]
  const minutes = Math.round((new Date(event.end).getTime() - new Date(event.start).getTime()) / 60000)
  const sameBus = event.kind === 'same_bus'
  const place = useNearbyPick(sameBus ? null : event.area.id, minutes)

  return (
    <div className="overflow-hidden rounded-xl border-2 border-ember bg-white shadow">
      <div className="flex items-center gap-2 bg-ember/10 px-3 py-2">
        <div className="flex shrink-0 -space-x-1.5">
          {who.map((f) => (
            <span
              key={f.id}
              title={f.name}
              style={{ backgroundColor: f.colour }}
              className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white ring-2 ring-white"
            >
              {f.name.trim().charAt(0).toUpperCase()}
            </span>
          ))}
        </div>
        <p className="min-w-0 flex-1 text-xs font-bold uppercase leading-tight tracking-wide text-ember">
          {sameBus ? '🚌 Same bus' : '⏱️ Meet while changing'}
        </p>
        {minutes > 0 && <p className="shrink-0 text-xs font-semibold text-ember">{duration(minutes)}</p>}
      </div>
      <div className="p-3">
        <p className="font-medium leading-snug">{event.description}</p>
        <p className="mt-1 text-sm text-slate-600">
          📍 {event.area.name} · {hhmm(event.start)}–{hhmm(event.end)}
        </p>
        {place && (
          <p className="mt-2 rounded-lg bg-amber-50 px-2 py-1.5 text-sm text-amber-900">
            {categoryMeta(place.category).emoji} {VERB[place.category] ?? 'Pop over to'} <b>{place.name}</b>
            {place.distance_m != null && <span className="text-amber-700"> · {walkMin(place.distance_m)} min walk</span>}
            {place.source === 'curated' && ' ⭐'}
          </p>
        )}
      </div>
    </div>
  )
}

/** Best place near `areaId` that fits a round trip in `minutes`: a local gem, else a café, else anything. */
function useNearbyPick(areaId: number | null, minutes: number): Place | null {
  const [place, setPlace] = useState<Place | null>(null)
  useEffect(() => {
    setPlace(null)
    if (areaId == null || minutes < BUFFER_MIN + 2) return
    let cancelled = false
    api
      .places([areaId], undefined, 30)
      .then((ps) => {
        const fits = ps.filter((p) => 2 * walkMin(p.distance_m ?? 0) + BUFFER_MIN <= minutes)
        const pick =
          fits.find((p) => p.source === 'curated') ?? fits.find((p) => p.category === 'cafe') ?? fits[0] ?? null
        if (!cancelled) setPlace(pick)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [areaId, minutes])
  return place
}
