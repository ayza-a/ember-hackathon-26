// OWNER: workstream 4 (Discovery). Places near the meeting point / change stops.
// FROZEN PROPS (used by pages/Meetup.tsx): areaIds, onSelectPlace(lat, lon).
// STUB: simple list. TODO: category filter chips, empty state, nicer layout.
import { useEffect, useState } from 'react'
import { api } from '../api'
import type { Place } from '../types'
import PlaceCard from './PlaceCard'

interface Props {
  areaIds: number[]
  onSelectPlace: (lat: number, lon: number) => void
}

export default function PlacesPanel({ areaIds, onSelectPlace }: Props) {
  const [places, setPlaces] = useState<Place[]>([])
  const key = areaIds.join(',')

  useEffect(() => {
    if (!key) return
    api.places(key.split(',').map(Number)).then(setPlaces).catch(() => setPlaces([]))
  }, [key])

  return (
    <div className="rounded-xl bg-white p-4 shadow">
      <h2 className="font-semibold">Explore nearby</h2>
      {places.length === 0 && <p className="text-sm text-slate-500">No places yet.</p>}
      <div className="mt-2 space-y-2">
        {places.map((p) => <PlaceCard key={p.id} place={p} onSelect={() => onSelectPlace(p.lat, p.lon)} />)}
      </div>
    </div>
  )
}
